import Incident from '../models/Incident.js';
import Monitor from '../models/Monitor.js';
import User from '../models/User.js';
import notificationService from './notification.service.js';

import redisClient from '../config/redis-cache.js';

/**
 * Enhanced Alert Service
 * Industry-standard alerting with:
 * - Multi-threshold alerting (soft vs hard limits)
 * - Alert escalation based on health state confidence
 * - Smart alert deduplication with state context (Redis persisted)
 * - Performance-based degradation alerts
 * - Recovery confirmation with incident correlation
 */

class EnhancedAlertService {
    constructor() {
        // Alert configuration
        this.config = {
            // Alert thresholds for different state confidence levels
            lowConfidenceThreshold: 0.6,
            mediumConfidenceThreshold: 0.8,
            highConfidenceThreshold: 0.9,

            // Alert escalation timing
            escalationDelayMs: {
                low: 30000,     // 30 seconds
                medium: 60000,  // 1 minute  
                high: 0         // Immediate
            },

            // Alert suppression for recovery (prevent flapping)
            recoverySuppressionMs: 60000, // 1 minute

            // Partial failure alert configuration
            partialFailureWeight: 0.4,
            performanceDegradationThreshold: 0.7,

            // Recovery confirmation settings
            recoveryConfirmationRequired: true,
            recoveryConfidenceThreshold: 0.8
        };

        // Removed: this.alertHistory = new Map(); // Now using Redis
        this.REDIS_PREFIX = 'alert:suppression:';
        this.io = null;
    }

    /**
     * Enhanced failure handling with multi-threshold logic
     */
    async handleFailure(monitor, checkResult, healthStateResult = null) {
        if (!monitor?._id) {
            console.warn('handleFailure: invalid monitor');
            return null;
        }
        const confidence = healthStateResult?.confidence || 0.5;
        const analysis = healthStateResult?.analysis;

        // Determine alert escalation based on confidence and analysis
        const escalationLevel = this.determineEscalationLevel(confidence, analysis);

        // 1. Check for existing open incident FIRST (to prevent duplicates)
        const existingIncident = await this.findExistingIncident(monitor._id);

        if (existingIncident) {
            // Update existing incident with enhanced analysis
            await this.updateIncidentWithAnalysis(existingIncident, healthStateResult, checkResult);

            // Escalate severity if failure is high
            if (existingIncident.severity !== 'high' && escalationLevel === 'high') {
                await Incident.updateOne({ _id: existingIncident._id }, { $set: { severity: 'high' } });
                existingIncident.severity = 'high';
            }

            // Check if failure alert has already been sent for this ongoing incident
            const failureAlreadySent = Boolean(
                existingIncident.notificationsSent?.failureSent ||
                existingIncident.notificationsSent?.failureEmailSent ||
                (!existingIncident.degradationCategory && existingIncident.errorType !== 'degraded' && existingIncident.errorType !== 'ssl_warning' && existingIncident.notificationsSent?.email)
            );

            if (!failureAlreadySent) {
                const locked = await this.acquireAlertLock(monitor._id, 'failure');
                if (locked) {
                    await this.sendFailureAlert(monitor, existingIncident, escalationLevel);
                }
            }

            return existingIncident;
        }

        // 2. Only create NEW incident if threshold is met
        const alertThreshold = monitor.alertThreshold || 2;
        if (monitor.consecutiveFailures >= alertThreshold) {
            // Create new failure incident (ALWAYS - suppression only affects notification dispatch)
            const incident = await this.createFailureIncident(monitor, checkResult, healthStateResult, escalationLevel);

            // Send alert (only if not suppressed via atomic lock)
            const locked = await this.acquireAlertLock(monitor._id, 'failure');
            if (locked) {
                await this.sendFailureAlert(monitor, incident, escalationLevel);
            } else {
                console.log(`🚨 Alert suppressed for ${monitor.name} (incident created)`);
            }

            return incident;
        }

        return null;
    }

    /**
     * Enhanced degraded handling with performance analysis
     */
    async handleDegraded(monitor, checkResult, reasons = [], healthStateResult = null) {
        if (!monitor?._id) {
            console.warn('handleDegraded: invalid monitor');
            return null;
        }
        const confidence = healthStateResult?.confidence || 0.5;
        const analysis = healthStateResult?.analysis;

        // Check if this is a performance degradation
        const isPerformanceIssue = this.isPerformanceDegradation(reasons, analysis);

        // Determine degradation type and alert priority
        const degradationType = this.categorizeDegradation(reasons, analysis, isPerformanceIssue);

        // Check for existing degraded incident
        const existingIncident = await this.findExistingIncident(monitor._id);

        if (existingIncident) {
            // Update existing incident
            await this.updateIncidentWithAnalysis(existingIncident, healthStateResult, checkResult);

            // Check if alert has already been sent for this ongoing incident
            const degradedAlreadySent = Boolean(
                existingIncident.notificationsSent?.degradedSent ||
                existingIncident.notificationsSent?.degradedEmailSent ||
                existingIncident.notificationsSent?.email ||
                existingIncident.notificationsSent?.slack ||
                existingIncident.notificationsSent?.webhook
            );
            // One-time policy: if a DOWN (failure) alert was already sent for this
            // ongoing incident, do NOT send a lesser DEGRADED alert (downgrade = no re-alert).
            const failureAlreadySent = Boolean(
                existingIncident.notificationsSent?.failureSent ||
                existingIncident.notificationsSent?.failureEmailSent
            );

            // Send alert only if this incident has not already sent an alert and not suppressed
            if (!failureAlreadySent && !degradedAlreadySent && degradationType.severity === 'high' && confidence >= this.config.mediumConfidenceThreshold) {
                const locked = await this.acquireAlertLock(monitor._id, 'degraded');
                if (locked) {
                    await this.sendDegradationAlert(monitor, existingIncident, degradationType, healthStateResult);
                }
            }

            return existingIncident;
        }

        // Check if we should create new degraded incident
        // Enforce alertThreshold: only create incident and alert when consecutiveDegraded meets threshold
        const alertThreshold = monitor.alertThreshold || 2;
        const consecutiveDegraded = monitor.consecutiveDegraded !== undefined
            ? Number(monitor.consecutiveDegraded)
            : alertThreshold;

        if (consecutiveDegraded >= alertThreshold && this.shouldCreateDegradedIncident(monitor, degradationType, confidence, healthStateResult, checkResult)) {
            // Create incident ALWAYS (suppression only affects notification dispatch)
            const incident = await this.createDegradedIncident(monitor, checkResult, degradationType, healthStateResult);

            // Send alert (only if not suppressed via atomic lock)
            const locked = await this.acquireAlertLock(monitor._id, 'degraded');
            if (locked) {
                await this.sendDegradationAlert(monitor, incident, degradationType, healthStateResult);
            } else {
                console.log(`🟡 Degradation alert suppressed for ${monitor.name} (incident created)`);
            }

            return incident;
        }

        return null;
    }

    /**
     * Enhanced recovery handling with correlation analysis
     */
    async handleRecovery(monitor, healthStateResult = null) {
        if (!monitor?._id) {
            console.warn('handleRecovery: invalid monitor');
            return null;
        }
        const confidence = healthStateResult?.confidence || 0.5;

        // Snapshot ongoing incidents BEFORE resolving, to decide if a recovery
        // alert is warranted (one-time policy: only recover if we previously alerted).
        const ongoingBefore = await Incident.find({ monitor: monitor._id, status: 'ongoing' }).lean();
        if (ongoingBefore.length === 0) {
            // No ongoing incident to recover; do not touch suppression keys
            return null;
        }
        const wasAlerted = ongoingBefore.some(i =>
            i.notificationsSent?.failureSent ||
            i.notificationsSent?.failureEmailSent ||
            i.notificationsSent?.degradedSent ||
            i.notificationsSent?.degradedEmailSent ||
            i.notificationsSent?.email ||
            i.notificationsSent?.slack ||
            i.notificationsSent?.webhook
        );

        const now = new Date();
        const startTime = ongoingBefore[0]?.startTime ? new Date(ongoingBefore[0].startTime) : now;
        const duration = Math.max(0, now.getTime() - startTime.getTime());

        // Find and resolve ALL ongoing incidents to prevent "zombies"
        const updateResult = await Incident.updateMany(
            { monitor: monitor._id, status: 'ongoing' },
            {
                $set: {
                    status: 'resolved',
                    endTime: now,
                    duration: duration,
                    recoveryConfidence: confidence,
                    healthStateAnalysis: healthStateResult,
                    failureRate: healthStateResult?.analysis?.window?.failureRate || 0,
                    patternDetected: healthStateResult?.analysis?.window?.pattern || 'stable',
                    resolvedBy: 'auto'
                }
            }
        );

        if (updateResult.matchedCount === 0) {
            await this.clearAlertSuppression(monitor._id);
            return null;
        }

        // Fetch the exact resolved incident for the notification
        const targetId = ongoingBefore[0]?._id;
        const incident = (targetId ? await Incident.findById(targetId) : null) ||
            await Incident.findOne({ monitor: monitor._id, status: 'resolved' }).sort({ endTime: -1 });

        // One-time policy: send recovery alert ONLY if a DOWN/DEGRADED alert was
        // previously sent for this incident lifecycle. Otherwise resolve silently
        // (avoids "recovery without alert" confusion). Suppression is still cleared.
        if (wasAlerted && incident && !incident.notificationsSent?.recoverySent) {
            const recoveryLock = await this.acquireRecoveryLock(monitor._id);
            if (recoveryLock) {
                await this.sendRecoveryAlert(monitor, incident, healthStateResult);
                await Incident.updateOne({ _id: incident._id }, { $set: { 'notificationsSent.recoverySent': true } });
            }
        } else {
            console.log(`ℹ️ Recovery for ${monitor.name} resolved silently (no prior alert sent or already alerted)`);
        }

        // Clear alert suppression for recovery (future alerts should fire immediately if it goes down again)
        await this.clearAlertSuppression(monitor._id);

        // Real-time notification: emit incident_resolved event
        if (this.io) {
            const roomUserId = monitor.user?._id || monitor.user;
            if (roomUserId) {
                this.io.to(`user_${roomUserId}`).emit('incident_resolved', {
                    monitorId: monitor._id,
                    incidentId: incident?._id,
                    status: 'resolved',
                    timestamp: new Date()
                });
            }
        }

        return incident;
    }

    /**
     * Determine escalation level based on confidence and analysis
     */
    determineEscalationLevel(confidence, analysis) {
        const currentCheck = analysis?.currentCheck || {};
        const severity = currentCheck.severity || 0;

        if (confidence >= this.config.highConfidenceThreshold && severity >= 0.9) return 'high';
        if (confidence >= this.config.mediumConfidenceThreshold && analysis?.window?.shouldBeDown) return 'medium';
        return 'low';
    }

    /**
     * Atomically acquire an alert lock via Redis SET ... EX ... NX.
     * Returns true if lock was acquired (caller may send alert), false if already locked/suppressed.
     */
    async acquireAlertLock(monitorId, alertType, ttl = 30 * 86400) {
        try {
            // Degraded alerts are cross-suppressed if a failure (DOWN) alert is already active
            if (alertType === 'degraded') {
                const failureKey = `${this.REDIS_PREFIX}${monitorId}:failure`;
                const failureExists = await redisClient.exists(failureKey);
                if (failureExists === 1) {
                    return false;
                }
            }

            const key = `${this.REDIS_PREFIX}${monitorId}:${alertType}`;
            const result = await redisClient.set(key, '1', 'EX', ttl, 'NX');
            const acquired = result === 'OK';
            if (acquired) {
                await this.recordAlertAttempt(monitorId, alertType);
            }
            return acquired;
        } catch (err) {
            console.error(`Error acquiring alert lock for ${monitorId}:`, err.message);
            // In case Redis fails, check suppression fallback
            return !(await this.shouldSuppressAlert(monitorId, alertType));
        }
    }

    /**
     * Atomically acquire a recovery lock via Redis SET ... EX ... NX.
     * Prevents race conditions where concurrent recovery checks double-dispatch recovery emails.
     */
    async acquireRecoveryLock(monitorId, ttl = 300) {
        try {
            const key = `${this.REDIS_PREFIX}${monitorId}:recovery_lock`;
            const result = await redisClient.set(key, '1', 'EX', ttl, 'NX');
            return result === 'OK';
        } catch (err) {
            console.error(`Error acquiring recovery lock for ${monitorId}:`, err.message);
            return true;
        }
    }

    /**
     * Check if alert should be suppressed (REDIS Implementation)
     * Level is optional and ignored to prevent level shifts from breaking suppression.
     */
    async shouldSuppressAlert(monitorId, alertType, escalationLevel = null) {
        try {
            // If checking degraded, also suppress if failure is already suppressed (down takes precedence)
            if (alertType === 'degraded') {
                const failureKey = `${this.REDIS_PREFIX}${monitorId}:failure`;
                const failureExists = await redisClient.exists(failureKey);
                if (failureExists === 1) return true;
            }

            const key = `${this.REDIS_PREFIX}${monitorId}:${alertType}`;
            const exists = await redisClient.exists(key);
            return exists === 1;
        } catch (err) {
            console.error(`Error checking alert suppression for ${monitorId}:`, err.message);
            return false;
        }
    }

    /**
     * Record alert attempt for suppression logic (REDIS Implementation)
     * Level is optional and ignored so key remains constant.
     */
    async recordAlertAttempt(monitorId, alertType, escalationLevel = null) {
        try {
            const key = `${this.REDIS_PREFIX}${monitorId}:${alertType}`;

            // Extended suppression while incident remains ongoing (30 days to prevent daily repeat alerts).
            // It is automatically deleted upon recovery by clearAlertSuppression(monitorId).
            const ttl = 30 * 86400;

            await redisClient.set(key, '1', 'EX', ttl);
        } catch (err) {
            console.error(`Error recording alert attempt for ${monitorId}:`, err.message);
        }
    }

    /**
     * Clear alert suppression for monitor (REDIS Implementation)
     */
    async clearAlertSuppression(monitorId) {
        const pattern = `${this.REDIS_PREFIX}${monitorId}:*`;
        let cursor = '0';
        try {
            do {
                const [newCursor, keys] = await redisClient.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
                cursor = newCursor;
                if (keys && keys.length > 0) {
                    await redisClient.del(...keys);
                }
            } while (cursor !== '0');

            // Defensive cleanup of direct keys
            await redisClient.del(
                `${this.REDIS_PREFIX}${monitorId}:failure`,
                `${this.REDIS_PREFIX}${monitorId}:degraded`,
                `${this.REDIS_PREFIX}${monitorId}:recovery`,
                `${this.REDIS_PREFIX}${monitorId}:recovery_lock`
            );
        } catch (err) {
            console.error(`❌ Error clearing suppression keys for ${monitorId}:`, err.message);
        }
    }

    /**
     * Find existing incident of specified types (cleans up any duplicate ongoing zombies)
     */
    async findExistingIncident(monitorId) {
        const incidents = await Incident.find({
            monitor: monitorId,
            status: 'ongoing'
        }).sort({ startTime: -1 });

        if (incidents.length > 1) {
            // Defensive: clean up duplicate zombie ongoing incidents
            const [keep, ...duplicates] = incidents;
            const duplicateIds = duplicates.map(d => d._id);
            await Incident.updateMany(
                { _id: { $in: duplicateIds } },
                { $set: { status: 'resolved', endTime: new Date(), resolvedBy: 'auto' } }
            );
            return keep;
        }

        return incidents[0] || null;
    }

    /**
     * Update incident with enhanced analysis
     */
    async updateIncidentWithAnalysis(incident, healthStateResult, checkResult) {
        // Prepare update data
        const updateData = {
            $set: {
                lastUpdated: new Date(),
                healthStateAnalysis: healthStateResult
            }
        };

        // Update errorMessage from checkResult or fallback to healthStateResult reasons
        // Guard against null/undefined checkResult (unhandled null crash fix)
        if (checkResult?.errorMessage) {
            updateData.$set.errorMessage = checkResult.errorMessage;
        } else if (healthStateResult?.reasons?.length > 0) {
            updateData.$set.errorMessage = healthStateResult.reasons[0];
        }

        if (checkResult?.errorType) updateData.$set.errorType = checkResult.errorType;
        if (checkResult?.statusCode) updateData.$set.statusCode = checkResult.statusCode;

        // Perform atomic update
        return await Incident.findOneAndUpdate(
            { _id: incident._id },
            updateData,
            { new: true }
        );
    }

    /**
     * Create failure incident with enhanced metadata
     */
    async createFailureIncident(monitor, checkResult, healthStateResult, escalationLevel) {
        return await Incident.create({
            monitor: monitor._id,
            startTime: new Date(),
            errorMessage: checkResult?.errorMessage || healthStateResult?.reasons?.[0] || 'Service failure detected',
            errorType: checkResult?.errorType || (healthStateResult.analysis?.currentCheck?.statusCode ? 'STATUS_CODE_MISMATCH' : 'SERVICE_FAILURE'),
            statusCode: checkResult?.statusCode,
            severity: escalationLevel,
            healthStateAnalysis: healthStateResult,
            confidence: healthStateResult?.confidence || 0.5
        });
    }

    /**
     * Create degraded incident with type categorization
     */
    async createDegradedIncident(monitor, checkResult, degradationType, healthStateResult) {
        return await Incident.create({
            monitor: monitor._id,
            startTime: new Date(),
            errorMessage: degradationType?.message || healthStateResult?.reasons?.[0] || 'Service degradation detected',
            errorType: degradationType?.type || 'degraded',
            statusCode: checkResult?.statusCode,
            severity: degradationType?.severity || 'medium',
            degradationCategory: degradationType?.category || 'general',
            healthStateAnalysis: healthStateResult,
            confidence: healthStateResult?.confidence || 0.5
        });
    }

    /**
     * Categorize degradation type and severity
     */
    categorizeDegradation(reasons, analysis, isPerformanceIssue) {
        const safeReasons = Array.isArray(reasons) ? reasons.map(r => String(r || '')) : [];
        if (isPerformanceIssue) {
            const severity = analysis?.currentCheck?.severity >= 0.6 ? 'high' : 'medium';
            const reasonText = safeReasons.length > 0 ? safeReasons.join(', ') : 'Rate limit or performance issue detected';
            return {
                type: 'performance_issue',
                category: 'performance',
                severity,
                message: `Performance degradation: ${reasonText}`,
                priority: severity === 'high' ? 1 : 2
            };
        }

        if (safeReasons.some(r => r.toLowerCase().includes('ssl') || r.toLowerCase().includes('cert'))) {
            return {
                type: 'ssl_warning',
                category: 'security',
                severity: 'high', // ESCALATED: Ensure SSL warnings always alert
                message: safeReasons.length > 0 ? `SSL/Certificate issue: ${safeReasons.join(', ')}` : 'SSL certificate is expiring soon',
                priority: 1
            };
        }

        if (safeReasons.some(r => r.toLowerCase().includes('content') || r.toLowerCase().includes('keyword'))) {
            return {
                type: 'content_issue',
                category: 'content',
                severity: 'medium',
                message: `Content issue: ${safeReasons.join(', ')}`,
                priority: 2
            };
        }

        return {
            type: 'degraded',
            category: 'general',
            severity: 'low',
            message: safeReasons.length > 0 ? safeReasons.join(', ') : 'Service degradation detected',
            priority: 3
        };
    }

    /**
     * Check if degradation incident should be created
     * - Rate limit (429) and SSL issues: immediate alert
     * - Slow response: require 2+ consecutive slow checks to avoid false positives
     * - HTTP client errors (4xx): immediate alert (server returning error)
     */
    shouldCreateDegradedIncident(monitor, degradationType, confidence, healthStateResult, checkResult = null) {
        const hsReasons = Array.isArray(healthStateResult?.reasons) ? healthStateResult.reasons.map(r => String(r || '')) : [];
        // Rate limit (429) - check errorType directly
        const isRateLimit = checkResult?.errorType === 'HTTP_RATE_LIMIT' ||
            hsReasons.some(r => r.toLowerCase().includes('429') || r.toLowerCase().includes('rate'));

        if (isRateLimit && confidence >= this.config.lowConfidenceThreshold) {
            console.log(`✅ Creating rate limit incident for ${monitor.name}`);
            return true;
        }

        // SSL/Security issues
        if (degradationType.category === 'security' && confidence >= this.config.lowConfidenceThreshold) return true;

        // HTTP Client Errors (4xx) - check errorType directly
        const isClientError = checkResult?.errorType?.includes('HTTP_CLIENT_ERROR') ||
            checkResult?.errorType?.includes('HTTP_NOT_FOUND') ||
            checkResult?.errorType?.includes('HTTP_FORBIDDEN') ||
            checkResult?.errorType?.includes('HTTP_UNAUTHORIZED') ||
            checkResult?.errorType?.includes('HTTP_BAD_REQUEST') ||
            hsReasons.some(r =>
                r.toLowerCase().includes('client error') ||
                r.toLowerCase().includes('not found') ||
                r.toLowerCase().includes('forbidden') ||
                r.toLowerCase().includes('unauthorized') ||
                r.toLowerCase().includes('bad request') ||
                r.toLowerCase().includes('http_client_error')
            );

        if (isClientError && confidence >= this.config.lowConfidenceThreshold) {
            console.log(`✅ Creating client error incident for ${monitor.name}`);
            return true;
        }

        // Slow response / performance issues
        if (degradationType.category === 'performance' && !isRateLimit) {
            if (confidence >= this.config.mediumConfidenceThreshold) return true;
            return false;
        }

        // Content issues - require medium confidence
        if (degradationType.category === 'content' && confidence >= this.config.mediumConfidenceThreshold) {
            const failureRate = healthStateResult?.analysis?.window?.failureRate || 0;
            if (failureRate >= 0.4) return true; // Alert if 40%+ of recent checks show content issues
            return false;
        }

        // General degradation with high confidence
        if (degradationType.severity === 'high' && confidence >= this.config.highConfidenceThreshold) return true;

        return false;
    }

    /**
     * Check if reasons indicate performance degradation
     */
    isPerformanceDegradation(reasons, analysis) {
        const performanceKeywords = ['slow', 'performance', 'latency', 'timeout', 'response time', 'rate limit', '429'];
        const safeReasons = Array.isArray(reasons) ? reasons.map(r => String(r || '')) : [];
        if (safeReasons.some(reason => performanceKeywords.some(keyword => reason.toLowerCase().includes(keyword)))) return true;
        if (analysis?.currentCheck?.performanceIssues?.length > 0) return true;
        return false;
    }

    /**
     * Send failure alert with escalation
     */
    async sendFailureAlert(monitor, incident, escalationLevel) {
        const enhancedAlert = this.createEnhancedFailureAlert(monitor, incident, escalationLevel);
        return await this.sendNotificationWithRetry(enhancedAlert);
    }

    /**
     * Send degradation alert with type-specific formatting
     */
    async sendDegradationAlert(monitor, incident, degradationType, healthStateResult) {
        const enhancedAlert = this.createEnhancedDegradationAlert(monitor, incident, degradationType, healthStateResult);
        return await this.sendNotificationWithRetry(enhancedAlert);
    }

    /**
     * Send recovery alert with incident correlation
     */
    async sendRecoveryAlert(monitor, incident, healthStateResult) {
        const enhancedAlert = this.createEnhancedRecoveryAlert(monitor, incident, healthStateResult);
        return await this.sendNotificationWithRetry(enhancedAlert);
    }

    /**
     * Send escalated failure alert for high-confidence issues
     */
    async sendEscalatedFailureAlert(monitor, incident, healthStateResult) {
        console.log(`🚨 Escalated alert: ${monitor.name} - Critical failure detected`);
        const enhancedAlert = this.createEnhancedFailureAlert(monitor, incident, 'high');
        return await this.sendNotificationWithRetry(enhancedAlert);
    }

    /**
     * Create enhanced failure alert content
     */
    createEnhancedFailureAlert(monitor, incident, escalationLevel) {
        return {
            type: 'failure',
            severity: escalationLevel,
            monitor: {
                id: monitor._id,
                name: monitor.name,
                url: monitor.url,
                type: monitor.type
            },
            incident: {
                id: incident._id,
                startTime: incident.startTime,
                errorMessage: incident.errorMessage,
                errorType: incident.errorType,
                severity: incident.severity
            },
            analysis: incident.healthStateAnalysis,
            timestamp: new Date()
        };
    }

    /**
     * Create enhanced degradation alert content
     */
    createEnhancedDegradationAlert(monitor, incident, degradationType, healthStateResult) {
        return {
            type: degradationType.type || 'degradation',
            category: degradationType.category,
            severity: degradationType.severity,
            monitor: {
                id: monitor._id,
                name: monitor.name,
                url: monitor.url,
                type: monitor.type
            },
            incident: {
                id: incident._id,
                startTime: incident.startTime,
                errorMessage: incident.errorMessage,
                degradationCategory: incident.degradationCategory
            },
            analysis: healthStateResult,
            timestamp: new Date()
        };
    }

    /**
     * Create enhanced recovery alert content
     */
    createEnhancedRecoveryAlert(monitor, incident, healthStateResult) {
        return {
            type: 'recovery',
            monitor: {
                id: monitor._id,
                name: monitor.name,
                url: monitor.url,
                type: monitor.type
            },
            incident: {
                id: incident._id,
                startTime: incident.startTime,
                endTime: incident.endTime,
                duration: incident.duration,
                recoveryConfidence: incident.recoveryConfidence
            },
            analysis: healthStateResult,
            timestamp: new Date()
        };
    }

    /**
     * Helper to mask PII in log output
     */
    maskPiiInResults(results) {
        const masked = { ...results };

        // Mask emails
        if (masked.email && Array.isArray(masked.email)) {
            masked.email = masked.email.map(entry => ({
                ...entry,
                to: entry.to ? entry.to.replace(/(.{2})(.*)(@.*)/, '$1***$3') : 'unknown'
            }));
        }

        return masked;
    }

    /**
     * Send notification with retry logic
     */
    async sendNotificationWithRetry(alertData) {
        try {
            if (!alertData || !alertData.monitor || !alertData.incident) {
                console.warn('sendNotificationWithRetry: Invalid alert data');
                return { success: false, error: 'invalid-data' };
            }

            const monitorId = alertData.monitor._id || alertData.monitor.id;
            const monitorDoc = await Monitor.findById(monitorId).populate('user');

            if (!monitorDoc || !monitorDoc.user) return { success: false, error: 'user-not-found' };
            const user = monitorDoc.user;

            const incidentId = alertData.incident.id || alertData.incident._id;
            const incident = await Incident.findById(incidentId);
            if (!incident) return { success: false, error: 'incident-not-found' };

            const results = { email: [], slack: null, webhook: null };
            const notificationPromises = [];

            // 1. Email Notifications
            if (user.notificationPreferences?.email) {
                const rawRecipients = [user.email, ...(user.contactEmails || [])];
                const recipients = [...new Set(rawRecipients.map(e => e?.trim().toLowerCase()).filter(Boolean))];
                if (recipients.length > 0) {
                    notificationPromises.push((async () => {
                        let subject = '', html = '';
                        if (alertData.type === 'failure') {
                            subject = `🚨 ALERT: ${alertData.monitor.name} is DOWN`;
                            html = notificationService.getDowntimeEmailHTML(alertData.monitor, incident);
                        } else if (alertData.type === 'ssl_warning') {
                            subject = `⚠️ SSL WARNING: ${alertData.monitor.name} Certificate Issue`;
                            html = notificationService.getSslWarningEmailHTML(alertData.monitor, incident);
                        } else if (alertData.type === 'recovery') {
                            subject = `✅ RECOVERY: ${alertData.monitor.name} is UP`;
                            html = notificationService.getRecoveryEmailHTML(alertData.monitor, incident);
                        } else {
                            // Degraded, performance_issue, rate_limit, content_issue, high_latency, etc.
                            subject = `⚠️ WARNING: ${alertData.monitor.name} Performance Degraded`;
                            html = notificationService.getDegradationEmailHTML(alertData.monitor, incident);
                        }

                        // Empty-email guard: never send a blank subject/body (bug fix)
                        if (!subject || !html) {
                            console.warn(`sendNotificationWithRetry: empty subject/html for type '${alertData.type}' — skipping`);
                            return;
                        }

                        for (const recipient of recipients) {
                            try {
                                const result = await notificationService.sendEmail(recipient, subject, html);
                                results.email.push({ to: recipient, success: result.success, messageId: result.messageId, error: result.error });
                            } catch (err) {
                                results.email.push({ to: recipient, success: false, error: err.message });
                            }
                        }
                    })());
                }
            }

            // 2. Slack Notifications
            if (user.notificationPreferences?.slack && user.slackWebhook) {
                notificationPromises.push((async () => {
                    let text = '';
                    if (alertData.type === 'failure') {
                        text = `🚨 *Monitor Alert: ${alertData.monitor.name} is DOWN*\nURL: ${alertData.monitor.url}\nError: ${incident.errorMessage}`;
                    } else if (alertData.type === 'ssl_warning') {
                        text = `⚠️ *SSL Warning: ${alertData.monitor.name} Certificate Issue*\nURL: ${alertData.monitor.url}\nIssue: ${incident.errorMessage}`;
                    } else if (alertData.type === 'recovery') {
                        text = `✅ *Monitor Recovered: ${alertData.monitor.name} is UP*\nURL: ${alertData.monitor.url}\nDuration: ${notificationService.formatDuration(incident.duration || 0)}`;
                    } else {
                        text = `⚠️ *Monitor Warning: ${alertData.monitor.name} is Degraded*\nURL: ${alertData.monitor.url}\nIssue: ${incident.errorMessage}`;
                    }
                    if (!text) {
                        console.warn('sendNotificationWithRetry: empty Slack text — skipping');
                        return;
                    }

                    const slackResult = await this.executeWithRetry(
                        () => notificationService.sendSlack(user.slackWebhook, { text }),
                        `Slack retry for ${alertData.monitor.name}`
                    );
                    results.slack = slackResult.success;
                })());
            }

            // 3. Webhook Notifications
            if (user.notificationPreferences?.webhook && user.webhookUrl) {
                notificationPromises.push((async () => {
                    const webhookResult = await this.executeWithRetry(
                        () => notificationService.sendWebhook(user.webhookUrl, {
                            event: alertData.type,
                            monitor: { id: monitorId, name: alertData.monitor.name, url: alertData.monitor.url },
                            incident: { id: incident._id, status: incident.status, startTime: incident.startTime, endTime: incident.endTime, duration: incident.duration }
                        }),
                        `Webhook retry for ${alertData.monitor.name}`
                    );
                    results.webhook = webhookResult.success;
                })());
            }

            await Promise.allSettled(notificationPromises);

            // Persist notification statistics in incident document
            try {
                const emailSentSuccessfully = results.email.some(e => e.success);
                const updateQuery = {
                    $set: {
                        'notificationsSent.email': emailSentSuccessfully,
                        'notificationsSent.emailDetails': results.email,
                        'notificationsSent.slack': results.slack || false,
                        'notificationsSent.webhook': results.webhook || false
                    }
                };

                if (alertData.type === 'failure') {
                    updateQuery.$set['notificationsSent.failureSent'] = true;
                    if (emailSentSuccessfully) {
                        updateQuery.$set['notificationsSent.failureEmailSent'] = true;
                    }
                } else if (alertData.type === 'recovery') {
                    updateQuery.$set['notificationsSent.recoverySent'] = true;
                } else {
                    // Degraded, performance_issue, rate_limit, content_issue, ssl_warning, high_latency, etc.
                    updateQuery.$set['notificationsSent.degradedSent'] = true;
                    if (emailSentSuccessfully) {
                        updateQuery.$set['notificationsSent.degradedEmailSent'] = true;
                    }
                }

                await Incident.updateOne({ _id: incident._id }, updateQuery);
                if (incident && incident.notificationsSent) {
                    incident.notificationsSent.email = emailSentSuccessfully;
                    incident.notificationsSent.emailDetails = results.email;
                    incident.notificationsSent.slack = results.slack || false;
                    incident.notificationsSent.webhook = results.webhook || false;
                    if (alertData.type === 'failure') {
                        incident.notificationsSent.failureSent = true;
                        if (emailSentSuccessfully) incident.notificationsSent.failureEmailSent = true;
                    } else if (alertData.type === 'recovery') {
                        incident.notificationsSent.recoverySent = true;
                    } else {
                        incident.notificationsSent.degradedSent = true;
                        if (emailSentSuccessfully) incident.notificationsSent.degradedEmailSent = true;
                    }
                }
                console.log(`✅ Incident ${incident._id} updated with notification status`);

                // Increment Global Stats in Redis (Phase 11: Persistent Counters)
                const statsKey = `${this.REDIS_PREFIX}global:stats`;
                const statsPip = redisClient.pipeline();
                if (results.email.some(e => e.success)) statsPip.hincrby(statsKey, 'email', 1);
                if (results.slack) statsPip.hincrby(statsKey, 'slack', 1);
                if (results.webhook) statsPip.hincrby(statsKey, 'webhook', 1);
                await statsPip.exec().catch(err => console.error('Stats increment error:', err.message));

            } catch (dbErr) {
                console.error(`❌ Failed to persist notification results for incident ${incident._id}:`, dbErr.message);
            }

            // Log sanitized results
            console.log(`📧 Alerts processed for ${alertData.monitor.name || monitorId}:`, this.maskPiiInResults(results));
            return { success: true, results };
        } catch (error) {
            console.error('Alert notification failed:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Execute a function with exponential backoff retries
     */
    async executeWithRetry(fn, label, maxRetries = 3) {
        let lastError;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const result = await fn();
                if (result && result.success) return result;
                lastError = new Error(result?.error || 'Unknown notification error');
            } catch (err) {
                lastError = err;
            }

            if (attempt < maxRetries) {
                const backoffMs = 1000 * Math.pow(2, attempt - 1);
                console.warn(`⚠️ ${label} attempt ${attempt} failed: ${lastError.message}. Retrying in ${backoffMs}ms...`);
                await new Promise(res => setTimeout(res, backoffMs));
            }
        }
        return { success: false, error: lastError?.message || 'Max retries reached' };
    }

    /**
     * Get alert statistics (Redis implementation - approximate)
     */
    async getAlertStatistics() {
        const pattern = `${this.REDIS_PREFIX}*`;
        const byType = { failure: 0, degraded: 0, recovery: 0 };
        let totalKeys = 0;
        let cursor = '0';

        try {
            do {
                const [newCursor, scannedKeys] = await redisClient.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
                cursor = newCursor;

                if (scannedKeys && scannedKeys.length > 0) {
                    totalKeys += scannedKeys.length;
                    for (const key of scannedKeys) {
                        if (key.includes(':failure')) byType.failure++;
                        else if (key.includes(':degraded')) byType.degraded++;
                        else if (key.includes(':recovery')) byType.recovery++;
                    }
                }
            } while (cursor !== '0');

            // Also fetch global counters for alerts sent (Phase 11: Persistent Counters)
            const globalStats = await redisClient.hgetall(`${this.REDIS_PREFIX}global:stats`);

            return {
                totalAlerts: totalKeys,
                suppressedAlerts: totalKeys,
                suppressionRate: 0,
                totalOngoingSuppressed: totalKeys,
                byType,
                totalSent: {
                    email: parseInt(globalStats?.email || 0),
                    slack: parseInt(globalStats?.slack || 0),
                    webhook: parseInt(globalStats?.webhook || 0),
                    total: parseInt(globalStats?.email || 0) + parseInt(globalStats?.slack || 0) + parseInt(globalStats?.webhook || 0)
                },
                timestamp: new Date()
            };
        } catch (err) {
            console.error('Error fetching alert statistics:', err.message);
            return {
                totalAlerts: 0,
                suppressedAlerts: 0,
                suppressionRate: 0,
                totalOngoingSuppressed: 0,
                byType: { failure: 0, degraded: 0, recovery: 0 },
                totalSent: { email: 0, slack: 0, webhook: 0, total: 0 },
                error: 'Failed to fetch statistics',
                timestamp: new Date()
            };
        }
    }

    /**
     * Set the Socket.io instance for real-time notifications
     * @param {Object} io - The Socket.io server instance
     */
    setIoInstance(io) {
        this.io = io;
    }
}

export default new EnhancedAlertService();
export { EnhancedAlertService };
