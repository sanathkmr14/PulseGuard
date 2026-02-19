import { Queue } from 'bullmq';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load env vars
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

const QUEUE_NAME = 'monitor-queue';

async function cleanQueue() {
    console.log('🧹 Connecting to Redis...');

    // Parse REDIS_URL or fallbacks
    const connection = process.env.REDIS_URL || {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || undefined
    };

    const queue = new Queue(QUEUE_NAME, { connection });

    try {
        console.log('🔍 Finding failed jobs...');
        const failedJobs = await queue.getJobs(['failed']);

        if (failedJobs.length === 0) {
            console.log('✅ No failed jobs found.');
        } else {
            console.log(`🗑️  Found ${failedJobs.length} failed jobs. Removing...`);
            await Promise.all(failedJobs.map(job => job.remove()));
            console.log('✨ All failed jobs removed successfully.');
        }

    } catch (error) {
        console.error('❌ Error cleaning queue:', error);
    } finally {
        await queue.close();
        process.exit(0);
    }
}

cleanQueue();
