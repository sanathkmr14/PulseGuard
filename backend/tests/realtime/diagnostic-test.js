#!/usr/bin/env node
/**
 * DIAGNOSTIC TEST - Check actual vs expected values
 * Tests all protocols: HTTP, TCP, DNS, PING, SMTP, UDP
 */

import MonitorRunner from '../../src/services/runner.js';

async function diagnose() {
    console.log('\n' + '='.repeat(90));
    console.log('🔍 DIAGNOSTIC TEST - Checking Actual Values');
    console.log('='.repeat(90) + '\n');

    // Test 1: HTTP 200
    console.log('TEST 1: HTTP 200 OK');
    console.log('-'.repeat(90));
    try {
        const result200 = await MonitorRunner.run({
            type: 'HTTP',
            url: 'https://httpbin.org/status/200',
            timeout: 15000,
            degradedThresholdMs: 2000
        });
        console.log('Result:');
        console.log(`  healthState: "${result200.healthState}" (expected: "UP")`);
        console.log(`  errorType: "${result200.errorType}" (expected: "HTTP_SUCCESS")`);
        console.log(`  statusCode: ${result200.statusCode} (expected: 200)`);
        console.log(`  responseTime: ${result200.responseTime}ms`);
        console.log(`  Match: ${result200.healthState === 'UP' && result200.errorType === 'HTTP_SUCCESS' ? '✅ YES' : '❌ NO'}\n`);
    } catch (error) {
        console.log(`❌ Error: ${error.message}\n`);
    }

    // Test 2: HTTP 404
    console.log('TEST 2: HTTP 404 Not Found');
    console.log('-'.repeat(90));
    try {
        const result404 = await MonitorRunner.run({
            type: 'HTTP',
            url: 'https://httpbin.org/status/404',
            timeout: 15000,
            degradedThresholdMs: 2000
        });
        console.log('Result:');
        console.log(`  healthState: "${result404.healthState}" (expected: "DEGRADED")`);
        console.log(`  errorType: "${result404.errorType}" (expected: "HTTP_CLIENT_ERROR")`);
        console.log(`  statusCode: ${result404.statusCode} (expected: 404)`);
        console.log(`  responseTime: ${result404.responseTime}ms`);
        console.log(`  Match: ${result404.healthState === 'DEGRADED' && result404.errorType === 'HTTP_CLIENT_ERROR' ? '✅ YES' : '❌ NO'}\n`);
    } catch (error) {
        console.log(`❌ Error: ${error.message}\n`);
    }

    // Test 3: TCP Open Port
    console.log('TEST 3: TCP Open Port (google.com:443)');
    console.log('-'.repeat(90));
    try {
        const resultTcp = await MonitorRunner.run({
            type: 'TCP',
            url: 'google.com',
            port: 443,
            timeout: 5000
        });
        console.log('Result:');
        console.log(`  healthState: "${resultTcp.healthState}" (expected: "UP")`);
        console.log(`  errorType: "${resultTcp.errorType}" (expected: null)`);
        console.log(`  responseTime: ${resultTcp.responseTime}ms`);
        console.log(`  Match: ${resultTcp.healthState === 'UP' && resultTcp.errorType === null ? '✅ YES' : '❌ NO'}\n`);
    } catch (error) {
        console.log(`❌ Error: ${error.message}\n`);
    }

    // Test 4: DNS Valid Domain
    console.log('TEST 4: DNS Valid Domain (google.com)');
    console.log('-'.repeat(90));
    try {
        const resultDns = await MonitorRunner.run({
            type: 'DNS',
            url: 'google.com',
            timeout: 5000
        });
        console.log('Result:');
        console.log(`  healthState: "${resultDns.healthState}" (expected: "UP")`);
        console.log(`  errorType: "${resultDns.errorType}" (expected: null)`);
        console.log(`  responseTime: ${resultDns.responseTime}ms`);
        console.log(`  Match: ${resultDns.healthState === 'UP' && resultDns.errorType === null ? '✅ YES' : '❌ NO'}\n`);
    } catch (error) {
        console.log(`❌ Error: ${error.message}\n`);
    }

    // Test 5: PING Localhost
    console.log('TEST 5: PING Localhost (127.0.0.1)');
    console.log('-'.repeat(90));
    try {
        const resultPing = await MonitorRunner.run({
            type: 'PING',
            url: '127.0.0.1',
            timeout: 5000
        });
        console.log('Result:');
        console.log(`  healthState: "${resultPing.healthState}" (expected: "UP")`);
        console.log(`  errorType: "${resultPing.errorType}" (expected: null)`);
        console.log(`  responseTime: ${resultPing.responseTime}ms`);
        console.log(`  Match: ${resultPing.healthState === 'UP' && resultPing.errorType === null ? '✅ YES' : '❌ NO'}\n`);
    } catch (error) {
        console.log(`❌ Error: ${error.message}\n`);
    }

    // Test 6: SMTP Gmail
    console.log('TEST 6: SMTP Gmail (smtp.gmail.com:587)');
    console.log('-'.repeat(90));
    try {
        const resultSmtp = await MonitorRunner.run({
            type: 'SMTP',
            url: 'smtp.gmail.com',
            port: 587,
            timeout: 10000
        });
        console.log('Result:');
        console.log(`  healthState: "${resultSmtp.healthState}" (expected: "UP")`);
        console.log(`  errorType: "${resultSmtp.errorType}" (expected: null)`);
        console.log(`  responseTime: ${resultSmtp.responseTime}ms`);
        console.log(`  Match: ${resultSmtp.healthState === 'UP' && resultSmtp.errorType === null ? '✅ YES' : '❌ NO'}\n`);
    } catch (error) {
        console.log(`❌ Error: ${error.message}\n`);
    }

    // Test 7: UDP Google DNS
    console.log('TEST 7: UDP DNS (8.8.8.8:53)');
    console.log('-'.repeat(90));
    try {
        const resultUdp = await MonitorRunner.run({
            type: 'UDP',
            url: '8.8.8.8',
            port: 53,
            timeout: 5000
        });
        console.log('Result:');
        console.log(`  healthState: "${resultUdp.healthState}" (expected: "UP")`);
        console.log(`  errorType: "${resultUdp.errorType}" (expected: null)`);
        console.log(`  responseTime: ${resultUdp.responseTime}ms`);
        console.log(`  Match: ${resultUdp.healthState === 'UP' && resultUdp.errorType === null ? '✅ YES' : '❌ NO'}\n`);
    } catch (error) {
        console.log(`❌ Error: ${error.message}\n`);
    }

    console.log('='.repeat(90));
    console.log('✅ Diagnostic test complete - All protocols tested');
    console.log('='.repeat(90) + '\n');
}

diagnose().catch(console.error);

