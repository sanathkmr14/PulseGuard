
import mongoose from 'mongoose';
import Monitor from '../src/models/Monitor.js';
import Check from '../src/models/Check.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const connectDB = async () => {
    if (mongoose.connection.readyState === 0) {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB Connected');
    }
};

const checkOrphans = async () => {
    await connectDB();

    try {
        // User provided IDs
        const targetMonitors = ['698080c47c39783b8eabee86', '698080c47c39783b8eabee8f'];

        console.log('--- Checking Specific Monitors ---');
        for (const id of targetMonitors) {
            const monitor = await Monitor.findById(id);
            const checkCount = await Check.countDocuments({ monitor: id });
            console.log(`Monitor ${id}: ${monitor ? 'EXISTS' : 'MISSING'} | Checks: ${checkCount}`);
        }

        console.log('\n--- Scanning All Orphans ---');
        const allChecks = await Check.find({}).select('monitor');
        const orphanCount = 0;
        const processed = new Set();
        const orphans = [];

        console.log(`Total Checks in DB: ${allChecks.length}`);

        for (const check of allChecks) {
            const monId = check.monitor.toString();
            if (processed.has(monId)) continue;
            processed.add(monId);

            const exists = await Monitor.exists({ _id: monId });
            if (!exists) {
                const count = await Check.countDocuments({ monitor: monId });
                console.log(`Found Orphaned Checks for missing monitor ${monId}: ${count}`);
                orphans.push(monId);
            }
        }

        if (orphans.length === 0) {
            console.log('No orphaned checks found.');
        } else {
            console.log(`Found ${orphans.length} missing monitors with lingering checks.`);
        }

    } catch (error) {
        console.error('Error checking orphans:', error);
    } finally {
        await mongoose.disconnect();
    }
};

checkOrphans();
