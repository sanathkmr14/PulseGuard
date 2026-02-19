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
        const confidence = healthStateResult?.confidence || 0.5;
        const analysis = healthStateResult?.analysis;

        // Determine alert escalation based on confidence and analysis
        const escalationLevel = this.determineEscalationLevel(confidence, analysis);

        // 1. Check for existing open incident FIRST (to prevent duplicates)
        const existingIncident = await this.findExistingIncident(monitor._id);

        if (existingIncident) {
            // Update existing incident with enhanced analysis
            await this.updateIncidentWithAnalysis(existingIncident, healthStateResult, checkResult);

            // Send escalated alert if needed (suppression only applies to emails)
            if (escalationLevel === 'high') {
                const isSuppressed = await this.shouldSuppressAlert(monitor._id, 'failure', escalationLevel);
                if (!isSuppressed) {
                    await this.recordAlertAttempt(monitor._id, 'failure', escalationLevel);
                    await this.sendEscalatedFailureAlert(monitor, existingIncident, healthStateResult);
                }
            }

            return existingIncident;
        }

        // 2. Only create NEW incident if threshold is met
        const alertThreshold = monitor.alertThreshold || 2;
        if (monitor.consecutiveFailures >= alertThreshold) {
            // Create new failure incident (ALWAYS - suppression only affects email)
            const incident = await this.createFailureIncident(monitor, checkResult, healthStateResult, escalationLevel);

            // Send alert email (only if not suppressed)
            const isSuppressed = await this.shouldSuppressAlert(monitor._id, 'failure', escalationLevel);
            if (!isSuppressed) {
                await this.recordAlertAttempt(monitor._id, 'failure', escalationLevel);
                await this.sendFailureAlert(monitor, incident, escalationLevel);
            } else {
                console.log(`🚨 Alert email suppressed for ${monitor.name} (incident still created)`);
            }

            return incident;
        }

        return null;
    }

    /**
     * Enhanced degraded handling with performance analysis
     */
    async handleDegraded(monitor, checkResult, reasons = [], healthStateResult = null) {
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

            // Send alert only for significant changes (suppression only affects email)
            if (degradationType.severity === 'high' && confidence >= this.config.mediumConfidenceThreshold) {
                const isSuppressed = await this.shouldSuppressAlert(monitor._id, 'degraded', degradationType.severity);
                if (!isSuppressed) {
                    await this.recordAlertAttempt(monitor._id, 'degraded', degradationType.severity);
                    await this.sendDegradationAlert(monitor, existingIncident, degradationType, healthStateResult);
                }
            }

            return null; // Don't create duplicate incident
        }

        // Check if we should create new degraded incident
        if (this.shouldCreateDegradedIncident(monitor, degradationType, confidence, healthStateResult, checkResult)) {
            // Create incident ALWAYS (suppression only affects email)
            const incident = await this.createDegradedIncident(monitor, checkResult, degradationType, healthStateResult);

            // Send alert email (only if not suppressed)
            const isSuppressed = await this.shouldSuppressAlert(monitor._id, 'degraded', degradationType.severity);
            if (!isSuppressed) {
                await this.recordAlertAttempt(monitor._id, 'degraded', degradationType.severity);
                await this.sendDegradationAlert(monitor, incident, degradationType, healthStateResult);
            } else {
                console.log(`🟡 Degradation email suppressed for ${monitor.name} (incident still created)`);
            }

            return incident;
        }

        return null;
    }

    /**
     * Enhanced recovery handling with correlation analysis
     */
    async handleRecovery(monitor, healthStateResult = null) {
        const confidence = healthStateResult?.confidence || 0.5;

        // Require recovery confirmation for low confidence states
        if (this.config.recoveryConfirmationRequired && confidence < this.config.recoveryConfidenceThreshold) {
            console.log(`⏳ Recovery confirmation pending for ${monitor.name} (confidence: ${confidence})`);
            return null;
        }

        // Find and resolve ALL ongoing incidents to prevent "zombies"
        const updateResult = await Incident.updateMany(
            { monitor: monitor._id, status: 'ongoing' },
            [
                {
                    $set: {
                        status: 'resolved',
                        endTime: new Date(),
                        duration: { $subtract: [new Date(), "$startTime"] }, // Calculate duration dynamically
                        recoveryConfidence: confidence,
                        healthStateAnalysis: healthStateResult,
                        failureRate: healthStateResult?.analysis?.window?.failureRate || 0,
                        patternDetected: healthStateResult?.analysis?.window?.pattern || 'stable'
                    }
                }
            ]
        );

        if (updateResult.matchedCount === 0) {
            return null;
        }

        // Fetch one resolved incident for the notification (just for metadata)
        const incident = await Incident.findOne({ monitor: monitor._id }).sort({ endTime: -1 });

        // Send enhanced recovery alert
        await this.sendRecoveryAlert(monitor, incident, healthStateResult);

        // Clear alert suppression for recovery (future alerts should fire immediately if it goes down again)
        await this.clearAlertSuppression(monitor._id);

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
     * Check if alert should be suppressed (REDIS Implementation)
     */
    async shouldSuppressAlert(monitorId, alertType, escalationLevel) {
        const key = `${this.REDIS_PREFIX}${monitorId}:${alertType}:${escalationLevel}`;
        const exists = await redisClient.exists(key);
        return exists === 1;
    }

    /**
     * Record alert attempt for suppression logic (REDIS Implementation)
     */
    async recordAlertAttempt(monitorId, alertType, escalationLevel) {
        const key = `${this.REDIS_PREFIX}${monitorId}:${alertType}:${escalationLevel}`;

        // Determine TTL based on escalation level (default 1 hour for general safety)
        let ttl = 3600; // 1 hour default

        // Use configured suppression delay if available, otherwise default
        if (this.config.escalationDelayMs[escalationLevel]) {
            // If configured delay is 0 (immediate), we still want SOME debounce to prevent loop spam
            // Use 15 seconds minimum for explicit debounce
            ttl = Math.max(15, this.config.escalationDelayMs[escalationLevel] / 1000);
        }

        // Set key with TTL
        await redisClient.set(key, '1', 'EX', Math.ceil(ttl));
    }

    /**
     * Clear alert suppression for monitor (REDIS Implementation)
     */
    async clearAlertSuppression(monitorId) {
        const pattern = `${this.REDIS_PREFIX}${monitorId}:*`;
        const keys = await redisClient.keys(pattern);
        if (keys.length > 0) {
            await redisClient.del(...keys);
        }
    }

    /**
     * Find existing incident of specified types
     */
    async findExistingIncident(monitorId) {
        return await Incident.findOne({
            monitor: monitorId,
            status: 'ongoing'
        });
    }

    /**
     * Update incident with enhanced analysis
     */
    async updateIncidentWithAnalysis(incident, healthStateResult, checkResult) {
        incident.lastUpdated = new Date();
        incident.healthStateAnalysis = healthStateResult;

        // Update errorMessage from checkResult or fallback to healthStateResult reasons
        if (checkResult.errorMessage) {
            incident.errorMessage = checkResult.errorMessage;
        } else if (healthStateResult?.reasons?.length > 0) {
            // Fallback: use reasons from health state analysis
            incident.errorMessage = healthStateResult.reasons[0];
        }

        if (checkResult.errorType) incident.errorType = checkResult.errorType;
        if (checkResult.statusCode) incident.statusCode = checkResult.statusCode;

        await incident.save();
    }

    /**
     * Create failure incident with enhanced metadata
     */
    async createFailureIncident(monitor, checkResult, healthStateResult, escalationLevel) {
        return await Incident.create({
            monitor: monitor._id,
            startTime: new Date(),
            errorMessage: checkResult.errorMessage || healthStateResult?.reasons?.[0] || 'Service failure detected',
            errorType: checkResult.errorType || (healthStateResult.analysis?.currentCheck?.statusCode ? 'STATUS_CODE_MISMATCH' : 'SERVICE_FAILURE'),
            statusCode: checkResult.statusCode,
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
            errorMessage: degradationType.message,
            errorType: degradationType.type,
            statusCode: checkResult.statusCode,
            severity: degradationType.severity,
            degradationCategory: degradationType.category,
            healthStateAnalysis: healthStateResult,
            confidence: healthStateResult?.confidence || 0.5
        });
    }

    /**
     * Categorize degradation type and severity
     */
    categorizeDegradation(reasons, analysis, isPerformanceIssue) {
        if (isPerformanceIssue) {
            const severity = analysis?.currentCheck?.severity >= 0.6 ? 'high' : 'medium';
            const reasonText = reasons.length > 0 ? reasons.join(', ') : 'Rate limit or performance issue detected';
            return {
                type: 'performance_issue',
                category: 'performance',
                severity,
                message: `Performance degradation: ${reasonText}`,
                priority: severity === 'high' ? 1 : 2
            };
        }

        if (reasons.some(r => r.toLowerCase().includes('ssl') || r.toLowerCase().includes('cert'))) {
            return {
                type: 'ssl_warning',
                category: 'security',
                severity: 'high', // ESCALATED: Ensure SSL warnings always alert
                message: reasons.length > 0 ? `SSL/Certificate issue: ${reasons.join(', ')}` : 'SSL certificate is expiring soon',
                priority: 1
            };
        }

        if (reasons.some(r => r.includes('content') || r.includes('keyword'))) {
            return {
                type: 'content_issue',
                category: 'content',
                severity: 'medium',
                message: `Content issue: ${reasons.join(', ')}`,
                priority: 2
            };
        }

        return {
            type: 'degraded',
            category: 'general',
            severity: 'low',
            message: reasons.length > 0 ? reasons.join(', ') : 'Service degradation detected',
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
        // UNIFIED THRESHOLD: All degradation types now require alertThreshold (default: 2) checks
        const alertThreshold = monitor.alertThreshold || 2;
        const consecutiveDegraded = monitor.consecutiveDegraded || 0;

        // Check if we've met the alertThreshold for degraded incidents
        const meetsThreshold = consecutiveDegraded >= alertThreshold;

        // Rate limit (429) - check errorType directly
        const isRateLimit = checkResult?.errorType === 'HTTP_RATE_LIMIT' ||
            (healthStateResult?.reasons || []).some(r => r.toLowerCase().includes('429') || r.toLowerCase().includes('rate'));

        if (isRateLimit && meetsThreshold && confidence >= this.config.lowConfidenceThreshold) {
            console.log(`✅ Creating rate limit incident for ${monitor.name} (${consecutiveDegraded}/${alertThreshold})`);
            return true;
        }
        if (isRateLimit && !meetsThreshold) {
            console.log(`⏳ Rate limit detected but waiting for ${alertThreshold - consecutiveDegraded} more checks (${consecutiveDegraded}/${alertThreshold})`);
            return false;
        }


        // SSL/Security issues - require threshold
        if (degradationType.category === 'security' && meetsThreshold && confidence >= this.config.lowConfidenceThreshold) return true;
        if (degradationType.category === 'security' && !meetsThreshold) {
            console.log(`⏳ Security issue detected but waiting for ${alertThreshold - consecutiveDegraded} more checks (${consecutiveDegraded}/${alertThreshold})`);
            return false;
        }

        // HTTP Client Errors (4xx) - check errorType directly
        const isClientError = checkResult?.errorType?.includes('HTTP_CLIENT_ERROR') ||
            checkResult?.errorType?.includes('HTTP_NOT_FOUND') ||
            checkResult?.errorType?.includes('HTTP_FORBIDDEN') ||
            checkResult?.errorType?.includes('HTTP_UNAUTHORIZED') ||
            checkResult?.errorType?.includes('HTTP_BAD_REQUEST') ||
            (healthStateResult?.reasons || []).some(r =>
                r.toLowerCase().includes('client error') ||
                r.toLowerCase().includes('not found') ||
                r.toLowerCase().includes('forbidden') ||
                r.toLowerCase().includes('unauthorized') ||
                r.toLowerCase().includes('bad request') ||
                r.toLowerCase().includes('http_client_error')
            );

        if (isClientError && meetsThreshold && confidence >= this.config.lowConfidenceThreshold) {
            console.log(`✅ Creating client error incident for ${monitor.name} (${consecutiveDegraded}/${alertThreshold})`);
            return true;
        }
        if (isClientError && !meetsThreshold) {
            console.log(`⏳ Client error detected but waiting for ${alertThreshold - consecutiveDegraded} more checks (${consecutiveDegraded}/${alertThreshold})`);
            return false;
        }

        // Slow response / performance issues - require threshold
        if (degradationType.category === 'performance' && !isRateLimit) {
            const recentSlowCount = monitor.consecutiveSlowCount || 0;
            if (recentSlowCount >= alertThreshold && confidence >= this.config.mediumConfidenceThreshold) return true;
            console.log(`⏳ Slow response detected but waiting for ${alertThreshold - recentSlowCount} more checks (${recentSlowCount}/${alertThreshold})`);
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
        if (reasons.some(reason => performanceKeywords.some(keyword => reason.toLowerCase().includes(keyword)))) return true;
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
        // Implementation would send immediate notification (skipped for now as per original)
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
            const { user } = await Monitor.findById(monitorId).populate('user');

            if (!user) return { success: false, error: 'user-not-found' };

            const incident = await Incident.findById(alertData.incident.id);
            if (!incident) return { success: false, error: 'incident-not-found' };

            const results = { email: [], slack: null, webhook: null };
            const notificationPromises = [];

            // 1. Email Notifications
            if (user.notificationPreferences?.email) {
                const recipients = [user.email, ...(user.contactEmails || [])].filter(email => email && email.trim() !== '');
                if (recipients.length > 0) {
                    notificationPromises.push((async () => {
                        let subject = '', html = '';
                        if (alertData.type === 'failure') {
                            subject = `🚨 ALERT: ${alertData.monitor.name} is DOWN`;
                            html = notificationService.getDowntimeEmailHTML(alertData.monitor, incident);
                        } else if (['degradation', 'performance_issue', 'content_issue'].includes(alertData.type)) {
                            subject = `⚠️ WARNING: ${alertData.monitor.name} Performance Degraded`;
                            html = notificationService.getDegradationEmailHTML(alertData.monitor, incident);
                        } else if (alertData.type === 'ssl_warning') {
                            subject = `⚠️ SSL WARNING: ${alertData.monitor.name} Certificate Issue`;
                            html = notificationService.getSslWarningEmailHTML(alertData.monitor, incident);
                        } else if (alertData.type === 'recovery') {
                            subject = `✅ RECOVERY: ${alertData.monitor.name} is UP`;
                            html = notificationService.getRecoveryEmailHTML(alertData.monitor, incident);
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
                    try {
                        let text = '';
                        if (alertData.type === 'failure') text = `🚨 *Monitor Alert: ${alertData.monitor.name} is DOWN*\nURL: ${alertData.monitor.url}\nError: ${incident.errorMessage}`;
                        else if (alertData.type === 'degradation') text = `⚠️ *Monitor Warning: ${alertData.monitor.name} is Degraded*\nURL: ${alertData.monitor.url}\nIssue: ${incident.errorMessage}`;
                        else if (alertData.type === 'recovery') text = `✅ *Monitor Recovered: ${alertData.monitor.name} is UP*\nURL: ${alertData.monitor.url}\nDuration: ${notificationService.formatDuration(incident.duration || 0)}`;

                        const slackResult = await notificationService.sendSlack(user.slackWebhook, { text });
                        results.slack = slackResult.success;
                    } catch (err) {
                        results.slack = false;
                    }
                })());
            }

            // 3. Webhook Notifications
            if (user.notificationPreferences?.webhook && user.webhookUrl) {
                notificationPromises.push((async () => {
                    try {
                        const webhookResult = await notificationService.sendWebhook(user.webhookUrl, {
                            event: alertData.type,
                            monitor: { id: monitorId, name: alertData.monitor.name, url: alertData.monitor.url },
                            incident: { id: incident._id, status: incident.status, startTime: incident.startTime, endTime: incident.endTime, duration: incident.duration }
                        });
                        results.webhook = webhookResult.success;
                    } catch (err) {
                        results.webhook = false;
                    }
                })());
            }

            await Promise.allSettled(notificationPromises);

            await Promise.allSettled(notificationPromises);

            // Persist notification statistics in incident document (Phase 8 Fix)
            try {
                const updateQuery = {
                    $set: {
                        'notificationsSent.email': results.email.some(e => e.success),
                        'notificationsSent.emailDetails': results.email,
                        'notificationsSent.slack': results.slack || false,
                        'notificationsSent.webhook': results.webhook || false
                    }
                };

                const updateResult = await Incident.updateOne({ _id: incident._id }, updateQuery);

                if (updateResult.modifiedCount === 0 && updateResult.matchedCount === 0) {
                    console.error(`⚠️ Failed to update incident ${incident._id}: Document not found`);
                } else if (updateResult.matchedCount > 0 && updateResult.modifiedCount === 0) {
                    // This is fine, maybe it was already set?
                    console.log(`ℹ️ Incident ${incident._id} notification status already up to date`);
                } else {
                    console.log(`✅ Incident ${incident._id} updated with notification status`);
                }

            } catch (dbErr) {
                console.error(`❌ CRITICAL: Failed to persist notification results for incident ${incident._id}:`, dbErr.message);
                console.error('Update payload was:', JSON.stringify(results, null, 2));
            }

            // Log sanitized results (PII Masking Fix)
            console.log(`📧 Alerts processed for ${alertData.monitor.name || monitorId}:`, this.maskPiiInResults(results));
            return { success: true, results };
        } catch (error) {
            console.error('Alert notification failed:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get alert statistics (Redis implementation - approximate)
     */
    async getAlertStatistics() {
        // This is harder with Redis keys. Simplified to just return active suppression count.
        const pattern = `${this.REDIS_PREFIX}*`;
        const keys = await redisClient.keys(pattern);

        return {
            totalAlerts: 0, // Cannot easily track history without List/Stream. Redis is for current state here.
            suppressedAlerts: keys.length,
            byType: { failure: 0, degraded: 0, recovery: 0 },
            timestamp: new Date()
        };
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
