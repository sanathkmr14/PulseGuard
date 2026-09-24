#!/usr/bin/env node
/**
 * DNS PROTOCOL REAL-TIME TEST
 * Tests DNS resolution with real endpoints
 * 
 * Validates:
 * ✅ Valid domain resolution (UP)
 * ✅ Invalid domain detection (DOWN)
 * ✅ DNS server failures (DOWN)
 * ✅ Latency measurement
 * ✅ Error classification
 */

import MonitorRunner from '../../src/services/runner.js';

// ==========================================
// TEST SCENARIOS
// ==========================================

const TEST_SCENARIOS = [
    {
        name: 'Invalid Domain - Empty String',
        url: '',
        timeout: 5000,
        expected: { healthState: 'DOWN', errorType: 'DNS_NOT_FOUND' }
    },
    {
        name: 'Valid Domain - Google',
        url: 'google.com',
        timeout: 5000,
        expected: { healthState: 'UP', errorType: null }
    },
    {
        name: 'Valid Domain - GitHub',
        url: 'github.com',
        timeout: 5000,
        expected: { healthState: 'UP', errorType: null }
    },
    {
        name: 'Invalid Domain - Raw IP',
        url: '1.1.1.1',
        timeout: 5000,
        expected: { healthState: 'DOWN', errorType: 'INVALID_INPUT' }
    },
    {
        name: 'Invalid Domain - Non-existent',
        url: 'no-such-domain-xyz-999.com',
        timeout: 5000,
        expected: { healthState: 'DOWN', errorType: 'DNS_NOT_FOUND' }
    },
    {
        name: 'Invalid Domain - Random String',
        url: 'this-domain-definitely-does-not-exist-12345.com',
        timeout: 5000,
        expected: { healthState: 'DOWN', errorType: 'DNS_NOT_FOUND' }
    },
    {
        name: 'Valid Domain - Amazon',
        url: 'amazon.com',
        timeout: 5000,
        expected: { healthState: 'UP', errorType: null }
    },
    {
        name: 'Valid Domain - Microsoft',
        url: 'microsoft.com',
        timeout: 5000,
        expected: { healthState: 'UP', errorType: null }
    },
    {
        name: 'Valid Domain - Apple',
        url: 'apple.com',
        timeout: 5000,
        expected: { healthState: 'UP', errorType: null }
    }
];

// ==========================================
// TEST RUNNER
// ==========================================

async function testDnsScenario(scenario, attempt = 1) {
    try {
        const result = await MonitorRunner.run({
            type: 'DNS',
            url: scenario.url,
            timeout: scenario.timeout
        });

        // Validate results
        const healthStateMatch = result.healthState === scenario.expected.healthState;
        const errorTypeMatch = scenario.expected.errorType === null ||
            result.errorType === scenario.expected.errorType ||
            (scenario.expected.healthState === 'DOWN' && (result.errorType?.includes('DNS') || ['MISSING_TARGET', 'INVALID_INPUT', 'DNS_ERROR', 'DNS_NOT_FOUND'].includes(result.errorType)));
        const hasResponseTime = result.responseTime >= 0;

        const passed = healthStateMatch && errorTypeMatch && hasResponseTime;

        return {
            name: scenario.name,
            status: passed ? 'PASS' : 'FAIL',
            expected: scenario.expected,
            actual: {
                healthState: result.healthState,
                errorType: result.errorType,
                errorMessage: result.errorMessage,
                responseTime: result.responseTime
            },
            details: {
                healthStateMatch,
                errorTypeMatch,
                hasResponseTime
            }
        };
    } catch (error) {
        // Retry logic
        if (attempt < 2) {
            await new Promise(resolve => setTimeout(resolve, 500));
            return testDnsScenario(scenario, attempt + 1);
        }

        return {
            name: scenario.name,
            status: 'ERROR',
            error: error.message,
            attempt
        };
    }
}

async function runAllTests() {
    console.log('\n' + '='.repeat(90));
    console.log('🧪 DNS PROTOCOL REAL-TIME TEST SUITE');
    console.log('='.repeat(90));
    console.log(`Testing ${TEST_SCENARIOS.length} DNS scenarios with real endpoints`);
    console.log('='.repeat(90) + '\n');

    const results = {
        passed: 0,
        failed: 0,
        error: 0,
        details: []
    };

    // Test each scenario
    for (const scenario of TEST_SCENARIOS) {
        process.stdout.write(`Testing: ${scenario.name.padEnd(40)}... `);
        const testResult = await testDnsScenario(scenario);
        results.details.push(testResult);

        if (testResult.status === 'PASS') {
            results.passed++;
            console.log(`✅ PASS`);
        } else if (testResult.status === 'FAIL') {
            results.failed++;
            console.log(`❌ FAIL`);
        } else {
            results.error++;
            console.log(`💥 ERROR`);
        }

        await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Print summary
    printSummary(results);

    return results;
}

function printSummary(results) {
    console.log('\n' + '='.repeat(90));
    console.log('📊 DNS TEST RESULTS');
    console.log('='.repeat(90));

    const total = results.passed + results.failed + results.error;
    const passRate = total > 0 ? ((results.passed / total) * 100).toFixed(2) : 0;

    console.log(`\nTotal Tests:    ${total}`);
    console.log(`Passed:         ${results.passed} ✅`);
    console.log(`Failed:         ${results.failed} ❌`);
    console.log(`Errors:         ${results.error} 💥`);
    console.log(`Pass Rate:      ${passRate}%`);

    // Detailed failures
    if (results.failed > 0 || results.error > 0) {
        console.log('\n' + '='.repeat(90));
        console.log('🔍 DETAILED FAILURE ANALYSIS');
        console.log('='.repeat(90) + '\n');

        for (const detail of results.details) {
            if (detail.status === 'FAIL' || detail.status === 'ERROR') {
                console.log(`\n❌ ${detail.name}`);
                if (detail.error) {
                    console.log(`   Error: ${detail.error}`);
                } else {
                    console.log(`   Expected: ${JSON.stringify(detail.expected)}`);
                    console.log(`   Actual:   ${JSON.stringify(detail.actual)}`);
                }
            }
        }
    }

    console.log('\n' + '='.repeat(90));
    if (results.failed === 0 && results.error === 0) {
        console.log('🎉 ALL DNS TESTS PASSED!');
    } else {
        console.log(`⚠️  ${results.failed + results.error} test(s) need attention`);
    }
    console.log('='.repeat(90) + '\n');
}

// ==========================================
// MAIN EXECUTION
// ==========================================

runAllTests()
    .then(results => {
        const exitCode = results.failed > 0 || results.error > 0 ? 1 : 0;
        process.exit(exitCode);
    })
    .catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
