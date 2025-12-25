const schedule = require('node-schedule');
const newsAggregator = require('./newsAggregator');

class Scheduler {
    constructor() {
        this.job = null;
        this.isRunning = false;
    }

    // Start the 24-hour scheduler
    start() {
        if (this.job) {
            console.log('[Scheduler] Already running');
            return;
        }

        // Run every 24 hours at midnight
        this.job = schedule.scheduleJob('0 0 * * *', async () => {
            await this.runFetch();
        });

        // Also run every 6 hours for more frequent updates
        this.job6h = schedule.scheduleJob('0 */6 * * *', async () => {
            await this.runFetch();
        });

        console.log('[Scheduler] Started - will fetch news every 6 hours');
    }

    // Manual fetch trigger - returns { total, newCount, newArticles }
    async runFetch() {
        if (this.isRunning) {
            console.log('[Scheduler] Fetch already in progress, skipping...');
            return false;
        }

        this.isRunning = true;
        console.log('[Scheduler] Running scheduled news fetch...');

        try {
            const result = await newsAggregator.fetchAllNews();
            console.log(`[Scheduler] Fetch completed - ${result.newCount} new articles found`);
            return result;
        } catch (error) {
            console.error('[Scheduler] Fetch error:', error.message);
            return { total: 0, newCount: 0, newArticles: [], error: error.message };
        } finally {
            this.isRunning = false;
        }
    }

    // Stop scheduler
    stop() {
        if (this.job) {
            this.job.cancel();
            this.job = null;
        }
        if (this.job6h) {
            this.job6h.cancel();
            this.job6h = null;
        }
        console.log('[Scheduler] Stopped');
    }

    // Get status
    getStatus() {
        return {
            running: !!this.job,
            fetching: this.isRunning,
            nextRun: this.job ? this.job.nextInvocation() : null
        };
    }
}

module.exports = new Scheduler();
