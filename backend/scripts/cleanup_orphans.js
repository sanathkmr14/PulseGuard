
import mongoose from 'mongoose';
import Monitor from '../src/models/Monitor.js';
import Check from '../src/models/Check.js';
import Incident from '../src/models/Incident.js';
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

const cleanup = async () => {
    await connectDB();

    try {
        console.log('--- Starting Cleanup ---');

        // Find all distinct monitor IDs in Checks
        const allChecks = await Check.find({}).select('monitor');
        const monitorIds = new Set(allChecks.map(c => c.monitor.toString()));
        console.log(`Total unique monitor IDs in Checks: ${monitorIds.size}`);

        const orphans = [];
        for (const id of monitorIds) {
            const exists = await Monitor.exists({ _id: id });
            if (!exists) {
                orphans.push(id);
            }
        }

        console.log(`Found ${orphans.length} missing monitors referenced by checks.`);

        if (orphans.length > 0) {
            const result = await Check.deleteMany({ monitor: { $in: orphans } });
            console.log(`✅ Deleted ${result.deletedCount} orphaned checks.`);

            const incResult = await Incident.deleteMany({ monitor: { $in: orphans } });
            console.log(`✅ Deleted ${incResult.deletedCount} orphaned incidents.`);
        } else {
            console.log('No orphans to clean.');
        }

    } catch (error) {
        console.error('Error cleaning orphans:', error);
    } finally {
        await mongoose.disconnect();
    }
};

cleanup();
