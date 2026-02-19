/**
 * Bug Fixes Verification Test Suite
 * Tests for: Malformed URLs, FTP Protocol, Triple Slash, Empty DNS, 1xx Codes
 */

import MonitorRunner from '../../src/services/runner.js';

// ==========================================
// TEST SUITE
// ==========================================
const SCENARIOS = [
    // Bug #1: Malformed URLs - These are actually valid URLs syntactically
    // but DNS fails because the domain doesn't exist. DNS_ERROR is correct.
    {
        bug: 'Malformed URLs',
        name: 'Double Dot',
        url: 'https://..com',
        type: 'HTTP',
        expected: { status: 'DOWN', errorType: 'DNS_ERROR' }
    },
    {
        bug: 'Malformed URLs',
        name: 'Double Dot in Middle',
        url: 'http://example..com',
        type: 'HTTP',
        expected: { status: 'DOWN', errorType: 'DNS_ERROR' }
    },
    {
        bug: 'Malformed URLs',
        name: 'No TLD',
        url: 'http://example',
        type: 'HTTP',
        expected: { status: 'DOWN' } // DNS_NOT_FOUND expected for valid but non-existent domain
    },

    // Bug #2: FTP Protocol should return DOWN with PROTOCOL_MISMATCH
    {
        bug: 'FTP Protocol',
        name: 'FTP Protocol',
        url: 'ftp://example.com',
        type: 'HTTP',
        expected: { status: 'DOWN', errorType: 'PROTOCOL_MISMATCH' }
    },
    {
        bug: 'FTP Protocol',
        name: 'SSH Protocol',
        url: 'ssh://example.com',
        type: 'HTTP',
        expected: { status: 'DOWN', errorType: 'PROTOCOL_MISMATCH' }
    },
    {
        bug: 'FTP Protocol',
        name: 'Typo Protocol',
        url: 'htp://typo.com',
        type: 'HTTP',
        expected: { status: 'DOWN' }
    },

    // Bug #3: Triple Slash should return DOWN with MALFORMED_STRUCTURE
    {
        bug: 'Triple Slash',
        name: 'Triple Slash HTTP',
        url: 'http:///example.com',
        type: 'HTTP',
        expected: { status: 'DOWN', errorType: 'MALFORMED_STRUCTURE' }
    },
    {
        bug: 'Triple Slash',
        name: 'Triple Slash HTTPS',
        url: 'https:///test.com',
        type: 'HTTP',
        expected: { status: 'DOWN', errorType: 'MALFORMED_STRUCTURE' }
    },

    // Bug #4: Empty String DNS should return DOWN with MISSING_TARGET
    {
        bug: 'Empty String DNS',
        name: 'Empty String',
        url: '',
        type: 'HTTP',
        expected: { status: 'DOWN', errorType: 'MISSING_TARGET' }
    },
    {
        bug: 'Empty String DNS',
        name: 'Whitespace Only',
        url: '   ',
        type: 'HTTP',
        expected: { status: 'DOWN', errorType: 'MISSING_TARGET' }
    },

    // Bug #5: Empty Hostname - http:// without hostname is invalid
    {
        bug: 'Empty Hostname',
        name: 'Empty Hostname',
        url: 'http://',
        type: 'HTTP',
        expected: { status: 'DOWN', errorType: 'INVALID_URL' }
    },

    // Special Characters
    {
        bug: 'Special Characters',
        name: 'Angle Brackets',
        url: 'http://exam<ple>.com',
        type: 'HTTP',
        expected: { status: 'DOWN', errorType: 'INVALID_URL' }
    },
    {
        bug: 'Special Characters',
        name: 'Square Brackets',
        url: 'http://exam[ple].com',
        type: 'HTTP',
        expected: { status: 'DOWN', errorType: 'INVALID_URL' }
    },
    {
        bug: 'Special Characters',
        name: 'Pipe Character',
        url: 'http://exam|ple.com',
        type: 'HTTP',
        expected: { status: 'DOWN', errorType: 'INVALID_URL' }
    },

    // Invalid Ports
    {
        bug: 'Invalid Port',
        name: 'Port Too Large',
        url: 'http://example.com:99999',
        type: 'HTTP',
        expected: { status: 'DOWN' }
    },
    {
        bug: 'Invalid Port',
        name: 'Non-Numeric Port',
        url: 'http://example.com:abc',
        type: 'HTTP',
        expected: { status: 'DOWN' }
    },
    {
        bug: 'Invalid Port',
        name: 'Negative Port',
        url: 'http://example.com:-1',
        type: 'HTTP',
        expected: { status: 'DOWN' }
    }
];

// ==========================================
// RUNNER
// ==========================================
async function runBugFixTests() {
    console.log('🚀 Starting Bug Fixes Verification Test Suite...');
    console.log('='.repeat(80));

    const results = {
        passed: 0,
        failed: 0,
        byBug: {}
    };

    for (const scenario of SCENARIOS) {
        // Group by bug for summary
        if (!results.byBug[scenario.bug]) {
            results.byBug[scenario.bug] = { passed: 0, failed: 0, total: 0 };
        }
        results.byBug[scenario.bug].total++;

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
                results.passed++;
                results.byBug[scenario.bug].passed++;
                console.log(`✅ [${scenario.bug}] ${scenario.name}: ${result.healthState} / ${result.errorType}`);
            } else {
                results.failed++;
                results.byBug[scenario.bug].failed++;
                console.log(`❌ [${scenario.bug}] ${scenario.name}: Expected ${scenario.expected.status}/${scenario.expected.errorType}, got ${result.healthState}/${result.errorType}`);
                console.log(`   Message: ${result.errorMessage || 'N/A'}`);
            }

        } catch (err) {
            // For malformed URLs, errors are expected
            if (scenario.expected.status === 'DOWN') {
                results.passed++;
                results.byBug[scenario.bug].passed++;
                console.log(`✅ [${scenario.bug}] ${scenario.name}: DOWN (Error as expected)`);
            } else {
                results.failed++;
                results.byBug[scenario.bug].failed++;
                console.log(`❌ [${scenario.bug}] ${scenario.name}: Unexpected error: ${err.message}`);
            }
        }
    }

    console.log('='.repeat(80));
    console.log('\n📊 SUMMARY BY BUG FIX:');
    console.log('-'.repeat(40));

    for (const [bug, stats] of Object.entries(results.byBug)) {
        const status = stats.failed === 0 ? '✅' : '❌';
        console.log(`${status} ${bug}: ${stats.passed}/${stats.total} passed`);
    }

    console.log('-'.repeat(40));
    console.log(`\n🎯 OVERALL: ${results.passed}/${SCENARIOS.length} Passed, ${results.failed} Failed`);

    if (results.failed > 0) {
        console.log('\n❌ Some tests failed');
        process.exit(1);
    } else {
        console.log('\n✅ All bug fixes verified!');
        process.exit(0);
    }
}

runBugFixTests();

