import mongoose from 'mongoose';
import Check from '../src/models/Check.js';
import Monitor from '../src/models/Monitor.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

async function inspectChecks() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        
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
            console.log(`Monitor not found: ${input}`);
            return;
        }

        console.log(`\nInspecting checks for: ${monitor.name} (${monitor.url})`);
        console.log(`Current Status: ${monitor.status}`);

        const checks = await Check.find({ monitor: monitor._id })
            .sort({ createdAt: -1 })
            .limit(5);

        if (checks.length === 0) {
            console.log('No checks found.');
        } else {
            checks.forEach((check, i) => {
                console.log(`\nCheck #${i + 1}:`);
                console.log(`  Time: ${check.timestamp}`);
                console.log(`  Status Code: ${check.statusCode}`);
                console.log(`  Latency: ${check.responseTime}ms`);
                console.log(`  Health State: ${check.status}`);
                console.log(`  Error: ${check.errorMessage || 'None'}`);
                console.log(`  Error Type: ${check.errorType || 'None'}`);
                if (check.degradationReasons && check.degradationReasons.length > 0) {
                    console.log(`  Degradation Reasons: ${check.degradationReasons.join(', ')}`);
                }
                if (check.sslInfo) {
                    console.log(`  SSL Info: Valid: ${check.sslInfo.valid}, Days Remaining: ${check.sslInfo.daysRemaining}`);
                }
                if (check.meta) {
                    console.log('  Meta:', JSON.stringify(check.meta, null, 2));
                }
            });
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

inspectChecks();
