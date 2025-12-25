// Claude Code News - Frontend Application
class NewsApp {
    constructor() {
        this.currentPage = 1;
        this.currentCategory = null;
        this.searchTerm = '';
        this.articles = [];
        this.totalPages = 1;
        this.categories = [];
        this.stats = null;
        this.isLoading = false;

        this.init();
    }

    async init() {
        this.bindEvents();
        // Load stats first, then categories (which need stats for counts)
        await this.loadStats();
        await Promise.all([
            this.loadCategories(),
            this.loadFeatured(),
            this.loadNews()
        ]);
        this.startAutoRefresh();
    }

    bindEvents() {
        // Search
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            let debounceTimer;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    this.searchTerm = e.target.value;
                    this.currentPage = 1;
                    this.loadNews();
                }, 300);
            });
        }

        // Refresh button
        const refreshBtn = document.getElementById('refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.triggerRefresh());
        }
    }

    async fetchAPI(endpoint) {
        try {
            const response = await fetch(`/api${endpoint}`);
            if (!response.ok) throw new Error('API error');
            return await response.json();
        } catch (error) {
            console.error('API fetch error:', error);
            return null;
        }
    }

    async loadCategories() {
        const data = await this.fetchAPI('/categories');
        if (data && data.success) {
            this.categories = data.categories;
            this.renderCategories();
        }
    }

    async loadStats() {
        const data = await this.fetchAPI('/stats');
        if (data && data.success) {
            this.stats = data;
            this.renderStats();
        }
    }

    async loadFeatured() {
        const data = await this.fetchAPI('/news/featured');
        if (data && data.success && data.articles.length > 0) {
            this.renderFeatured(data.articles);
        }
    }

    async loadNews() {
        if (this.isLoading) return;
        this.isLoading = true;
        this.showLoading();

        let endpoint = `/news?page=${this.currentPage}&limit=12`;
        if (this.currentCategory) endpoint += `&category=${this.currentCategory}`;
        if (this.searchTerm) endpoint += `&search=${encodeURIComponent(this.searchTerm)}`;

        const data = await this.fetchAPI(endpoint);
        this.isLoading = false;

        if (data && data.success) {
            this.articles = data.articles;
            this.totalPages = data.totalPages;
            this.renderNews();
            this.renderPagination();
        } else {
            this.showEmpty();
        }
    }

    async triggerRefresh() {
        const btn = document.getElementById('refresh-btn');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner"></span> Scanning for new articles...';
        }

        const result = await this.fetchAPI('/refresh');

        // Show result message
        if (result && result.success) {
            if (btn) {
                btn.innerHTML = result.newCount > 0
                    ? `&#10003; Found ${result.newCount} NEW!`
                    : '&#10003; No new articles';
            }
        }

        setTimeout(async () => {
            await Promise.all([
                this.loadStats(),
                this.loadFeatured(),
                this.loadNews()
            ]);
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '&#8635; Refresh';
            }
        }, 2500);
    }

    setCategory(category) {
        this.currentCategory = category;
        this.currentPage = 1;

        // Update active state
        document.querySelectorAll('.category-item').forEach(item => {
            item.classList.toggle('active', item.dataset.category === (category || ''));
        });

        this.loadNews();
    }

    setPage(page) {
        if (page >= 1 && page <= this.totalPages) {
            this.currentPage = page;
            this.loadNews();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    renderCategories() {
        const container = document.getElementById('category-list');
        if (!container) return;

        const icons = {
            official: '&#128226;',
            releases: '&#128640;',
            tech: '&#128187;',
            tutorials: '&#128214;',
            articles: '&#128196;',
            community: '&#128101;'
        };

        container.innerHTML = `
            <div class="category-item active" data-category="" onclick="app.setCategory(null)">
                <span class="category-icon">&#127760;</span>
                <span class="category-name">All News</span>
            </div>
            ${this.categories.map(cat => `
                <div class="category-item" data-category="${cat.id}" onclick="app.setCategory('${cat.id}')">
                    <span class="category-icon">${icons[cat.id] || '&#128196;'}</span>
                    <span class="category-name">${cat.name}</span>
                    <span class="category-count">${this.stats?.categories?.[cat.id] || 0}</span>
                </div>
            `).join('')}
        `;
    }

    renderStats() {
        const container = document.getElementById('stats-content');
        if (!container || !this.stats) return;

        const lastUpdate = this.stats.lastUpdated
            ? this.formatTimeAgo(new Date(this.stats.lastUpdated))
            : 'Never';

        container.innerHTML = `
            <div class="stats-left">
                <div class="stat-item">
                    <span class="stat-value">${this.stats.totalArticles}</span>
                    <span class="stat-label">Articles</span>
                </div>
                <div class="stat-item">
                    <span class="stat-value">${this.stats.avgRelevance}%</span>
                    <span class="stat-label">Avg Relevance</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Updated: ${lastUpdate}</span>
                </div>
            </div>
            <div class="live-indicator">
                <span class="live-dot"></span>
                <span>Auto-updating every 6 hours</span>
            </div>
        `;
    }

    renderFeatured(articles) {
        const container = document.getElementById('featured-container');
        if (!container || articles.length === 0) return;

        const main = articles[0];
        const sidebar = articles.slice(1, 4);

        container.innerHTML = `
            <div class="featured-main fade-in">
                <div class="featured-image">
                    ${main.thumbnail
                        ? `<img src="${main.thumbnail}" alt="${this.escapeHtml(main.title)}" onerror="this.parentElement.innerHTML='<span class=\\'featured-image-placeholder\\'>&#128240;</span>'">`
                        : '<span class="featured-image-placeholder">&#128240;</span>'
                    }
                </div>
                <div class="featured-content">
                    <span class="featured-badge">&#11088; Featured</span>
                    <h2 class="featured-title">
                        <a href="${main.link}" target="_blank" rel="noopener">${this.escapeHtml(main.title)}</a>
                    </h2>
                    <p class="featured-desc">${this.escapeHtml(main.description)}</p>
                    <div class="featured-meta">
                        <span class="featured-meta-item">&#128188; ${main.source}</span>
                        <span class="featured-meta-item">&#128337; ${this.formatTimeAgo(new Date(main.pubDate))}</span>
                        <span class="relevance-badge relevance-high">&#127919; ${main.relevance}% relevant</span>
                    </div>
                </div>
            </div>
            <div class="featured-sidebar">
                ${sidebar.map(article => `
                    <div class="featured-small fade-in">
                        <div class="news-card-category">${this.getCategoryName(article.category)}</div>
                        <h3 class="featured-small-title">
                            <a href="${article.link}" target="_blank" rel="noopener">${this.escapeHtml(article.title)}</a>
                        </h3>
                        <div class="featured-meta">
                            <span class="featured-meta-item">&#128337; ${this.formatTimeAgo(new Date(article.pubDate))}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    renderNews() {
        const container = document.getElementById('news-grid');
        if (!container) return;

        if (this.articles.length === 0) {
            this.showEmpty();
            return;
        }

        container.innerHTML = this.articles.map((article, index) => `
            <article class="news-card fade-in" style="animation-delay: ${index * 0.05}s">
                <div class="news-card-image">
                    ${article.thumbnail
                        ? `<img src="${article.thumbnail}" alt="${this.escapeHtml(article.title)}" loading="lazy" onerror="this.parentElement.innerHTML='<span class=\\'news-card-image-placeholder\\'>&#128196;</span>'">`
                        : '<span class="news-card-image-placeholder">&#128196;</span>'
                    }
                </div>
                <div class="news-card-body">
                    <span class="news-card-category">${this.getCategoryIcon(article.category)} ${this.getCategoryName(article.category)}</span>
                    <h3 class="news-card-title">
                        <a href="${article.link}" target="_blank" rel="noopener">${this.escapeHtml(article.title)}</a>
                    </h3>
                    <p class="news-card-desc">${this.escapeHtml(article.description)}</p>
                    <div class="news-card-footer">
                        <span class="news-card-source">${article.source}</span>
                        <span class="${this.getRelevanceClass(article.relevance)}">${article.relevance}%</span>
                    </div>
                </div>
            </article>
        `).join('');
    }

    renderPagination() {
        const container = document.getElementById('pagination');
        if (!container || this.totalPages <= 1) {
            if (container) container.innerHTML = '';
            return;
        }

        let pages = [];
        const maxVisible = 5;
        let start = Math.max(1, this.currentPage - Math.floor(maxVisible / 2));
        let end = Math.min(this.totalPages, start + maxVisible - 1);

        if (end - start < maxVisible - 1) {
            start = Math.max(1, end - maxVisible + 1);
        }

        for (let i = start; i <= end; i++) {
            pages.push(i);
        }

        container.innerHTML = `
            <button class="page-btn" onclick="app.setPage(${this.currentPage - 1})" ${this.currentPage <= 1 ? 'disabled' : ''}>
                &#8592; Prev
            </button>
            ${pages.map(p => `
                <button class="page-btn ${p === this.currentPage ? 'active' : ''}" onclick="app.setPage(${p})">${p}</button>
            `).join('')}
            <button class="page-btn" onclick="app.setPage(${this.currentPage + 1})" ${this.currentPage >= this.totalPages ? 'disabled' : ''}>
                Next &#8594;
            </button>
        `;
    }

    showLoading() {
        const container = document.getElementById('news-grid');
        if (container) {
            container.innerHTML = `
                <div class="loading" style="grid-column: 1 / -1;">
                    <div class="loading-spinner"></div>
                    <p>Loading news...</p>
                </div>
            `;
        }
    }

    showEmpty() {
        const container = document.getElementById('news-grid');
        if (container) {
            container.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1;">
                    <div class="empty-icon">&#128269;</div>
                    <h3 class="empty-title">No articles found</h3>
                    <p class="empty-desc">Try adjusting your search or filters</p>
                </div>
            `;
        }
    }

    startAutoRefresh() {
        // Refresh stats every 5 minutes
        setInterval(() => this.loadStats(), 5 * 60 * 1000);
    }

    // Utility functions
    formatTimeAgo(date) {
        const seconds = Math.floor((new Date() - date) / 1000);
        const intervals = {
            year: 31536000,
            month: 2592000,
            week: 604800,
            day: 86400,
            hour: 3600,
            minute: 60
        };

        for (const [unit, value] of Object.entries(intervals)) {
            const count = Math.floor(seconds / value);
            if (count >= 1) {
                return `${count} ${unit}${count > 1 ? 's' : ''} ago`;
            }
        }
        return 'Just now';
    }

    getCategoryName(id) {
        const names = {
            official: 'Official',
            releases: 'Releases',
            tech: 'Tech',
            tutorials: 'Tutorials',
            articles: 'Articles',
            community: 'Community'
        };
        return names[id] || id;
    }

    getCategoryIcon(id) {
        const icons = {
            official: '&#128226;',
            releases: '&#128640;',
            tech: '&#128187;',
            tutorials: '&#128214;',
            articles: '&#128196;',
            community: '&#128101;'
        };
        return icons[id] || '&#128196;';
    }

    getRelevanceClass(score) {
        if (score >= 50) return 'relevance-badge relevance-high';
        if (score >= 25) return 'relevance-badge relevance-medium';
        return 'relevance-badge relevance-low';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }
}

// Initialize app
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new NewsApp();
});
