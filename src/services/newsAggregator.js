const fetch = require('node-fetch');
const cheerio = require('cheerio');
const RSSParser = require('rss-parser');
const fs = require('fs');
const path = require('path');

const rssParser = new RSSParser({
    timeout: 15000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
});

const DATA_FILE = path.join(__dirname, '../../data/news.json');

// News sources configuration - multiple real sources for latest Claude Code news
const NEWS_SOURCES = {
    rss: [
        {
            name: 'Hacker News',
            url: 'https://hnrss.org/newest?q=claude+code+OR+anthropic+claude+OR+claude+ai',
            category: 'tech'
        },
        {
            name: 'Hacker News Claude',
            url: 'https://hnrss.org/newest?q=claude',
            category: 'tech'
        },
        {
            name: 'Reddit AI',
            url: 'https://www.reddit.com/r/artificial/search.rss?q=claude&restrict_sr=on&sort=new&t=week',
            category: 'community'
        },
        {
            name: 'Reddit LocalLLaMA',
            url: 'https://www.reddit.com/r/LocalLLaMA/search.rss?q=claude&restrict_sr=on&sort=new&t=week',
            category: 'community'
        },
        {
            name: 'Reddit ClaudeAI',
            url: 'https://www.reddit.com/r/ClaudeAI/new.rss',
            category: 'community'
        },
        {
            name: 'Reddit MachineLearning',
            url: 'https://www.reddit.com/r/MachineLearning/search.rss?q=claude+OR+anthropic&restrict_sr=on&sort=new&t=week',
            category: 'community'
        },
        {
            name: 'Dev.to Claude',
            url: 'https://dev.to/feed/tag/claude',
            category: 'tutorials'
        },
        {
            name: 'Dev.to Anthropic',
            url: 'https://dev.to/feed/tag/anthropic',
            category: 'tutorials'
        },
        {
            name: 'Medium AI',
            url: 'https://medium.com/feed/tag/claude-ai',
            category: 'articles'
        },
        {
            name: 'TechCrunch AI',
            url: 'https://techcrunch.com/tag/anthropic/feed/',
            category: 'tech'
        },
        {
            name: 'The Verge AI',
            url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml',
            category: 'tech'
        },
        {
            name: 'Ars Technica AI',
            url: 'https://feeds.arstechnica.com/arstechnica/technology-lab',
            category: 'tech'
        },
        {
            name: 'VentureBeat AI',
            url: 'https://venturebeat.com/category/ai/feed/',
            category: 'tech'
        },
        {
            name: 'Google News Claude',
            url: 'https://news.google.com/rss/search?q=claude+code+anthropic&hl=en-US&gl=US&ceid=US:en',
            category: 'articles'
        },
        {
            name: 'Google News Claude AI',
            url: 'https://news.google.com/rss/search?q=claude+ai+anthropic&hl=en-US&gl=US&ceid=US:en',
            category: 'articles'
        }
    ],
    web: [
        {
            name: 'Anthropic Blog',
            url: 'https://www.anthropic.com/news',
            category: 'official',
            selector: 'article, .post, .news-item, [class*="post"], [class*="article"]'
        },
        {
            name: 'GitHub Claude Code',
            url: 'https://github.com/anthropics/claude-code/releases',
            category: 'releases',
            type: 'github-releases'
        },
        {
            name: 'GitHub Anthropic',
            url: 'https://github.com/anthropics',
            category: 'releases',
            type: 'github-org'
        }
    ]
};

// Keywords for relevance scoring - fine-tuned for Claude Code news
const RELEVANCE_KEYWORDS = {
    highest: ['claude code', 'claude-code', 'claude cli', 'anthropic cli', 'claude terminal', '@anthropic/claude-code'],
    high: ['claude agent', 'claude mcp', 'model context protocol', 'claude sdk', 'claude desktop', 'claude computer use'],
    medium: ['claude 3', 'claude api', 'anthropic api', 'claude sonnet', 'claude opus', 'claude haiku', 'claude 3.5'],
    low: ['claude', 'anthropic', 'ai coding', 'llm coding', 'ai assistant']
};

class NewsAggregator {
    constructor() {
        this.news = [];
        this.lastFetch = null;
    }

    // Calculate relevance score
    calculateRelevance(title, content = '') {
        const text = `${title} ${content}`.toLowerCase();
        let score = 0;

        for (const keyword of RELEVANCE_KEYWORDS.highest) {
            if (text.includes(keyword.toLowerCase())) score += 50;
        }
        for (const keyword of RELEVANCE_KEYWORDS.high) {
            if (text.includes(keyword.toLowerCase())) score += 30;
        }
        for (const keyword of RELEVANCE_KEYWORDS.medium) {
            if (text.includes(keyword.toLowerCase())) score += 15;
        }
        for (const keyword of RELEVANCE_KEYWORDS.low) {
            if (text.includes(keyword.toLowerCase())) score += 5;
        }

        return Math.min(score, 100);
    }

    // Fetch RSS feeds
    async fetchRSS(source) {
        try {
            const feed = await rssParser.parseURL(source.url);
            return feed.items.map(item => ({
                id: this.generateId(item.link || item.guid),
                title: item.title || 'Untitled',
                link: item.link || '',
                description: this.cleanText(item.contentSnippet || item.content || ''),
                pubDate: new Date(item.pubDate || Date.now()).toISOString(),
                source: source.name,
                category: source.category,
                relevance: this.calculateRelevance(item.title, item.contentSnippet),
                thumbnail: this.extractImage(item)
            }));
        } catch (error) {
            console.error(`RSS fetch error for ${source.name}:`, error.message);
            return [];
        }
    }

    // Fetch web pages
    async fetchWeb(source) {
        try {
            const response = await fetch(source.url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'text/html,application/xhtml+xml'
                },
                timeout: 15000
            });

            if (!response.ok) return [];

            const html = await response.text();
            const $ = cheerio.load(html);
            const articles = [];

            if (source.type === 'github-releases') {
                return this.parseGitHubReleases($, source);
            }

            if (source.type === 'github-org') {
                return this.parseGitHubOrg($, source);
            }

            $(source.selector).each((i, el) => {
                const $el = $(el);
                const title = $el.find('h1, h2, h3, .title').first().text().trim();
                const link = $el.find('a').first().attr('href') || '';
                const description = $el.find('p, .summary, .excerpt').first().text().trim();
                const date = $el.find('time, .date').first().attr('datetime') || new Date().toISOString();

                if (title && title.length > 5) {
                    articles.push({
                        id: this.generateId(link || title),
                        title,
                        link: link.startsWith('http') ? link : new URL(link, source.url).href,
                        description: this.cleanText(description),
                        pubDate: new Date(date).toISOString(),
                        source: source.name,
                        category: source.category,
                        relevance: this.calculateRelevance(title, description),
                        thumbnail: null
                    });
                }
            });

            return articles.slice(0, 20);
        } catch (error) {
            console.error(`Web fetch error for ${source.name}:`, error.message);
            return [];
        }
    }

    // Parse GitHub releases
    parseGitHubReleases($, source) {
        const releases = [];
        $('[data-hpc] .Box-row, .release, [class*="Box-row"]').each((i, el) => {
            const $el = $(el);
            const title = $el.find('a.Link--primary, .release-title, a[href*="/releases/tag"]').first().text().trim();
            const link = $el.find('a.Link--primary, .release-title a, a[href*="/releases/tag"]').first().attr('href') || '';
            const date = $el.find('relative-time').attr('datetime') || new Date().toISOString();
            const body = $el.find('.markdown-body, [class*="markdown"]').first().text().trim();

            if (title) {
                releases.push({
                    id: this.generateId(link || title),
                    title: `Claude Code ${title}`,
                    link: link.startsWith('http') ? link : `https://github.com${link}`,
                    description: this.cleanText(body.slice(0, 300)) || 'New release available',
                    pubDate: new Date(date).toISOString(),
                    source: source.name,
                    category: 'releases',
                    relevance: 100,
                    thumbnail: null,
                    isRelease: true
                });
            }
        });
        return releases.slice(0, 10);
    }

    // Parse GitHub organization page for repos
    parseGitHubOrg($, source) {
        const repos = [];
        $('[itemprop="name codeRepository"], .repo, [class*="repo"]').each((i, el) => {
            const $el = $(el);
            const name = $el.text().trim();
            const link = $el.attr('href') || '';

            if (name && name.toLowerCase().includes('claude')) {
                repos.push({
                    id: this.generateId(link || name),
                    title: `Anthropic Repository: ${name}`,
                    link: link.startsWith('http') ? link : `https://github.com${link}`,
                    description: `Official Anthropic repository for ${name}`,
                    pubDate: new Date().toISOString(),
                    source: 'GitHub Anthropic',
                    category: 'releases',
                    relevance: 80,
                    thumbnail: null
                });
            }
        });
        return repos.slice(0, 5);
    }

    // Clean text
    cleanText(text) {
        return text
            .replace(/\s+/g, ' ')
            .replace(/\n/g, ' ')
            .trim()
            .slice(0, 500);
    }

    // Generate unique ID
    generateId(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }

    // Extract image from RSS item
    extractImage(item) {
        if (item.enclosure && item.enclosure.url) return item.enclosure.url;
        if (item['media:content'] && item['media:content']['$'] && item['media:content']['$'].url) {
            return item['media:content']['$'].url;
        }
        const content = item.content || item['content:encoded'] || '';
        const match = content.match(/<img[^>]+src="([^"]+)"/);
        return match ? match[1] : null;
    }

    // Main fetch function
    async fetchAllNews() {
        console.log('[NewsAggregator] Starting news fetch...');
        const startTime = Date.now();
        const allNews = [];

        // Fetch RSS feeds in parallel
        const rssPromises = NEWS_SOURCES.rss.map(source => this.fetchRSS(source));
        const rssResults = await Promise.allSettled(rssPromises);

        for (const result of rssResults) {
            if (result.status === 'fulfilled') {
                allNews.push(...result.value);
            }
        }

        // Fetch web sources in parallel
        const webPromises = NEWS_SOURCES.web.map(source => this.fetchWeb(source));
        const webResults = await Promise.allSettled(webPromises);

        for (const result of webResults) {
            if (result.status === 'fulfilled') {
                allNews.push(...result.value);
            }
        }

        // Filter by relevance and deduplicate
        const filtered = this.filterAndDedupe(allNews);

        // Sort by relevance and date
        filtered.sort((a, b) => {
            if (b.relevance !== a.relevance) return b.relevance - a.relevance;
            return new Date(b.pubDate) - new Date(a.pubDate);
        });

        this.news = filtered;
        this.lastFetch = new Date().toISOString();

        // Save to file
        await this.saveToFile();

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`[NewsAggregator] Fetched ${filtered.length} articles in ${elapsed}s`);

        return filtered;
    }

    // Filter by relevance and remove duplicates
    filterAndDedupe(articles) {
        // Filter articles with minimum relevance
        const relevant = articles.filter(a => a.relevance >= 5);

        // Deduplicate by title similarity
        const seen = new Set();
        const unique = [];

        for (const article of relevant) {
            const titleKey = article.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50);
            if (!seen.has(titleKey)) {
                seen.add(titleKey);
                unique.push(article);
            }
        }

        return unique;
    }

    // Save to JSON file
    async saveToFile() {
        const data = {
            lastUpdated: this.lastFetch,
            count: this.news.length,
            articles: this.news
        };

        try {
            fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
            console.log(`[NewsAggregator] Saved ${this.news.length} articles to disk`);
        } catch (error) {
            console.error('[NewsAggregator] Save error:', error.message);
        }
    }

    // Load from file
    loadFromFile() {
        try {
            if (fs.existsSync(DATA_FILE)) {
                const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
                this.news = data.articles || [];
                this.lastFetch = data.lastUpdated;
                console.log(`[NewsAggregator] Loaded ${this.news.length} articles from disk`);
                return true;
            }
        } catch (error) {
            console.error('[NewsAggregator] Load error:', error.message);
        }
        return false;
    }

    // Get articles with filters
    getArticles(options = {}) {
        let articles = [...this.news];

        if (options.category) {
            articles = articles.filter(a => a.category === options.category);
        }

        if (options.search) {
            const term = options.search.toLowerCase();
            articles = articles.filter(a =>
                a.title.toLowerCase().includes(term) ||
                a.description.toLowerCase().includes(term)
            );
        }

        if (options.minRelevance) {
            articles = articles.filter(a => a.relevance >= options.minRelevance);
        }

        const page = options.page || 1;
        const limit = options.limit || 20;
        const start = (page - 1) * limit;

        return {
            articles: articles.slice(start, start + limit),
            total: articles.length,
            page,
            totalPages: Math.ceil(articles.length / limit)
        };
    }

    // Get stats
    getStats() {
        const categories = {};
        for (const article of this.news) {
            categories[article.category] = (categories[article.category] || 0) + 1;
        }

        return {
            totalArticles: this.news.length,
            lastUpdated: this.lastFetch,
            categories,
            avgRelevance: this.news.length > 0
                ? Math.round(this.news.reduce((sum, a) => sum + a.relevance, 0) / this.news.length)
                : 0
        };
    }
}

module.exports = new NewsAggregator();
