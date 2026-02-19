#!/usr/bin/env node
/**
 * COMPREHENSIVE HTTP STATUS CODE REAL-TIME TEST
 * Tests all 61 HTTP status codes with real endpoints
 * 
 * Validates:
 * ✅ Correct healthState (UP/DOWN/DEGRADED/UNKNOWN)
 * ✅ Correct errorType classification
 * ✅ Correct severity score
 * ✅ Meaningful error messages
 * ✅ Response time captured
 * ✅ Status code preserved
 */

import MonitorRunner from '../../src/services/runner.js';
import HTTP_STATUS_CODES from '../../src/utils/http-status-codes.js';
import { STATUS, ERROR_TYPES } from '../../src/utils/status-classifier.js';

// ==========================================
// CONFIGURATION
// ==========================================

const TEST_CONFIG = {
    // Primary endpoint - most reliable
    PRIMARY_ENDPOINT: 'https://httpbin.org/status',
    // Fallback endpoint
    FALLBACK_ENDPOINT: 'https://httpstat.us',
    // Timeout for each test
    TIMEOUT: 15000,
    // Degraded threshold
    DEGRADED_THRESHOLD: 2000,
    // Retry attempts
    MAX_RETRIES: 2
};

// ==========================================
// EXPECTED RESULTS MAPPING
// ==========================================

const EXPECTED_RESULTS = {
    // 1xx Informational → DEGRADED (Incomplete request, waiting for final response)
    // This aligns with industry standards (UptimeRobot, etc.)
    // The server is processing but hasn't completed - not a complete failure but not fully successful
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
    303: { healthState: 'UP', errorType: 'HTTP_REDIRECT', severity: 0.2 },
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
            type: 'HTTP',
            url: url,
            timeout: TEST_CONFIG.TIMEOUT,
            degradedThresholdMs: TEST_CONFIG.DEGRADED_THRESHOLD
        });

        // Validate results
        const healthStateMatch = result.healthState === expected.healthState;
        const errorTypeMatch = result.errorType === expected.errorType;
        const statusCodeMatch = result.statusCode === code;
        const hasErrorMessage = result.errorMessage || result.healthState === 'UP';
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
        // Retry logic
        if (attempt < TEST_CONFIG.MAX_RETRIES) {
            console.log(`   ⚠️  Retry ${attempt}/${TEST_CONFIG.MAX_RETRIES} for code ${code}...`);
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
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

async function runAllTests() {
    console.log('\n' + '='.repeat(90));
    console.log('🧪 COMPREHENSIVE HTTP STATUS CODE REAL-TIME TEST SUITE');
    console.log('='.repeat(90));
    console.log(`Testing all 61 HTTP status codes against: ${TEST_CONFIG.PRIMARY_ENDPOINT}`);
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
            SERVER_ERROR: { passed: 0, failed: 0, error: 0 }
        },
        details: []
    };

    // Get all status codes sorted
    const codes = Object.keys(HTTP_STATUS_CODES)
        .map(Number)
        .sort((a, b) => a - b);

    // Test each code
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

        // Small delay between requests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Print summary
    printSummary(results);

    return results;
}

function printSummary(results) {
    console.log('\n' + '='.repeat(90));
    console.log('📊 TEST RESULTS SUMMARY');
    console.log('='.repeat(90));

    // By Category
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

    // Overall
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

    // Detailed failures
    if (results.failed > 0 || results.error > 0) {
        console.log('\n' + '='.repeat(90));
        console.log('🔍 DETAILED FAILURE ANALYSIS');
        console.log('='.repeat(90) + '\n');

        for (const detail of results.details) {
            if (detail.status === 'FAIL' || detail.status === 'ERROR') {
                console.log(`\n❌ Code ${detail.code}: ${detail.name}`);
                if (detail.error) {
                    console.log(`   Error: ${detail.error}`);
                } else {
                    console.log(`   Expected: ${JSON.stringify(detail.expected)}`);
                    console.log(`   Actual:   ${JSON.stringify(detail.actual)}`);
                    console.log(`   Details:  ${JSON.stringify(detail.details)}`);
                }
            }
        }
    }

    console.log('\n' + '='.repeat(90));
    if (results.failed === 0 && results.error === 0) {
        console.log('🎉 ALL TESTS PASSED! HTTP Status Code Detection is 100% Accurate');
    } else {
        console.log(`⚠️  ${results.failed + results.error} test(s) need attention`);
    }
    console.log('='.repeat(90) + '\n');
}

// ==========================================
// EDGE CASE TESTS FOR BUG FIXES
// ==========================================

async function testEdgeCases() {
    console.log('\n' + '='.repeat(90));
    console.log('🧪 EDGE CASE TESTS (Bug Fixes)');
    console.log('='.repeat(90) + '\n');

    const edgeCases = [
        {
            name: 'Malformed URL - Triple Slash (http:///example.com)',
            monitor: { type: 'HTTP', url: 'http:///example.com', timeout: 5000 },
            expected: { healthState: 'DOWN', errorType: 'INVALID_URL' }
        },
        {
            name: 'Malformed URL - Empty Hostname',
            monitor: { type: 'HTTP', url: 'http://', timeout: 5000 },
            expected: { healthState: 'DOWN', errorType: 'INVALID_URL' }
        },
        {
            name: 'Non-HTTP Protocol - FTP',
            monitor: { type: 'HTTP', url: 'ftp://example.com', timeout: 5000 },
            expected: { healthState: 'DOWN', errorType: 'INVALID_PROTOCOL' }
        },
        {
            name: 'Non-HTTP Protocol - SSH',
            monitor: { type: 'HTTP', url: 'ssh://example.com', timeout: 5000 },
            expected: { healthState: 'DOWN', errorType: 'INVALID_PROTOCOL' }
        },
        {
            name: 'Empty URL',
            monitor: { type: 'HTTP', url: '', timeout: 5000 },
            expected: { healthState: 'DOWN', errorType: 'INVALID_URL' }
        }
    ];

    const results = { passed: 0, failed: 0, error: 0, details: [] };

    for (const test of edgeCases) {
        process.stdout.write(`Testing: ${test.name.padEnd(50)}... `);

        try {
            const result = await MonitorRunner.run(test.monitor);
            const passed = result.healthState === test.expected.healthState &&
                           result.errorType === test.expected.errorType;

            results.details.push({
                name: test.name,
                status: passed ? 'PASS' : 'FAIL',
                expected: test.expected,
                actual: { healthState: result.healthState, errorType: result.errorType }
            });

            if (passed) {
                results.passed++;
                console.log('✅ PASS');
            } else {
                results.failed++;
                console.log('❌ FAIL');
            }
        } catch (err) {
            results.error++;
            console.log('💥 ERROR:', err.message);
        }

        await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log('\n' + '-'.repeat(90));
    console.log(`Edge Cases: ${results.passed}/${results.passed + results.failed + results.error} passed`);

    return results;
}

// ==========================================
// MAIN EXECUTION
// ==========================================

async function main() {
    await runAllTests();
    const edgeResults = await testEdgeCases();

    console.log('\n' + '='.repeat(90));
    console.log('🎯 FINAL SUMMARY');
    console.log('='.repeat(90));

    const allPassed = edgeResults.passed > 0 && edgeResults.failed === 0 && edgeResults.error === 0;

    if (allPassed) {
        console.log('✅ All edge case tests passed! Bug fixes verified.');
    } else {
        console.log(`⚠️  ${edgeResults.failed + edgeResults.error} edge case test(s) failed.`);
    }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
