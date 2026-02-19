import mongoose from 'mongoose';
import Monitor from '../src/models/Monitor.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars
dotenv.config({ path: path.join(__dirname, '../.env') });

async function checkMonitor() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const url = 'https://httpbin.org/status/404';
        const monitor = await Monitor.findOne({ url });

        if (!monitor) {
            console.log(`Monitor with URL ${url} not found.`);
            // List all monitors to see if we can find it
            const all = await Monitor.find({}, 'name url alertThreshold type userId');
            console.log('Available monitors:', all);
        } else {
            console.log('Found Monitor:');
            console.log('Name:', monitor.name);
            console.log('URL:', monitor.url);
            console.log('Alert Threshold:', monitor.alertThreshold);
            console.log('Consecutive Failures:', monitor.consecutiveFailures);
            console.log('Status:', monitor.status);
            console.log('Type:', monitor.type);
            console.log('Created At:', monitor.createdAt);
            console.log('Last Checked:', monitor.lastChecked);
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

checkMonitor();
