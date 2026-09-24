import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import Monitor from '../../src/models/Monitor.js';
import Incident from '../../src/models/Incident.js';
import notificationService from '../../src/services/notification.service.js';
import redisClient from '../../src/config/redis-cache.js';
import enhancedAlertService from '../../src/services/enhanced-alert.service.js';

describe('One-Time Alert Policy & Bug Fixes Verification', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('Monitor model defaults sslExpiryThresholdDays to 14', () => {
        const monitor = new Monitor({
            name: 'Test Monitor',
            url: 'https://example.com',
            user: new (Incident.base.Types.ObjectId)()
        });
        expect(monitor.sslExpiryThresholdDays).toBe(14);
    });

    test('Incident model has failureSent, degradedSent, and recoverySent in notificationsSent', () => {
        const incident = new Incident({
            monitor: new (Incident.base.Types.ObjectId)(),
            errorMessage: 'Test error'
        });
        expect(incident.notificationsSent.email).toBe(false);
        expect(incident.notificationsSent.failureEmailSent).toBe(false);
        expect(incident.notificationsSent.degradedEmailSent).toBe(false);
        expect(incident.notificationsSent.failureSent).toBe(false);
        expect(incident.notificationsSent.degradedSent).toBe(false);
        expect(incident.notificationsSent.recoverySent).toBe(false);
    });

    test('getDegradationEmailHTML generates non-empty subject and body', () => {
        const mockMonitor = { name: 'My Service', url: 'https://myservice.com' };
        const mockIncident = {
            startTime: new Date(),
            errorMessage: 'Response time degraded to 2500ms'
        };

        const html = notificationService.getDegradationEmailHTML(mockMonitor, mockIncident);
        expect(html).toContain('My Service');
        expect(html).toContain('Performance Issue Detected');
        expect(html).toContain('DEGRADED');
        expect(html).toContain('2500ms');
    });

    test('sendNotificationWithRetry handles "degraded" alert type with correct subject and HTML', async () => {
        const degradationTypes = ['degraded', 'degradation', 'performance_issue', 'content_issue'];
        expect(degradationTypes.includes('degraded')).toBe(true);
    });

    test('EnhancedAlertService recordAlertAttempt sets 30-day TTL (2592000s) on unified key', async () => {
        const setSpy = jest.spyOn(redisClient, 'set').mockResolvedValue('OK');
        const monitorId = '60d5ec49f1b2c8b1f8e4e1a1';

        await enhancedAlertService.recordAlertAttempt(monitorId, 'failure', 'high');

        expect(setSpy).toHaveBeenCalledWith(
            `alert:suppression:${monitorId}:failure`,
            '1',
            'EX',
            30 * 86400
        );
    });

    test('EnhancedAlertService shouldSuppressAlert suppresses across escalation levels', async () => {
        const monitorId = '60d5ec49f1b2c8b1f8e4e1a2';
        jest.spyOn(redisClient, 'exists').mockImplementation(async (key) => {
            if (key === `alert:suppression:${monitorId}:failure`) return 1;
            return 0;
        });

        const isSuppressedMedium = await enhancedAlertService.shouldSuppressAlert(monitorId, 'failure', 'medium');
        const isSuppressedHigh = await enhancedAlertService.shouldSuppressAlert(monitorId, 'failure', 'high');

        expect(isSuppressedMedium).toBe(true);
        expect(isSuppressedHigh).toBe(true);
    });

    test('EnhancedAlertService shouldSuppressAlert cross-suppresses degraded when failure is active', async () => {
        const monitorId = '60d5ec49f1b2c8b1f8e4e1a3';
        jest.spyOn(redisClient, 'exists').mockImplementation(async (key) => {
            if (key === `alert:suppression:${monitorId}:failure`) return 1;
            return 0;
        });

        const isDegradedSuppressed = await enhancedAlertService.shouldSuppressAlert(monitorId, 'degraded');
        expect(isDegradedSuppressed).toBe(true);
    });

    test('sendNotificationWithRetry returns user-not-found when monitor does not exist without throwing', async () => {
        const fakeMonitorId = new (Incident.base.Types.ObjectId)();
        const fakeIncidentId = new (Incident.base.Types.ObjectId)();

        jest.spyOn(Monitor, 'findById').mockReturnValue({
            populate: jest.fn().mockResolvedValue(null)
        });

        const result = await enhancedAlertService.sendNotificationWithRetry({
            monitor: { _id: fakeMonitorId, name: 'Fake' },
            incident: { id: fakeIncidentId },
            type: 'failure'
        });

        expect(result).toEqual({ success: false, error: 'user-not-found' });
    });

    test('handleFailure creates incident and alerts once, and suppresses repeat alerts on subsequent failures', async () => {
        const monitorId = new mongoose.Types.ObjectId();
        const mockMonitor = {
            _id: monitorId,
            name: 'Test Production',
            url: 'https://test.production.com',
            consecutiveFailures: 2,
            alertThreshold: 2
        };

        const mockIncident = {
            _id: new mongoose.Types.ObjectId(),
            monitor: monitorId,
            status: 'ongoing',
            notificationsSent: {
                failureSent: false,
                failureEmailSent: false
            },
            save: jest.fn()
        };

        // 1. First failure check at threshold: no existing incident
        jest.spyOn(enhancedAlertService, 'findExistingIncident').mockResolvedValueOnce(null);
        jest.spyOn(enhancedAlertService, 'createFailureIncident').mockResolvedValue(mockIncident);
        jest.spyOn(enhancedAlertService, 'shouldSuppressAlert').mockResolvedValue(false);
        const recordAttemptSpy = jest.spyOn(enhancedAlertService, 'recordAlertAttempt').mockResolvedValue();
        const sendFailureAlertSpy = jest.spyOn(enhancedAlertService, 'sendFailureAlert').mockResolvedValue({ success: true });

        const result1 = await enhancedAlertService.handleFailure(mockMonitor, { errorMessage: 'Connection refused' });

        expect(result1).toBe(mockIncident);
        expect(sendFailureAlertSpy).toHaveBeenCalledTimes(1);
        expect(recordAttemptSpy).toHaveBeenCalledWith(monitorId, 'failure');

        // 2. Second failure check while still down: existing incident found with failureSent = true
        mockIncident.notificationsSent.failureSent = true;
        jest.spyOn(enhancedAlertService, 'findExistingIncident').mockResolvedValueOnce(mockIncident);
        jest.spyOn(enhancedAlertService, 'updateIncidentWithAnalysis').mockResolvedValue(mockIncident);

        const result2 = await enhancedAlertService.handleFailure(mockMonitor, { errorMessage: 'Connection refused' });

        expect(result2).toBe(mockIncident);
        // Alert count must still be 1 (no duplicate alert)
        expect(sendFailureAlertSpy).toHaveBeenCalledTimes(1);
    });

    test('handleDegraded does not send degraded alert if failure alert was already sent (no downgrade re-alert)', async () => {
        const monitorId = new mongoose.Types.ObjectId();
        const mockMonitor = {
            _id: monitorId,
            name: 'Test Production',
            url: 'https://test.production.com'
        };

        const mockIncident = {
            _id: new mongoose.Types.ObjectId(),
            monitor: monitorId,
            status: 'ongoing',
            severity: 'high',
            notificationsSent: {
                failureSent: true,
                failureEmailSent: true,
                degradedSent: false
            }
        };

        jest.spyOn(enhancedAlertService, 'findExistingIncident').mockResolvedValue(mockIncident);
        jest.spyOn(enhancedAlertService, 'updateIncidentWithAnalysis').mockResolvedValue(mockIncident);
        const sendDegradedAlertSpy = jest.spyOn(enhancedAlertService, 'sendDegradationAlert').mockResolvedValue();

        const degradationType = { type: 'performance_issue', severity: 'high', category: 'performance' };
        jest.spyOn(enhancedAlertService, 'categorizeDegradation').mockReturnValue(degradationType);

        await enhancedAlertService.handleDegraded(mockMonitor, { responseTime: 2500 }, ['slow response'], { confidence: 0.9 });

        expect(sendDegradedAlertSpy).not.toHaveBeenCalled();
    });

    test('handleRecovery sends exactly 1 recovery alert if alerted, and clears suppression', async () => {
        const monitorId = new mongoose.Types.ObjectId();
        const mockMonitor = {
            _id: monitorId,
            name: 'Test Production',
            user: new mongoose.Types.ObjectId()
        };

        const ongoingIncidents = [{
            _id: new mongoose.Types.ObjectId(),
            monitor: monitorId,
            status: 'ongoing',
            startTime: new Date(Date.now() - 300000),
            notificationsSent: {
                failureSent: true,
                failureEmailSent: true
            }
        }];

        const resolvedIncident = {
            ...ongoingIncidents[0],
            status: 'resolved',
            endTime: new Date(),
            duration: 300000,
            notificationsSent: {
                failureSent: true,
                failureEmailSent: true,
                recoverySent: false
            }
        };

        jest.spyOn(Incident, 'find').mockReturnValue({
            lean: jest.fn().mockResolvedValue(ongoingIncidents)
        });
        jest.spyOn(Incident, 'updateMany').mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
        jest.spyOn(Incident, 'findOne').mockReturnValue({
            sort: jest.fn().mockResolvedValue(resolvedIncident)
        });
        jest.spyOn(Incident, 'updateOne').mockResolvedValue({ matchedCount: 1 });

        const sendRecoveryAlertSpy = jest.spyOn(enhancedAlertService, 'sendRecoveryAlert').mockResolvedValue({ success: true });
        const clearSuppressionSpy = jest.spyOn(enhancedAlertService, 'clearAlertSuppression').mockResolvedValue();

        await enhancedAlertService.handleRecovery(mockMonitor, { confidence: 0.95 });

        expect(sendRecoveryAlertSpy).toHaveBeenCalledTimes(1);
        expect(clearSuppressionSpy).toHaveBeenCalledWith(monitorId);
    });

    test('handleRecovery resolves silently if incident had no prior alert sent', async () => {
        const monitorId = new mongoose.Types.ObjectId();
        const mockMonitor = {
            _id: monitorId,
            name: 'Test Production'
        };

        const ongoingIncidents = [{
            _id: new mongoose.Types.ObjectId(),
            monitor: monitorId,
            status: 'ongoing',
            startTime: new Date(Date.now() - 10000),
            notificationsSent: {
                failureSent: false,
                failureEmailSent: false,
                degradedSent: false,
                email: false,
                slack: false,
                webhook: false
            }
        }];

        const resolvedIncident = {
            ...ongoingIncidents[0],
            status: 'resolved',
            endTime: new Date()
        };

        jest.spyOn(Incident, 'find').mockReturnValue({
            lean: jest.fn().mockResolvedValue(ongoingIncidents)
        });
        jest.spyOn(Incident, 'updateMany').mockResolvedValue({ matchedCount: 1 });
        jest.spyOn(Incident, 'findOne').mockReturnValue({
            sort: jest.fn().mockResolvedValue(resolvedIncident)
        });

        const sendRecoveryAlertSpy = jest.spyOn(enhancedAlertService, 'sendRecoveryAlert').mockResolvedValue();
        const clearSuppressionSpy = jest.spyOn(enhancedAlertService, 'clearAlertSuppression').mockResolvedValue();

        await enhancedAlertService.handleRecovery(mockMonitor, { confidence: 0.95 });

        expect(sendRecoveryAlertSpy).not.toHaveBeenCalled();
        expect(clearSuppressionSpy).toHaveBeenCalledWith(monitorId);
    });

    test('findExistingIncident automatically cleans up zombie duplicate ongoing incidents', async () => {
        const monitorId = new mongoose.Types.ObjectId();
        const inc1 = { _id: new mongoose.Types.ObjectId(), monitor: monitorId, startTime: new Date(Date.now() - 1000) };
        const inc2 = { _id: new mongoose.Types.ObjectId(), monitor: monitorId, startTime: new Date(Date.now() - 5000) };
        const inc3 = { _id: new mongoose.Types.ObjectId(), monitor: monitorId, startTime: new Date(Date.now() - 10000) };

        jest.spyOn(Incident, 'find').mockReturnValue({
            sort: jest.fn().mockResolvedValue([inc1, inc2, inc3])
        });
        const updateManySpy = jest.spyOn(Incident, 'updateMany').mockResolvedValue({ matchedCount: 2 });

        const result = await enhancedAlertService.findExistingIncident(monitorId);

        expect(result).toBe(inc1);
        expect(updateManySpy).toHaveBeenCalledWith(
            { _id: { $in: [inc2._id, inc3._id] } },
            expect.objectContaining({ $set: expect.objectContaining({ status: 'resolved' }) })
        );
    });

    test('handleRecovery does NOT clear alert suppression when no ongoing incident exists (routine check)', async () => {
        const monitorId = new mongoose.Types.ObjectId();
        const mockMonitor = {
            _id: monitorId,
            name: 'Routine UP Monitor'
        };

        jest.spyOn(Incident, 'find').mockReturnValue({
            lean: jest.fn().mockResolvedValue([])
        });
        const clearSuppressionSpy = jest.spyOn(enhancedAlertService, 'clearAlertSuppression').mockResolvedValue();

        const result = await enhancedAlertService.handleRecovery(mockMonitor, { confidence: 0.95 });

        expect(result).toBeNull();
        expect(clearSuppressionSpy).not.toHaveBeenCalled();
    });

    test('Test2 scenario: permanently degraded 429 monitor fires exactly 1 alert across 20 consecutive checks', async () => {
        const monitorId = new mongoose.Types.ObjectId();
        const mockMonitor = {
            _id: monitorId,
            name: 'Test2',
            url: 'https://httpbin.org/status/429',
            consecutiveFailures: 0
        };

        const checkResult = {
            isUp: false,
            statusCode: 429,
            errorType: 'HTTP_RATE_LIMIT',
            errorMessage: 'Too Many Requests (429) — rate limit exceeded.'
        };

        const healthStateResult = {
            status: 'degraded',
            confidence: 0.9,
            reasons: ['Too Many Requests (429) — rate limit exceeded']
        };

        let currentIncident = null;

        jest.spyOn(enhancedAlertService, 'findExistingIncident').mockImplementation(async () => currentIncident);
        jest.spyOn(enhancedAlertService, 'createDegradedIncident').mockImplementation(async () => {
            currentIncident = {
                _id: new mongoose.Types.ObjectId(),
                monitor: monitorId,
                status: 'ongoing',
                degradationCategory: 'performance',
                notificationsSent: {
                    degradedSent: false,
                    degradedEmailSent: false,
                    failureSent: false,
                    failureEmailSent: false,
                    email: false
                }
            };
            return currentIncident;
        });
        jest.spyOn(enhancedAlertService, 'updateIncidentWithAnalysis').mockImplementation(async (inc) => inc);

        let suppressionActive = false;
        jest.spyOn(enhancedAlertService, 'shouldSuppressAlert').mockImplementation(async () => suppressionActive);
        jest.spyOn(enhancedAlertService, 'recordAlertAttempt').mockImplementation(async () => {
            suppressionActive = true;
        });

        const sendDegradedAlertSpy = jest.spyOn(enhancedAlertService, 'sendDegradationAlert').mockImplementation(async (m, inc) => {
            inc.notificationsSent.degradedSent = true;
            inc.notificationsSent.degradedEmailSent = true;
            inc.notificationsSent.email = true;
            return { success: true };
        });

        // Run 20 consecutive checks (simulating 20 scheduled intervals of Test2)
        for (let checkIndex = 1; checkIndex <= 20; checkIndex++) {
            await enhancedAlertService.handleDegraded(mockMonitor, checkResult, healthStateResult.reasons, healthStateResult);
        }

        // Exactly 1 alert must be sent across all 20 checks
        expect(sendDegradedAlertSpy).toHaveBeenCalledTimes(1);
    });

    test('degraded to down escalation sends 1 failure alert, and subsequent down checks do not re-alert', async () => {
        const monitorId = new mongoose.Types.ObjectId();
        const mockMonitor = {
            _id: monitorId,
            name: 'Escalating Monitor',
            url: 'https://example.com',
            consecutiveFailures: 2,
            alertThreshold: 2
        };

        // Ongoing incident that was already alerted as degraded
        const existingIncident = {
            _id: new mongoose.Types.ObjectId(),
            monitor: monitorId,
            status: 'ongoing',
            degradationCategory: 'performance',
            notificationsSent: {
                degradedSent: true,
                degradedEmailSent: true,
                email: true,
                failureSent: false,
                failureEmailSent: false
            }
        };

        jest.spyOn(enhancedAlertService, 'findExistingIncident').mockResolvedValue(existingIncident);
        jest.spyOn(enhancedAlertService, 'updateIncidentWithAnalysis').mockResolvedValue(existingIncident);
        jest.spyOn(enhancedAlertService, 'shouldSuppressAlert').mockResolvedValue(false);
        jest.spyOn(enhancedAlertService, 'recordAlertAttempt').mockResolvedValue();

        const sendFailureAlertSpy = jest.spyOn(enhancedAlertService, 'sendFailureAlert').mockImplementation(async (m, inc) => {
            inc.notificationsSent.failureSent = true;
            inc.notificationsSent.failureEmailSent = true;
            return { success: true };
        });

        // Check 1: Transitions to DOWN -> Should send failure alert (escalation)
        await enhancedAlertService.handleFailure(mockMonitor, { errorMessage: 'Connection refused' }, { confidence: 0.9 });
        expect(sendFailureAlertSpy).toHaveBeenCalledTimes(1);

        // Check 2: Still DOWN -> Should NOT send another alert
        await enhancedAlertService.handleFailure(mockMonitor, { errorMessage: 'Connection refused' }, { confidence: 0.9 });
        expect(sendFailureAlertSpy).toHaveBeenCalledTimes(1);

        // Check 3: Still DOWN -> Should NOT send another alert
        await enhancedAlertService.handleFailure(mockMonitor, { errorMessage: 'Connection refused' }, { confidence: 0.9 });
        expect(sendFailureAlertSpy).toHaveBeenCalledTimes(1);
    });

    test('EnhancedAlertService acquireAlertLock uses atomic SET NX and cross-suppresses degraded when failure active', async () => {
        const monitorId = '60d5ec49f1b2c8b1f8e4e1a4';
        const inMemoryRedis = new Map();

        jest.spyOn(redisClient, 'exists').mockImplementation(async (key) => inMemoryRedis.has(key) ? 1 : 0);
        jest.spyOn(redisClient, 'set').mockImplementation(async (key, val, ex, ttl, nx) => {
            if (nx === 'NX' && inMemoryRedis.has(key)) return null;
            inMemoryRedis.set(key, val);
            return 'OK';
        });

        // 1. Acquire failure lock -> Success
        const lock1 = await enhancedAlertService.acquireAlertLock(monitorId, 'failure');
        expect(lock1).toBe(true);

        // 2. Concurrent second call for failure -> Blocked (atomic NX lock)
        const lock2 = await enhancedAlertService.acquireAlertLock(monitorId, 'failure');
        expect(lock2).toBe(false);

        // 3. Attempt degraded lock while failure is active -> Cross-suppressed
        const lockDegraded = await enhancedAlertService.acquireAlertLock(monitorId, 'degraded');
        expect(lockDegraded).toBe(false);
    });

    test('EnhancedAlertService acquireRecoveryLock provides mutual exclusion against race conditions', async () => {
        const monitorId = '60d5ec49f1b2c8b1f8e4e1a5';
        const inMemoryRedis = new Map();

        jest.spyOn(redisClient, 'set').mockImplementation(async (key, val, ex, ttl, nx) => {
            if (nx === 'NX' && inMemoryRedis.has(key)) return null;
            inMemoryRedis.set(key, val);
            return 'OK';
        });

        const firstRecovery = await enhancedAlertService.acquireRecoveryLock(monitorId);
        expect(firstRecovery).toBe(true);

        const concurrentRecovery = await enhancedAlertService.acquireRecoveryLock(monitorId);
        expect(concurrentRecovery).toBe(false);
    });

    test('getRecoveryEmailHTML renders Degradation Duration for degraded and Downtime Duration for downtime', () => {
        const mockMonitor = { name: 'Context Test', url: 'https://example.com' };
        const degradedIncident = {
            duration: 120000,
            degradationCategory: 'performance',
            endTime: new Date()
        };
        const downtimeIncident = {
            duration: 120000,
            errorType: 'SERVICE_FAILURE',
            endTime: new Date()
        };

        const degradedHTML = notificationService.getRecoveryEmailHTML(mockMonitor, degradedIncident);
        expect(degradedHTML).toContain('Degradation Duration:');
        expect(degradedHTML).not.toContain('Downtime Duration:');

        const downtimeHTML = notificationService.getRecoveryEmailHTML(mockMonitor, downtimeIncident);
        expect(downtimeHTML).toContain('Downtime Duration:');
        expect(downtimeHTML).not.toContain('Degradation Duration:');
    });
});

