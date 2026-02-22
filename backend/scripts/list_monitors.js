import mongoose from 'mongoose';
import Monitor from '../src/models/Monitor.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars
dotenv.config({ path: path.join(__dirname, '../.env') });

async function listMonitors() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const monitors = await Monitor.find({});
        console.log(`Found ${monitors.length} monitors.`);

        monitors.forEach((monitor, index) => {
            console.log(`\nMonitor #${index + 1}`);
            console.log(`ID: ${monitor._id}`);
            console.log(`Name: ${monitor.name}`);
            console.log(`URL: ${monitor.url}`);
            console.log(`Type: ${monitor.type}`);
            console.log(`Status: ${monitor.status}`);
            console.log(`Last Checked: ${monitor.lastChecked}`);
            console.log(`Consecutive Failures: ${monitor.consecutiveFailures}`);
        });

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

listMonitors();
