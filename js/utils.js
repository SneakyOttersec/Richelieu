/**
 * Formatting utilities.
 */

const Utils = {
    formatCurrency(value, currency = 'EUR') {
        if (value == null || isNaN(value)) return '\u2014';
        const opts = { style: 'currency', currency, maximumFractionDigits: 2 };
        return new Intl.NumberFormat('en-US', opts).format(value);
    },

    formatLargeNumber(value, currency = 'EUR') {
        if (value == null || isNaN(value)) return '\u2014';
        const abs = Math.abs(value);
        const sign = value < 0 ? '-' : '';
        const symbols = { EUR: '\u20ac', USD: '$', GBP: '\u00a3', JPY: '\u00a5', CAD: 'CA$' };
        const sym = symbols[currency] || currency + ' ';

        if (abs >= 1e12) return `${sign}${sym}${(abs / 1e12).toFixed(2)}T`;
        if (abs >= 1e9) return `${sign}${sym}${(abs / 1e9).toFixed(2)}B`;
        if (abs >= 1e6) return `${sign}${sym}${(abs / 1e6).toFixed(2)}M`;
        if (abs >= 1e3) return `${sign}${sym}${(abs / 1e3).toFixed(1)}k`;
        return `${sign}${sym}${abs.toFixed(2)}`;
    },

    formatPercent(value, isDecimal = true) {
        if (value == null || isNaN(value)) return '\u2014';
        const pct = isDecimal ? value * 100 : value;
        return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
    },

    formatNumber(value, decimals = 2) {
        if (value == null || isNaN(value)) return '\u2014';
        return new Intl.NumberFormat('en-US', {
            maximumFractionDigits: decimals,
            minimumFractionDigits: decimals,
        }).format(value);
    },

    formatDate(dateStr) {
        if (!dateStr) return '\u2014';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString('en-US', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        });
    },

    formatDateShort(dateStr) {
        if (!dateStr) return '\u2014';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString('en-US', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        });
    },

    tickerToFilename(ticker) {
        return ticker.replace(/\./g, '_').replace(/-/g, '_');
    },

    getUrlParam(name) {
        return new URLSearchParams(window.location.search).get(name);
    },

    valueClass(value) {
        if (value == null || isNaN(value)) return '';
        return value >= 0 ? 'positive' : 'negative';
    },

    getISOWeek(date) {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
        const week1 = new Date(d.getFullYear(), 0, 4);
        return 1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
    },
};
