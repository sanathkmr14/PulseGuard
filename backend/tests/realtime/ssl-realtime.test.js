#!/usr/bin/env node
/**
 * SSL/TLS CERTIFICATE REAL-TIME TEST
 * Tests SSL certificate validation with real endpoints
 * 
 * Validates:
 * ✅ Valid certificates (UP)
 * ✅ Expired certificates (DOWN)
 * ✅ Self-signed certificates (DEGRADED)
 * ✅ Hostname mismatches (DOWN)
 * ✅ Certificate expiration tracking
 * ✅ Error classification
 */

import MonitorRunner from '../../src/services/runner.js';

// ==========================================
// TEST SCENARIOS
// ==========================================

const TEST_SCENARIOS = [
    {
        name: 'Valid Certificate - Google',
        url: 'https://google.com',
        timeout: 10000,
        expected: { healthState: 'UP', errorType: null }
    },
    {
        name: 'Valid Certificate - GitHub',
        url: 'https://github.com',
        timeout: 10000,
        expected: { healthState: 'UP', errorType: null }
    },
    {
        name: 'Valid Certificate - Amazon',
        url: 'https://amazon.com',
        timeout: 10000,
        expected: { healthState: 'UP', errorType: null }
    },
    {
        name: 'Expired Certificate - badssl.com',
        url: 'https://expired.badssl.com/',
        timeout: 10000,
        expected: { healthState: 'DOWN', errorType: 'CERT_EXPIRED' }
    },
    {
        name: 'Self-Signed Certificate - badssl.com',
        url: 'https://self-signed.badssl.com/',
        timeout: 10000,
        expected: { healthState: 'DEGRADED', errorType: 'SELF_SIGNED_CERT' }
    },
    {
        name: 'Hostname Mismatch - badssl.com',
        url: 'https://wrong.host.badssl.com/',
        timeout: 10000,
        expected: { healthState: 'DOWN', errorType: 'CERT_HOSTNAME_MISMATCH' }
    },
    {
        name: 'Valid Certificate - Microsoft',
        url: 'https://microsoft.com',
        timeout: 10000,
        expected: { healthState: 'UP', errorType: null }
    },
    {
        name: 'Valid Certificate - Apple',
        url: 'https://apple.com',
        timeout: 10000,
        expected: { healthState: 'UP', errorType: null }
    }
];

// ==========================================
// TEST RUNNER
// ==========================================

async function testSslScenario(scenario, attempt = 1) {
    try {
        const result = await MonitorRunner.run({
            type: 'HTTPS',
            url: scenario.url,
            timeout: scenario.timeout
        });

        // Validate results
        const healthStateMatch = result.healthState === scenario.expected.healthState;
        const errorTypeMatch = scenario.expected.errorType === null || result.errorType === scenario.expected.errorType;
        const hasResponseTime = result.responseTime > 0;

        const passed = healthStateMatch && errorTypeMatch && hasResponseTime;

        return {
            name: scenario.name,
            status: passed ? 'PASS' : 'FAIL',
            expected: scenario.expected,
            actual: {
                healthState: result.healthState,
                errorType: result.errorType,
                errorMessage: result.errorMessage,
                responseTime: result.responseTime,
                meta: result.meta
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
            await new Promise(resolve => setTimeout(resolve, 1000));
            return testSslScenario(scenario, attempt + 1);
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
    console.log('🧪 SSL/TLS CERTIFICATE REAL-TIME TEST SUITE');
    console.log('='.repeat(90));
    console.log(`Testing ${TEST_SCENARIOS.length} SSL scenarios with real endpoints`);
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
        const testResult = await testSslScenario(scenario);
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

        await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Print summary
    printSummary(results);

    return results;
}

function printSummary(results) {
    console.log('\n' + '='.repeat(90));
    console.log('📊 SSL/TLS TEST RESULTS');
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
        console.log('🎉 ALL SSL/TLS TESTS PASSED!');
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
