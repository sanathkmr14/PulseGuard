
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
        expected: { status: 'DEGRADED', errorType: 'HTTP_CLIENT_ERROR' }
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
        // Current policy is to treat untrusted certs as DOWN (which is safe/secure default)
        expected: { status: 'DOWN', errorType: 'SSL_ERROR' }
    },
    {
        name: 'SSL Untrusted Root',
        url: 'https://untrusted-root.badssl.com/',
        type: 'HTTP',
        // Current policy is to treat untrusted certs as DOWN
        expected: { status: 'DOWN', errorType: 'CERT_CHAIN_ERROR' }
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
            const statusMatch = result.healthState === scenario.expected.status;

            // For error types, check if it matches expected OR if we expected a connection error but got a specific one
            let typeMatch = result.errorType === scenario.expected.errorType;

            // Allow SSL_UNTRUSTED_CERT / CERT_CHAIN_ERROR overlap
            if (scenario.expected.errorType === 'SSL_UNTRUSTED_CERT' && result.errorType === 'CERT_CHAIN_ERROR') typeMatch = true;
            if (scenario.expected.errorType === 'CERT_CHAIN_ERROR' && result.errorType === 'SSL_UNTRUSTED_CERT') typeMatch = true;


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
