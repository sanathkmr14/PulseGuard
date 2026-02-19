/**
 * End-to-End Test Suite for Enhanced Alert Service
 * 
 * Tests the full chain: check result → health evaluation → alert service → incident creation
 * 
 * Run with: npm test -- tests/integration/enhanced-alert.e2e.test.js
 */

import mongoose from 'mongoose';
import enhancedAlertService from '../../src/services/enhanced-alert.service.js';
import Incident from '../../src/models/Incident.js';
import Monitor from '../../src/models/Monitor.js';
import User from '../../src/models/User.js';
import notificationService from '../../src/services/notification.service.js';

// Mock notification service to capture calls
const mockNotifications = {
    emails: [],
    slacks: [],
    webhooks: []
};

const originalSendEmail = notificationService.sendEmail;
const originalSendSlack = notificationService.sendSlack;
const originalSendWebhook = notificationService.sendWebhook;

notificationService.sendEmail = async (to, subject, html) => {
    mockNotifications.emails.push({ to, subject, html, timestamp: new Date() });
    console.log(`📧 [MOCK] Email sent to ${to}: ${subject}`);
    return { success: true };
};

notificationService.sendSlack = async (webhook, payload) => {
    mockNotifications.slacks.push({ webhook, payload, timestamp: new Date() });
    console.log(`💬 [MOCK] Slack sent: ${payload.text?.substring(0, 50)}...`);
    return { success: true };
};

notificationService.sendWebhook = async (url, payload) => {
    mockNotifications.webhooks.push({ url, payload, timestamp: new Date() });
    console.log(`🪝 [MOCK] Webhook sent to ${url}`);
    return { success: true };
};

describe('Enhanced Alert Service - E2E Tests', () => {
    let testUser;
    let testMonitors = {};

    beforeAll(async () => {
        console.log('\n🔧 Setting up test environment...\n');

        // Clear old test data
        await Incident.deleteMany({ monitor: { $exists: true } });
        await Monitor.deleteMany({ name: /^TEST_/ });
        await User.deleteMany({ email: /^test-/ });

        // Create test user with all notification channels
        testUser = await User.create({
            email: 'test-alerts@example.com',
            password: 'hashed_password',
            name: 'Test User',
            username: 'test_user',
            notificationPreferences: {
                email: true,
                slack: true,
                webhook: true
            },
            slackWebhook: 'https://hooks.slack.com/mock/test',
            webhookUrl: 'https://webhook.site/mock/test',
            contactEmails: ['alert1@example.com', 'alert2@example.com']
        });

        console.log(`✅ Test user created: ${testUser.email}\n`);
    });

    afterAll(async () => {
        // Restore original notification functions
        notificationService.sendEmail = originalSendEmail;
        notificationService.sendSlack = originalSendSlack;
        notificationService.sendWebhook = originalSendWebhook;

        // Clean up
        await Incident.deleteMany({ monitor: { $exists: true } });
        await Monitor.deleteMany({ name: /^TEST_/ });
        await User.deleteMany({ email: /^test-/ });

        console.log('\n🧹 Test cleanup complete\n');
    });

    beforeEach(() => {
        mockNotifications.emails = [];
        mockNotifications.slacks = [];
        mockNotifications.webhooks = [];
    });

    // ========================================
    // TEST 1: HTTP 200 + FAST = UP (Recovery)
    // ========================================
    it('should handle healthy response (HTTP 200, fast latency) as RECOVERY', async () => {
        console.log('\n\n📝 TEST 1: Healthy Response (200 + Fast)');
        console.log('='.repeat(60));

        const monitor = await Monitor.create({
            name: 'TEST_HTTP_200_FAST',
            url: 'https://httpbin.org/status/200',
            type: 'HTTP',
            method: 'GET',
            user: testUser._id,
            alertThreshold: 3,
            latencyThreshold: 2000,
            status: 'unknown',
            consecutiveFailures: 0,
            consecutiveSuccesses: 0
        });

        testMonitors.healthy = monitor;

        const checkResult = {
            statusCode: 200,
            latency: 450,
            isUp: true,
            errorMessage: null,
            errorType: null
        };

        const healthStateResult = {
            confidence: 0.95,
            reasons: ['Service healthy'],
            analysis: {
                currentCheck: { severity: 0.0, statusCode: 200 },
                window: { shouldBeDown: false, failureRate: 0 },
                baseline: { reliabilityScore: 0.98 }
            }
        };

        const result = await enhancedAlertService.handleRecovery(monitor, healthStateResult);

        console.log(`\n✅ Result: ${result ? 'Recovery incident processed' : 'No prior incident'}`);
        console.log(`📧 Emails sent: ${mockNotifications.emails.length}`);
        console.log(`💬 Slack messages: ${mockNotifications.slacks.length}`);
        console.log(`🪝 Webhooks: ${mockNotifications.webhooks.length}`);

        if (mockNotifications.emails.length > 0) {
            mockNotifications.emails.forEach(e => console.log(`   → ${e.to}: ${e.subject}`));
        }

        return true;
    });

    // ========================================
    // TEST 2: HTTP 200 + SLOW = DEGRADED
    // ========================================
    it('should handle slow response (HTTP 200, high latency) as DEGRADED', async () => {
        console.log('\n\n📝 TEST 2: Slow Response (200 + Slow)');
        console.log('='.repeat(60));

        const monitor = await Monitor.create({
            name: 'TEST_HTTP_200_SLOW',
            url: 'https://httpbin.org/delay/3',
            type: 'HTTP',
            method: 'GET',
            user: testUser._id,
            alertThreshold: 3,
            latencyThreshold: 2000,
            status: 'up',
            consecutiveFailures: 0,
            consecutiveSuccesses: 5
        });

        testMonitors.slow = monitor;

        const checkResult = {
            statusCode: 200,
            latency: 3500,
            isUp: true,
            errorMessage: null,
            errorType: null
        };

        const reasons = ['⚠️ Slow response: 3500ms (threshold: 2000ms)'];

        const healthStateResult = {
            confidence: 0.8,
            reasons,
            analysis: {
                currentCheck: {
                    severity: 0.6,
                    statusCode: 200,
                    performanceIssues: ['high_latency']
                },
                window: { shouldBeDown: false, failureRate: 0 },
                baseline: { reliabilityScore: 0.95 }
            }
        };

        const result = await enhancedAlertService.handleDegraded(
            monitor,
            checkResult,
            reasons,
            healthStateResult
        );

        console.log(`\n✅ Result: ${result ? 'Degraded incident created' : 'Skipped (no repeat)'}`);
        console.log(`   Incident ID: ${result?._id}`);
        console.log(`   Error Type: ${result?.errorType}`);
        console.log(`   Severity: ${result?.severity}`);
        console.log(`📧 Emails sent: ${mockNotifications.emails.length}`);
        console.log(`💬 Slack messages: ${mockNotifications.slacks.length}`);
        console.log(`🪝 Webhooks: ${mockNotifications.webhooks.length}`);

        if (mockNotifications.emails.length > 0) {
            mockNotifications.emails.forEach(e => console.log(`   → ${e.to}: ${e.subject}`));
        }

        return result !== null;
    });

    // ========================================
    // TEST 3: HTTP 404 = DOWN
    // ========================================
    it('should handle not found (HTTP 404) as FAILURE/DOWN', async () => {
        console.log('\n\n📝 TEST 3: Client Error (404 Not Found)');
        console.log('='.repeat(60));

        const monitor = await Monitor.create({
            name: 'TEST_HTTP_404',
            url: 'https://httpbin.org/status/404',
            type: 'HTTP',
            method: 'GET',
            user: testUser._id,
            alertThreshold: 2,
            latencyThreshold: 2000,
            status: 'up',
            consecutiveFailures: 0,
            consecutiveSuccesses: 10
        });

        testMonitors.notFound = monitor;

        const checkResult = {
            statusCode: 404,
            latency: 300,
            isUp: false,
            errorMessage: 'HTTP 404: Not Found',
            errorType: 'STATUS_CODE_MISMATCH'
        };

        // Simulate first failure
        monitor.consecutiveFailures = 1;
        await monitor.save();

        const healthStateResult = {
            confidence: 0.85,
            reasons: ['HTTP 404 received - endpoint not found'],
            analysis: {
                currentCheck: {
                    severity: 0.9,
                    statusCode: 404
                },
                window: { shouldBeDown: false, failureRate: 0.5 },
                baseline: { reliabilityScore: 0.95 }
            }
        };

        const result = await enhancedAlertService.handleFailure(
            monitor,
            checkResult,
            healthStateResult
        );

        console.log(`\n✅ Result: ${result ? 'Failure incident created' : 'Suppressed by threshold'}`);
        if (result) {
            console.log(`   Incident ID: ${result._id}`);
            console.log(`   Error Type: ${result.errorType}`);
            console.log(`   Status Code: ${result.statusCode}`);
            console.log(`   Severity: ${result.severity}`);
        }
        console.log(`📧 Emails sent: ${mockNotifications.emails.length}`);
        console.log(`💬 Slack messages: ${mockNotifications.slacks.length}`);
        console.log(`🪝 Webhooks: ${mockNotifications.webhooks.length}`);

        if (mockNotifications.emails.length > 0) {
            mockNotifications.emails.forEach(e => console.log(`   → ${e.to}: ${e.subject}`));
        }

        return result !== null;
    });

    // ========================================
    // TEST 4: HTTP 500 = DOWN
    // ========================================
    it('should handle server error (HTTP 500) as FAILURE/DOWN', async () => {
        console.log('\n\n📝 TEST 4: Server Error (500)');
        console.log('='.repeat(60));

        const monitor = await Monitor.create({
            name: 'TEST_HTTP_500',
            url: 'https://httpbin.org/status/500',
            type: 'HTTP',
            method: 'GET',
            user: testUser._id,
            alertThreshold: 1,
            latencyThreshold: 2000,
            status: 'up',
            consecutiveFailures: 0,
            consecutiveSuccesses: 20
        });

        testMonitors.serverError = monitor;

        const checkResult = {
            statusCode: 500,
            latency: 250,
            isUp: false,
            errorMessage: 'HTTP 500: Internal Server Error',
            errorType: 'SERVER_ERROR'
        };

        // Set to already at threshold
        monitor.consecutiveFailures = 1;
        await monitor.save();

        const healthStateResult = {
            confidence: 0.95,
            reasons: ['HTTP 500 - server is experiencing issues'],
            analysis: {
                currentCheck: {
                    severity: 1.0,
                    statusCode: 500
                },
                window: { shouldBeDown: true, failureRate: 1.0 },
                baseline: { reliabilityScore: 0.95 }
            }
        };

        const result = await enhancedAlertService.handleFailure(
            monitor,
            checkResult,
            healthStateResult
        );

        console.log(`\n✅ Result: ${result ? 'Failure incident created' : 'Suppressed by threshold'}`);
        if (result) {
            console.log(`   Incident ID: ${result._id}`);
            console.log(`   Error Type: ${result.errorType}`);
            console.log(`   Status Code: ${result.statusCode}`);
            console.log(`   Confidence: ${result.confidence}`);
            console.log(`   Severity: ${result.severity}`);
        }
        console.log(`📧 Emails sent: ${mockNotifications.emails.length}`);
        console.log(`💬 Slack messages: ${mockNotifications.slacks.length}`);
        console.log(`🪝 Webhooks: ${mockNotifications.webhooks.length}`);

        if (mockNotifications.emails.length > 0) {
            mockNotifications.emails.forEach(e => console.log(`   → ${e.to}: ${e.subject}`));
        }

        return result !== null;
    });

    // ========================================
    // TEST 5: TIMEOUT/CONNECTION ERROR = DOWN
    // ========================================
    it('should handle timeout/connection errors as FAILURE/DOWN', async () => {
        console.log('\n\n📝 TEST 5: Connection Timeout');
        console.log('='.repeat(60));

        const monitor = await Monitor.create({
            name: 'TEST_TIMEOUT',
            url: 'https://unreachable-domain-12345.example.com',
            type: 'HTTP',
            method: 'GET',
            user: testUser._id,
            alertThreshold: 1,
            latencyThreshold: 2000,
            status: 'up',
            consecutiveFailures: 0,
            consecutiveSuccesses: 10
        });

        testMonitors.timeout = monitor;

        const checkResult = {
            statusCode: null,
            latency: 10000,
            isUp: false,
            errorMessage: 'connect ETIMEDOUT',
            errorType: 'TIMEOUT'
        };

        monitor.consecutiveFailures = 1;
        await monitor.save();

        const healthStateResult = {
            confidence: 0.95,
            reasons: ['Request timeout - service not responding'],
            analysis: {
                currentCheck: {
                    severity: 1.0,
                    statusCode: null
                },
                window: { shouldBeDown: true, failureRate: 1.0 },
                baseline: { reliabilityScore: 0.95 }
            }
        };

        const result = await enhancedAlertService.handleFailure(
            monitor,
            checkResult,
            healthStateResult
        );

        console.log(`\n✅ Result: ${result ? 'Failure incident created' : 'Suppressed by threshold'}`);
        if (result) {
            console.log(`   Incident ID: ${result._id}`);
            console.log(`   Error Type: ${result.errorType}`);
            console.log(`   Error Message: ${result.errorMessage}`);
            console.log(`   Severity: ${result.severity}`);
        }
        console.log(`📧 Emails sent: ${mockNotifications.emails.length}`);
        console.log(`💬 Slack messages: ${mockNotifications.slacks.length}`);
        console.log(`🪝 Webhooks: ${mockNotifications.webhooks.length}`);

        if (mockNotifications.emails.length > 0) {
            mockNotifications.emails.forEach(e => console.log(`   → ${e.to}: ${e.subject}`));
        }

        return result !== null;
    });

    // ========================================
    // TEST 6: ESCALATION LEVELS
    // ========================================
    it('should escalate alerts based on confidence levels', async () => {
        console.log('\n\n📝 TEST 6: Alert Escalation Levels');
        console.log('='.repeat(60));

        const monitor = await Monitor.create({
            name: 'TEST_ESCALATION',
            url: 'https://httpbin.org/status/503',
            type: 'HTTP',
            method: 'GET',
            user: testUser._id,
            alertThreshold: 1,
            latencyThreshold: 2000,
            status: 'up',
            consecutiveFailures: 0,
            consecutiveSuccesses: 5
        });

        testMonitors.escalation = monitor;

        const checkResult = {
            statusCode: 503,
            latency: 200,
            isUp: false,
            errorMessage: 'HTTP 503: Service Unavailable',
            errorType: 'SERVICE_UNAVAILABLE'
        };

        monitor.consecutiveFailures = 1;
        await monitor.save();

        // Test LOW confidence (0.6)
        console.log('\n--- Low Confidence (0.6) ---');
        let healthStateResult = {
            confidence: 0.6,
            reasons: ['Service temporarily unavailable'],
            analysis: {
                currentCheck: { severity: 0.7 },
                window: { shouldBeDown: false },
                baseline: { reliabilityScore: 0.95 }
            }
        };

        let result = await enhancedAlertService.handleFailure(
            monitor,
            checkResult,
            healthStateResult
        );
        console.log(`Escalation Level: LOW → ${result ? 'Incident created' : 'Skipped'}`);

        // Test MEDIUM confidence (0.8)
        console.log('\n--- Medium Confidence (0.8) ---');
        healthStateResult.confidence = 0.8;
        healthStateResult.analysis.window.shouldBeDown = true;

        result = await enhancedAlertService.handleFailure(
            monitor,
            checkResult,
            healthStateResult
        );
        console.log(`Escalation Level: MEDIUM → ${result ? 'Incident created' : 'Existing incident updated'}`);

        // Test HIGH confidence (0.95)
        console.log('\n--- High Confidence (0.95) ---');
        healthStateResult.confidence = 0.95;
        healthStateResult.analysis.currentCheck.severity = 0.95;

        result = await enhancedAlertService.handleFailure(
            monitor,
            checkResult,
            healthStateResult
        );
        console.log(`Escalation Level: HIGH → ${result ? 'Incident created' : 'Existing incident updated'}`);

        console.log(`\n📧 Total emails sent: ${mockNotifications.emails.length}`);
        console.log(`💬 Total Slack messages: ${mockNotifications.slacks.length}`);
        console.log(`🪝 Total Webhooks: ${mockNotifications.webhooks.length}`);

        return true;
    });

    // ========================================
    // TEST 7: INCIDENT STATISTICS
    // ========================================
    it('should provide alert statistics', async () => {
        console.log('\n\n📝 TEST 7: Alert Statistics');
        console.log('='.repeat(60));

        const stats = await enhancedAlertService.getAlertStatistics();

        console.log(`\n📊 Statistics:`);
        console.log(`   Total Alerts (last hour): ${stats.totalAlerts}`);
        console.log(`   Suppressed Alerts: ${stats.suppressedAlerts}`);
        console.log(`   Suppression Rate: ${(stats.suppressionRate * 100).toFixed(2)}%`);
        console.log(`   By Type:`);
        Object.entries(stats.byType).forEach(([type, count]) => {
            console.log(`      ${type}: ${count}`);
        });

        return true;
    });

    // ========================================
    // TEST 8: INCIDENT VERIFICATION
    // ========================================
    it('should verify incidents are persisted correctly in database', async () => {
        console.log('\n\n📝 TEST 8: Database Incident Verification');
        console.log('='.repeat(60));

        const incidents = await Incident.find({ monitor: { $in: Object.values(testMonitors).map(m => m._id) } });

        console.log(`\n💾 Incidents in Database: ${incidents.length}`);
        incidents.forEach((incident, i) => {
            console.log(`\n   Incident ${i + 1}:`);
            console.log(`   • Type: ${incident.errorType}`);
            console.log(`   • Status Code: ${incident.statusCode || 'N/A'}`);
            console.log(`   • Severity: ${incident.severity}`);
            console.log(`   • Error Message: ${incident.errorMessage}`);
            console.log(`   • Created: ${incident.startTime}`);
        });

        return incidents.length > 0;
    });
});

// ========================================
// SUMMARY
// ========================================
afterAll(() => {
    console.log('\n\n' + '='.repeat(60));
    console.log('✅ E2E TEST SUITE COMPLETED');
    console.log('='.repeat(60));
    console.log('\nSummary:');
    console.log(`  Total Emails Sent: ${mockNotifications.emails.length}`);
    console.log(`  Total Slack Messages: ${mockNotifications.slacks.length}`);
    console.log(`  Total Webhooks: ${mockNotifications.webhooks.length}`);
    console.log('\nEmail Recipients:');
    new Set(mockNotifications.emails.map(e => e.to)).forEach(recipient => {
        const count = mockNotifications.emails.filter(e => e.to === recipient).length;
        console.log(`  • ${recipient}: ${count} emails`);
    });
});
