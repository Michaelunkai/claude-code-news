const express = require('express');
const path = require('path');
const apiRoutes = require('./routes/api');
const newsAggregator = require('./services/newsAggregator');
const scheduler = require('./services/scheduler');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// API routes
app.use('/api', apiRoutes);

// Serve index.html for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Initialize and start server
async function init() {
    console.log('='.repeat(60));
    console.log('   CLAUDE CODE NEWS - Auto-Updating News Aggregator');
    console.log('='.repeat(60));

    // Try to load existing data
    const loaded = newsAggregator.loadFromFile();

    if (!loaded) {
        console.log('[Init] No cached data found, fetching fresh news...');
        await newsAggregator.fetchAllNews();
    } else {
        // Check if data is older than 6 hours
        const lastUpdate = new Date(newsAggregator.lastFetch);
        const hoursOld = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60);

        if (hoursOld > 6) {
            console.log(`[Init] Data is ${hoursOld.toFixed(1)} hours old, refreshing...`);
            newsAggregator.fetchAllNews().catch(err => {
                console.error('[Init] Background refresh error:', err.message);
            });
        }
    }

    // Start the scheduler
    scheduler.start();

    // Start server
    app.listen(PORT, () => {
        console.log('='.repeat(60));
        console.log(`   Server running at http://localhost:${PORT}`);
        console.log(`   API endpoint: http://localhost:${PORT}/api/news`);
        console.log('='.repeat(60));
    });
}

// Handle shutdown
process.on('SIGINT', () => {
    console.log('\n[Server] Shutting down...');
    scheduler.stop();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n[Server] Shutting down...');
    scheduler.stop();
    process.exit(0);
});

init().catch(err => {
    console.error('[Fatal] Init error:', err);
    process.exit(1);
});
