
import http from 'http';
import MonitorRunner from '../../src/services/runner.js';
import HTTP_STATUS_CODES from '../../src/utils/http-status-codes.js';
import { STATUS, ERROR_TYPES } from '../../src/utils/status-classifier.js';

// ==========================================
// CONFIGURATION: Ground Truth Expected Values
// ==========================================
// Based on backend/src/workers/http.worker.js and utils/status-classifier.js
const TEST_PORT_BASE = 4000;

// Specific mappings for Deep Validation
const EXCEPTIONS = {
    // Rate Limiting
    429: { status: 'DEGRADED', errorType: 'HTTP_RATE_LIMIT', severity: 0.5 },

    // Degraded Client Errors
    400: { status: 'DEGRADED', errorType: 'HTTP_CLIENT_ERROR', severity: 0.6 },
    401: { status: 'DEGRADED', errorType: 'HTTP_CLIENT_ERROR', severity: 0.6 },
    403: { status: 'DEGRADED', errorType: 'HTTP_CLIENT_ERROR', severity: 0.6 },
    404: { status: 'DEGRADED', errorType: 'HTTP_CLIENT_ERROR', severity: 0.6 },
    408: { status: 'DEGRADED', errorType: 'HTTP_CLIENT_ERROR', severity: 0.6 },
    418: { status: 'DEGRADED', errorType: 'HTTP_CLIENT_ERROR', severity: 0.6 },

    // Special Error Types
    502: { status: 'DOWN', errorType: 'HTTP_SERVER_ERROR', severity: 1.0 },
    503: { status: 'DOWN', errorType: 'HTTP_SERVER_ERROR', severity: 1.0 },
    504: { status: 'DOWN', errorType: 'HTTP_SERVER_ERROR', severity: 1.0 },

    // 1xx Informational codes now treated as DEGRADED (not DOWN or UP)
    // since they indicate the server is processing but not complete
    100: { status: 'DEGRADED', errorType: 'HTTP_INFORMATIONAL', severity: 0.6 },
    101: { status: 'DEGRADED', errorType: 'HTTP_INFORMATIONAL', severity: 0.6 },
    102: { status: 'DEGRADED', errorType: 'HTTP_INFORMATIONAL', severity: 0.6 },
    103: { status: 'DEGRADED', errorType: 'HTTP_INFORMATIONAL', severity: 0.6 },
};

function getExpectedState(code) {
    // 1. Check Exceptions first
    if (EXCEPTIONS[code]) return EXCEPTIONS[code];

    // 2. 2xx: Success -> UP
    if (code >= 200 && code < 300) return { status: 'UP', errorType: 'HTTP_SUCCESS', severity: 0.0 };

    // 3. 3xx: Redirect -> UP (handled as success by axios without followRedirect turned off, but test server returns code directly)
    // Note: http.worker.js treats 3xx as UP.
    if (code >= 300 && code < 400) return { status: 'UP', errorType: 'HTTP_REDIRECT', severity: 0.2 };

    // 4. 4xx: Client Error -> DOWN (Default for non-degraded)
    if (code >= 400 && code < 500) return { status: 'DOWN', errorType: 'HTTP_CLIENT_ERROR', severity: 0.85 };

    // 5. 5xx: Server Error -> DOWN
    if (code >= 500 && code < 600) return { status: 'DOWN', errorType: 'HTTP_SERVER_ERROR', severity: 1.0 };

    return { status: 'UNKNOWN', errorType: 'UNKNOWN_ERROR', severity: 0.5 };
}

// ==========================================
// TEST SERVER
// ==========================================
const server = http.createServer((req, res) => {
    // URL format: /:statusCode
    const code = parseInt(req.url.substring(1));
    if (!isNaN(code)) {
        res.writeHead(code, { 'Content-Type': 'text/plain' });
        res.end(`Status ${code}`);
    } else {
        res.writeHead(400);
        res.end('Bad Request');
    }
});

// ==========================================
// TEST RUNNER
// ==========================================
async function runValidation() {
    console.log('🚀 Starting Deep Validation Test Suite for HTTP Status Codes...');
    console.log('===============================================================');

    return new Promise((resolve) => {
        server.listen(TEST_PORT_BASE, async () => {
            let passed = 0;
            let failed = 0;
            const failures = [];

            const codes = Object.keys(HTTP_STATUS_CODES).map(Number).sort((a, b) => a - b);

            for (const code of codes) {
                const expected = getExpectedState(code);
                const url = `http://localhost:${TEST_PORT_BASE}/${code}`;

                try {
                    const result = await MonitorRunner.run({
                        type: 'HTTP',
                        url: url,
                        timeout: 1000 // Fast timeout for local
                    });

                    // VALIDATION LOGIC
                    const statusMatch = result.healthState === expected.status;

                    // Error Type Check:
                    // Allow specific subtypes if they map to the general category in expected
                    // e.g. 503 might return SERVICE_UNAVAILABLE or HTTP_SERVER_ERROR. 
                    // For now, strict check based on GROUND TRUTH from status-classifier.js default behaviors.
                    // The classifier logic in status-classifier returns 'HTTP_SERVER_ERROR' for all 5xx.
                    const typeMatch = result.errorType === expected.errorType;

                    if (statusMatch && typeMatch) {
                        passed++;
                        // console.log(`✅ ${code} ${HTTP_STATUS_CODES[code].name} -> ${result.healthState} [${result.errorType}]`);
                    } else {
                        failed++;
                        const failureMsg = `❌ ${code} ${HTTP_STATUS_CODES[code].name}: Expected ${expected.status} [${expected.errorType}], got ${result.healthState} [${result.errorType}]`;
                        console.error(failureMsg);
                        failures.push({ code, expected, actual: result });
                    }

                } catch (err) {
                    console.error(`💥 CRASH Code ${code}:`, err);
                    failed++;
                    failures.push({ code, error: err });
                }
            }

            console.log('===============================================================');
            console.log(`SUMMARY: ${passed}/${codes.length} Passed (${Math.round(passed / codes.length * 100)}%)`);

            server.close();

            if (failed > 0) {
                console.log('\n🔍 FAILED VALIDATION DETAILS 🔍');
                failures.forEach(f => {
                    if (f.error) {
                        console.log(`[${f.code}] Crash: ${f.error.message}`);
                    } else {
                        console.log(`[${f.code}] Value Mismatch:`);
                        console.log(`   Expected: Status=${f.expected.status}, ErrorType=${f.expected.errorType}`);
                        console.log(`   Actual:   Status=${f.actual.healthState}, ErrorType=${f.actual.errorType}`);
                        console.log(`   Messages: ${f.actual.errorMessage}`);
                    }
                });
                process.exit(1);
            } else {
                console.log('✨ ALL STATUS CODES VALIDATED SUCCESSFULLY ✨');
                process.exit(0);
            }
        });
    });
}

runValidation();
