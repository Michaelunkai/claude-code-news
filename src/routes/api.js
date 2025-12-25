const express = require('express');
const router = express.Router();
const newsAggregator = require('../services/newsAggregator');
const scheduler = require('../services/scheduler');

// Get news articles
router.get('/news', (req, res) => {
    try {
        const options = {
            page: parseInt(req.query.page) || 1,
            limit: parseInt(req.query.limit) || 20,
            category: req.query.category || null,
            search: req.query.search || null,
            minRelevance: parseInt(req.query.minRelevance) || 0
        };

        const result = newsAggregator.getArticles(options);
        res.json({
            success: true,
            ...result,
            lastUpdated: newsAggregator.lastFetch
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get featured/top news
router.get('/news/featured', (req, res) => {
    try {
        const result = newsAggregator.getArticles({
            limit: 5,
            minRelevance: 30
        });
        res.json({
            success: true,
            articles: result.articles
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get categories
router.get('/categories', (req, res) => {
    const categories = [
        { id: 'official', name: 'Official News', icon: 'megaphone' },
        { id: 'releases', name: 'Releases', icon: 'rocket' },
        { id: 'tech', name: 'Tech News', icon: 'cpu' },
        { id: 'tutorials', name: 'Tutorials', icon: 'book-open' },
        { id: 'articles', name: 'Articles', icon: 'file-text' },
        { id: 'community', name: 'Community', icon: 'users' }
    ];
    res.json({ success: true, categories });
});

// Get stats
router.get('/stats', (req, res) => {
    try {
        const stats = newsAggregator.getStats();
        const schedulerStatus = scheduler.getStatus();
        res.json({
            success: true,
            ...stats,
            scheduler: schedulerStatus
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Trigger manual refresh - returns count of NEW articles found
router.post('/refresh', async (req, res) => {
    try {
        const result = await scheduler.runFetch();
        if (result === false) {
            res.json({
                success: false,
                message: 'Refresh already in progress'
            });
        } else {
            res.json({
                success: true,
                message: result.newCount > 0
                    ? `Found ${result.newCount} NEW articles!`
                    : 'No new articles found - check back later',
                newCount: result.newCount || 0,
                totalArticles: result.total || 0
            });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Health check
router.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

module.exports = router;
