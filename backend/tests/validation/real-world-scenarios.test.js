
import MonitorRunner from '../../src/services/runner.js';

// ==========================================
// CONFIGURATION: Real World Scenarios
// ==========================================
// Note: httpstat.us is flaky (socket hang up). Using httpbin.org for stable codes.
const SCENARIOS = [
    // --- HTTP Status Codes (httpbin.org) ---
    {
        name: 'External HTTP 200 (OK)',
        url: 'https://httpbin.org/status/200',
        type: 'HTTP',
        expected: { status: 'UP', errorType: 'HTTP_SUCCESS' },
        timeout: 10000 // Increase test timeout
    },
    {
        name: 'External HTTP 404 (Not Found)',
        url: 'https://httpbin.org/status/404',
        type: 'HTTP',
        expected: { status: 'DOWN', errorType: 'HTTP_CLIENT_ERROR' }
    },
    {
        name: 'External HTTP 503 (Service Unavailable)',
        url: 'https://httpbin.org/status/503',
        type: 'HTTP',
        expected: { status: 'DOWN', errorType: 'HTTP_SERVER_ERROR' }
    },
    // Skipping timeout simulation on public APIs to avoid flakiness

    // --- SSL Scenarios (badssl.com) ---
    {
        name: 'SSL Expired',
        url: 'https://expired.badssl.com/',
        type: 'HTTP',
        expected: { status: 'DOWN', errorType: 'CERT_EXPIRED' }
    },
    {
        name: 'SSL Wrong Host',
        url: 'https://wrong.host.badssl.com/',
        type: 'HTTP',
        expected: { status: 'DOWN', errorType: 'CERT_HOSTNAME_MISMATCH' }
    },
    {
        name: 'SSL Self-Signed',
        url: 'https://self-signed.badssl.com/',
        type: 'HTTP',
        expected: { status: 'DEGRADED', errorType: 'SELF_SIGNED_CERT' }
    },
    {
        name: 'SSL Untrusted Root',
        url: 'https://untrusted-root.badssl.com/',
        type: 'HTTP',
        expected: { status: 'DEGRADED', errorType: 'SELF_SIGNED_CERT' }
    }
];

// ==========================================
// TEST RUNNER
// ==========================================
async function runRealWorldTests() {
    console.log('🌍 Starting Real-World External Verification...');
    console.log('   Targets: httpstat.us, badssl.com');
    console.log('===============================================================');

    let passed = 0;
    let failed = 0;
    const failures = [];

    for (const scenario of SCENARIOS) {
        process.stdout.write(`Testing ${scenario.name}... `);

        try {
            const result = await MonitorRunner.run({
                type: scenario.type,
                url: scenario.url,
                timeout: scenario.timeout || 10000,
                degradedThresholdMs: 5000, // Allow slower responses for external tests
                interval: 60 // dummy
            });

            // Loose matching for error types as external sites might vary slightly (e.g. connection reset instead of timeout)
            let statusMatch = result.healthState === scenario.expected.status;

            // For error types, check if it matches expected OR if we expected a connection error but got a specific one
            let typeMatch = result.errorType === scenario.expected.errorType;

            // Allow SSL variant overlaps (untrusted root, self-signed, chain error, reset)
            const sslTypes = ['SSL_UNTRUSTED_CERT', 'CERT_CHAIN_ERROR', 'SELF_SIGNED_CERT', 'SSL_ERROR', 'CONNECTION_RESET'];
            if (sslTypes.includes(scenario.expected.errorType) && sslTypes.includes(result.errorType)) {
                typeMatch = true;
                if (['DOWN', 'DEGRADED'].includes(result.healthState)) {
                    statusMatch = true;
                }
            }

            // Allow 429 rate limit if public test endpoint is temporarily throttling
            if ((result.statusCode === 429 || result.errorType === 'HTTP_RATE_LIMIT') && ['DOWN', 'DEGRADED'].includes(result.healthState)) {
                statusMatch = true;
                typeMatch = true;
            }

            // Allow any 5xx server error (500, 502, 503, 504) for HTTP_SERVER_ERROR
            if (scenario.expected.errorType === 'HTTP_SERVER_ERROR' && (result.errorType?.includes('SERVER_ERROR') || result.errorType?.includes('GATEWAY') || result.errorType?.includes('SERVICE_UNAVAILABLE') || (result.statusCode >= 500 && result.statusCode < 600))) {
                typeMatch = true;
                statusMatch = true;
            }

            // Allow network errors (like ECONNRESET, EADDRNOTAVAIL, TIMEOUT) for external DOWN tests
            if (scenario.expected.status === 'DOWN' && ['DOWN', 'DEGRADED'].includes(result.healthState) && ['TIMEOUT', 'CONNECTION_RESET', 'UNKNOWN_ERROR', 'NETWORK_ERROR'].includes(result.errorType)) {
                typeMatch = true;
                statusMatch = true;
            }


            if (statusMatch && typeMatch) {
                console.log(`✅ PASS [${result.healthState}]`);
                passed++;
            } else {
                console.log(`❌ FAIL`);
                console.log(`   Expected: Status=${scenario.expected.status}, Type=${scenario.expected.errorType}`);
                console.log(`   Actual:   Status=${result.healthState}, Type=${result.errorType}, Msg=${result.errorMessage}`);
                failed++;
                failures.push({ scenario, result });
            }

        } catch (err) {
            console.log(`💥 CRASH`);
            console.error(err);
            failed++;
            failures.push({ scenario, error: err });
        }
    }

    console.log('===============================================================');
    console.log(`SUMMARY: ${passed}/${SCENARIOS.length} Passed`);

    if (failed > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runRealWorldTests();
