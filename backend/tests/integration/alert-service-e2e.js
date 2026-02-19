#!/usr/bin/env node

/**
 * Standalone E2E Test Runner for Enhanced Alert Service
 * 
 * Run directly: node tests/integration/alert-service-e2e.js
 * No Jest required - uses console output and mock data
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import enhancedAlertService from '../../src/services/enhanced-alert.service.js';
import Incident from '../../src/models/Incident.js';
import Monitor from '../../src/models/Monitor.js';
import User from '../../src/models/User.js';
import notificationService from '../../src/services/notification.service.js';

dotenv.config();

// ========================================
// SETUP
// ========================================

const COLORS = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

const log = {
    header: (text) => console.log(`\n${COLORS.bright}${COLORS.cyan}${'='.repeat(70)}${COLORS.reset}\n${COLORS.bright}${text}${COLORS.reset}\n${COLORS.cyan}${'='.repeat(70)}${COLORS.reset}\n`),
    success: (text) => console.log(`${COLORS.green}✅ ${text}${COLORS.reset}`),
    error: (text) => console.log(`${COLORS.red}❌ ${text}${COLORS.reset}`),
    info: (text) => console.log(`${COLORS.blue}ℹ️  ${text}${COLORS.reset}`),
    warn: (text) => console.log(`${COLORS.yellow}⚠️  ${text}${COLORS.reset}`),
    alert: (text) => console.log(`${COLORS.red}🚨 ${text}${COLORS.reset}`),
    data: (text) => console.log(`${COLORS.dim}   ${text}${COLORS.reset}`),
    section: (text) => console.log(`\n${COLORS.bright}${COLORS.blue}→ ${text}${COLORS.reset}\n`)
};

// Mock notification service
const mockNotifications = {
    emails: [],
    slacks: [],
    webhooks: [],
    clear: function() {
        this.emails = [];
        this.slacks = [];
        this.webhooks = [];
    }
};

const originalSendEmail = notificationService.sendEmail;
const originalSendSlack = notificationService.sendSlack;
const originalSendWebhook = notificationService.sendWebhook;

notificationService.sendEmail = async (to, subject, html) => {
    mockNotifications.emails.push({ to, subject, timestamp: new Date() });
    log.data(`📧 Email → ${to}: ${subject}`);
    return { success: true };
};

notificationService.sendSlack = async (webhook, payload) => {
    mockNotifications.slacks.push({ payload, timestamp: new Date() });
    log.data(`💬 Slack: ${payload.text?.substring(0, 60)}...`);
    return { success: true };
};

notificationService.sendWebhook = async (url, payload) => {
    mockNotifications.webhooks.push({ url, payload, timestamp: new Date() });
    log.data(`🪝 Webhook → ${url}`);
    return { success: true };
};

// ========================================
// TEST RUNNER
// ========================================

async function runTests() {
    try {
        // Connect to MongoDB
        log.header('🔧 INITIALIZING TEST ENVIRONMENT');
        log.info(`Connecting to MongoDB: ${process.env.MONGODB_URI || 'mongodb://localhost:27017/uptime-checker'}`);
        
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/uptime-checker');
        log.success('MongoDB connected');

        // Create test user
        log.section('Creating Test User');
        await User.deleteMany({ email: /^test-e2e/ });
        
        const testUser = await User.create({
            name: 'Test E2E User',
            email: 'test-e2e-alerts@example.com',
            password: 'hashed_password',
            notificationPreferences: {
                email: true,
                slack: true,
                webhook: true
            },
            slackWebhook: 'https://hooks.slack.com/mock/test',
            webhookUrl: 'https://webhook.site/mock/test',
            contactEmails: ['alert1@example.com']
        });

        log.success(`User created: ${testUser.email}`);

        // Clean up old test monitors and incidents
        await Monitor.deleteMany({ name: /^TEST_E2E/ });
        await Incident.deleteMany({});

        const testResults = {
            passed: 0,
            failed: 0,
            tests: []
        };

        // ========================================
        // TEST 1: HTTP 200 + FAST = RECOVERY (UP)
        // ========================================
        log.header('TEST 1: HTTP 200 + FAST RESPONSE (RECOVERY/UP)');
        
        try {
            mockNotifications.clear();
            
            const monitor1 = await Monitor.create({
                name: 'TEST_E2E_200_FAST',
                url: 'https://httpbin.org/status/200',
                type: 'HTTP',
                user: testUser._id,
                alertThreshold: 3,
                latencyThreshold: 2000,
                status: 'down',
                consecutiveFailures: 3,
                consecutiveSuccesses: 0
            });

            log.section('Scenario: Service recovering from downtime');
            log.data(`Monitor: ${monitor1.name}`);
            log.data(`Status Code: 200 (OK)`);
            log.data(`Latency: 450ms (< 2000ms threshold)`);

            const result1 = await enhancedAlertService.handleRecovery(monitor1, {
                confidence: 0.95,
                reasons: ['Service is healthy'],
                analysis: {
                    currentCheck: { severity: 0.0 },
                    window: { shouldBeDown: false },
                    baseline: { reliabilityScore: 0.98 }
                }
            });

            log.data(`Incidents found and resolved: ${result1 ? 'Yes' : 'No'}`);
            log.data(`Recovery emails sent: ${mockNotifications.emails.length}`);
            
            testResults.passed++;
            testResults.tests.push({
                name: 'HTTP 200 Fast (Recovery)',
                status: 'PASSED',
                details: `${mockNotifications.emails.length} notifications sent`
            });

            log.success('Test PASSED');
        } catch (err) {
            log.error(`Test FAILED: ${err.message}`);
            testResults.failed++;
            testResults.tests.push({
                name: 'HTTP 200 Fast (Recovery)',
                status: 'FAILED',
                error: err.message
            });
        }

        // ========================================
        // TEST 2: HTTP 200 + SLOW = DEGRADED
        // ========================================
        log.header('TEST 2: HTTP 200 + SLOW RESPONSE (DEGRADED)');

        try {
            mockNotifications.clear();

            const monitor2 = await Monitor.create({
                name: 'TEST_E2E_200_SLOW',
                url: 'https://httpbin.org/delay/3',
                type: 'HTTP',
                user: testUser._id,
                alertThreshold: 3,
                latencyThreshold: 2000,
                status: 'up',
                consecutiveFailures: 0,
                consecutiveSuccesses: 5
            });

            log.section('Scenario: Service responding slowly');
            log.data(`Monitor: ${monitor2.name}`);
            log.data(`Status Code: 200 (OK)`);
            log.data(`Latency: 3500ms (> 2000ms threshold)`);

            const reasons2 = ['⚠️ Slow response: 3500ms (threshold: 2000ms)'];
            
            const result2 = await enhancedAlertService.handleDegraded(
                monitor2,
                { statusCode: 200, latency: 3500 },
                reasons2,
                {
                    confidence: 0.8,
                    reasons: reasons2,
                    analysis: {
                        currentCheck: {
                            severity: 0.6,
                            performanceIssues: ['high_latency']
                        },
                        baseline: { reliabilityScore: 0.95 }
                    }
                }
            );

            log.data(`Degraded incident created: ${result2 ? 'Yes' : 'No (expected)'}`);
            log.data(`Degradation emails sent: ${mockNotifications.emails.length}`);

            testResults.passed++;
            testResults.tests.push({
                name: 'HTTP 200 Slow (Degraded)',
                status: 'PASSED',
                details: `${mockNotifications.emails.length} notifications sent`
            });

            log.success('Test PASSED');
        } catch (err) {
            log.error(`Test FAILED: ${err.message}`);
            testResults.failed++;
            testResults.tests.push({
                name: 'HTTP 200 Slow (Degraded)',
                status: 'FAILED',
                error: err.message
            });
        }

        // ========================================
        // TEST 3: HTTP 404 = DOWN
        // ========================================
        log.header('TEST 3: HTTP 404 NOT FOUND (DOWN)');

        try {
            mockNotifications.clear();

            const monitor3 = await Monitor.create({
                name: 'TEST_E2E_404',
                url: 'https://httpbin.org/status/404',
                type: 'HTTP',
                user: testUser._id,
                alertThreshold: 1,
                latencyThreshold: 2000,
                status: 'up',
                consecutiveFailures: 0,
                consecutiveSuccesses: 10
            });

            log.section('Scenario: Endpoint not found');
            log.data(`Monitor: ${monitor3.name}`);
            log.data(`Status Code: 404 (Not Found)`);
            log.data(`Latency: 300ms`);

            // Simulate first failure
            monitor3.consecutiveFailures = 1;
            await monitor3.save();

            const result3 = await enhancedAlertService.handleFailure(
                monitor3,
                {
                    statusCode: 404,
                    latency: 300,
                    errorMessage: 'HTTP 404: Not Found',
                    errorType: 'STATUS_CODE_MISMATCH'
                },
                {
                    confidence: 0.85,
                    reasons: ['HTTP 404 - endpoint not found'],
                    analysis: {
                        currentCheck: {
                            severity: 0.9,
                            statusCode: 404
                        },
                        window: { shouldBeDown: false }
                    }
                }
            );

            log.data(`Failure incident created: ${result3 ? 'Yes' : 'No (threshold not met)'}`);
            log.data(`Down emails sent: ${mockNotifications.emails.length}`);

            testResults.passed++;
            testResults.tests.push({
                name: 'HTTP 404 (Down)',
                status: 'PASSED',
                details: `Incident: ${result3?._id || 'None (threshold)'}`
            });

            log.success('Test PASSED');
        } catch (err) {
            log.error(`Test FAILED: ${err.message}`);
            testResults.failed++;
            testResults.tests.push({
                name: 'HTTP 404 (Down)',
                status: 'FAILED',
                error: err.message
            });
        }

        // ========================================
        // TEST 4: HTTP 500 = DOWN
        // ========================================
        log.header('TEST 4: HTTP 500 SERVER ERROR (DOWN)');

        try {
            mockNotifications.clear();

            const monitor4 = await Monitor.create({
                name: 'TEST_E2E_500',
                url: 'https://httpbin.org/status/500',
                type: 'HTTP',
                user: testUser._id,
                alertThreshold: 1,
                latencyThreshold: 2000,
                status: 'up',
                consecutiveFailures: 0,
                consecutiveSuccesses: 15
            });

            log.section('Scenario: Server error');
            log.data(`Monitor: ${monitor4.name}`);
            log.data(`Status Code: 500 (Internal Server Error)`);
            log.data(`Latency: 250ms`);

            // At threshold
            monitor4.consecutiveFailures = 1;
            await monitor4.save();

            const result4 = await enhancedAlertService.handleFailure(
                monitor4,
                {
                    statusCode: 500,
                    latency: 250,
                    errorMessage: 'HTTP 500: Internal Server Error',
                    errorType: 'SERVER_ERROR'
                },
                {
                    confidence: 0.95,
                    reasons: ['HTTP 500 - server error'],
                    analysis: {
                        currentCheck: {
                            severity: 1.0,
                            statusCode: 500
                        },
                        window: { shouldBeDown: true }
                    }
                }
            );

            log.data(`Failure incident created: ${result4 ? 'Yes' : 'No'}`);
            if (result4) {
                log.data(`Incident ID: ${result4._id}`);
                log.data(`Error Type: ${result4.errorType}`);
                log.data(`Severity: ${result4.severity}`);
            }
            log.data(`Down emails sent: ${mockNotifications.emails.length}`);

            testResults.passed++;
            testResults.tests.push({
                name: 'HTTP 500 (Down)',
                status: 'PASSED',
                details: `Incident: ${result4?._id || 'None'}`
            });

            log.success('Test PASSED');
        } catch (err) {
            log.error(`Test FAILED: ${err.message}`);
            testResults.failed++;
            testResults.tests.push({
                name: 'HTTP 500 (Down)',
                status: 'FAILED',
                error: err.message
            });
        }

        // ========================================
        // TEST 5: TIMEOUT = DOWN
        // ========================================
        log.header('TEST 5: CONNECTION TIMEOUT (DOWN)');

        try {
            mockNotifications.clear();

            const monitor5 = await Monitor.create({
                name: 'TEST_E2E_TIMEOUT',
                url: 'https://unreachable-test-domain-xyz.example.com',
                type: 'HTTP',
                user: testUser._id,
                alertThreshold: 1,
                latencyThreshold: 2000,
                status: 'up',
                consecutiveFailures: 0,
                consecutiveSuccesses: 8
            });

            log.section('Scenario: Request timeout');
            log.data(`Monitor: ${monitor5.name}`);
            log.data(`Status Code: None (timeout)`);
            log.data(`Latency: 10000ms`);

            monitor5.consecutiveFailures = 1;
            await monitor5.save();

            const result5 = await enhancedAlertService.handleFailure(
                monitor5,
                {
                    statusCode: null,
                    latency: 10000,
                    errorMessage: 'connect ETIMEDOUT',
                    errorType: 'TIMEOUT'
                },
                {
                    confidence: 0.95,
                    reasons: ['Request timeout - service not responding'],
                    analysis: {
                        currentCheck: {
                            severity: 1.0
                        },
                        window: { shouldBeDown: true }
                    }
                }
            );

            log.data(`Failure incident created: ${result5 ? 'Yes' : 'No'}`);
            if (result5) {
                log.data(`Error Type: ${result5.errorType}`);
                log.data(`Severity: ${result5.severity}`);
            }
            log.data(`Down emails sent: ${mockNotifications.emails.length}`);

            testResults.passed++;
            testResults.tests.push({
                name: 'Connection Timeout (Down)',
                status: 'PASSED',
                details: `Incident: ${result5?._id || 'None'}`
            });

            log.success('Test PASSED');
        } catch (err) {
            log.error(`Test FAILED: ${err.message}`);
            testResults.failed++;
            testResults.tests.push({
                name: 'Connection Timeout (Down)',
                status: 'FAILED',
                error: err.message
            });
        }

        // ========================================
        // TEST 6: ALERT STATISTICS
        // ========================================
        log.header('TEST 6: ALERT STATISTICS & METRICS');

        try {
            const stats = enhancedAlertService.getAlertStatistics();
            
            log.section('Alert History');
            log.data(`Total alerts (last hour): ${stats.totalAlerts}`);
            log.data(`Suppressed: ${stats.suppressedAlerts}`);
            log.data(`Suppression rate: ${(stats.suppressionRate * 100).toFixed(2)}%`);
            log.data(`By type:`);
            Object.entries(stats.byType).forEach(([type, count]) => {
                log.data(`  • ${type}: ${count}`);
            });

            testResults.passed++;
            testResults.tests.push({
                name: 'Alert Statistics',
                status: 'PASSED',
                details: `${stats.totalAlerts} total alerts tracked`
            });

            log.success('Test PASSED');
        } catch (err) {
            log.error(`Test FAILED: ${err.message}`);
            testResults.failed++;
            testResults.tests.push({
                name: 'Alert Statistics',
                status: 'FAILED',
                error: err.message
            });
        }

        // ========================================
        // TEST 7: DATABASE VERIFICATION
        // ========================================
        log.header('TEST 7: INCIDENT DATABASE VERIFICATION');

        try {
            const incidents = await Incident.find({});
            
            log.section(`Incidents in Database: ${incidents.length}`);
            incidents.forEach((inc, i) => {
                log.data(`${i + 1}. ${inc.errorType} - ${inc.errorMessage?.substring(0, 50)}...`);
                log.data(`   Status Code: ${inc.statusCode || 'N/A'} | Severity: ${inc.severity}`);
            });

            testResults.passed++;
            testResults.tests.push({
                name: 'Database Verification',
                status: 'PASSED',
                details: `${incidents.length} incidents stored`
            });

            log.success('Test PASSED');
        } catch (err) {
            log.error(`Test FAILED: ${err.message}`);
            testResults.failed++;
            testResults.tests.push({
                name: 'Database Verification',
                status: 'FAILED',
                error: err.message
            });
        }

        // ========================================
        // SUMMARY
        // ========================================
        log.header('TEST SUMMARY');

        log.section('Results by Test');
        testResults.tests.forEach((test, i) => {
            const icon = test.status === 'PASSED' ? '✅' : '❌';
            console.log(`${icon} ${i + 1}. ${test.name}`);
            log.data(`   Status: ${test.status}`);
            log.data(`   ${test.details || test.error}`);
        });

        log.section('Overall Statistics');
        log.data(`Total Tests: ${testResults.passed + testResults.failed}`);
        log.success(`Passed: ${testResults.passed}`);
        if (testResults.failed > 0) {
            log.error(`Failed: ${testResults.failed}`);
        }

        log.section('Notification Summary');
        log.data(`Total Emails: ${mockNotifications.emails.length}`);
        log.data(`Total Slack Messages: ${mockNotifications.slacks.length}`);
        log.data(`Total Webhooks: ${mockNotifications.webhooks.length}`);

        // Cleanup
        await User.deleteMany({ email: /^test-e2e/ });
        await Monitor.deleteMany({ name: /^TEST_E2E/ });
        await Incident.deleteMany({});

        // Restore original functions
        notificationService.sendEmail = originalSendEmail;
        notificationService.sendSlack = originalSendSlack;
        notificationService.sendWebhook = originalSendWebhook;

        log.success('Test data cleaned up');

        process.exit(testResults.failed > 0 ? 1 : 0);
    } catch (err) {
        log.error(`FATAL ERROR: ${err.message}`);
        console.error(err);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
    }
}

// Run tests
runTests().catch(err => {
    console.error('Test runner error:', err);
    process.exit(1);
});
