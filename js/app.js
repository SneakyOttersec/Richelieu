/**
 * Richelieu - Main application logic.
 * Handles routing, sidebar, and data loading.
 */

const App = {
    companiesData: null,
    pricesData: null,
    basePath: '',

    async init() {
        this.basePath = this.detectBasePath();
        this.setupHamburger();

        const isCompanyPage = window.location.pathname.endsWith('company.html');
        const ticker = Utils.getUrlParam('ticker');

        if (isCompanyPage && ticker) {
            await this.loadCompanyPage(ticker);
        } else {
            await this.loadIndexPage();
        }
    },

    detectBasePath() {
        const path = window.location.pathname;
        const lastSlash = path.lastIndexOf('/');
        return path.substring(0, lastSlash + 1);
    },

    setupHamburger() {
        const hamburger = document.getElementById('hamburger');
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('overlay');

        if (hamburger && sidebar && overlay) {
            hamburger.addEventListener('click', () => {
                sidebar.classList.toggle('open');
                overlay.classList.toggle('active');
            });

            overlay.addEventListener('click', () => {
                sidebar.classList.remove('open');
                overlay.classList.remove('active');
            });
        }
    },

    // ========================================
    // INDEX PAGE
    // ========================================

    async loadIndexPage() {
        try {
            const [companiesResp, lastUpdatedResp] = await Promise.all([
                fetch(`${this.basePath}data/companies.json`),
                fetch(`${this.basePath}data/last_updated.json`).catch(() => null),
            ]);

            this.companiesData = await companiesResp.json();
            this.buildSidebar();
            this.setupSearch();
            this.buildCountryGrid();

            // Init index chart
            if (typeof IndexChart !== 'undefined') {
                IndexChart.init(this.basePath);
            }

            // Load fundamentals for rankings (non-blocking)
            this.loadRankings();

            if (lastUpdatedResp && lastUpdatedResp.ok) {
                const lu = await lastUpdatedResp.json();
                this.showLastUpdated(lu);
            }
        } catch (e) {
            console.error('Error loading index:', e);
            document.getElementById('country-grid').innerHTML =
                '<div class="error-message">Failed to load data. Check that JSON files exist in data/.</div>';
        }
    },

    async loadRankings() {
        const grid = document.getElementById('rankings-grid');
        if (!grid || !this.companiesData) return;

        // Exclude ETFs from rankings
        const companies = this.companiesData.companies.filter(c => c.country !== 'etf');

        // Fetch all fundamentals in parallel
        const fundPromises = companies.map(c => {
            const filename = Utils.tickerToFilename(c.ticker);
            return fetch(`${this.basePath}data/fundamentals/${filename}.json`)
                .then(r => r.ok ? r.json() : null)
                .catch(() => null);
        });

        const allFundamentals = await Promise.all(fundPromises);

        // Merge company info with fundamentals
        const merged = companies.map((c, i) => ({ company: c, fund: allFundamentals[i] }))
            .filter(m => m.fund);

        // 1. Lowest P/E (positive only)
        const lowestPE = merged
            .filter(m => m.fund.pe_ratio != null && m.fund.pe_ratio > 0)
            .sort((a, b) => a.fund.pe_ratio - b.fund.pe_ratio)
            .slice(0, 10);

        // 2. Biggest revenue growth YoY
        const revenueGrowth = merged.map(m => {
            const inc = m.fund.income_stmt;
            if (!inc) return null;
            const cols = Object.keys(inc).sort().reverse();
            if (cols.length < 2) return null;
            const rev1 = inc[cols[0]] && inc[cols[0]]['Total Revenue'];
            const rev2 = inc[cols[1]] && inc[cols[1]]['Total Revenue'];
            if (rev1 == null || rev2 == null || rev2 === 0) return null;
            const growth = ((rev1 - rev2) / Math.abs(rev2)) * 100;
            return { ...m, revenueGrowth: growth };
        }).filter(Boolean).sort((a, b) => b.revenueGrowth - a.revenueGrowth).slice(0, 10);

        // 3. Biggest dividend yield
        const biggestDividend = merged
            .filter(m => m.fund.dividend_yield != null && m.fund.dividend_yield > 0)
            .sort((a, b) => b.fund.dividend_yield - a.fund.dividend_yield)
            .slice(0, 10);

        // 4. Lowest debt/equity (positive only)
        const lowestDebt = merged
            .filter(m => m.fund.debt_to_equity != null && m.fund.debt_to_equity >= 0)
            .sort((a, b) => a.fund.debt_to_equity - b.fund.debt_to_equity)
            .slice(0, 10);

        // Render
        grid.innerHTML = this.renderRankingCard('Lowest P/E Ratio', lowestPE, m => Utils.formatNumber(m.fund.pe_ratio, 1))
            + this.renderRankingCard('Top Revenue Growth (YoY)', revenueGrowth, m => {
                const sign = m.revenueGrowth >= 0 ? '+' : '';
                return `${sign}${m.revenueGrowth.toFixed(1)}%`;
            }, m => m.revenueGrowth)
            + this.renderRankingCard('Highest Dividend Yield', biggestDividend, m => Utils.formatPercent(m.fund.dividend_yield, false), () => 1)
            + this.renderRankingCard('Lowest Debt/Equity', lowestDebt, m => Utils.formatNumber(m.fund.debt_to_equity, 1));
    },

    renderRankingCard(title, items, formatValue, colorFn) {
        let html = `<div class="ranking-card"><h3>${title}</h3><ul class="ranking-list">`;
        items.forEach((m, i) => {
            const val = formatValue(m);
            const colorVal = colorFn ? colorFn(m) : undefined;
            const cls = colorVal !== undefined ? Utils.valueClass(colorVal) : '';
            html += `<li>
                <span class="rank">${i + 1}.</span>
                <a class="rank-name" href="company.html?ticker=${encodeURIComponent(m.company.ticker)}">
                    <span class="rank-flag">${m.company.flag}</span>${m.company.name}
                </a>
                <span class="rank-value ${cls}">${val}</span>
            </li>`;
        });
        html += '</ul></div>';
        return html;
    },

    buildSidebar(activeTicker) {
        const nav = document.getElementById('sidebar-nav');
        if (!nav || !this.companiesData) return;

        const countries = this.companiesData.countries;
        const companies = this.companiesData.companies;

        const byCountry = {};
        for (const c of companies) {
            if (!byCountry[c.country]) byCountry[c.country] = [];
            byCountry[c.country].push(c);
        }

        let html = '';
        const countryOrder = ['etf', 'france', 'usa', 'uk', 'germany', 'italy', 'japan', 'canada'];

        for (const countryId of countryOrder) {
            const country = countries[countryId];
            if (!country) continue;
            const countryCompanies = byCountry[countryId] || [];
            const isActive = activeTicker && countryCompanies.some(c => c.ticker === activeTicker);

            html += `<div class="sidebar-country">`;
            html += `<button class="sidebar-country-btn ${isActive ? 'open' : ''}" data-country="${countryId}">`;
            html += `${country.flag} ${country.name} <span class="arrow">\u25b6</span></button>`;
            html += `<div class="sidebar-companies ${isActive ? 'open' : ''}">`;

            for (const c of countryCompanies) {
                const active = c.ticker === activeTicker ? ' active' : '';
                html += `<a href="company.html?ticker=${encodeURIComponent(c.ticker)}" class="${active}">${c.name}</a>`;
            }

            html += `</div></div>`;
        }

        nav.innerHTML = html;

        nav.querySelectorAll('.sidebar-country-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.classList.toggle('open');
                const list = btn.nextElementSibling;
                list.classList.toggle('open');
            });
        });
    },

    buildCountryGrid() {
        const grid = document.getElementById('country-grid');
        if (!grid || !this.companiesData) return;

        const countries = this.companiesData.countries;
        const companies = this.companiesData.companies;
        const countryOrder = ['etf', 'france', 'usa', 'uk', 'germany', 'italy', 'japan', 'canada'];

        let html = '';
        for (const countryId of countryOrder) {
            const country = countries[countryId];
            if (!country) continue;
            const countryCompanies = companies.filter(c => c.country === countryId);

            html += `<div class="country-card">`;
            html += `<h2><span class="flag">${country.flag}</span>${country.name}</h2>`;
            html += `<ul class="company-list">`;

            for (const c of countryCompanies) {
                html += `<li><a href="company.html?ticker=${encodeURIComponent(c.ticker)}">`;
                html += `<span>${c.name}</span>`;
                html += `<span class="ticker">${c.ticker}</span>`;
                html += `</a></li>`;
            }

            html += `</ul></div>`;
        }

        grid.innerHTML = html;
    },

    // ========================================
    // SEARCH
    // ========================================

    setupSearch() {
        const input = document.getElementById('search-input');
        const resultsEl = document.getElementById('search-results');
        if (!input || !resultsEl || !this.companiesData) return;

        const companies = this.companiesData.companies;

        input.addEventListener('input', () => {
            const query = input.value.trim().toLowerCase();
            if (query.length < 2) {
                resultsEl.innerHTML = '';
                resultsEl.style.display = 'none';
                return;
            }

            const matches = [];
            for (const c of companies) {
                if (matches.length >= 15) break;
                const matchType = this.getMatchType(c, query);
                if (matchType) {
                    matches.push({ company: c, matchType });
                }
            }

            if (matches.length === 0) {
                resultsEl.innerHTML = '<div class="search-no-results">No results</div>';
                resultsEl.style.display = 'block';
                return;
            }

            resultsEl.innerHTML = matches.map(m => {
                const c = m.company;
                return `<a href="company.html?ticker=${encodeURIComponent(c.ticker)}">
                    <span>${c.name}</span>
                    <span class="search-match-type">${m.matchType}</span>
                </a>`;
            }).join('');
            resultsEl.style.display = 'block';
        });

        // Close on click outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.sidebar-search')) {
                resultsEl.style.display = 'none';
            }
        });

        // Close on Escape
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                resultsEl.style.display = 'none';
                input.blur();
            }
        });
    },

    getMatchType(company, query) {
        if (company.name.toLowerCase().includes(query)) return company.ticker;
        if (company.ticker.toLowerCase().includes(query)) return 'Ticker';
        if (company.sector && company.sector.toLowerCase().includes(query)) return company.sector;
        if (company.industry && company.industry.toLowerCase().includes(query)) return company.industry;
        if (company.country_name && company.country_name.toLowerCase().includes(query)) return company.country_name;
        if (company.nominatif_benefit) {
            const benefitTerms = ['nominatif', 'benefit', 'loyalty', 'bonus', 'registered', 'fidel'];
            if (benefitTerms.some(t => t.includes(query) || query.includes(t))) return 'Nominatif';
        }
        return null;
    },

    // ========================================
    // COMPANY PAGE
    // ========================================

    async loadCompanyPage(ticker) {
        const filename = Utils.tickerToFilename(ticker);

        try {
            const [companiesResp, pricesResp, fundResp, newsResp, historyResp] = await Promise.all([
                fetch(`${this.basePath}data/companies.json`),
                fetch(`${this.basePath}data/prices.json`).catch(() => null),
                fetch(`${this.basePath}data/fundamentals/${filename}.json`).catch(() => null),
                fetch(`${this.basePath}data/news/${filename}.json`).catch(() => null),
                fetch(`${this.basePath}data/history/${filename}.json`).catch(() => null),
            ]);

            this.companiesData = await companiesResp.json();
            this.buildSidebar(ticker);
            this.setupSearch();

            const company = this.companiesData.companies.find(c => c.ticker === ticker);
            if (!company) {
                this.showError(`Company not found: ${ticker}`);
                return;
            }

            let prices = null;
            if (pricesResp && pricesResp.ok) {
                this.pricesData = await pricesResp.json();
                prices = this.pricesData[ticker];
            }

            let fundamentals = null;
            if (fundResp && fundResp.ok) {
                fundamentals = await fundResp.json();
            }

            let news = null;
            if (newsResp && newsResp.ok) {
                news = await newsResp.json();
            }

            let history = null;
            if (historyResp && historyResp.ok) {
                history = await historyResp.json();
            }

            this.renderCompanyHeader(company, fundamentals);
            this.renderSummary(fundamentals);
            this.renderTickerBar(company, prices, history);
            this.renderNominatifInfo(company);
            this.renderStats(fundamentals, company.currency);
            this.renderProjections(fundamentals, company.currency);
            this.renderQuarterly(fundamentals, company.currency);

            if (typeof ChartWidget !== 'undefined') {
                ChartWidget.init(company.tv_ticker, company.ticker);
            }

            if (typeof NewsSection !== 'undefined') {
                NewsSection.init(news);
            }

            try {
                const luResp = await fetch(`${this.basePath}data/last_updated.json`);
                if (luResp.ok) {
                    this.showLastUpdated(await luResp.json());
                }
            } catch (e) {
                // Not critical
            }

        } catch (e) {
            console.error('Error loading company:', e);
            this.showError('Failed to load data.');
        }
    },

    renderCompanyHeader(company, fundamentals) {
        const nameEl = document.getElementById('company-name');
        const subEl = document.getElementById('company-subtitle');
        const logoEl = document.getElementById('company-logo');

        if (nameEl) {
            nameEl.textContent = company.name;
            nameEl.classList.remove('loading-text');
        }
        if (subEl) {
            const sector = fundamentals && fundamentals.sector ? ` \u2022 ${fundamentals.sector}` : '';
            subEl.textContent = `${company.flag} ${company.country_name} \u2022 ${company.exchange}${sector}`;
        }

        // Company logo from website domain
        if (logoEl && fundamentals && fundamentals.website) {
            try {
                const domain = new URL(fundamentals.website).hostname.replace('www.', '');
                logoEl.src = `https://logo.clearbit.com/${domain}`;
                logoEl.alt = company.name;
                logoEl.style.display = 'block';
                logoEl.onerror = () => { logoEl.style.display = 'none'; };
            } catch (e) {
                logoEl.style.display = 'none';
            }
        }

        document.title = `Richelieu - ${company.name}`;
    },

    renderStats(fundamentals, currency) {
        const grid = document.getElementById('stats-grid');
        if (!grid) return;

        if (!fundamentals) {
            grid.innerHTML = '<div class="error-message">Fundamental data unavailable</div>';
            return;
        }

        const stats = [
            { label: 'Market Cap', value: Utils.formatLargeNumber(fundamentals.market_cap, currency) },
            { label: 'Revenue', value: Utils.formatLargeNumber(fundamentals.revenue, currency) },
            { label: 'Net Income', value: Utils.formatLargeNumber(fundamentals.net_income, currency), colorVal: fundamentals.net_income },
            { label: 'P/E', value: fundamentals.pe_ratio != null ? Utils.formatNumber(fundamentals.pe_ratio, 1) : '\u2014' },
            { label: 'Dividend', value: this.formatDividend(fundamentals, currency) },
            { label: 'Net Margin', value: Utils.formatPercent(fundamentals.profit_margin), yoy: fundamentals.profit_margin_yoy_change },
            { label: 'ROE', value: Utils.formatPercent(fundamentals.roe), yoy: fundamentals.roe_yoy_change },
            { label: 'Debt/Equity', value: fundamentals.debt_to_equity != null ? Utils.formatNumber(fundamentals.debt_to_equity, 1) : '\u2014' },
        ];

        grid.innerHTML = stats.map(s => {
            const cls = s.colorVal !== undefined ? Utils.valueClass(s.colorVal) : '';
            let yoyHtml = '';
            if (s.yoy != null) {
                const sign = s.yoy >= 0 ? '+' : '';
                const yoyCls = s.yoy >= 0 ? 'positive' : 'negative';
                yoyHtml = `<div class="stat-yoy ${yoyCls}">${sign}${s.yoy.toFixed(2)}pp YoY</div>`;
            }
            return `<div class="stat-card"><div class="label">${s.label}</div><div class="value ${cls}">${s.value}</div>${yoyHtml}</div>`;
        }).join('');
    },

    formatDividend(fundamentals, currency) {
        const rate = fundamentals.dividend_rate || fundamentals.trailing_dividend_rate;
        if (rate == null) return '\u2014';
        const formatted = Utils.formatCurrency(rate, currency);
        const trailing = fundamentals.trailing_dividend_rate;
        const forward = fundamentals.dividend_rate;
        if (forward && trailing && trailing > 0 && forward !== trailing) {
            const growth = ((forward - trailing) / trailing) * 100;
            const sign = growth >= 0 ? '+' : '';
            return `${formatted} (${sign}${growth.toFixed(1)}% YoY)`;
        }
        return formatted;
    },

    renderNominatifInfo(company) {
        const el = document.getElementById('nominatif-info');
        if (!el) return;
        if (company.nominatif_benefit) {
            el.className = 'nominatif-info';
            el.textContent = `Nominatif benefit: ${company.nominatif_benefit}`;
            el.style.display = 'block';
        } else {
            el.style.display = 'none';
        }
    },

    renderSummary(fundamentals) {
        const container = document.getElementById('company-summary-content');
        if (!container) return;

        if (!fundamentals) {
            container.innerHTML = '<div class="no-data">Summary unavailable</div>';
            return;
        }

        let html = '<div class="company-meta">';
        if (fundamentals.sector) html += `<span>${fundamentals.sector}</span>`;
        if (fundamentals.industry) html += `<span>${fundamentals.industry}</span>`;
        if (fundamentals.employees) html += `<span>${Utils.formatNumber(fundamentals.employees, 0)} employees</span>`;
        if (fundamentals.website) html += `<span><a href="${fundamentals.website}" target="_blank" rel="noopener">${fundamentals.website}</a></span>`;
        html += '</div>';

        if (fundamentals.summary) {
            let text = fundamentals.summary;
            if (text.length > 300) {
                text = text.substring(0, 300);
                const lastDot = text.lastIndexOf('. ');
                if (lastDot > 100) {
                    text = text.substring(0, lastDot + 1);
                } else {
                    text = text.substring(0, text.lastIndexOf(' ')) + '...';
                }
            }
            html += `<p>${text}</p>`;
        }

        container.innerHTML = html;
    },

    renderProjections(fundamentals, currency) {
        const container = document.getElementById('projections-content');
        if (!container) return;

        if (!fundamentals || (fundamentals.target_mean == null && !fundamentals.growth_estimates)) {
            container.innerHTML = '<div class="no-data">Projections unavailable</div>';
            return;
        }

        let html = '<div class="projections-grid">';

        if (fundamentals.target_mean != null) {
            const items = [
                { label: 'Low Target', value: Utils.formatCurrency(fundamentals.target_low, currency) },
                { label: 'Mean Target', value: Utils.formatCurrency(fundamentals.target_mean, currency) },
                { label: 'Median Target', value: Utils.formatCurrency(fundamentals.target_median, currency) },
                { label: 'High Target', value: Utils.formatCurrency(fundamentals.target_high, currency) },
            ];

            for (const item of items) {
                html += `<div class="projection-item"><div class="proj-label">${item.label}</div><div class="proj-value">${item.value}</div></div>`;
            }
        }

        if (fundamentals.recommendation) {
            const recoLabels = {
                buy: 'Buy', hold: 'Hold', sell: 'Sell',
                strong_buy: 'Strong Buy', strong_sell: 'Strong Sell',
                underperform: 'Underperform', outperform: 'Outperform',
            };
            const reco = recoLabels[fundamentals.recommendation] || fundamentals.recommendation;
            html += `<div class="projection-item"><div class="proj-label">Recommendation</div><div class="proj-value">${reco}</div></div>`;
        }

        if (fundamentals.num_analysts != null) {
            html += `<div class="projection-item"><div class="proj-label">Analysts</div><div class="proj-value">${fundamentals.num_analysts}</div></div>`;
        }

        if (fundamentals.growth_estimates) {
            try {
                const ge = fundamentals.growth_estimates;
                const ticker = fundamentals.ticker;
                if (ge[ticker]) {
                    const tickerGrowth = ge[ticker];
                    for (const [period, val] of Object.entries(tickerGrowth)) {
                        if (val != null) {
                            html += `<div class="projection-item"><div class="proj-label">Growth (${period})</div><div class="proj-value">${Utils.formatPercent(val)}</div></div>`;
                        }
                    }
                }
            } catch (e) {
                // Not critical
            }
        }

        html += '</div>';
        container.innerHTML = html;
    },

    renderTickerBar(company, prices, history) {
        const symbolEl = document.getElementById('ticker-symbol');
        const badgeEl = document.getElementById('pea-badge');
        const priceEl = document.getElementById('price-current');
        const changeEl = document.getElementById('price-change');

        if (symbolEl) symbolEl.textContent = company.isin || company.ticker;

        if (badgeEl) {
            if (company.pea_eligible) {
                badgeEl.textContent = 'PEA';
                badgeEl.className = 'badge badge-pea';
            } else {
                badgeEl.textContent = 'Non PEA';
                badgeEl.className = 'badge badge-no-pea';
            }
        }

        if (prices) {
            if (priceEl) priceEl.textContent = Utils.formatCurrency(prices.price, prices.currency || company.currency);
            if (changeEl) {
                const sign = prices.change >= 0 ? '+' : '';
                changeEl.textContent = `${sign}${Utils.formatNumber(prices.change)} (${sign}${Utils.formatNumber(prices.change_pct)}%)`;
                changeEl.className = `price-change ${Utils.valueClass(prices.change)}`;
            }
        } else {
            if (priceEl) priceEl.textContent = '\u2014';
            if (changeEl) changeEl.textContent = 'Price unavailable';
        }

        // Price performance badges
        this.renderPricePerformance(prices, history);
    },

    renderPricePerformance(prices, history) {
        const container = document.getElementById('price-performance');
        if (!container) return;

        const badges = [];

        // Today
        if (prices && prices.change_pct != null) {
            badges.push({ label: 'Today', value: prices.change_pct });
        }

        // 1W, 1M, 1Y, 5Y from history
        if (history && history.length > 5) {
            const lastClose = history[history.length - 1].close;

            // 1W (~5 trading days back)
            if (history.length > 5) {
                const weekClose = history[history.length - 6].close;
                if (weekClose > 0) {
                    badges.push({ label: '1W', value: ((lastClose - weekClose) / weekClose) * 100 });
                }
            }

            // 1M (~22 trading days back)
            if (history.length > 22) {
                const monthClose = history[history.length - 23].close;
                if (monthClose > 0) {
                    badges.push({ label: '1M', value: ((lastClose - monthClose) / monthClose) * 100 });
                }
            }

            // 1Y (~252 trading days back)
            if (history.length > 252) {
                const yearClose = history[history.length - 253].close;
                if (yearClose > 0) {
                    badges.push({ label: '1Y', value: ((lastClose - yearClose) / yearClose) * 100 });
                }
            }

            // 5Y (first data point if we have ~5 years of data, i.e. >1000 days)
            if (history.length > 1000) {
                const fiveYearClose = history[0].close;
                if (fiveYearClose > 0) {
                    badges.push({ label: '5Y', value: ((lastClose - fiveYearClose) / fiveYearClose) * 100 });
                }
            }
        }

        if (badges.length === 0) {
            container.style.display = 'none';
            return;
        }

        container.innerHTML = badges.map(b => {
            const sign = b.value >= 0 ? '+' : '';
            const cls = b.value >= 0 ? 'positive' : 'negative';
            return `<div class="perf-badge">
                <span class="perf-label">${b.label}</span>
                <span class="perf-value ${cls}">${sign}${b.value.toFixed(2)}%</span>
            </div>`;
        }).join('');
    },

    renderQuarterly(fundamentals, currency) {
        const container = document.getElementById('quarterly-content');
        const heading = document.getElementById('results-heading');
        if (!container) return;

        // Determine data source: quarterly if available, otherwise annual
        const hasQuarterly = fundamentals && fundamentals.quarterly_income &&
            Object.keys(fundamentals.quarterly_income).length > 0;
        const hasAnnual = fundamentals && fundamentals.income_stmt &&
            Object.keys(fundamentals.income_stmt).length > 0;

        if (!hasQuarterly && !hasAnnual) {
            container.innerHTML = '<div class="no-data">Results unavailable</div>';
            if (heading) heading.textContent = 'Results';
            return;
        }

        const isQuarterly = hasQuarterly;
        const data = isQuarterly ? fundamentals.quarterly_income : fundamentals.income_stmt;

        if (heading) heading.textContent = isQuarterly ? 'Quarterly Results' : 'Annual Results';

        // Filter to last 4 years and sort descending
        const now = new Date();
        const fourYearsAgo = new Date(now.getFullYear() - 4, 0, 1);
        const periods = Object.keys(data)
            .filter(p => { const d = new Date(p); return !isNaN(d.getTime()) && d >= fourYearsAgo; })
            .sort().reverse();

        // For quarterly, cap at 16 (4 years); for annual, cap at 4
        const maxPeriods = isQuarterly ? 16 : 4;
        const displayPeriods = periods.slice(0, maxPeriods);

        if (displayPeriods.length === 0) {
            container.innerHTML = '<div class="no-data">Results unavailable</div>';
            return;
        }

        // Build period labels
        let html = '<table class="data-table"><thead><tr><th>Period</th>';
        for (const p of displayPeriods) {
            const d = new Date(p);
            let label;
            if (isQuarterly) {
                label = `Q${Math.ceil((d.getMonth() + 1) / 3)} ${d.getFullYear()}`;
            } else {
                label = `FY ${d.getFullYear()}`;
            }
            html += `<th>${label}</th>`;
        }
        html += '</tr></thead><tbody>';

        const rows = [
            { label: 'Revenue', key: 'Total Revenue' },
            { label: 'Net Income', key: 'Net Income' },
            { label: 'EBITDA', key: 'EBITDA' },
            { label: 'Operating Income', key: 'Operating Income' },
        ];

        for (const row of rows) {
            // Data row
            html += `<tr><td>${row.label}</td>`;
            for (const p of displayPeriods) {
                const val = data[p] && data[p][row.key];
                html += `<td>${Utils.formatLargeNumber(val, currency)}</td>`;
            }
            html += '</tr>';

            // YoY growth row
            html += `<tr class="yoy-row"><td>YoY</td>`;
            for (const p of displayPeriods) {
                const val = data[p] && data[p][row.key];
                // Find the same period one year earlier
                const d = new Date(p);
                const yoyDate = new Date(d.getFullYear() - 1, d.getMonth(), d.getDate());
                // Find closest match in data
                let prevVal = null;
                for (const pp of Object.keys(data)) {
                    const pd = new Date(pp);
                    if (Math.abs(pd - yoyDate) < 45 * 24 * 60 * 60 * 1000) {
                        prevVal = data[pp] && data[pp][row.key];
                        break;
                    }
                }
                if (val != null && prevVal != null && prevVal !== 0) {
                    const growth = ((val - prevVal) / Math.abs(prevVal)) * 100;
                    const sign = growth >= 0 ? '+' : '';
                    const cls = growth >= 0 ? 'positive' : 'negative';
                    html += `<td class="${cls}">${sign}${growth.toFixed(1)}%</td>`;
                } else {
                    html += `<td>\u2014</td>`;
                }
            }
            html += '</tr>';
        }

        html += '</tbody></table>';
        container.innerHTML = html;
    },

    showLastUpdated(data) {
        const el = document.getElementById('last-updated');
        if (el && data && data.date) {
            el.textContent = `Last updated: ${data.date}`;
        }
    },

    showError(message) {
        const main = document.querySelector('.main');
        if (main) {
            main.innerHTML = `<div class="header"><h1>Error</h1></div><div class="error-message">${message}</div>`;
        }
    },
};

document.addEventListener('DOMContentLoaded', () => App.init());
