/**
 * Chart.js doughnut charts for revenue segmentation.
 */

const PieCharts = {
    colors: [
        '#2bbc8a', '#d480aa', '#eeeeee', '#6699cc',
        '#e6c07b', '#d19a66', '#c678dd', '#56b6c2',
        '#98c379', '#e06c75',
    ],

    chartInstances: {},
    lastFundamentals: null,

    getThemeColors() {
        const isLight = document.documentElement.getAttribute('data-theme') === 'light';
        return {
            borderColor: isLight ? '#fafafa' : '#1d1f21',
            legendColor: isLight ? '#22272a' : '#c9cacc',
            tooltipBg: isLight ? '#f5f5f5' : '#242629',
            tooltipTitle: isLight ? '#22272a' : '#eeeeee',
            tooltipBody: isLight ? '#22272a' : '#c9cacc',
            tooltipBorder: isLight ? '#666666' : '#666666',
        };
    },

    refresh() {
        if (this.lastFundamentals) {
            this.init(this.lastFundamentals);
        }
    },

    /**
     * Initialise les camemberts avec les donnees fondamentales.
     * @param {Object} fundamentals - Donnees fondamentales de l'entreprise
     */
    init(fundamentals) {
        this.lastFundamentals = fundamentals;
        this.renderGeoChart(fundamentals);
        this.renderSegmentChart(fundamentals);
    },

    /**
     * Rendu du camembert geographique.
     */
    renderGeoChart(fundamentals) {
        const canvas = document.getElementById('pie-geo');
        if (!canvas) return;

        // Essayer d'extraire les donnees geographiques du income statement ou revenue segmentation
        const geoData = this.extractGeoData(fundamentals);

        if (!geoData) {
            canvas.parentElement.innerHTML = '<h3>Par region</h3><div class="no-data">Donnees non disponibles</div>';
            return;
        }

        this.createDoughnut(canvas, geoData.labels, geoData.values, 'geo');
    },

    /**
     * Rendu du camembert par segment d'activite.
     */
    renderSegmentChart(fundamentals) {
        const canvas = document.getElementById('pie-segment');
        if (!canvas) return;

        const segData = this.extractSegmentData(fundamentals);

        if (!segData) {
            canvas.parentElement.innerHTML = '<h3>Par activite</h3><div class="no-data">Donnees non disponibles</div>';
            return;
        }

        this.createDoughnut(canvas, segData.labels, segData.values, 'segment');
    },

    /**
     * Extrait les donnees geographiques si disponibles.
     */
    extractGeoData(fundamentals) {
        // Les donnees de segmentation geographique sont rarement disponibles via yfinance
        // On retourne null pour afficher le fallback
        // Dans une version future, on pourrait parser les donnees supplementaires
        if (fundamentals && fundamentals.revenue_forecasts) {
            try {
                const data = fundamentals.revenue_forecasts;
                const labels = Object.keys(data);
                if (labels.length > 0) {
                    const values = labels.map(k => {
                        const vals = Object.values(data[k]);
                        return vals[0] || 0;
                    });
                    if (values.some(v => v > 0)) {
                        return { labels, values };
                    }
                }
            } catch (e) {
                // Fallback
            }
        }
        return null;
    },

    /**
     * Extrait les donnees de segmentation par activite.
     */
    extractSegmentData(fundamentals) {
        // Meme logique - donnees rarement disponibles
        return null;
    },

    /**
     * Cree un graphique doughnut Chart.js.
     */
    createDoughnut(canvas, labels, values, id) {
        if (this.chartInstances[id]) {
            this.chartInstances[id].destroy();
        }

        const tc = this.getThemeColors();

        this.chartInstances[id] = new Chart(canvas, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: this.colors.slice(0, labels.length),
                    borderColor: tc.borderColor,
                    borderWidth: 2,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: tc.legendColor,
                            font: {
                                family: "'JetBrains Mono', monospace",
                                size: 11,
                            },
                            padding: 12,
                        },
                    },
                    tooltip: {
                        backgroundColor: tc.tooltipBg,
                        titleColor: tc.tooltipTitle,
                        bodyColor: tc.tooltipBody,
                        borderColor: tc.tooltipBorder,
                        borderWidth: 1,
                        titleFont: { family: "'JetBrains Mono', monospace" },
                        bodyFont: { family: "'JetBrains Mono', monospace" },
                        callbacks: {
                            label(ctx) {
                                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                                const pct = ((ctx.raw / total) * 100).toFixed(1);
                                return ` ${ctx.label}: ${pct}%`;
                            },
                        },
                    },
                },
            },
        });
    },
};
