/**
 * Chart widget using TradingView lightweight-charts.
 * Loads OHLCV data from data/history/{ticker}.json.
 */

const ChartWidget = {
    containerId: 'tradingview-container',
    chart: null,
    candleSeries: null,
    volumeSeries: null,
    historyData: null,
    currentPeriod: '6M',

    getThemeColors() {
        const isLight = document.documentElement.getAttribute('data-theme') === 'light';
        return isLight ? {
            bg: '#fafafa',
            text: '#22272a',
            grid: '#e1e1e1',
            border: '#666666',
            upColor: '#2bbc8a',
            downColor: '#e06c75',
            volUp: 'rgba(43,188,138,0.3)',
            volDown: 'rgba(224,108,117,0.3)',
        } : {
            bg: '#1d1f21',
            text: '#c9cacc',
            grid: '#2a2d30',
            border: '#666666',
            upColor: '#2bbc8a',
            downColor: '#e06c75',
            volUp: 'rgba(43,188,138,0.3)',
            volDown: 'rgba(224,108,117,0.3)',
        };
    },

    refresh() {
        if (this.historyData) {
            this.renderChart();
        }
    },

    /**
     * Initialise le graphique.
     * @param {string} _tvSymbol - Ignore (conserve pour compatibilite)
     * @param {string} ticker - Ticker yfinance (ex: "MC.PA")
     */
    init(_tvSymbol, ticker) {
        this.ticker = ticker;
        this.setupControls();
        this.loadData(ticker);
    },

    setupControls() {
        const controls = document.getElementById('chart-controls');
        if (!controls) return;

        controls.querySelectorAll('.chart-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                controls.querySelectorAll('.chart-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentPeriod = btn.dataset.interval;
                this.renderChart();
            });
        });
    },

    async loadData(ticker) {
        const filename = ticker.replace(/\./g, '_').replace(/-/g, '_');
        try {
            const resp = await fetch(`data/history/${filename}.json`);
            if (!resp.ok) throw new Error('Historique non disponible');
            this.historyData = await resp.json();
            this.renderChart();
        } catch (e) {
            const container = document.getElementById(this.containerId);
            if (container) {
                container.innerHTML = `<div class="no-data">Historique non disponible pour ${ticker}</div>`;
            }
        }
    },

    filterByPeriod(data, period) {
        if (!data || !data.length) return data;
        const now = new Date(data[data.length - 1].time);
        let cutoff;
        switch (period) {
            case '1M': cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 1); break;
            case '3M': cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 3); break;
            case '6M': cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 6); break;
            case '1Y': cutoff = new Date(now); cutoff.setFullYear(cutoff.getFullYear() - 1); break;
            case '5Y': default: return data;
        }
        const cutoffStr = cutoff.toISOString().slice(0, 10);
        return data.filter(d => d.time >= cutoffStr);
    },

    renderChart() {
        const container = document.getElementById(this.containerId);
        if (!container || !this.historyData) return;

        container.innerHTML = '';

        const filtered = this.filterByPeriod(this.historyData, this.currentPeriod);
        if (!filtered.length) {
            container.innerHTML = '<div class="no-data">Aucune donnee pour cette periode</div>';
            return;
        }

        const colors = this.getThemeColors();

        this.chart = LightweightCharts.createChart(container, {
            width: container.clientWidth,
            height: 500,
            layout: {
                background: { color: colors.bg },
                textColor: colors.text,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
            },
            grid: {
                vertLines: { color: colors.grid },
                horzLines: { color: colors.grid },
            },
            crosshair: {
                mode: LightweightCharts.CrosshairMode.Normal,
            },
            rightPriceScale: {
                borderColor: colors.border,
            },
            timeScale: {
                borderColor: colors.border,
                timeVisible: false,
            },
        });

        this.candleSeries = this.chart.addSeries(
            LightweightCharts.CandlestickSeries,
            {
                upColor: colors.upColor,
                downColor: colors.downColor,
                borderUpColor: colors.upColor,
                borderDownColor: colors.downColor,
                wickUpColor: colors.upColor,
                wickDownColor: colors.downColor,
            }
        );
        this.candleSeries.setData(filtered);

        this.volumeSeries = this.chart.addSeries(
            LightweightCharts.HistogramSeries,
            {
                priceFormat: { type: 'volume' },
                priceScaleId: 'volume',
            }
        );
        this.chart.priceScale('volume').applyOptions({
            scaleMargins: { top: 0.8, bottom: 0 },
        });
        this.volumeSeries.setData(
            filtered.map(d => ({
                time: d.time,
                value: d.volume,
                color: d.close >= d.open ? colors.volUp : colors.volDown,
            }))
        );

        this.chart.timeScale().fitContent();

        // Responsive resize
        const ro = new ResizeObserver(() => {
            if (this.chart) {
                this.chart.applyOptions({ width: container.clientWidth });
            }
        });
        ro.observe(container);
    },
};
