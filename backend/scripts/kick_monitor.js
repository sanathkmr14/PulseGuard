import mongoose from 'mongoose';
import Monitor from '../src/models/Monitor.js';
import schedulerService from '../src/services/scheduler.service.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

async function kickMonitor() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const input = process.argv[2];
        if (!input) {
            console.log('Please provide a Monitor ID or URL as an argument.');
            process.exit(1);
        }

        let monitor;
        if (mongoose.Types.ObjectId.isValid(input)) {
            monitor = await Monitor.findById(input);
        } else {
            monitor = await Monitor.findOne({ url: input });
        }

        if (!monitor) {
            console.log(`Monitor with ID/URL ${input} not found.`);
            process.exit(1);
        }

        console.log(`Found Monitor: ${monitor.name} (${monitor.url})`);
        console.log(`Current Status: ${monitor.status}`);
        console.log(`Last Checked: ${monitor.lastChecked}`);

        console.log('Scheduling immediate check...');
        // This will add a job to the Redis queue, which the main app's worker should pick up
        await schedulerService.scheduleMonitor(monitor);
        console.log('✅ Monitor scheduled successfully.');

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
        // schedulerService has Redis connections that need closing
        if (schedulerService.queue) {
            await schedulerService.queue.close();
        }
        if (schedulerService.redis) {
            await schedulerService.redis.quit();
        }
        process.exit(0);
    }
}

kickMonitor();
