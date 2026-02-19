import { Queue } from 'bullmq';
import Redis from 'ioredis';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

const checkQueue = async () => {
    try {
        console.log('Connecting to Redis...', process.env.REDIS_URL);
        const connection = new Redis(process.env.REDIS_URL);
        const queue = new Queue('monitor-queue', { connection });

        const counts = await queue.getJobCounts();
        console.log('📊 Queue Counts:', counts);

        const active = await queue.getJobs(['active']);
        const waiting = await queue.getJobs(['waiting']);
        const delayed = await queue.getJobs(['delayed']);
        const failed = await queue.getJobs(['failed']);

        console.log('\n🏃 Active Jobs:', active.length);
        active.forEach(j => console.log(`   - ${j.id} (${j.data.url})`));

        console.log('\n⏳ Waiting Jobs:', waiting.length);
        waiting.forEach(j => console.log(`   - ${j.id} (${j.data.url})`));

        console.log('\n🕒 Delayed Jobs:', delayed.length);
        delayed.forEach(j => {
            const runTime = j.timestamp + j.opts.delay;
            const diff = runTime - Date.now();
            console.log(`   - ${j.id} (${j.data.url}) Delay: ${j.opts.delay}ms`);
            console.log(`     Created: ${new Date(j.timestamp).toISOString()}`);
            console.log(`     Run At:  ${new Date(runTime).toISOString()} (in ${Math.round(diff / 1000)}s)`);
        });

        console.log('\n❌ Failed Jobs (Last 5):', failed.length);
        failed.slice(0, 5).forEach(j => console.log(`   - ${j.id} (${j.data.url}) Reason: ${j.failedReason}`));

        await connection.quit();
        await queue.close();
    } catch (error) {
        console.error('Check failed:', error);
    }
};

checkQueue();
