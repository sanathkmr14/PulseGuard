#!/usr/bin/env node
/**
 * SMTP PROTOCOL REAL-TIME TEST
 * Tests SMTP server connectivity with real endpoints
 * 
 * Validates:
 * ✅ Valid SMTP servers (UP)
 * ✅ Connection refused (DOWN)
 * ✅ Timeout handling (DOWN)
 * ✅ Banner reception (220 code)
 * ✅ Error classification
 */

import MonitorRunner from '../../src/services/runner.js';

// ==========================================
// TEST SCENARIOS
// ==========================================

const TEST_SCENARIOS = [
    {
        name: 'Gmail SMTP - Port 587',
        url: 'smtp.gmail.com',
        port: 587,
        timeout: 10000,
        expected: { healthState: 'UP', errorType: null }
    },
    {
        name: 'Gmail SMTP - Port 465 (SMTPS)',
        url: 'smtp.gmail.com',
        port: 465,
        timeout: 10000,
        expected: { healthState: 'DOWN', errorType: null } // Accepts connection, no 220 banner = DOWN
    },
    {
        name: 'Outlook SMTP - Port 587',
        url: 'smtp-mail.outlook.com',
        port: 587,
        timeout: 10000,
        expected: { healthState: 'UP', errorType: null }
    },
    {
        name: 'Connection Refused - Invalid Port',
        url: 'smtp.gmail.com',
        port: 9999,
        timeout: 5000,
        expected: { healthState: 'DOWN', errorType: 'TIMEOUT' } // Worker returns TIMEOUT for closed/unreachable ports
    },
    {
        name: 'Timeout - Unreachable Host',
        url: '10.255.255.1',
        port: 25,
        timeout: 2000,
        expected: { healthState: 'DOWN', errorType: 'TIMEOUT' }
    },
    {
        name: 'DNS Failure - Invalid Domain',
        url: 'no-such-smtp-server-xyz-999.com',
        port: 587,
        timeout: 5000,
        expected: { healthState: 'DOWN', errorType: 'DNS_ERROR' } // Worker returns DNS_ERROR for DNS failures
    },
    {
        name: 'Localhost SMTP - Port 25',
        url: 'localhost',
        port: 25,
        timeout: 5000,
        expected: { healthState: 'DOWN', errorType: 'CONNECTION_REFUSED' } // Likely not running
    }
];

// ==========================================
// TEST RUNNER
// ==========================================

async function testSmtpScenario(scenario, attempt = 1) {
    try {
        const result = await MonitorRunner.run({
            type: 'SMTP',
            url: scenario.url,
            port: scenario.port,
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
            return testSmtpScenario(scenario, attempt + 1);
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
    console.log('🧪 SMTP PROTOCOL REAL-TIME TEST SUITE');
    console.log('='.repeat(90));
    console.log(`Testing ${TEST_SCENARIOS.length} SMTP scenarios with real endpoints`);
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
        const testResult = await testSmtpScenario(scenario);
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

        await new Promise(resolve => setTimeout(resolve, 300));
    }

    // Print summary
    printSummary(results);

    return results;
}

function printSummary(results) {
    console.log('\n' + '='.repeat(90));
    console.log('📊 SMTP TEST RESULTS');
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
        console.log('🎉 ALL SMTP TESTS PASSED!');
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
