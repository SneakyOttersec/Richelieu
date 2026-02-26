"""
Script principal de recuperation des donnees financieres via yfinance.
Execute quotidiennement par GitHub Actions (22h UTC, lun-ven).
"""

import json
import os
import time
from datetime import datetime, timedelta
from pathlib import Path

import yfinance as yf

from companies_config import COMPANIES, COUNTRIES, INDICES, get_all_companies, ticker_to_filename

# Chemins
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
FUNDAMENTALS_DIR = DATA_DIR / "fundamentals"
NEWS_DIR = DATA_DIR / "news"
HISTORY_DIR = DATA_DIR / "history"

# Creer les repertoires
FUNDAMENTALS_DIR.mkdir(parents=True, exist_ok=True)
NEWS_DIR.mkdir(parents=True, exist_ok=True)
HISTORY_DIR.mkdir(parents=True, exist_ok=True)


def generate_companies_json():
    """Genere data/companies.json depuis la config Python, enrichi avec sector/industry."""
    companies = get_all_companies()

    # Enrich each company with sector/industry from its fundamentals file
    for company in companies:
        filename = ticker_to_filename(company["ticker"])
        fund_path = FUNDAMENTALS_DIR / f"{filename}.json"
        if fund_path.exists():
            try:
                with open(fund_path, "r", encoding="utf-8") as f:
                    fund = json.load(f)
                company["sector"] = fund.get("sector")
                company["industry"] = fund.get("industry")
            except Exception:
                company["sector"] = None
                company["industry"] = None
        else:
            company["sector"] = None
            company["industry"] = None

    output = {
        "countries": {},
        "companies": companies,
    }
    for country_id, info in COUNTRIES.items():
        output["countries"][country_id] = {
            "name": info["name"],
            "flag": info["flag"],
            "exchange": info["exchange"],
            "currency": info["currency"],
            "pea_eligible": info["pea_eligible"],
        }

    path = DATA_DIR / "companies.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"[OK] companies.json genere ({len(companies)} entreprises)")


def fetch_batch_prices():
    """Recupere les prix batch pour les 175 tickers via yf.download()."""
    all_companies = get_all_companies()
    tickers = [c["ticker"] for c in all_companies]

    print(f"[...] Telechargement des prix pour {len(tickers)} tickers...")
    data = yf.download(tickers, period="5d", group_by="ticker", threads=True)

    prices = {}
    for company in all_companies:
        ticker = company["ticker"]
        try:
            if len(tickers) == 1:
                ticker_data = data
            else:
                ticker_data = data[ticker]

            if ticker_data.empty:
                continue

            last_row = ticker_data.dropna(how="all").iloc[-1]
            prev_row = ticker_data.dropna(how="all").iloc[-2] if len(ticker_data.dropna(how="all")) > 1 else None

            close = float(last_row["Close"])
            prev_close = float(prev_row["Close"]) if prev_row is not None else close
            change = close - prev_close
            change_pct = (change / prev_close * 100) if prev_close != 0 else 0

            prices[ticker] = {
                "price": round(close, 2),
                "change": round(change, 2),
                "change_pct": round(change_pct, 2),
                "volume": int(last_row["Volume"]) if "Volume" in last_row.index else 0,
                "currency": company["currency"],
            }
        except Exception as e:
            print(f"  [ERREUR] Prix {ticker}: {e}")

    path = DATA_DIR / "prices.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(prices, f, ensure_ascii=False, indent=2)
    print(f"[OK] prices.json genere ({len(prices)} tickers)")


def fetch_history():
    """Recupere 1 an d'historique OHLCV quotidien par entreprise."""
    all_companies = get_all_companies()
    tickers = [c["ticker"] for c in all_companies]

    print(f"[...] Telechargement historique 5 ans pour {len(tickers)} tickers...")
    data = yf.download(tickers, period="5y", group_by="ticker", threads=True)

    count = 0
    for company in all_companies:
        ticker = company["ticker"]
        filename = ticker_to_filename(ticker)
        try:
            if len(tickers) == 1:
                ticker_data = data
            else:
                ticker_data = data[ticker]

            df = ticker_data.dropna(how="all")
            if df.empty:
                continue

            history = []
            for date, row in df.iterrows():
                o, h, l, c = row.get("Open"), row.get("High"), row.get("Low"), row.get("Close")
                v = row.get("Volume", 0)
                if any(x is None or (hasattr(x, '__float__') and str(x) == 'nan') for x in [o, h, l, c]):
                    continue
                history.append({
                    "time": date.strftime("%Y-%m-%d"),
                    "open": round(float(o), 2),
                    "high": round(float(h), 2),
                    "low": round(float(l), 2),
                    "close": round(float(c), 2),
                    "volume": int(float(v)) if v and str(v) != 'nan' else 0,
                })

            path = HISTORY_DIR / f"{filename}.json"
            with open(path, "w", encoding="utf-8") as f:
                json.dump(history, f)
            count += 1
        except Exception as e:
            print(f"  [ERREUR] Historique {ticker}: {e}")

    print(f"[OK] Historique genere ({count} fichiers)")


def fetch_indices():
    """Recupere 20 ans d'historique mensuel pour les indices G7 + MSCI World."""
    tickers = list(INDICES.keys())
    print(f"[...] Telechargement indices ({len(tickers)} tickers, 20 ans mensuel)...")

    try:
        data = yf.download(tickers, period="20y", interval="1mo", group_by="ticker", threads=True)

        indices_data = {}
        for ticker in tickers:
            try:
                if len(tickers) == 1:
                    ticker_data = data
                else:
                    ticker_data = data[ticker]

                df = ticker_data.dropna(how="all")
                if df.empty:
                    print(f"  [SKIP] {ticker}: pas de donnees")
                    continue

                series = []
                for date, row in df.iterrows():
                    close = row.get("Close")
                    if close is None or (hasattr(close, '__float__') and str(close) == 'nan'):
                        continue
                    series.append({
                        "time": date.strftime("%Y-%m-%d"),
                        "value": round(float(close), 2),
                    })

                info = INDICES[ticker]
                indices_data[ticker] = {
                    "name": info["name"],
                    "country": info["country"],
                    "color": info["color"],
                    "data": series,
                }
                print(f"  [OK] {ticker} ({info['name']}): {len(series)} points")
            except Exception as e:
                print(f"  [ERREUR] {ticker}: {e}")

        path = DATA_DIR / "indices.json"
        with open(path, "w", encoding="utf-8") as f:
            json.dump(indices_data, f, ensure_ascii=False)
        print(f"[OK] indices.json genere ({len(indices_data)} indices)")

    except Exception as e:
        print(f"[ERREUR] Telechargement indices: {e}")


def safe_convert(value):
    """Convertit les valeurs numpy/pandas en types Python natifs."""
    if value is None:
        return None
    import numpy as np
    import pandas as pd
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        return float(value) if not np.isnan(value) else None
    if isinstance(value, (np.bool_,)):
        return bool(value)
    if isinstance(value, (pd.Timestamp,)):
        return value.isoformat()
    if isinstance(value, (float,)):
        import math
        return value if not math.isnan(value) else None
    return value


def extract_statement_data(stmt):
    """Extrait les donnees d'un etat financier en dict serialisable."""
    if stmt is None or stmt.empty:
        return None
    result = {}
    for col in stmt.columns:
        col_key = col.isoformat() if hasattr(col, "isoformat") else str(col)
        col_data = {}
        for idx in stmt.index:
            val = safe_convert(stmt.loc[idx, col])
            col_data[str(idx)] = val
        result[col_key] = col_data
    return result


def fetch_company_fundamentals(company):
    """Recupere les donnees fondamentales d'une entreprise."""
    ticker_str = company["ticker"]
    filename = ticker_to_filename(ticker_str)
    filepath = FUNDAMENTALS_DIR / f"{filename}.json"

    # Cache 7 jours
    if filepath.exists():
        mtime = datetime.fromtimestamp(filepath.stat().st_mtime)
        if datetime.now() - mtime < timedelta(days=7):
            print(f"  [CACHE] {ticker_str} (< 7 jours)")
            return

    print(f"  [...] {ticker_str}...")
    try:
        ticker = yf.Ticker(ticker_str)
        info = ticker.info or {}

        fundamentals = {
            "ticker": ticker_str,
            "name": company["name"],
            "country": company["country"],
            "currency": company["currency"],
            "last_fetched": datetime.now().isoformat(),

            # Metriques cles
            "market_cap": safe_convert(info.get("marketCap")),
            "revenue": safe_convert(info.get("totalRevenue")),
            "net_income": safe_convert(info.get("netIncomeToCommon")),
            "pe_ratio": safe_convert(info.get("trailingPE")),
            "forward_pe": safe_convert(info.get("forwardPE")),
            "dividend_yield": safe_convert(info.get("dividendYield")),
            "dividend_rate": safe_convert(info.get("dividendRate")),
            "trailing_dividend_rate": safe_convert(info.get("trailingAnnualDividendRate")),
            "profit_margin": safe_convert(info.get("profitMargins")),
            "roe": safe_convert(info.get("returnOnEquity")),
            "debt_to_equity": safe_convert(info.get("debtToEquity")),
            "beta": safe_convert(info.get("beta")),
            "ev_to_ebitda": safe_convert(info.get("enterpriseToEbitda")),

            # Description
            "sector": info.get("sector"),
            "industry": info.get("industry"),
            "summary": info.get("longBusinessSummary"),
            "website": info.get("website"),
            "employees": safe_convert(info.get("fullTimeEmployees")),

            # Prix cible analystes
            "target_high": safe_convert(info.get("targetHighPrice")),
            "target_low": safe_convert(info.get("targetLowPrice")),
            "target_mean": safe_convert(info.get("targetMeanPrice")),
            "target_median": safe_convert(info.get("targetMedianPrice")),
            "recommendation": info.get("recommendationKey"),
            "num_analysts": safe_convert(info.get("numberOfAnalystOpinions")),
        }

        # Etats financiers
        try:
            fundamentals["income_stmt"] = extract_statement_data(ticker.income_stmt)
        except Exception:
            fundamentals["income_stmt"] = None

        try:
            fundamentals["quarterly_income"] = extract_statement_data(ticker.quarterly_income_stmt)
        except Exception:
            fundamentals["quarterly_income"] = None

        try:
            fundamentals["balance_sheet"] = extract_statement_data(ticker.balance_sheet)
        except Exception:
            fundamentals["balance_sheet"] = None

        try:
            fundamentals["cashflow"] = extract_statement_data(ticker.cashflow)
        except Exception:
            fundamentals["cashflow"] = None

        # Estimations analystes
        try:
            earnings_est = ticker.earnings_estimate
            if earnings_est is not None and not earnings_est.empty:
                fundamentals["earnings_estimate"] = json.loads(earnings_est.to_json())
            else:
                fundamentals["earnings_estimate"] = None
        except Exception:
            fundamentals["earnings_estimate"] = None

        try:
            revenue_est = ticker.revenue_estimate
            if revenue_est is not None and not revenue_est.empty:
                fundamentals["revenue_estimate"] = json.loads(revenue_est.to_json())
            else:
                fundamentals["revenue_estimate"] = None
        except Exception:
            fundamentals["revenue_estimate"] = None

        try:
            growth_est = ticker.growth_estimates
            if growth_est is not None and not growth_est.empty:
                fundamentals["growth_estimates"] = json.loads(growth_est.to_json())
            else:
                fundamentals["growth_estimates"] = None
        except Exception:
            fundamentals["growth_estimates"] = None

        # Revenue/geo segmentation (si disponible)
        try:
            seg = ticker.revenue_forecasts
            if seg is not None and not seg.empty:
                fundamentals["revenue_forecasts"] = json.loads(seg.to_json())
            else:
                fundamentals["revenue_forecasts"] = None
        except Exception:
            fundamentals["revenue_forecasts"] = None

        # Compute YoY changes for profit margin and ROE
        try:
            income = ticker.income_stmt
            balance = ticker.balance_sheet
            if income is not None and not income.empty and balance is not None and not balance.empty:
                # Get the two most recent annual periods
                inc_cols = sorted(income.columns, reverse=True)
                bal_cols = sorted(balance.columns, reverse=True)

                if len(inc_cols) >= 2:
                    # Profit margin YoY
                    margin_current = None
                    margin_prev = None
                    for year_idx in [0, 1]:
                        col = inc_cols[year_idx]
                        ni = income.loc["Net Income", col] if "Net Income" in income.index else None
                        rev = income.loc["Total Revenue", col] if "Total Revenue" in income.index else None
                        if ni is not None and rev is not None and rev != 0:
                            margin = float(ni) / float(rev)
                            if year_idx == 0:
                                margin_current = margin
                            else:
                                margin_prev = margin

                    if margin_current is not None and margin_prev is not None:
                        fundamentals["profit_margin_yoy_change"] = round((margin_current - margin_prev) * 100, 2)
                    else:
                        fundamentals["profit_margin_yoy_change"] = None
                else:
                    fundamentals["profit_margin_yoy_change"] = None

                if len(bal_cols) >= 2 and len(inc_cols) >= 2:
                    # ROE YoY
                    roe_vals = []
                    for year_idx in [0, 1]:
                        ni = income.loc["Net Income", inc_cols[year_idx]] if "Net Income" in income.index else None
                        eq = balance.loc["Stockholders Equity", bal_cols[year_idx]] if "Stockholders Equity" in balance.index else None
                        if ni is not None and eq is not None and eq != 0:
                            roe_vals.append(float(ni) / float(eq))
                        else:
                            roe_vals.append(None)

                    if roe_vals[0] is not None and roe_vals[1] is not None:
                        fundamentals["roe_yoy_change"] = round((roe_vals[0] - roe_vals[1]) * 100, 2)
                    else:
                        fundamentals["roe_yoy_change"] = None
                else:
                    fundamentals["roe_yoy_change"] = None
            else:
                fundamentals["profit_margin_yoy_change"] = None
                fundamentals["roe_yoy_change"] = None
        except Exception:
            fundamentals["profit_margin_yoy_change"] = None
            fundamentals["roe_yoy_change"] = None

        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(fundamentals, f, ensure_ascii=False, indent=2)
        print(f"  [OK] {ticker_str}")

    except Exception as e:
        print(f"  [ERREUR] {ticker_str}: {e}")


def fetch_company_news(company):
    """Recupere les actualites d'une entreprise."""
    ticker_str = company["ticker"]
    filename = ticker_to_filename(ticker_str)
    filepath = NEWS_DIR / f"{filename}.json"

    print(f"  [...] News {ticker_str}...")
    try:
        ticker = yf.Ticker(ticker_str)
        raw_news = ticker.news or []

        news_items = []
        for item in raw_news:
            content = item.get("content", item) if isinstance(item, dict) else item
            news_items.append({
                "title": content.get("title", ""),
                "link": content.get("canonicalUrl", {}).get("url", "") if isinstance(content.get("canonicalUrl"), dict) else content.get("link", ""),
                "publisher": content.get("provider", {}).get("displayName", "") if isinstance(content.get("provider"), dict) else content.get("publisher", ""),
                "date": content.get("pubDate", content.get("providerPublishTime", "")),
                "type": content.get("contentType", ""),
            })

        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(news_items, f, ensure_ascii=False, indent=2)
        print(f"  [OK] News {ticker_str} ({len(news_items)} articles)")

    except Exception as e:
        print(f"  [ERREUR] News {ticker_str}: {e}")


def update_timestamp():
    """Met a jour le fichier last_updated.json."""
    path = DATA_DIR / "last_updated.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump({
            "timestamp": datetime.now().isoformat(),
            "date": datetime.now().strftime("%d/%m/%Y %H:%M UTC"),
        }, f, indent=2)
    print(f"[OK] last_updated.json")


def main():
    print("=" * 60)
    print(f"Richelieu - Mise a jour des donnees - {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("=" * 60)

    # 1. Generer companies.json
    print("\n--- Generation companies.json ---")
    generate_companies_json()

    # 2. Prix batch
    print("\n--- Recuperation des prix ---")
    fetch_batch_prices()

    # 2b. Historique 1 an (pour les graphiques)
    print("\n--- Recuperation historique 1 an ---")
    fetch_history()

    # 2c. Indices G7 (20 ans mensuel pour le dashboard)
    print("\n--- Recuperation indices G7 ---")
    fetch_indices()

    # 3. Fondamentaux (avec delai entre chaque)
    print("\n--- Recuperation des fondamentaux ---")
    all_companies = get_all_companies()
    for i, company in enumerate(all_companies):
        fetch_company_fundamentals(company)
        if i < len(all_companies) - 1:
            time.sleep(1.5)

    # 4. Actualites
    print("\n--- Recuperation des actualites ---")
    for i, company in enumerate(all_companies):
        fetch_company_news(company)
        if i < len(all_companies) - 1:
            time.sleep(0.5)

    # 5. Timestamp
    print("\n--- Mise a jour timestamp ---")
    update_timestamp()

    print("\n" + "=" * 60)
    print("Mise a jour terminee!")
    print("=" * 60)


if __name__ == "__main__":
    main()
