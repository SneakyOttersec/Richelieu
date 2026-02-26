/**
 * IndexChart - G7 indices chart (20 years, base 100) using Lightweight Charts.
 */

const IndexChart = {
    chart: null,
    seriesList: [],
    indicesData: null,
    basePath: '',

    getThemeColors() {
        const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
        return {
            background: isDark ? '#1d1f21' : '#fafafa',
            textColor: isDark ? '#c9cacc' : '#22272a',
            gridColor: isDark ? '#333538' : '#e0e0e0',
            borderColor: isDark ? '#666666' : '#666666',
        };
    },

    async init(basePath) {
        this.basePath = basePath || '';
        const container = document.getElementById('indices-chart-container');
        if (!container || typeof LightweightCharts === 'undefined') return;

        try {
            const resp = await fetch(`${this.basePath}data/indices.json`);
            if (!resp.ok) {
                container.innerHTML = '<div class="no-data">Index data unavailable</div>';
                return;
            }
            this.indicesData = await resp.json();
            this.renderChart();
        } catch (e) {
            console.error('Error loading indices:', e);
            container.innerHTML = '<div class="no-data">Index data unavailable</div>';
        }
    },

    normalizeToBase100(allSeries) {
        // Find the first date shared by all series
        const dateSets = allSeries.map(s => new Set(s.data.map(d => d.time)));
        let sharedDates = [...dateSets[0]];
        for (let i = 1; i < dateSets.length; i++) {
            sharedDates = sharedDates.filter(d => dateSets[i].has(d));
        }
        sharedDates.sort();

        if (sharedDates.length === 0) return allSeries;

        const baseDate = sharedDates[0];

        return allSeries.map(s => {
            const basePoint = s.data.find(d => d.time === baseDate);
            if (!basePoint || basePoint.value === 0) return s;
            const baseVal = basePoint.value;

            return {
                ...s,
                data: s.data
                    .filter(d => d.time >= baseDate)
                    .map(d => ({
                        time: d.time,
                        value: Math.round((d.value / baseVal) * 10000) / 100,
                    })),
            };
        });
    },

    renderChart() {
        const container = document.getElementById('indices-chart-container');
        const legendEl = document.getElementById('indices-legend');
        if (!container || !this.indicesData) return;

        // Clear previous
        container.innerHTML = '';
        this.seriesList = [];

        const colors = this.getThemeColors();

        this.chart = LightweightCharts.createChart(container, {
            width: container.clientWidth,
            height: 450,
            layout: {
                background: { type: 'solid', color: colors.background },
                textColor: colors.textColor,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
            },
            grid: {
                vertLines: { color: colors.gridColor },
                horzLines: { color: colors.gridColor },
            },
            rightPriceScale: {
                borderColor: colors.borderColor,
            },
            timeScale: {
                borderColor: colors.borderColor,
                timeVisible: false,
            },
            crosshair: {
                mode: LightweightCharts.CrosshairMode.Normal,
            },
        });

        // Prepare all series
        let allSeries = [];
        for (const [ticker, info] of Object.entries(this.indicesData)) {
            if (info.data && info.data.length > 0) {
                allSeries.push({
                    ticker,
                    name: info.name,
                    color: info.color,
                    data: info.data,
                });
            }
        }

        // Normalize to base 100
        allSeries = this.normalizeToBase100(allSeries);

        // Add each as a line series
        for (const s of allSeries) {
            const lineSeries = this.chart.addSeries(LightweightCharts.LineSeries, {
                color: s.color,
                lineWidth: 2,
                priceLineVisible: false,
                lastValueVisible: false,
                crosshairMarkerVisible: true,
            });
            lineSeries.setData(s.data);
            this.seriesList.push({ series: lineSeries, ...s });
        }

        this.chart.timeScale().fitContent();

        // Build legend
        if (legendEl) {
            legendEl.innerHTML = allSeries.map(s =>
                `<span class="index-legend-item"><span class="index-legend-dot" style="background:${s.color}"></span>${s.name}</span>`
            ).join('');
        }

        // Responsive resize
        const ro = new ResizeObserver(entries => {
            for (const entry of entries) {
                this.chart.applyOptions({ width: entry.contentRect.width });
            }
        });
        ro.observe(container);
    },

    refresh() {
        if (this.chart && this.indicesData) {
            this.renderChart();
        }
    },
};
