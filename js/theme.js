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
        this.updateButton();
    },

    toggle() {
        const next = this.current === 'dark' ? 'light' : 'dark';
        this.apply(next);
        this.refreshCharts();
    },

    updateButton() {
        const btn = document.getElementById('theme-toggle');
        if (btn) {
            btn.textContent = this.current === 'dark' ? '\u2600' : '\u263E';
            btn.title = this.current === 'dark' ? 'Light theme' : 'Dark theme';
        }
    },

    setupToggle() {
        const btn = document.getElementById('theme-toggle');
        if (btn) {
            btn.addEventListener('click', () => this.toggle());
        }
    },

    refreshCharts() {
        if (typeof ChartWidget !== 'undefined' && ChartWidget.refresh) {
            ChartWidget.refresh();
        }
        if (typeof PieCharts !== 'undefined' && PieCharts.refresh) {
            PieCharts.refresh();
        }
    },
};

document.addEventListener('DOMContentLoaded', () => Theme.init());
