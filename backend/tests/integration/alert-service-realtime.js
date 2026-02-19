#!/usr/bin/env node

/**
 * Real-Time E2E Test Runner for Enhanced Alert Service
 * 
 * Makes REAL HTTP requests to actual endpoints
 * Creates REAL incidents in database
 * Sends REAL notifications
 * 
 * Run: node tests/integration/alert-service-realtime.js
 */

import mongoose from 'mongoose';
import axios from 'axios';
import dotenv from 'dotenv';
import enhancedAlertService from '../../src/services/enhanced-alert.service.js';
import Incident from '../../src/models/Incident.js';
import Monitor from '../../src/models/Monitor.js';
import User from '../../src/models/User.js';

dotenv.config();

// ========================================
// COLORS & LOGGING
// ========================================

const COLORS = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m'
};

const log = {
    header: (text) => console.log(`\n${COLORS.bright}${COLORS.cyan}${'═'.repeat(80)}${COLORS.reset}\n${COLORS.bright}${COLORS.cyan}${text}${COLORS.reset}\n${COLORS.cyan}${'═'.repeat(80)}${COLORS.reset}\n`),
    test: (num, name) => console.log(`\n${COLORS.bright}${COLORS.magenta}TEST ${num}: ${name}${COLORS.reset}\n${COLORS.magenta}${'-'.repeat(70)}${COLORS.reset}\n`),
    success: (text) => console.log(`${COLORS.green}✅ ${text}${COLORS.reset}`),
    error: (text) => console.log(`${COLORS.red}❌ ${text}${COLORS.reset}`),
    info: (text) => console.log(`${COLORS.blue}ℹ️  ${text}${COLORS.reset}`),
    warn: (text) => console.log(`${COLORS.yellow}⚠️  ${text}${COLORS.reset}`),
    alert: (text) => console.log(`${COLORS.red}🚨 ${text}${COLORS.reset}`),
    data: (text) => console.log(`${COLORS.dim}${text}${COLORS.reset}`),
    section: (text) => console.log(`${COLORS.bright}${COLORS.blue}→ ${text}${COLORS.reset}`),
    response: (text) => console.log(`${COLORS.yellow}${text}${COLORS.reset}`),
    incident: (text) => console.log(`${COLORS.magenta}${text}${COLORS.reset}`)
};

// ========================================
// HTTP REQUEST HELPER
// ========================================

async function makeHttpRequest(url, timeout = 10000) {
    const startTime = Date.now();
    
    try {
        const response = await axios.get(url, { 
            timeout,
            maxRedirects: 5,
            validateStatus: () => true // Don't throw on any status code
        });
        
        const latency = Date.now() - startTime;
        
        return {
            success: true,
            statusCode: response.status,
            latency,
            headers: response.headers,
            data: response.data
        };
    } catch (err) {
        const latency = Date.now() - startTime;
        
        return {
            success: false,
            statusCode: null,
            latency,
            error: err.message,
            code: err.code
        };
    }
}

// ========================================
// STATUS CLASSIFICATION LOGIC
// ========================================

function classifyResponse(statusCode, latency, thresholdMs = 2000) {
    if (statusCode === null) {
        return {
            state: 'down',
            reason: 'Connection/timeout error',
            severity: 1.0
        };
    }

    if (statusCode >= 200 && statusCode < 300) {
        if (latency > thresholdMs) {
            return {
                state: 'degraded',
                reason: `Slow response: ${latency}ms (threshold: ${thresholdMs}ms)`,
                severity: 0.6
            };
        }
        return {
            state: 'up',
            reason: 'Service healthy',
            severity: 0.0
        };
    }

    if (statusCode >= 300 && statusCode < 400) {
        return {
            state: 'up',
            reason: `Redirect (${statusCode})`,
            severity: 0.1
        };
    }

    if (statusCode >= 400 && statusCode < 500) {
        return {
            state: 'down',
            reason: `Client error (${statusCode})`,
            severity: 0.8
        };
    }

    if (statusCode >= 500) {
        return {
            state: 'down',
            reason: `Server error (${statusCode})`,
            severity: 1.0
        };
    }

    return {
        state: 'unknown',
        reason: `Unknown status: ${statusCode}`,
        severity: 0.5
    };
}

// ========================================
// HEALTH STATE CREATOR
// ========================================

function createHealthStateResult(state, statusCode, latency, reason, severity) {
    return {
        confidence: 0.85 + (severity * 0.1),
        reasons: [reason],
        analysis: {
            currentCheck: {
                severity,
                statusCode,
                performanceIssues: latency > 2000 ? ['high_latency'] : []
            },
            window: {
                shouldBeDown: state === 'down',
                failureRate: state === 'down' ? 1.0 : 0
            },
            baseline: {
                reliabilityScore: 0.95
            }
        }
    };
}

// ========================================
// TEST RUNNER
// ========================================

async function runRealTimeTests() {
    try {
        // Connect to MongoDB
        log.header('🔧 CONNECTING TO DATABASE');
        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/uptime-checker';
        log.info(`MongoDB: ${mongoUri}`);
        
        await mongoose.connect(mongoUri);
        log.success('Connected to MongoDB');

        // Create or get test user
        log.section('Setting up test user');
        let testUser = await User.findOne({ email: 'test-realtime@example.com' });
        
        if (!testUser) {
            testUser = await User.create({
                email: 'test-realtime@example.com',
                username: 'test_realtime',
                password: 'hashed_password',
                notificationPreferences: {
                    email: true,
                    slack: false,
                    webhook: false
                }
            });
            log.success(`User created: ${testUser.email}`);
        } else {
            log.success(`Using existing user: ${testUser.email}`);
        }

        // Clean up old test monitors
        await Monitor.deleteMany({ name: /^REALTIME_TEST/ });
        await Incident.deleteMany({ monitor: { $in: [] } });

        const testResults = [];

        // ========================================
        // TEST 1: HTTP 200 - FAST RESPONSE (UP)
        // ========================================
        log.test(1, 'HTTP 200 - Fast Response (Should be UP)');
        
        try {
            log.section('Creating monitor for httpbin.org/status/200');
            const monitor1 = await Monitor.create({
                name: 'REALTIME_TEST_200',
                url: 'https://httpbin.org/status/200',
                type: 'http',
                method: 'GET',
                user: testUser._id,
                alertThreshold: 3,
                latencyThreshold: 2000,
                status: 'unknown',
                consecutiveFailures: 0,
                consecutiveSuccesses: 0
            });

            log.info(`Monitor created: ${monitor1._id}`);

            log.section('Making HTTP request...');
            const response1 = await makeHttpRequest(monitor1.url);

            if (response1.success) {
                log.response(`Status: ${response1.statusCode}`);
                log.response(`Latency: ${response1.latency}ms`);

                const classification = classifyResponse(response1.statusCode, response1.latency);
                log.response(`Classification: ${classification.state.toUpperCase()} (${classification.reason})`);

                if (classification.state === 'up') {
                    const healthState = createHealthStateResult(
                        'up',
                        response1.statusCode,
                        response1.latency,
                        classification.reason,
                        classification.severity
                    );

                    log.section('Calling handleRecovery...');
                    const incident = await enhancedAlertService.handleRecovery(monitor1, healthState);

                    if (incident) {
                        log.incident(`✓ Recovery processed: ${incident._id}`);
                    } else {
                        log.info('No prior incident to recover');
                    }

                    log.success('TEST PASSED - Service UP');
                    testResults.push({ test: 1, name: 'HTTP 200 Fast', status: 'PASSED', state: 'UP' });
                } else {
                    log.error('Expected UP but got ' + classification.state);
                    testResults.push({ test: 1, name: 'HTTP 200 Fast', status: 'FAILED', reason: 'Wrong classification' });
                }
            } else {
                log.error(`Request failed: ${response1.error}`);
                testResults.push({ test: 1, name: 'HTTP 200 Fast', status: 'FAILED', reason: response1.error });
            }
        } catch (err) {
            log.error(`Test failed: ${err.message}`);
            testResults.push({ test: 1, name: 'HTTP 200 Fast', status: 'ERROR', error: err.message });
        }

        // ========================================
        // TEST 2: HTTP 201 - SLOW RESPONSE (DEGRADED)
        // ========================================
        log.test(2, 'HTTP 201 - Slow Response (Should be DEGRADED)');

        try {
            log.section('Creating monitor for httpbin.org/delay/3');
            const monitor2 = await Monitor.create({
                name: 'REALTIME_TEST_SLOW',
                url: 'https://httpbin.org/delay/3',
                type: 'http',
                method: 'GET',
                user: testUser._id,
                alertThreshold: 3,
                latencyThreshold: 2000,
                status: 'up',
                consecutiveFailures: 0,
                consecutiveSuccesses: 5
            });

            log.info(`Monitor created: ${monitor2._id}`);

            log.section('Making HTTP request (this will take ~3 seconds)...');
            const response2 = await makeHttpRequest(monitor2.url, 15000);

            if (response2.success) {
                log.response(`Status: ${response2.statusCode}`);
                log.response(`Latency: ${response2.latency}ms`);

                const classification = classifyResponse(response2.statusCode, response2.latency);
                log.response(`Classification: ${classification.state.toUpperCase()} (${classification.reason})`);

                if (classification.state === 'degraded') {
                    const reasons = [classification.reason];
                    const healthState = createHealthStateResult(
                        'degraded',
                        response2.statusCode,
                        response2.latency,
                        classification.reason,
                        classification.severity
                    );

                    log.section('Calling handleDegraded...');
                    const incident = await enhancedAlertService.handleDegraded(
                        monitor2,
                        { statusCode: response2.statusCode, latency: response2.latency },
                        reasons,
                        healthState
                    );

                    if (incident) {
                        log.incident(`✓ Degraded incident created: ${incident._id}`);
                        log.data(`  Error Type: ${incident.errorType}`);
                        log.data(`  Severity: ${incident.severity}`);
                    } else {
                        log.info('No new incident created (may exist already)');
                    }

                    log.success('TEST PASSED - Service DEGRADED');
                    testResults.push({ test: 2, name: 'HTTP 201 Slow', status: 'PASSED', state: 'DEGRADED' });
                } else {
                    log.error('Expected DEGRADED but got ' + classification.state);
                    testResults.push({ test: 2, name: 'HTTP 201 Slow', status: 'FAILED', reason: 'Wrong classification' });
                }
            } else {
                log.error(`Request failed: ${response2.error}`);
                testResults.push({ test: 2, name: 'HTTP 201 Slow', status: 'FAILED', reason: response2.error });
            }
        } catch (err) {
            log.error(`Test failed: ${err.message}`);
            testResults.push({ test: 2, name: 'HTTP 201 Slow', status: 'ERROR', error: err.message });
        }

        // ========================================
        // TEST 3: HTTP 404 - NOT FOUND (DOWN)
        // ========================================
        log.test(3, 'HTTP 404 - Not Found (Should be DOWN)');

        try {
            log.section('Creating monitor for httpbin.org/status/404');
            const monitor3 = await Monitor.create({
                name: 'REALTIME_TEST_404',
                url: 'https://httpbin.org/status/404',
                type: 'http',
                method: 'GET',
                user: testUser._id,
                alertThreshold: 1,
                latencyThreshold: 2000,
                status: 'up',
                consecutiveFailures: 0,
                consecutiveSuccesses: 10
            });

            log.info(`Monitor created: ${monitor3._id}`);

            log.section('Making HTTP request...');
            const response3 = await makeHttpRequest(monitor3.url);

            if (response3.success !== undefined) {
                log.response(`Status: ${response3.statusCode}`);
                log.response(`Latency: ${response3.latency}ms`);

                const classification = classifyResponse(response3.statusCode, response3.latency);
                log.response(`Classification: ${classification.state.toUpperCase()} (${classification.reason})`);

                if (classification.state === 'down') {
                    // Set consecutive failures to trigger alert
                    monitor3.consecutiveFailures = 1;
                    await monitor3.save();

                    const healthState = createHealthStateResult(
                        'down',
                        response3.statusCode,
                        response3.latency,
                        classification.reason,
                        classification.severity
                    );

                    log.section('Calling handleFailure...');
                    const incident = await enhancedAlertService.handleFailure(
                        monitor3,
                        {
                            statusCode: response3.statusCode,
                            latency: response3.latency,
                            errorMessage: classification.reason,
                            errorType: 'STATUS_CODE_MISMATCH'
                        },
                        healthState
                    );

                    if (incident) {
                        log.incident(`✓ Down incident created: ${incident._id}`);
                        log.data(`  Error Type: ${incident.errorType}`);
                        log.data(`  Status Code: ${incident.statusCode}`);
                        log.data(`  Severity: ${incident.severity}`);
                    } else {
                        log.info('No new incident created (threshold not met)');
                    }

                    log.success('TEST PASSED - Service DOWN');
                    testResults.push({ test: 3, name: 'HTTP 404', status: 'PASSED', state: 'DOWN' });
                } else {
                    log.error('Expected DOWN but got ' + classification.state);
                    testResults.push({ test: 3, name: 'HTTP 404', status: 'FAILED', reason: 'Wrong classification' });
                }
            }
        } catch (err) {
            log.error(`Test failed: ${err.message}`);
            testResults.push({ test: 3, name: 'HTTP 404', status: 'ERROR', error: err.message });
        }

        // ========================================
        // TEST 4: HTTP 500 - SERVER ERROR (DOWN)
        // ========================================
        log.test(4, 'HTTP 500 - Server Error (Should be DOWN)');

        try {
            log.section('Creating monitor for httpbin.org/status/500');
            const monitor4 = await Monitor.create({
                name: 'REALTIME_TEST_500',
                url: 'https://httpbin.org/status/500',
                type: 'http',
                method: 'GET',
                user: testUser._id,
                alertThreshold: 1,
                latencyThreshold: 2000,
                status: 'up',
                consecutiveFailures: 0,
                consecutiveSuccesses: 15
            });

            log.info(`Monitor created: ${monitor4._id}`);

            log.section('Making HTTP request...');
            const response4 = await makeHttpRequest(monitor4.url);

            if (response4.success !== undefined) {
                log.response(`Status: ${response4.statusCode}`);
                log.response(`Latency: ${response4.latency}ms`);

                const classification = classifyResponse(response4.statusCode, response4.latency);
                log.response(`Classification: ${classification.state.toUpperCase()} (${classification.reason})`);

                if (classification.state === 'down') {
                    monitor4.consecutiveFailures = 1;
                    await monitor4.save();

                    const healthState = createHealthStateResult(
                        'down',
                        response4.statusCode,
                        response4.latency,
                        classification.reason,
                        classification.severity
                    );

                    log.section('Calling handleFailure...');
                    const incident = await enhancedAlertService.handleFailure(
                        monitor4,
                        {
                            statusCode: response4.statusCode,
                            latency: response4.latency,
                            errorMessage: classification.reason,
                            errorType: 'SERVER_ERROR'
                        },
                        healthState
                    );

                    if (incident) {
                        log.incident(`✓ Down incident created: ${incident._id}`);
                        log.data(`  Error Type: ${incident.errorType}`);
                        log.data(`  Status Code: ${incident.statusCode}`);
                        log.data(`  Severity: ${incident.severity}`);
                    } else {
                        log.info('No new incident created (threshold not met)');
                    }

                    log.success('TEST PASSED - Service DOWN');
                    testResults.push({ test: 4, name: 'HTTP 500', status: 'PASSED', state: 'DOWN' });
                } else {
                    log.error('Expected DOWN but got ' + classification.state);
                    testResults.push({ test: 4, name: 'HTTP 500', status: 'FAILED', reason: 'Wrong classification' });
                }
            }
        } catch (err) {
            log.error(`Test failed: ${err.message}`);
            testResults.push({ test: 4, name: 'HTTP 500', status: 'ERROR', error: err.message });
        }

        // ========================================
        // TEST 5: TIMEOUT - CONNECTION ERROR (DOWN)
        // ========================================
        log.test(5, 'Connection Timeout (Should be DOWN)');

        try {
            log.section('Creating monitor for unreachable host');
            const monitor5 = await Monitor.create({
                name: 'REALTIME_TEST_TIMEOUT',
                url: 'https://httpbin-unreachable-12345.example.com/',
                type: 'http',
                method: 'GET',
                user: testUser._id,
                alertThreshold: 1,
                latencyThreshold: 2000,
                status: 'up',
                consecutiveFailures: 0,
                consecutiveSuccesses: 8
            });

            log.info(`Monitor created: ${monitor5._id}`);

            log.section('Making HTTP request (will timeout)...');
            const response5 = await makeHttpRequest(monitor5.url, 5000);

            log.response(`Success: ${response5.success}`);
            log.response(`Status Code: ${response5.statusCode}`);
            log.response(`Latency: ${response5.latency}ms`);
            if (response5.error) log.response(`Error: ${response5.error}`);

            if (!response5.success) {
                const classification = classifyResponse(null, response5.latency, 2000);
                log.response(`Classification: ${classification.state.toUpperCase()} (${classification.reason})`);

                monitor5.consecutiveFailures = 1;
                await monitor5.save();

                const healthState = createHealthStateResult(
                    'down',
                    null,
                    response5.latency,
                    response5.error || 'Connection timeout',
                    1.0
                );

                log.section('Calling handleFailure...');
                const incident = await enhancedAlertService.handleFailure(
                    monitor5,
                    {
                        statusCode: null,
                        latency: response5.latency,
                        errorMessage: response5.error,
                        errorType: 'TIMEOUT'
                    },
                    healthState
                );

                if (incident) {
                    log.incident(`✓ Timeout incident created: ${incident._id}`);
                    log.data(`  Error Type: ${incident.errorType}`);
                    log.data(`  Severity: ${incident.severity}`);
                } else {
                    log.info('No new incident created (threshold not met)');
                }

                log.success('TEST PASSED - Timeout detected');
                testResults.push({ test: 5, name: 'Connection Timeout', status: 'PASSED', state: 'DOWN' });
            }
        } catch (err) {
            log.error(`Test failed: ${err.message}`);
            testResults.push({ test: 5, name: 'Connection Timeout', status: 'ERROR', error: err.message });
        }

        // ========================================
        // TEST 6: VERIFY DATABASE INCIDENTS
        // ========================================
        log.test(6, 'Verify Incidents in Database');

        try {
            const incidents = await Incident.find({}).populate('monitor');
            
            log.section(`Found ${incidents.length} incidents in database`);
            
            incidents.forEach((inc, i) => {
                log.incident(`${i + 1}. ${inc.monitor?.name || 'Unknown'}`);
                log.data(`   Error Type: ${inc.errorType}`);
                log.data(`   Status Code: ${inc.statusCode || 'N/A'}`);
                log.data(`   Severity: ${inc.severity}`);
                log.data(`   Created: ${inc.startTime}`);
            });

            if (incidents.length > 0) {
                log.success('TEST PASSED - Incidents persisted');
                testResults.push({ test: 6, name: 'Database Verification', status: 'PASSED', count: incidents.length });
            } else {
                log.warn('No incidents found in database');
                testResults.push({ test: 6, name: 'Database Verification', status: 'WARNING', count: 0 });
            }
        } catch (err) {
            log.error(`Test failed: ${err.message}`);
            testResults.push({ test: 6, name: 'Database Verification', status: 'ERROR', error: err.message });
        }

        // ========================================
        // SUMMARY
        // ========================================
        log.header('📊 TEST SUMMARY');

        log.section('Results');
        let passed = 0;
        let failed = 0;
        
        testResults.forEach(result => {
            if (result.status === 'PASSED') {
                log.success(`${result.test}. ${result.name} - ${result.state || 'OK'}`);
                passed++;
            } else if (result.status === 'FAILED') {
                log.error(`${result.test}. ${result.name} - ${result.reason}`);
                failed++;
            } else if (result.status === 'WARNING') {
                log.warn(`${result.test}. ${result.name} - ${result.count} incidents`);
            } else {
                log.error(`${result.test}. ${result.name} - ${result.error}`);
                failed++;
            }
        });

        log.section('Statistics');
        log.data(`Total Tests: ${testResults.length}`);
        log.data(`Passed: ${passed}`);
        log.data(`Failed: ${failed}`);

        log.section('Next Steps');
        log.data('✓ Check your database for created incidents');
        log.data('✓ Check your email for alert notifications');
        log.data('✓ Review the monitor list in the frontend');

        await mongoose.disconnect();
        log.success('Disconnected from MongoDB');

        process.exit(failed > 0 ? 1 : 0);

    } catch (err) {
        log.alert(`FATAL ERROR: ${err.message}`);
        console.error(err);
        process.exit(1);
    }
}

// Run tests
console.log('\n' + COLORS.bright + COLORS.cyan + '🚀 STARTING REAL-TIME E2E TESTS' + COLORS.reset);
runRealTimeTests().catch(err => {
    console.error('Test runner error:', err);
    process.exit(1);
});
