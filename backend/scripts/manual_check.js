import mongoose from 'mongoose';
import Monitor from '../src/models/Monitor.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { checkHttp } from '../src/workers/http.worker.js';
import { checkHttps } from '../src/workers/https.worker.js';
import { classifyHttpResponse } from '../src/utils/status-classifier.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

// Mock options for checkHttp/checkHttps
// We need to provide the helper functions that are dynamically imported in runner.js
// but here we can just import them or mock them.
// Actually, checkHttp uses options to pass these functions.
// Let's import them from status-classifier and error-classifications.

import { 
    detectErrorType, 
    determineHealthStateFromError, 
    formatErrorMessage 
} from '../src/utils/error-classifications.js';

const options = {
    detectErrorType,
    determineHealthStateFromError,
    formatErrorMessage
};

const runManualChecks = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const monitors = await Monitor.find({});
        console.log(`Found ${monitors.length} monitors.`);

        for (const monitor of monitors) {
            console.log(`\n--------------------------------------------------`);
            console.log(`Checking ${monitor.name} (${monitor.url})...`);
            console.log(`Type: ${monitor.type}`);

            const result = {
                checkStartTime: Date.now(),
                timestamp: new Date(),
                monitor: monitor._id,
                healthState: 'UNKNOWN',
                isUp: false,
                responseTime: 0,
                meta: {}
            };

            try {
                if (monitor.type === 'HTTP') {
                    await checkHttp(monitor, result, options);
                } else if (monitor.type === 'HTTPS') {
                    await checkHttps(monitor, result, options);
                } else {
                    console.log(`Skipping ${monitor.type} check (only HTTP/HTTPS supported in this script)`);
                    continue;
                }

                console.log(`Result:`);
                console.log(`  Status Code: ${result.statusCode}`);
                console.log(`  Health State: ${result.healthState}`);
                console.log(`  Is Up: ${result.isUp}`);
                console.log(`  Response Time: ${result.responseTime}ms`);
                if (result.errorType) console.log(`  Error Type: ${result.errorType}`);
                if (result.errorMessage) console.log(`  Error Message: ${result.errorMessage}`);
                if (result.meta) console.log(`  Meta:`, result.meta);

            } catch (err) {
                console.error(`  Check Failed with Exception:`, err);
            }
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
};

runManualChecks();
