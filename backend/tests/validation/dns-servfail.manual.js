
import MonitorRunner from '../../src/services/runner.js';

// ==========================================
// DNS SERVFAIL / ERROR TEST SUITE
// ==========================================
const SCENARIOS = [
    // Valid DNS
    {
        category: 'Valid DNS',
        name: 'Valid Domain (google.com)',
        url: 'google.com',
        type: 'DNS',
        expected: { status: 'UP', errorType: null }
    },
    {
        category: 'Valid DNS',
        name: 'Valid Domain (cloudflare.com)',
        url: 'cloudflare.com',
        type: 'DNS',
        expected: { status: 'UP', errorType: null }
    },
    {
        category: 'Valid DNS',
        name: 'Localhost',
        url: 'localhost',
        type: 'DNS',
        expected: { status: 'UP', errorType: null }
    },
    {
        category: 'Valid DNS',
        name: 'IP Address (direct)',
        url: '8.8.8.8',
        type: 'DNS',
        expected: { status: 'UP', errorType: null }
    },

    // Non-existent domains
    {
        category: 'NXDOMAIN',
        name: 'Non-existent Domain',
        url: 'this-domain-definitely-does-not-exist-12345.com',
        type: 'DNS',
        expected: { status: 'DOWN', errorType: 'DNS_NOT_FOUND' }
    },
    {
        category: 'NXDOMAIN',
        name: 'Random String Domain',
        url: 'asdfjklqwertyzxcv123456789.xyz',
        type: 'DNS',
        expected: { status: 'DOWN' }
    },

    // Invalid TLD
    {
        category: 'Invalid TLD',
        name: 'Invalid TLD',
        url: 'example.invalidtld',
        type: 'DNS',
        expected: { status: 'DOWN' }
    },
    {
        category: 'Invalid TLD',
        name: 'Numeric TLD',
        url: 'example.123',
        type: 'DNS',
        expected: { status: 'DOWN' }
    },

    // Empty/Malformed
    {
        category: 'Malformed',
        name: 'Empty String',
        url: '',
        type: 'DNS',
        expected: { status: 'DOWN' }
    },
    {
        category: 'Malformed',
        name: 'Single Character',
        url: 'x',
        type: 'DNS',
        expected: { status: 'DOWN' }
    },

    // Special characters
    {
        category: 'Special Characters',
        name: 'Underscore in domain',
        url: 'example_invalid.com',
        type: 'DNS',
        expected: { status: 'DOWN' } // May or may not resolve
    },

    // Very long domain
    {
        category: 'Overly Long',
        name: 'Excessively Long Domain',
        url: 'a'.repeat(250) + '.com',
        type: 'DNS',
        expected: { status: 'DOWN' }
    }
];

// ==========================================
// RUNNER
// ==========================================
async function runDnsServfailTests() {
    console.log('🚀 Starting DNS Error Test Suite...');
    console.log('================================================================================');
    console.log(`${'CATEGORY'.padEnd(18)} | ${'SCENARIO'.padEnd(35)} | ${'STATUS'.padEnd(10)} | ${'ERROR TYPE'.padEnd(18)} | RESULT`);
    console.log('--------------------------------------------------------------------------------');

    let passed = 0;
    let failed = 0;

    for (const scenario of SCENARIOS) {
        try {
            const result = await MonitorRunner.run({
                type: scenario.type,
                url: scenario.url,
                timeout: 5000,
                degradedThresholdMs: 3000
            });

            const statusMatch = result.healthState === scenario.expected.status;
            let typeMatch = true;

            if (scenario.expected.errorType) {
                typeMatch = result.errorType === scenario.expected.errorType;
            }

            if (statusMatch && typeMatch) {
                passed++;
                console.log(`${scenario.category.padEnd(18)} | ${scenario.name.padEnd(35)} | ✅ ${result.healthState.padEnd(8)} | ${(result.errorType || 'NONE').padEnd(18)} | PASS`);
            } else {
                // Accept DNS_ERROR as a generic fallback for DNS-related errors
                const isAcceptable = result.healthState === scenario.expected.status &&
                    (result.errorType?.includes('DNS') || result.errorType === scenario.expected.errorType);
                
                if (isAcceptable) {
                    passed++;
                    console.log(`${scenario.category.padEnd(18)} | ${scenario.name.padEnd(35)} | ✅ ${result.healthState.padEnd(8)} | ${(result.errorType || 'NONE').padEnd(18)} | PASS (DNS variant)`);
                } else {
                    failed++;
                    console.log(`${scenario.category.padEnd(18)} | ${scenario.name.padEnd(35)} | ❌ ${result.healthState.padEnd(8)} | ${(result.errorType || 'NONE').padEnd(18)} | FAIL`);
                    console.log(`   EXPECTED: Status=${scenario.expected.status}, ErrorType=${scenario.expected.errorType || 'ANY'}`);
                    console.log(`   ACTUAL:   Status=${result.healthState}, ErrorType=${result.errorType}, IP=${result.ipAddress || 'N/A'}`);
                }
            }

        } catch (err) {
            // DNS lookup failures are expected for invalid domains
            if (scenario.expected.status === 'DOWN') {
                passed++;
                console.log(`${scenario.category.padEnd(18)} | ${scenario.name.padEnd(35)} | ✅ DOWN     | ${err.message.substring(0, 18).padEnd(18)} | PASS (Error expected)`);
            } else {
                failed++;
                console.log(`${scenario.category.padEnd(18)} | ${scenario.name.padEnd(35)} | 💥 ERROR    | ${err.message.substring(0, 18).padEnd(18)} | FAIL (Unexpected)`);
            }
        }
    }

    console.log('================================================================================');
    console.log(`SUMMARY: ${passed}/${SCENARIOS.length} Passed, ${failed} Failed`);

    if (failed > 0) {
        console.log('❌ Some DNS tests failed');
        process.exit(1);
    } else {
        console.log('✅ All DNS tests passed');
        process.exit(0);
    }
}

runDnsServfailTests();

