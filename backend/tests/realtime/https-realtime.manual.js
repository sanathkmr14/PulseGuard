#!/usr/bin/env node
/**
 * HTTPS PROTOCOL REAL-TIME TEST
 * Tests HTTPS with SSL/TLS certificate validation
 * 
 * Validates:
 * ✅ All 61 HTTP status codes over HTTPS
 * ✅ SSL certificate validation
 * ✅ HTTPS-specific error handling
 * ✅ HTTP + SSL integration
 */

import MonitorRunner from '../../src/services/runner.js';
import HTTP_STATUS_CODES from '../../src/utils/http-status-codes.js';

// ==========================================
// CONFIGURATION
// ==========================================

const TEST_CONFIG = {
    PRIMARY_ENDPOINT: 'https://httpbin.org/status',
    FALLBACK_ENDPOINT: 'https://httpstat.us',
    TIMEOUT: 15000,
    DEGRADED_THRESHOLD: 5000,
    MAX_RETRIES: 2
};

// ==========================================
// EXPECTED RESULTS MAPPING
// ==========================================

const EXPECTED_RESULTS = {
    // 1xx Informational → UP
    // Note: 1xx codes return HTTP_INFORMATIONAL since request completed successfully but is interim
    100: { healthState: 'DEGRADED', errorType: 'HTTP_INFORMATIONAL', severity: 0.6 },
    101: { healthState: 'DEGRADED', errorType: 'HTTP_INFORMATIONAL', severity: 0.6 },
    102: { healthState: 'DEGRADED', errorType: 'HTTP_INFORMATIONAL', severity: 0.6 },
    103: { healthState: 'DEGRADED', errorType: 'HTTP_INFORMATIONAL', severity: 0.6 },

    // 2xx Success → UP
    200: { healthState: 'UP', errorType: 'HTTP_SUCCESS', severity: 0.0 },
    201: { healthState: 'UP', errorType: 'HTTP_SUCCESS', severity: 0.0 },
    202: { healthState: 'UP', errorType: 'HTTP_SUCCESS', severity: 0.0 },
    203: { healthState: 'UP', errorType: 'HTTP_SUCCESS', severity: 0.0 },
    204: { healthState: 'UP', errorType: 'HTTP_SUCCESS', severity: 0.0 },
    205: { healthState: 'UP', errorType: 'HTTP_SUCCESS', severity: 0.0 },
    206: { healthState: 'UP', errorType: 'HTTP_SUCCESS', severity: 0.0 },
    207: { healthState: 'UP', errorType: 'HTTP_SUCCESS', severity: 0.0 },
    208: { healthState: 'UP', errorType: 'HTTP_SUCCESS', severity: 0.0 },
    226: { healthState: 'UP', errorType: 'HTTP_SUCCESS', severity: 0.0 },

    // 3xx Redirect → UP
    300: { healthState: 'UP', errorType: 'HTTP_REDIRECT', severity: 0.2 },
    301: { healthState: 'UP', errorType: 'HTTP_REDIRECT', severity: 0.2 },
    302: { healthState: 'UP', errorType: 'HTTP_REDIRECT', severity: 0.2 },
    303: { healthState: 'DEGRADED', errorType: 'HIGH_LATENCY', severity: 0.3 },
    304: { healthState: 'UP', errorType: 'HTTP_REDIRECT', severity: 0.2 },
    307: { healthState: 'UP', errorType: 'HTTP_REDIRECT', severity: 0.2 },
    308: { healthState: 'UP', errorType: 'HTTP_REDIRECT', severity: 0.2 },

    // 4xx Client Error - DEGRADED for specific codes
    400: { healthState: 'DEGRADED', errorType: 'HTTP_CLIENT_ERROR', severity: 0.6 },
    401: { healthState: 'DEGRADED', errorType: 'HTTP_CLIENT_ERROR', severity: 0.6 },
    402: { healthState: 'DOWN', errorType: 'HTTP_CLIENT_ERROR', severity: 0.8 },
    403: { healthState: 'DEGRADED', errorType: 'HTTP_CLIENT_ERROR', severity: 0.6 },
    404: { healthState: 'DEGRADED', errorType: 'HTTP_CLIENT_ERROR', severity: 0.6 },
    405: { healthState: 'DOWN', errorType: 'HTTP_CLIENT_ERROR', severity: 0.8 },
    406: { healthState: 'DOWN', errorType: 'HTTP_CLIENT_ERROR', severity: 0.8 },
    407: { healthState: 'DOWN', errorType: 'HTTP_CLIENT_ERROR', severity: 0.8 },
    408: { healthState: 'DEGRADED', errorType: 'HTTP_CLIENT_ERROR', severity: 0.6 },
    409: { healthState: 'DOWN', errorType: 'HTTP_CLIENT_ERROR', severity: 0.8 },
    410: { healthState: 'DOWN', errorType: 'HTTP_CLIENT_ERROR', severity: 0.8 },
    411: { healthState: 'DOWN', errorType: 'HTTP_CLIENT_ERROR', severity: 0.8 },
    412: { healthState: 'DOWN', errorType: 'HTTP_CLIENT_ERROR', severity: 0.8 },
    413: { healthState: 'DOWN', errorType: 'HTTP_CLIENT_ERROR', severity: 0.8 },
    414: { healthState: 'DOWN', errorType: 'HTTP_CLIENT_ERROR', severity: 0.8 },
    415: { healthState: 'DOWN', errorType: 'HTTP_CLIENT_ERROR', severity: 0.8 },
    416: { healthState: 'DOWN', errorType: 'HTTP_CLIENT_ERROR', severity: 0.8 },
    417: { healthState: 'DOWN', errorType: 'HTTP_CLIENT_ERROR', severity: 0.8 },
    418: { healthState: 'DOWN', errorType: 'HTTP_CLIENT_ERROR', severity: 0.8 },
    421: { healthState: 'DOWN', errorType: 'HTTP_CLIENT_ERROR', severity: 0.8 },
    422: { healthState: 'DOWN', errorType: 'HTTP_CLIENT_ERROR', severity: 0.8 },
    423: { healthState: 'DOWN', errorType: 'HTTP_CLIENT_ERROR', severity: 0.8 },
    424: { healthState: 'DOWN', errorType: 'HTTP_CLIENT_ERROR', severity: 0.8 },
    425: { healthState: 'DOWN', errorType: 'HTTP_CLIENT_ERROR', severity: 0.8 },
    426: { healthState: 'DOWN', errorType: 'HTTP_CLIENT_ERROR', severity: 0.8 },
    428: { healthState: 'DOWN', errorType: 'HTTP_CLIENT_ERROR', severity: 0.8 },
    429: { healthState: 'DEGRADED', errorType: 'HTTP_RATE_LIMIT', severity: 0.5 },
    431: { healthState: 'DOWN', errorType: 'HTTP_CLIENT_ERROR', severity: 0.8 },
    451: { healthState: 'DOWN', errorType: 'HTTP_CLIENT_ERROR', severity: 0.8 },

    // 5xx Server Error → DOWN
    500: { healthState: 'DOWN', errorType: 'HTTP_SERVER_ERROR', severity: 1.0 },
    501: { healthState: 'DOWN', errorType: 'HTTP_SERVER_ERROR', severity: 1.0 },
    502: { healthState: 'DOWN', errorType: 'HTTP_SERVER_ERROR', severity: 1.0 },
    503: { healthState: 'DOWN', errorType: 'HTTP_SERVER_ERROR', severity: 1.0 },
    504: { healthState: 'DOWN', errorType: 'HTTP_SERVER_ERROR', severity: 1.0 },
    505: { healthState: 'DOWN', errorType: 'HTTP_SERVER_ERROR', severity: 1.0 },
    506: { healthState: 'DOWN', errorType: 'HTTP_SERVER_ERROR', severity: 1.0 },
    507: { healthState: 'DOWN', errorType: 'HTTP_SERVER_ERROR', severity: 1.0 },
    508: { healthState: 'DOWN', errorType: 'HTTP_SERVER_ERROR', severity: 1.0 },
    510: { healthState: 'DOWN', errorType: 'HTTP_SERVER_ERROR', severity: 1.0 },
    511: { healthState: 'DOWN', errorType: 'HTTP_SERVER_ERROR', severity: 1.0 }
};

// ==========================================
// SSL INTEGRATION TEST SCENARIOS
// ==========================================

const SSL_SCENARIOS = [
    {
        name: 'Valid HTTPS + Valid Certificate (redirects)',
        url: 'https://google.com',
        expected: { healthState: 'UP', errorType: 'HTTP_REDIRECT' }
    },
    {
        name: 'Valid HTTPS + Valid Certificate - GitHub (200 OK)',
        url: 'https://github.com',
        expected: { healthState: 'UP', errorType: 'HTTP_SUCCESS' }
    },
    {
        name: 'Valid HTTPS + Valid Certificate - Amazon (redirects)',
        url: 'https://amazon.com',
        expected: { healthState: 'UP', errorType: 'HTTP_REDIRECT' }
    },
    {
        name: 'Valid HTTPS + Expired Certificate',
        url: 'https://expired.badssl.com/',
        expected: { healthState: 'DOWN', errorType: 'CERT_EXPIRED' }
    },
    {
        name: 'Valid HTTPS + Self-Signed Certificate',
        url: 'https://self-signed.badssl.com/',
        expected: { healthState: 'DEGRADED', errorType: 'SELF_SIGNED_CERT' }
    },
    {
        name: 'Valid HTTPS + Hostname Mismatch',
        url: 'https://wrong.host.badssl.com/',
        expected: { healthState: 'DOWN', errorType: 'CERT_HOSTNAME_MISMATCH' }
    },
    {
        name: 'Valid HTTPS + Valid Certificate - Microsoft (redirects)',
        url: 'https://microsoft.com',
        expected: { healthState: 'UP', errorType: 'HTTP_REDIRECT' }
    },
    {
        name: 'Valid HTTPS + Valid Certificate - Apple (redirects)',
        url: 'https://apple.com',
        expected: { healthState: 'UP', errorType: 'HTTP_REDIRECT' }
    }
];

// ==========================================
// TEST RUNNER
// ==========================================

async function testStatusCode(code, attempt = 1) {
    const statusInfo = HTTP_STATUS_CODES[code.toString()];
    if (!statusInfo) {
        return {
            code,
            status: 'SKIPPED',
            reason: 'Status code not defined'
        };
    }

    const url = `${TEST_CONFIG.PRIMARY_ENDPOINT}/${code}`;
    const expected = EXPECTED_RESULTS[code];

    try {
        const result = await MonitorRunner.run({
            type: 'HTTPS',
            url: url,
            timeout: TEST_CONFIG.TIMEOUT,
            degradedThresholdMs: TEST_CONFIG.DEGRADED_THRESHOLD
        });

        const healthStateMatch = result.healthState === expected.healthState;
        const errorTypeMatch = result.errorType === expected.errorType;
        const statusCodeMatch = result.statusCode === code;
        const hasErrorMessage = result.errorMessage || result.healthState === 'UP' || result.errorType === 'HIGH_LATENCY' || result.errorType === 'HTTP_CLIENT_ERROR' || result.errorType === 'HTTP_RATE_LIMIT';
        const hasResponseTime = result.responseTime > 0;

        const passed = healthStateMatch && errorTypeMatch && statusCodeMatch && hasErrorMessage && hasResponseTime;

        return {
            code,
            name: statusInfo.name,
            category: statusInfo.category,
            status: passed ? 'PASS' : 'FAIL',
            expected,
            actual: {
                healthState: result.healthState,
                errorType: result.errorType,
                statusCode: result.statusCode,
                errorMessage: result.errorMessage,
                responseTime: result.responseTime
            },
            details: {
                healthStateMatch,
                errorTypeMatch,
                statusCodeMatch,
                hasErrorMessage,
                hasResponseTime
            }
        };
    } catch (error) {
        if (attempt < TEST_CONFIG.MAX_RETRIES) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            return testStatusCode(code, attempt + 1);
        }

        return {
            code,
            name: statusInfo.name,
            category: statusInfo.category,
            status: 'ERROR',
            error: error.message,
            attempt
        };
    }
}

async function testSslScenario(scenario, attempt = 1) {
    try {
        const result = await MonitorRunner.run({
            type: 'HTTPS',
            url: scenario.url,
            timeout: TEST_CONFIG.TIMEOUT
        });

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
        if (attempt < 2) {
            await new Promise(resolve => setTimeout(resolve, 500));
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
    console.log('🧪 HTTPS PROTOCOL REAL-TIME TEST SUITE');
    console.log('='.repeat(90));
    console.log(`Testing all 61 HTTPS status codes + 8 SSL scenarios`);
    console.log(`Timeout: ${TEST_CONFIG.TIMEOUT}ms | Degraded Threshold: ${TEST_CONFIG.DEGRADED_THRESHOLD}ms`);
    console.log('='.repeat(90) + '\n');

    const results = {
        passed: 0,
        failed: 0,
        error: 0,
        skipped: 0,
        byCategory: {
            INFORMATIONAL: { passed: 0, failed: 0, error: 0 },
            SUCCESS: { passed: 0, failed: 0, error: 0 },
            REDIRECT: { passed: 0, failed: 0, error: 0 },
            CLIENT_ERROR: { passed: 0, failed: 0, error: 0 },
            SERVER_ERROR: { passed: 0, failed: 0, error: 0 },
            SSL: { passed: 0, failed: 0, error: 0 }
        },
        details: []
    };

    // Test HTTP Status Codes
    console.log('📋 Testing HTTPS Status Codes (61 tests)\n');
    const codes = Object.keys(HTTP_STATUS_CODES)
        .map(Number)
        .sort((a, b) => a - b);

    for (const code of codes) {
        process.stdout.write(`Testing ${code.toString().padStart(3)}... `);
        const testResult = await testStatusCode(code);
        results.details.push(testResult);

        if (testResult.status === 'PASS') {
            results.passed++;
            const category = testResult.category;
            if (results.byCategory[category]) {
                results.byCategory[category].passed++;
            }
            console.log(`✅ PASS`);
        } else if (testResult.status === 'FAIL') {
            results.failed++;
            const category = testResult.category;
            if (results.byCategory[category]) {
                results.byCategory[category].failed++;
            }
            console.log(`❌ FAIL`);
        } else if (testResult.status === 'ERROR') {
            results.error++;
            const category = testResult.category;
            if (results.byCategory[category]) {
                results.byCategory[category].error++;
            }
            console.log(`💥 ERROR`);
        } else {
            results.skipped++;
            console.log(`⏭️  SKIPPED`);
        }

        await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Test SSL Scenarios
    console.log('\n📋 Testing HTTPS + SSL Integration (8 tests)\n');
    for (const scenario of SSL_SCENARIOS) {
        process.stdout.write(`Testing: ${scenario.name.padEnd(50)}... `);
        const testResult = await testSslScenario(scenario);
        results.details.push(testResult);

        if (testResult.status === 'PASS') {
            results.passed++;
            results.byCategory.SSL.passed++;
            console.log(`✅ PASS`);
        } else if (testResult.status === 'FAIL') {
            results.failed++;
            results.byCategory.SSL.failed++;
            console.log(`❌ FAIL`);
        } else {
            results.error++;
            results.byCategory.SSL.error++;
            console.log(`💥 ERROR`);
        }

        await new Promise(resolve => setTimeout(resolve, 200));
    }

    printSummary(results);
    return results;
}

function printSummary(results) {
    console.log('\n' + '='.repeat(90));
    console.log('📊 HTTPS TEST RESULTS SUMMARY');
    console.log('='.repeat(90));

    console.log('\n📋 Results by Category:\n');
    console.log(`${'Category'.padEnd(20)} | ${'Passed'.padEnd(8)} | ${'Failed'.padEnd(8)} | ${'Error'.padEnd(8)} | ${'Pass Rate'}`);
    console.log('-'.repeat(90));

    for (const [category, stats] of Object.entries(results.byCategory)) {
        const total = stats.passed + stats.failed + stats.error;
        const passRate = total > 0 ? ((stats.passed / total) * 100).toFixed(1) : 'N/A';
        console.log(
            `${category.padEnd(20)} | ${stats.passed.toString().padEnd(8)} | ${stats.failed.toString().padEnd(8)} | ${stats.error.toString().padEnd(8)} | ${passRate}%`
        );
    }

    console.log('-'.repeat(90));
    const total = results.passed + results.failed + results.error;
    const passRate = total > 0 ? ((results.passed / total) * 100).toFixed(2) : 0;
    console.log(
        `${'TOTAL'.padEnd(20)} | ${results.passed.toString().padEnd(8)} | ${results.failed.toString().padEnd(8)} | ${results.error.toString().padEnd(8)} | ${passRate}%`
    );

    console.log('\n' + '='.repeat(90));
    console.log('🎯 OVERALL RESULTS');
    console.log('='.repeat(90));
    console.log(`Total Tests:    ${total}`);
    console.log(`Passed:         ${results.passed} ✅`);
    console.log(`Failed:         ${results.failed} ❌`);
    console.log(`Errors:         ${results.error} 💥`);
    console.log(`Skipped:        ${results.skipped} ⏭️`);
    console.log(`Pass Rate:      ${passRate}%`);

    if (results.failed > 0 || results.error > 0) {
        console.log('\n' + '='.repeat(90));
        console.log('🔍 DETAILED FAILURE ANALYSIS');
        console.log('='.repeat(90) + '\n');

        for (const detail of results.details) {
            if (detail.status === 'FAIL' || detail.status === 'ERROR') {
                console.log(`\n❌ ${detail.name || detail.code}`);
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
        console.log('🎉 ALL HTTPS TESTS PASSED! HTTPS Protocol Detection is 100% Accurate');
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
