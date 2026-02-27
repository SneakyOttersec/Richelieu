/**
 * Theme toggle: dark/light mode with localStorage persistence.
 */

const Theme = {
    current: 'dark',

    init() {
        this.current = localStorage.getItem('theme') || 'dark';
        this.apply(this.current);
        this.setupToggle();
    },

    apply(theme) {
        this.current = theme;
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        this.updateSelect();
    },

    toggle() {
        const next = this.current === 'dark' ? 'light' : 'dark';
        this.apply(next);
        this.refreshCharts();
    },

    updateSelect() {
        const sel = document.getElementById('setting-theme');
        if (sel) {
            sel.value = this.current;
        }
    },

    setupToggle() {
        const sel = document.getElementById('setting-theme');
        if (sel) {
            sel.value = this.current;
            sel.addEventListener('change', () => {
                this.apply(sel.value);
                this.refreshCharts();
            });
        }
    },

    refreshCharts() {
        if (typeof ChartWidget !== 'undefined' && ChartWidget.refresh) {
            ChartWidget.refresh();
        }
        if (typeof PieCharts !== 'undefined' && PieCharts.refresh) {
            PieCharts.refresh();
        }
        if (typeof IndexChart !== 'undefined' && IndexChart.refresh) {
            IndexChart.refresh();
        }
    },
};

document.addEventListener('DOMContentLoaded', () => Theme.init());
