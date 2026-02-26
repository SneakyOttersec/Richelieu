/**
 * News section with year filtering and grouping.
 */

const NewsSection = {
    newsData: [],

    init(news) {
        this.newsData = news || [];
        this.setupYearFilter();
        this.render();
    },

    setupYearFilter() {
        const select = document.getElementById('news-year');
        if (!select) return;

        const currentYear = new Date().getFullYear();
        select.innerHTML = '';

        const allOpt = document.createElement('option');
        allOpt.value = 'all';
        allOpt.textContent = 'All';
        select.appendChild(allOpt);

        for (let y = currentYear; y >= currentYear - 4; y--) {
            const opt = document.createElement('option');
            opt.value = y;
            opt.textContent = y;
            select.appendChild(opt);
        }

        select.addEventListener('change', () => this.render());
    },

    render() {
        const container = document.getElementById('news-content');
        if (!container) return;

        if (!this.newsData || this.newsData.length === 0) {
            container.innerHTML = '<div class="no-data">No news available</div>';
            return;
        }

        const select = document.getElementById('news-year');
        const yearFilter = select ? select.value : 'all';

        let filtered = this.newsData;
        if (yearFilter !== 'all') {
            filtered = this.newsData.filter(item => {
                const date = this.parseDate(item.date);
                return date && date.getFullYear() === parseInt(yearFilter);
            });
        }

        if (filtered.length === 0) {
            container.innerHTML = '<div class="no-data">No news for this period</div>';
            return;
        }

        filtered.sort((a, b) => {
            const da = this.parseDate(a.date);
            const db = this.parseDate(b.date);
            return (db || 0) - (da || 0);
        });

        const months = this.groupByMonth(filtered);

        let html = '';
        for (const [monthKey, items] of Object.entries(months)) {
            html += `<details class="news-group" ${Object.keys(months)[0] === monthKey ? 'open' : ''}>`;
            html += `<summary>${monthKey} (${items.length} article${items.length > 1 ? 's' : ''})</summary>`;

            const weeks = this.groupByWeek(items);
            for (const [weekKey, weekItems] of Object.entries(weeks)) {
                html += `<details class="news-group" style="margin-left:1rem;">`;
                html += `<summary>${weekKey} (${weekItems.length})</summary>`;

                for (const item of weekItems) {
                    html += this.renderNewsItem(item);
                }

                html += `</details>`;
            }

            html += `</details>`;
        }

        container.innerHTML = html;
    },

    parseDate(dateVal) {
        if (!dateVal) return null;
        if (typeof dateVal === 'number') {
            return new Date(dateVal > 1e12 ? dateVal : dateVal * 1000);
        }
        const d = new Date(dateVal);
        return isNaN(d.getTime()) ? null : d;
    },

    groupByMonth(items) {
        const groups = {};
        const monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];

        for (const item of items) {
            const date = this.parseDate(item.date);
            if (!date) continue;
            const key = `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(item);
        }
        return groups;
    },

    groupByWeek(items) {
        const groups = {};
        for (const item of items) {
            const date = this.parseDate(item.date);
            if (!date) continue;
            const week = Utils.getISOWeek(date);
            const key = `Week ${week}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(item);
        }
        return groups;
    },

    renderNewsItem(item) {
        const date = this.parseDate(item.date);
        const dateStr = date ? Utils.formatDateShort(date.toISOString()) : '';
        const title = this.escapeHtml(item.title || 'Untitled');
        const link = item.link || '#';
        const publisher = this.escapeHtml(item.publisher || '');

        return `
            <div class="news-item">
                <div class="news-title"><a href="${link}" target="_blank" rel="noopener">${title}</a></div>
                <span class="news-date">${dateStr}</span>
                ${publisher ? `<span class="news-source"> &middot; ${publisher}</span>` : ''}
            </div>
        `;
    },

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },
};
