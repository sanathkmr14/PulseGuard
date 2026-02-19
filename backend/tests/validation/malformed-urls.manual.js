
import MonitorRunner from '../../src/services/runner.js';

// ==========================================
// MALFORMED URLS TEST SUITE
// ==========================================
const SCENARIOS = [
    // Invalid Protocols
    {
        category: 'Invalid Protocol',
        name: 'FTP Protocol',
        url: 'ftp://example.com',
        type: 'HTTP',
        expected: { status: 'DOWN', errorType: 'PROTOCOL_MISMATCH' }
    },
    {
        category: 'Invalid Protocol',
        name: 'Invalid Protocol',
        url: 'invalid://test.com',
        type: 'HTTP',
        expected: { status: 'DOWN', errorType: 'PROTOCOL_MISMATCH' }
    },
    {
        category: 'Invalid Protocol',
        name: 'Typo Protocol',
        url: 'htp://typo.com',
        type: 'HTTP',
        expected: { status: 'DOWN' }
    },

    // Malformed Hostnames
    {
        category: 'Malformed Hostname',
        name: 'Empty Hostname',
        url: 'http://',
        type: 'HTTP',
        expected: { status: 'DOWN' }
    },
    {
        category: 'Malformed Hostname',
        name: 'Double Dot',
        url: 'https://..com',
        type: 'HTTP',
        expected: { status: 'DOWN' }
    },
    {
        category: 'Malformed Hostname',
        name: 'Double Dot in Middle',
        url: 'http://example..com',
        type: 'HTTP',
        expected: { status: 'DOWN' }
    },
    {
        category: 'Malformed Hostname',
        name: 'Space in Hostname',
        url: 'http://example .com',
        type: 'HTTP',
        expected: { status: 'DOWN' }
    },

    // Invalid Ports
    {
        category: 'Invalid Port',
        name: 'Port Too Large',
        url: 'http://example.com:99999',
        type: 'HTTP',
        expected: { status: 'DOWN' }
    },
    {
        category: 'Invalid Port',
        name: 'Non-Numeric Port',
        url: 'http://example.com:abc',
        type: 'HTTP',
        expected: { status: 'DOWN' }
    },
    {
        category: 'Invalid Port',
        name: 'Negative Port',
        url: 'http://example.com:-1',
        type: 'HTTP',
        expected: { status: 'DOWN' }
    },

    // Special Characters
    {
        category: 'Special Characters',
        name: 'Angle Brackets',
        url: 'http://exam<ple>.com',
        type: 'HTTP',
        expected: { status: 'DOWN' }
    },
    {
        category: 'Special Characters',
        name: 'Square Brackets',
        url: 'http://exam[ple].com',
        type: 'HTTP',
        expected: { status: 'DOWN' }
    },
    {
        category: 'Special Characters',
        name: 'Pipe Character',
        url: 'http://exam|ple.com',
        type: 'HTTP',
        expected: { status: 'DOWN' }
    },

    // Empty/Null URLs
    {
        category: 'Empty/Null',
        name: 'Empty String',
        url: '',
        type: 'HTTP',
        expected: { status: 'DOWN' }
    },

    // Overly Long URLs
    {
        category: 'Overly Long',
        name: 'Excessively Long URL',
        url: 'https://' + 'a'.repeat(2000) + '.com',
        type: 'HTTP',
        expected: { status: 'DOWN' }
    },

    // Missing TLD
    {
        category: 'Missing TLD',
        name: 'No TLD',
        url: 'http://example',
        type: 'HTTP',
        expected: { status: 'DOWN' }
    },

    // Double Slash After Protocol
    {
        category: 'Malformed Protocol',
        name: 'Triple Slash',
        url: 'http:///example.com',
        type: 'HTTP',
        expected: { status: 'DOWN' }
    }
];

// ==========================================
// RUNNER
// ==========================================
async function runMalformedUrlTests() {
    console.log('🚀 Starting Malformed URLs Test Suite...');
    console.log('================================================================================');
    console.log(`${'CATEGORY'.padEnd(22)} | ${'SCENARIO'.padEnd(30)} | ${'STATUS'.padEnd(10)} | ${'RESULT'}`);
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
                console.log(`${scenario.category.padEnd(22)} | ${scenario.name.padEnd(30)} | ✅ ${result.healthState.padEnd(8)} | PASS`);
            } else {
                failed++;
                console.log(`${scenario.category.padEnd(22)} | ${scenario.name.padEnd(30)} | ❌ ${result.healthState.padEnd(8)} | FAIL`);
                console.log(`   EXPECTED: Status=${scenario.expected.status}, ErrorType=${scenario.expected.errorType || 'ANY'}`);
                console.log(`   ACTUAL:   Status=${result.healthState}, ErrorType=${result.errorType}, Message=${result.errorMessage || 'N/A'}`);
            }

        } catch (err) {
            // For malformed URLs, errors are expected
            if (scenario.expected.status === 'DOWN') {
                passed++;
                console.log(`${scenario.category.padEnd(22)} | ${scenario.name.padEnd(30)} | ✅ DOWN     | PASS (Error as expected: ${err.message.substring(0, 50)})`);
            } else {
                failed++;
                console.log(`${scenario.category.padEnd(22)} | ${scenario.name.padEnd(30)} | 💥 ERROR    | FAIL (Unexpected error: ${err.message})`);
            }
        }
    }

    console.log('================================================================================');
    console.log(`SUMMARY: ${passed}/${SCENARIOS.length} Passed, ${failed} Failed`);

    if (failed > 0) {
        console.log('❌ Some tests failed');
        process.exit(1);
    } else {
        console.log('✅ All malformed URL tests passed');
        process.exit(0);
    }
}

runMalformedUrlTests();

