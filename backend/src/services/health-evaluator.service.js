import { ERROR_TYPES } from '../utils/status-classifier.js';
import enhancedHealthEvaluator from '../utils/health-evaluator.js';
import CheckHostProvider from './providers/CheckHostProvider.js';
import SSLProvider from './providers/SSLProvider.js';
import Incident from '../models/Incident.js';
import Check from '../models/Check.js';
import axios from 'axios';
import net from 'net';
import dns from 'dns';
import dgram from 'dgram';
import { exec } from 'child_process';
import { promisify } from 'util';
import Redis from 'ioredis';
import env from '../config/env.js';

/**
 * Enhanced Health State Service
 * Industry-standard real-time health monitoring with:
 * - Multi-check window analysis for DEGRADED vs DOWN determination
 * - State history tracking with hysteresis to prevent flapping
 * - Performance baseline analysis using historical data
 * - Partial failure detection (SSL warnings, slow responses)
 * - Unknown state handling for new monitors
 * - Configurable thresholds and confirmation logic
 */

/**
 * Request Queue for serializing external API calls
 * prevents hitting rate limits (e.g. check-host.net)
 */
class RequestQueue {
    constructor(concurrency = 1, interval = 2000) {
        this.queue = [];
        this.running = 0;
        this.concurrency = concurrency;
        this.interval = interval;
    }

    add(fn) {
        return new Promise((resolve, reject) => {
            this.queue.push({ fn, resolve, reject });
            this.process();
        });
    }

    async process() {
        if (this.running >= this.concurrency || this.queue.length === 0) return;

        this.running++;
        const { fn, resolve, reject } = this.queue.shift();

        try {
            const result = await fn();
            resolve(result);
        } catch (err) {
            reject(err);
        } finally {
            // Wait before freeing the slot
            setTimeout(() => {
                this.running--;
                this.process();
            }, this.interval);
        }
    }
}

class HealthStateService {
    constructor() {
        this.io = null; // Will be set later

        // Initialize Redis Client for Streams/Caching
        this.redis = new Redis(env.REDIS_URL, {
            lazyConnect: true,
            retryStrategy: (times) => Math.min(times * 500, 2000)
        });

        // Handle redis errors
        this.redis.on('error', (err) => {
            console.warn('HealthStateService Redis Error:', err.message);
        });

        // Rate limiting for external verification APIs
        // Conservative settings to avoid check-host.net rate limits during mass verification
        this.requestQueue = new RequestQueue(3, 2500);

        // Verification cache to avoid redundant API calls for same host within 2 minutes
        this.verificationCache = new Map(); // { host: { result, timestamp } }
        this.verificationCacheTTL = 120000; // 120 seconds (2 minutes)


        // Initialize Verification Providers
        this.checkHostProvider = new CheckHostProvider();
        this.sslProvider = new SSLProvider();

        // Protocol-specific thresholds for "No-Guesswork" monitoring
        // These defaults accommodate real-world network conditions
        const PROTOCOL_THRESHOLDS = {
            HTTP: 5000,
            HTTPS: 5000,
            PING: 1500,
            TCP: 3000,
            UDP: 3000,
            DNS: 2000,
            SMTP: 3000,
            SSL: 3000
        };

        // Configuration for industry-standard behavior
        this.config = {
            // Protocol-specific thresholds (can be overridden per monitor)
            protocolThresholds: PROTOCOL_THRESHOLDS,
            defaultSlowThresholdMs: 2000, // Fallback default

            // Multi-check window analysis
            checkWindowSize: 5,              // Analyze last 5 checks for patterns
            degradedThresholdRatio: 0.6,     // 60% failure rate triggers DOWN state
            partialFailureThreshold: 0.4,    // 40% partial failures trigger DEGRADED

            // Performance baseline analysis
            baselineWindowSize: 24,          // Use last 24 checks for performance baseline
            performanceVarianceMultiplier: 2, // 2x baseline variance triggers degradation

            // State transition hysteresis (prevents flapping)
            minTimeInStateMs: 30000,         // Minimum 30 seconds in state before transition
            consecutiveChecksForRecovery: 1, // Need 1 successful check to recover from DOWN
            consecutiveChecksForDegradation: 2, // Need 2 consecutive issues to degrade

            // Unknown state configuration
            minChecksForKnownState: 3,       // Need at least 3 checks to leave UNKNOWN
            maxTimeForUnknownMs: 300000,     // Maximum 5 minutes in UNKNOWN state

            // Partial failure weights
            sslWarningWeight: 0.3,           // SSL warnings count as 30% failure
            slowResponseWeight: 0.4,         // Slow responses count as 40% failure
            contentMismatchWeight: 0.5,      // Content mismatch counts as 50% failure

            // Slow response hysteresis
            // Single slow 2xx response should NOT degrade - need consecutive slow responses
            slowResponseThresholdMs: 2000,   // Response time threshold for "slow" (default 2s)
            slowResponseConsecutiveThreshold: 2, // UNIFIED: Match alertThreshold (2 checks)
            slowResponseWindowSize: 5        // Look at last N checks for slow pattern
        };

        this.stateHistory = new Map(); // Track state transitions per monitor
    }

    /**
     * Clean up state history for a monitor (Memory Leak Fix)
     * should be called when a monitor is deleted
     */
    cleanupState(monitorId) {
        const id = monitorId.toString();
        if (this.stateHistory.has(id)) {
            this.stateHistory.delete(id);
            console.log(`[HealthStateService] Cleaned up state history for monitor: ${id}`);
        }
    }

    /**
     * Sanitize hostname/URL for check-host.net API
     * Removes protocol prefixes, trailing whitespace, and paths
     * @param {string} url - The URL or hostname to clean
     * @param {boolean} removePort - If true, also removes port suffix
     * @returns {string} Clean hostname suitable for check-host.net
     */


    /**
     * Get the appropriate slow response threshold for a monitor based on its type
     * @param {Object} monitor - The monitor object with type property
     * @returns {number} - Threshold in milliseconds
     */
    getThresholdForMonitor(monitor) {
        if (!monitor) return this.config.defaultSlowThresholdMs;

        // If monitor has explicit threshold, use it
        if (monitor.degradedThresholdMs && monitor.degradedThresholdMs > 0) {
            return monitor.degradedThresholdMs;
        }

        // Otherwise, use protocol-specific default
        const protocolType = monitor.type?.toUpperCase();
        return this.config.protocolThresholds[protocolType] || this.config.defaultSlowThresholdMs;
    }

    /**
     * Determine health state using industry-standard logic
     * @param {Object} checkResult - Latest check result from runner
     * @param {Object} monitor - Monitor configuration
     * @param {Array} recentChecks - Recent check history for analysis
     * @returns {Object} Enhanced health state with detailed analysis
     */
    async determineHealthState(checkResult, monitor, recentChecks = []) {
        const monitorId = monitor?._id?.toString() || 'default-monitor';

        // Get state history for hysteresis
        const stateHistory = this.getStateHistory(monitorId);

        // Seed initial state from history if currently unknown but history exists
        // This handles server restarts and ensures hysteresis works correctly immediately
        if (stateHistory.currentState === 'unknown' && recentChecks.length > 0) {
            const lastCheck = recentChecks[0];
            const lastStatus = lastCheck.status || (lastCheck.isUp ? 'up' : 'down');
            stateHistory.currentState = lastStatus.toLowerCase();
            stateHistory.lastStateChange = lastCheck.createdAt || new Date();
            stateHistory.consecutiveCount = 1;
        }

        // 1. Check for UNKNOWN state first
        const unknownAnalysis = this.analyzeUnknownState(monitor, recentChecks, checkResult);
        if (unknownAnalysis.isUnknown) {
            return {
                status: 'unknown',
                reasons: unknownAnalysis.reasons,
                confidence: 0.1,
                analysis: {
                    checkCount: recentChecks.length,
                    minimumRequired: this.config.minChecksForKnownState,
                    timeSinceActivation: unknownAnalysis.timeSinceActivation
                }
            };
        }

        // 2. Analyze current check result
        const currentCheckAnalysis = this.analyzeCurrentCheck(checkResult, monitor);

        // 3. Analyze performance baseline
        const baselineAnalysis = this.analyzePerformanceBaseline(recentChecks);

        // 4. Multi-check window analysis
        const windowAnalysis = this.analyzeCheckWindow(recentChecks);

        // 5. Apply state transition logic with hysteresis
        const stateDecision = this.determineStateWithHysteresis(
            currentCheckAnalysis,
            baselineAnalysis,
            windowAnalysis,
            stateHistory,
            monitor
        );

        // 6. Use the enhanced health evaluator for final determination
        const enhancedEvaluation = this.useEnhancedEvaluator(monitor, checkResult, stateDecision);

        // Combine original decision with enhanced evaluation
        const finalResult = {
            status: enhancedEvaluation.status,
            reasons: enhancedEvaluation.reasons,
            confidence: enhancedEvaluation.confidence,
            analysis: {
                currentCheck: currentCheckAnalysis,
                baseline: baselineAnalysis,
                window: windowAnalysis,
                stateTransition: stateDecision.transition,
                previousState: stateHistory.currentState,
                enhancedEvaluation,
                originalDecision: stateDecision
            }
        };

        // 7. Update state history
        this.updateStateHistory(monitorId, finalResult);



        return finalResult;
    }

    /**
     * Analyze if monitor should be in UNKNOWN state
     */
    analyzeUnknownState(monitor, recentChecks, currentCheckResult) {
        const reasons = [];
        const timeSinceActivation = Date.now() - new Date(monitor.createdAt || Date.now()).getTime();
        const hasRecentData = recentChecks.length > 0;
        const hasCurrentResult = currentCheckResult != null && (currentCheckResult.status != null || currentCheckResult.isUp !== undefined);

        // A monitor is UNKNOWN only if it lacks any definitive data (neither history nor current result)
        if (!hasRecentData && !hasCurrentResult) {
            return { isUnknown: true, reasons: ['New monitor - no checks performed yet'], timeSinceActivation };
        }

        // If we have a current result, we can leave UNKNOWN
        if (hasCurrentResult) {
            return { isUnknown: false, reasons: [], timeSinceActivation };
        }

        // Fallback for edge cases where history exists but current check is missing/invalid
        const hasEnoughData = recentChecks.length >= this.config.minChecksForKnownState;
        if (!hasEnoughData && timeSinceActivation < this.config.maxTimeForUnknownMs) {
            return {
                isUnknown: true,
                reasons: [`Insufficient data - only ${recentChecks.length} checks performed`],
                timeSinceActivation
            };
        }

        return {
            isUnknown: false,
            reasons: [],
            timeSinceActivation
        };
    }

    /**
     * Analyze current check result with detailed failure classification
     * 
     * PROBLEM 2 FIX: Single slow 2xx responses are now WARNINGS, not failures.
     * Need consecutive slow responses before marking as DEGRADED.
     */
    analyzeCurrentCheck(checkResult, monitor) {
        const analysis = {
            isCompletelyUp: checkResult.isUp === true,
            responseTimeMs: checkResult.responseTimeMs || checkResult.responseTime || 0,
            statusCode: checkResult.statusCode,
            errorType: checkResult.errorType,
            errorMessage: checkResult.errorMessage,
            issues: [],
            partialFailures: [],
            severity: 0, // 0-1 scale, 1 = complete failure
            isSlowResponse: false,
            isConsecutiveSlow: false
        };

        // Get slow response configuration using protocol-specific defaults
        const slowThreshold = this.getThresholdForMonitor(monitor);
        const slowConsecutiveThreshold = this.config.slowResponseConsecutiveThreshold;

        // Check if this is a slow response with successful status code
        // SLOW 2xx responses are NOT complete failures - they're performance warnings
        const isSlowResponse = checkResult.errorType === 'SLOW_RESPONSE' ||
            (analysis.statusCode >= 200 && analysis.statusCode < 300 &&
                analysis.responseTimeMs > slowThreshold &&
                analysis.responseTimeMs > 0);

        analysis.isSlowResponse = isSlowResponse;

        // Get state history to check for consecutive slow responses
        const monitorId = monitor?._id?.toString() || 'default-monitor';
        const stateHistory = this.getStateHistory(monitorId);

        // Ensure consecutiveSlowCount is initialized
        if (typeof monitor.consecutiveSlowCount === 'undefined') {
            monitor.consecutiveSlowCount = 0;
        }

        // Count consecutive slow responses from monitor document (Phase 6: Distributed Fix)
        const recentSlowCount = monitor.consecutiveSlowCount || 0;
        analysis.consecutiveSlowCount = recentSlowCount;

        console.log(`🔍 HEALTH CHECK: isUp=${checkResult.isUp}, errorType=${checkResult.errorType}, statusCode=${analysis.statusCode}, isSlowResponse=${isSlowResponse}, recentSlowCount=${recentSlowCount}`);

        if (isSlowResponse && analysis.statusCode >= 200 && analysis.statusCode < 300) {
            // This is a successful response that's just slow
            // FIXED: Show DEGRADED immediately on first slow check
            // Alert threshold is handled separately by enhanced-alert.service.js
            const willBeConsecutive = recentSlowCount + 1;

            console.log(`⚠️ DEGRADED: Slow response ${analysis.responseTimeMs}ms > threshold ${slowThreshold}ms`);
            analysis.isCompletelyUp = true; // The service IS responding
            analysis.severity = 0.4; // Moderate severity for slow response
            analysis.issues.push(`Slow response: ${analysis.responseTimeMs}ms (threshold: ${slowThreshold}ms)`);
            analysis.healthStateSuggestion = 'degraded';
            analysis.isConsecutiveSlow = willBeConsecutive >= slowConsecutiveThreshold;

            // Store slow count in monitor document
            monitor.consecutiveSlowCount = willBeConsecutive;

            return analysis;
        }

        // Reset slow counter if response is not slow (Phase 6: Distributed Fix)
        if (monitor.consecutiveSlowCount > 0) {
            monitor.consecutiveSlowCount = 0;
        }

        // Complete failure analysis for non-slow responses
        if (!analysis.isCompletelyUp) {
            analysis.severity = 1.0;

            if (analysis.errorType) {
                // Network-level failures (highest severity)
                if (['TIMEOUT', 'DNS_ERROR', 'CONNECTION_REFUSED', 'ECONNABORTED', 'CONNECTION_RESET', 'ECONNRESET'].includes(analysis.errorType)) {
                    analysis.severity = 0.95;
                    analysis.issues.push(`Network failure: ${analysis.errorType}`);
                }
                // SSL/TLS failures
                else if (['SSL_ERROR', 'CERT_ERROR', 'CERT_EXPIRED', 'CERT_NOT_YET_VALID', 'CERT_HOSTNAME_MISMATCH', 'SSL_UNTRUSTED_CERT', 'CERT_EXPIRING_SOON', 'SELF_SIGNED_CERT', 'WEAK_SIGNATURE'].includes(analysis.errorType)) {
                    analysis.severity = 0.9;
                    // Use the detailed error message from the worker if available
                    const issueMsg = analysis.errorMessage || `SSL/TLS failure: ${analysis.errorType}`;
                    analysis.issues.push(issueMsg);
                }
                // Application-level failures - check severity by status code
                // HTTP 5xx errors are HIGH severity (DOWN), 4xx are medium (DEGRADED)
                else if (analysis.errorType.startsWith('HTTP_')) {
                    // HTTP 5xx = Server errors = HIGH severity (DOWN)
                    if (analysis.statusCode >= 500 && analysis.statusCode < 600) {
                        analysis.severity = 0.95; // High severity for 5xx
                        analysis.issues.push(`Server error: ${analysis.errorType} (${analysis.statusCode})`);
                    }
                    // HTTP 429 = Rate Limit = Performance degradation (Medium)
                    else if (analysis.statusCode === 429) {
                        analysis.severity = 0.6; // Medium severity
                        analysis.issues.push(`Rate Limit exceeded: ${analysis.errorType} (429)`);
                        // Ensure it's treated as performance issue
                        analysis.isSlowResponse = true;
                        monitor.consecutiveSlowCount = (monitor.consecutiveSlowCount || 0) + 1; // Treat as consecutive slow?
                    }
                    // HTTP 4xx = Client errors = Client Configuration Error (DOWN)
                    // Updated to 0.9 severity to match error-classifications.js (CLIENT_ERROR = DOWN)
                    // But handled with hysteresis (awaiting confirmation) via Rule 1
                    else if (analysis.statusCode >= 400 && analysis.statusCode < 500) {
                        analysis.severity = 0.9; // High severity for 4xx (Client Error is still a failure)
                        analysis.issues.push(`Client error: ${analysis.errorType} (${analysis.statusCode})`);
                    }
                    // Other HTTP errors
                    else {
                        analysis.severity = 0.7;
                        analysis.issues.push(`Application error: ${analysis.errorType} (${analysis.statusCode})`);
                    }
                }
                // Other failures (Generic Protocol Errors)
                else {
                    analysis.severity = 0.9; // Default to High severity for any identified error type
                    analysis.issues.push(`Service error: ${analysis.errorType}`);
                }
            }
        }

        // Performance degradation analysis for non-2xx responses
        if (analysis.responseTimeMs > 0 && slowThreshold > 0) {
            if (analysis.responseTimeMs > slowThreshold && analysis.isCompletelyUp) {
                const severityMultiplier = Math.min(analysis.responseTimeMs / slowThreshold, 3);
                const performanceSeverity = Math.min(severityMultiplier * 0.4, 0.6);
                analysis.severity = Math.max(analysis.severity, performanceSeverity);
                analysis.issues.push(`Slow response: ${analysis.responseTimeMs}ms (threshold: ${slowThreshold}ms)`);
                console.log(`⚠️ DEGRADED: Response ${analysis.responseTimeMs}ms > threshold ${slowThreshold}ms`);
            } else if (analysis.isCompletelyUp) {
                // Check if this is a 429 Rate Limit response (regardless of speed)
                if (checkResult.statusCode === 429 || analysis.errorType === 'HTTP_RATE_LIMIT') {
                    analysis.severity = Math.max(analysis.severity, 0.6);
                    analysis.issues.push(`Rate Limit exceeded: Too Many Requests (429)`);
                    console.log(`⚠️ DEGRADED: Rate Limit (429) detected`);
                } else {
                    console.log(`✅ RESPONSE TIME OK: Response ${slowThreshold}ms > ${analysis.responseTimeMs}ms`);
                }
            }
        }

        // SSL warning analysis (partial failure)
        const sslWarning = checkResult.warning || (checkResult.meta && checkResult.meta.warning);
        if (sslWarning && typeof sslWarning === 'string') {
            analysis.partialFailures.push({
                type: 'SSL_WARNING',
                message: sslWarning,
                weight: this.config.sslWarningWeight || 0.4,
                severity: 0.5 // Higher severity for security warnings
            });
            analysis.issues.push(`SSL warning: ${sslWarning}`);
        }

        // Content mismatch analysis (partial failure)
        if (analysis.errorType === 'KEYWORD_MISMATCH') {
            analysis.partialFailures.push({
                type: 'CONTENT_MISMATCH',
                message: analysis.errorMessage,
                weight: this.config.contentMismatchWeight,
                severity: 0.4
            });
            analysis.issues.push('Content mismatch detected');
        }

        // Expected status code mismatch (partial failure)
        if (monitor.expectedStatusCode && analysis.statusCode !== monitor.expectedStatusCode) {
            analysis.partialFailures.push({
                type: 'STATUS_CODE_MISMATCH',
                message: `Expected ${monitor.expectedStatusCode}, got ${analysis.statusCode}`,
                weight: 1.0,
                severity: 1.0
            });
            analysis.issues.push(`Unexpected status code: ${analysis.statusCode}`);
        }

        // Fallback: If no specific issues found but check failed
        if (!analysis.isCompletelyUp && analysis.issues.length === 0) {
            analysis.issues.push('Unknown service failure');
        }

        return analysis;
    }

    /**
     * Analyze performance baseline from historical data
     */
    analyzePerformanceBaseline(recentChecks) {
        if (recentChecks.length < 3) {
            return {
                hasBaseline: false,
                baselineResponseTime: 0,
                variance: 0,
                isStable: false,
                reliabilityScore: 0,
                trend: 'insufficient_data'
            };
        }

        // Filter successful checks for baseline calculation
        const successfulChecks = recentChecks
            .filter(check => (check.isUp || check.status === 'up' || check.status === 'UP') && (check.responseTime || check.responseTimeMs))
            .slice(0, this.config.baselineWindowSize);

        if (successfulChecks.length === 0) {
            return {
                hasBaseline: false,
                baselineResponseTime: 0,
                variance: 0,
                isStable: false,
                reliabilityScore: 0,
                trend: 'no_successful_checks'
            };
        }

        const responseTimes = successfulChecks.map(check => check.responseTime);

        // Calculate baseline metrics
        const baselineResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
        const variance = responseTimes.reduce((sum, time) => sum + Math.pow(time - baselineResponseTime, 2), 0) / responseTimes.length;
        const standardDeviation = Math.sqrt(variance);

        // Calculate reliability score
        const totalChecks = recentChecks.length;
        const reliabilityScore = recentChecks.filter(check => check.isUp || check.status === 'up' || check.status === 'UP').length / totalChecks;

        // Determine stability (coefficient of variation < 50% is considered stable)
        const coefficientOfVariation = standardDeviation / baselineResponseTime;
        const isStable = coefficientOfVariation < 0.5 && reliabilityScore > 0.8;

        // Calculate trend (improving, degrading, stable)
        let trend = 'stable';
        if (responseTimes.length >= 5) {
            const recentAvg = responseTimes.slice(0, Math.floor(responseTimes.length / 2)).reduce((sum, time) => sum + time, 0) / Math.floor(responseTimes.length / 2);
            const olderAvg = responseTimes.slice(Math.floor(responseTimes.length / 2)).reduce((sum, time) => sum + time, 0) / Math.ceil(responseTimes.length / 2);

            if (recentAvg < olderAvg * 0.9) {
                trend = 'improving';
            } else if (recentAvg > olderAvg * 1.1) {
                trend = 'degrading';
            }
        }

        return {
            hasBaseline: true,
            baselineResponseTime,
            variance,
            standardDeviation,
            isStable,
            reliabilityScore,
            trend,
            sampleSize: successfulChecks.length
        };
    }

    /**
     * Multi-check window analysis for pattern detection
     */
    analyzeCheckWindow(recentChecks) {
        const windowSize = Math.min(this.config.checkWindowSize, recentChecks.length);
        const windowChecks = recentChecks.slice(-windowSize);

        if (windowChecks.length === 0) {
            return {
                windowSize: 0,
                totalChecks: 0,
                upCount: 0,
                degradedCount: 0,
                downCount: 0,
                failureWeight: 0,
                degradationWeight: 0,
                failureRate: 0,
                shouldBeDown: false,
                shouldBeDegraded: false,
                pattern: 'no_data'
            };
        }

        let failureWeight = 0;
        let degradationWeight = 0;

        // Analyze checks with exponential decay (recent checks weighted more)
        windowChecks.forEach((check, index) => {
            const weight = Math.pow(0.8, (windowSize - index - 1)); // Recent checks have higher weight

            switch (check.status) {
                case 'down':
                    failureWeight += weight;
                    break;
                case 'degraded':
                    degradationWeight += weight * 0.5; // Degraded counts as half failure
                    break;
                case 'up':
                    // Successful checks reduce failure weight
                    failureWeight -= weight * 0.1;
                    break;
            }
        });

        const totalWeight = windowChecks.reduce((sum, _, index) => sum + Math.pow(0.8, (windowSize - index - 1)), 0);
        const failureRate = Math.max(0, failureWeight / totalWeight);
        const degradationRate = Math.max(0, degradationWeight / totalWeight);

        // Determine state based on thresholds
        const shouldBeDown = failureRate >= this.config.degradedThresholdRatio;
        const shouldBeDegraded = degradationRate >= 0.3 || failureRate >= 0.2;

        // Pattern detection
        let pattern = 'stable';
        if (windowChecks.length >= 3) {
            const recentStatuses = windowChecks.slice(-3).map(c => c.status);
            if (recentStatuses.every(status => status === 'down')) {
                pattern = 'consistently_down';
            } else if (recentStatuses.every(status => status === 'up')) {
                pattern = 'consistently_up';
            } else if (recentStatuses.includes('down') && recentStatuses.includes('up')) {
                pattern = 'flapping';
            } else if (recentStatuses.includes('degraded')) {
                pattern = 'degraded_pattern';
            }
        }

        return {
            windowSize,
            totalChecks: windowChecks.length,
            upCount: windowChecks.filter(c => c.status === 'up').length,
            degradedCount: windowChecks.filter(c => c.status === 'degraded').length,
            downCount: windowChecks.filter(c => c.status === 'down').length,
            failureWeight,
            degradationWeight,
            failureRate,
            degradationRate,
            shouldBeDown,
            shouldBeDegraded,
            pattern
        };
    }

    /**
     * Determine state with hysteresis to prevent flapping
     */
    determineStateWithHysteresis(currentCheck, baseline, window, stateHistory, monitor) {
        const previousState = stateHistory.currentState || 'unknown';
        const timeInPreviousState = Date.now() - (stateHistory.lastStateChange || Date.now());
        const consecutiveSameState = stateHistory.consecutiveCount || 0;

        let targetState = 'up';
        let reasons = ['All checks passing within thresholds'];
        let confidence = 0.95;
        let transition = { from: previousState, to: targetState, reason: '' };

        // PROBLEM 2 FIX: Respect slow response suggestion from analyzeCurrentCheck
        // Single slow response = UP with warning, NOT DEGRADED
        if (currentCheck.healthStateSuggestion === 'up' && currentCheck.isSlowWarning) {
            targetState = 'up';
            reasons = ['Single slow response detected (warning only)'];
            confidence = 0.9;
            transition = {
                from: previousState,
                to: targetState,
                reason: 'Slow response warning - maintaining UP status',
                preventedFlapping: false
            };

            // Update state history
            stateHistory.currentState = targetState;
            stateHistory.lastStateChange = Date.now();
            stateHistory.consecutiveCount = 1;

            return {
                status: targetState,
                reasons,
                confidence,
                transition
            };
        }

        // Rule 1: Complete failure (DOWN) - Highest priority
        // FIXED: Show correct status immediately on first check
        // Alert threshold is handled separately by enhanced-alert.service.js
        if (currentCheck.severity >= 0.9) {
            // Severe errors go directly to DOWN (correct status on first check)
            // Incident/alert creation is controlled by alertThreshold separately
            targetState = 'down';
            reasons = currentCheck.issues.length > 0 ? currentCheck.issues : ['Complete service failure detected'];
            confidence = 0.95;
        }
        // Rule 2: Multi-check window indicates DOWN
        // BUT: Skip this rule if current check is successful (slow response with 2xx is NOT a failure)
        else if (window.shouldBeDown && !currentCheck.isCompletelyUp) {
            targetState = 'down';
            reasons = [`${Math.round(window.failureRate * 100)}% failure rate in last ${window.windowSize} checks (pattern: ${window.pattern})`];
            confidence = 0.9;
        }
        // Rule 3: Performance degradation based on baseline (Only if baseline exists)
        // FIX: Only apply baseline degradation if current check isn't perfectly healthy
        else if (baseline.hasBaseline && (!baseline.isStable || baseline.reliabilityScore < 0.8) && !currentCheck.isCompletelyUp) {
            targetState = 'degraded';
            reasons = [
                `Performance instability detected (reliability: ${Math.round(baseline.reliabilityScore * 100)}%)`,
                baseline.trend === 'degrading' ? 'Performance trend: degrading' : 'High performance variance'
            ];
            confidence = 0.8;
        }
        // Rule 4: Current check has partial failures or soft failures
        // FIX: Only apply window degradation if current check isn't perfectly healthy
        // This prevents "sticky" degradation where history overrides a perfect current check
        else if (currentCheck.partialFailures?.length > 0 || currentCheck.issues?.length > 0 || (window.shouldBeDegraded && !currentCheck.isCompletelyUp)) {
            targetState = 'degraded';
            reasons = currentCheck.issues.length > 0 ? currentCheck.issues : ['Performance degradation detected (historical pattern)'];
            confidence = 0.8;
        }
        // Rule 5: Service is healthy
        else {
            targetState = 'up';
            reasons = ['All checks passing within normal parameters'];
            confidence = 0.95;
        }

        // Apply hysteresis for state transitions
        const confirmedThreshold = monitor.alertThreshold || this.config.consecutiveChecksForDegradation;
        const hysteresisResult = this.applyHysteresis(
            targetState,
            previousState,
            timeInPreviousState,
            consecutiveSameState,
            currentCheck,
            window,
            confirmedThreshold,
            monitor
        );

        // Prioritize diagnostic reasons, but include transition info if state was modified
        let finalReasons = reasons;
        if (targetState !== hysteresisResult.status) {
            // If hysteresis changed the state/decision, keep the original issues but add the hysteresis reason
            finalReasons = [...reasons, ...hysteresisResult.reasons];
        }

        return {
            status: hysteresisResult.status,
            reasons: finalReasons,
            confidence: (hysteresisResult.confidence > confidence) ? hysteresisResult.confidence : Math.min(confidence, hysteresisResult.confidence),
            transition: {
                ...transition,
                to: hysteresisResult.status,
                reason: hysteresisResult.transitionReason,
                preventedFlapping: hysteresisResult.preventedFlapping
            }
        };
    }

    /**
     * Apply hysteresis logic to prevent state flapping
     */
    applyHysteresis(targetState, previousState, timeInState, consecutiveCount, currentCheck, window, confirmedThreshold, monitor) {
        // Default configuration
        const minTimeInState = this.config.minTimeInStateMs || 30000;

        // If state represents a persistent failure, be stickier
        if (targetState === previousState) {
            return {
                status: targetState,
                reasons: targetState === 'up' ? ['Healthy'] : ['Continuing in current state'],
                confidence: 1.0,
                transitionReason: 'No change',
                preventedFlapping: false
            };
        }

        // UNKNOWN -> ANY: Allow immediate transition
        if (previousState === 'unknown') {
            return {
                status: targetState,
                reasons: [`Initial state: ${targetState}`],
                confidence: 0.9,
                transitionReason: 'Initial check',
                preventedFlapping: false
            };
        }

        // UP -> DEGRADED: Check threshold
        if (previousState === 'up' && targetState === 'degraded' && consecutiveCount < confirmedThreshold) {
            return {
                status: previousState, // Stay UP
                reasons: [`Potential degradation detected, awaiting confirmation (${consecutiveCount + 1}/${confirmedThreshold})`],
                confidence: 0.6,
                transitionReason: `Hysteresis: Need ${confirmedThreshold} consecutive issues`,
                preventedFlapping: true
            };
        }

        // UP -> DOWN: Need strong evidence
        // If it's a timeout or connection refused, we might want fast failure
        // But generally we want at least 1 confirmation to assume transient network blip
        if (previousState === 'up' && targetState === 'down') {
            // Immediate failure for critical errors if configured, otherwise require confirmation
            // Default: Require 2 consecutive failures
            if (consecutiveCount < confirmedThreshold) {
                return {
                    status: previousState, // Stay UP
                    reasons: ['Service glitch detected, awaiting confirmation'],
                    confidence: 0.7,
                    transitionReason: `Hysteresis: Need ${confirmedThreshold} consecutive failures (${consecutiveCount + 1}/${confirmedThreshold})`,
                    preventedFlapping: true
                };
            }
        }

        // DEGRADED -> DOWN: Need confirmation
        if (previousState === 'degraded' && targetState === 'down') {
            if (consecutiveCount < confirmedThreshold) {
                return {
                    status: previousState, // Stay DEGRADED
                    reasons: ['Service degradation detected, awaiting confirmation for DOWN state'],
                    confidence: 0.7,
                    transitionReason: `Hysteresis: Need ${confirmedThreshold} consecutive issues (${consecutiveCount + 1}/${confirmedThreshold})`,
                    preventedFlapping: true
                };
            }
        }

        // DEGRADED -> UP: Need confirmation
        if ((previousState === 'down' || previousState === 'degraded') && targetState === 'up') {
            // FAST TRACK: If current check is excellent (perfect health), allow immediate recovery
            // "Excellent" = Completely UP + Latency well below threshold (e.g. < 50%)
            const threshold = monitor && monitor.expectedResponseTime ? monitor.expectedResponseTime : 1000;
            const isExcellent = currentCheck.isCompletelyUp &&
                (currentCheck.latency < threshold * 0.8) &&
                currentCheck.issues.length === 0;

            if (isExcellent) {
                return {
                    status: 'up',
                    reasons: ['Fast Track: Excellent health detected, recovering immediately'],
                    confidence: 0.95,
                    transitionReason: 'Fast Track Recovery',
                    preventedFlapping: false
                };
            }

            // Standard Hysteresis
            if (consecutiveCount < this.config.consecutiveChecksForRecovery) {
                return {
                    status: previousState, // Stay in previous state
                    reasons: [`Partial recovery detected, need ${this.config.consecutiveChecksForRecovery - consecutiveCount} more healthy checks`],
                    confidence: 0.6,
                    transitionReason: `Hysteresis: Recovery confirmation required (${consecutiveCount}/${this.config.consecutiveChecksForRecovery})`,
                    preventedFlapping: true
                };
            }
        }

        // DEGRADED <-> DOWN: Allow transition with some protection
        if (((previousState === 'degraded' && targetState === 'down') ||
            (previousState === 'down' && targetState === 'degraded')) && timeInState < minTimeInState / 2) {
            return {
                status: previousState, // Stay in previous state
                reasons: ['State transition too rapid, preventing flapping'],
                confidence: 0.5,
                transitionReason: `Hysteresis: Rapid state change prevented`,
            };
        }

        // Check if the current check has rate limit issues
        const isRateLimit = currentCheck.statusCode === 429 ||
            (currentCheck.issues && currentCheck.issues.some(i => i.includes('429') || i.includes('Rate Limit')));

        if (targetState === 'degraded' && isRateLimit) {
            return {
                status: 'degraded',
                reasons: ['Explicit Rate Limit (429) detected'],
                confidence: 0.9, // High confidence for explicit Rate Limit
                transitionReason: 'Explicit Rate Limit (429) detected',
                preventedFlapping: false
            };
        }

        // Allow the transition
        // FLAPPING SUPPRESSION CHECK (Phase 8 Fix)
        // Check if the monitor is oscillating rapidly between states
        // Definition: > 4 state changes in last 10 minutes
        const isFlapping = this.checkFlapping(monitor._id);
        if (isFlapping && targetState !== previousState) {
            return {
                status: 'degraded', // Force to degraded if flapping
                reasons: ['Flapping detected: unstable connection (oscillating states)'],
                confidence: 0.6,
                transitionReason: 'Flapping Suppression',
                preventedFlapping: true
            };
        }

        return {
            status: targetState,
            reasons: [`State transition: ${previousState} → ${targetState}`],
            confidence: 0.8,
            transitionReason: `Hysteresis: Valid state transition`,
            preventedFlapping: false
        };
    }

    /**
     * Check if a monitor is flapping (rapid state changes)
     * @param {string} monitorId
     * @returns {boolean}
     */
    checkFlapping(monitorId) {
        if (!this.stateHistory.has(monitorId)) return false;

        const history = this.stateHistory.get(monitorId);
        if (!history.stateChanges || history.stateChanges.length < 5) return false;

        // Check last 5 changes
        const now = Date.now();
        const lookbackWindow = 10 * 60 * 1000; // 10 minutes

        // Count changes in window
        let changesInWindow = 0;
        for (let i = history.stateChanges.length - 1; i >= 0; i--) {
            const change = history.stateChanges[i];
            if (now - new Date(change.timestamp).getTime() < lookbackWindow) {
                changesInWindow++;
            } else {
                break;
            }
        }

        // If > 4 changes in 10 mins, it's flapping
        return changesInWindow >= 4;
    }

    /**
     * Get state history for monitor
     */
    getStateHistory(monitorId) {
        if (!this.stateHistory.has(monitorId)) {
            this.stateHistory.set(monitorId, {
                currentState: 'unknown',
                lastStateChange: Date.now(),
                consecutiveCount: 0,
                stateChanges: [],
                createdAt: Date.now()
            });
        }
        return this.stateHistory.get(monitorId);
    }

    /**
     * Update state history after state determination
     */
    updateStateHistory(monitorId, stateDecision) {
        const history = this.getStateHistory(monitorId);
        const now = Date.now();

        if (history.currentState === stateDecision.status) {
            history.consecutiveCount++;
        } else {
            // Safe access to transition reason - may not exist for all state decisions
            const transitionReason = stateDecision.transition?.reason ||
                (stateDecision.reasons && stateDecision.reasons.length > 0 ? stateDecision.reasons[0] : 'State changed');
            const preventedFlapping = stateDecision.transition?.preventedFlapping || false;

            // Ensure stateChanges array exists
            if (!history.stateChanges) {
                history.stateChanges = [];
            }

            // Log state change
            history.stateChanges.push({
                from: history.currentState,
                to: stateDecision.status,
                timestamp: new Date(now),
                reason: transitionReason,
                preventedFlapping: preventedFlapping
            });

            // Keep only last 10 state changes
            if (history.stateChanges.length > 10) {
                history.stateChanges = history.stateChanges.slice(-10);
            }

            history.currentState = stateDecision.status;
            history.lastStateChange = now;
            history.consecutiveCount = 1;
        }

        this.stateHistory.set(monitorId, history);
    }

    /**
     * Clear state history (useful for testing or monitor deletion)
     */
    clearStateHistory(monitorId) {
        this.stateHistory.delete(monitorId);
    }

    /**
     * Get health statistics for monitoring and reporting
     */
    async getHealthStatistics(monitorId, timeRangeHours = 24) {
        const history = this.getStateHistory(monitorId);
        const now = Date.now();
        const timeLimit = now - (timeRangeHours * 3600000);

        const recentTransitions = history.stateChanges.filter(c => c.timestamp.getTime() > timeLimit);

        return {
            monitorId,
            currentState: history.currentState,
            lastStateChange: history.lastStateChange,
            timeInStateMinutes: Math.floor((now - history.lastStateChange) / 60000),
            consecutiveCount: history.consecutiveCount,
            totalStateChanges24h: recentTransitions.length,
            uptimeScore: history.currentState === 'up' ? 1.0 : 0.0 // Simplified for now
        };
    }

    /**
     * Use the enhanced health evaluator for final determination
     * @param {Object} monitor - The monitor configuration
     * @param {Object} checkResult - The raw check result
     * @param {Object} stateDecision - The original state decision
     */
    useEnhancedEvaluator(monitor, checkResult, stateDecision) {
        try {
            // Use the enhanced health evaluator
            const evaluation = enhancedHealthEvaluator.evaluate(checkResult, monitor);

            // Return the evaluation result, but respect upstream confidence override (e.g. from Hysteresis)
            // Return the evaluation result, but respect upstream status and confidence (Hysteresis)
            // CRITICAL FIX: Use stateDecision.status as it includes hysteresis/threshold logic
            return {
                status: stateDecision.status,
                reasons: stateDecision.reasons && stateDecision.reasons.length > 0 ? stateDecision.reasons : (evaluation.reasons || []),
                confidence: Math.max(evaluation.confidence, stateDecision.confidence || 0),
                errorType: evaluation.errorType,
                message: evaluation.message,
                severity: evaluation.severity,
                analysis: evaluation.analysis
            };
        } catch (error) {
            // Fallback to original decision if enhanced evaluator fails
            console.error('Enhanced evaluator failed, using original decision:', error.message);
            return {
                status: stateDecision.status,
                reasons: stateDecision.reasons,
                confidence: stateDecision.confidence,
                errorType: stateDecision.status === 'down' ? 'HEALTH_EVALUATION_ERROR' : null,
                message: 'Health evaluation error, using original assessment',
                severity: 'WARNING',
                analysis: { fallback: true, original: stateDecision }
            };
        }
    }

    /**
     * Trigger immediate verification from multiple locations
     * @param {Object} monitor - The monitor that failed
     * @param {Object} checkResult - The failing check result
     * @param {Object} healthResult - The health determination result
     * @param {string} checkId - The ID of the check that triggered verification
     */
    async triggerImmediateVerification(monitor, checkResult, healthResult, checkId = null) {
        // Safety check: ensure monitor exists (may have been deleted during check execution)
        if (!monitor || !monitor._id) {
            console.warn('⚠️ Verification skipped: Monitor object invalid or deleted');
            return;
        }

        const verificationId = `${monitor._id}-${Date.now()}`;

        // Track this verification to prevent duplicates
        this.verificationQueue = this.verificationQueue || new Map();
        this.verificationQueue.set(verificationId, {
            monitorId: monitor._id,
            createdAt: Date.now(),
            originalResult: healthResult,
            attempts: []
        });

        const monitorType = (monitor.type || 'HTTPS').toUpperCase();

        // Use ssl-checker.io for SSL monitors (real certificate validation)
        if (monitorType === 'SSL') {
            console.log(`🔐 Starting SSL verification via ssl-checker.io for ${monitor.name} (${monitor.url})`);
        } else {
            console.log(`🌍 Starting GLOBAL verification via check-host.net for ${monitor.name} (${monitor.url})`);
        }

        try {
            // Use ssl-checker.io for SSL monitors, check-host.net for others
            let globalResults;

            // Extract host + path for cache key (path-specific caching)
            let cacheKey;
            try {
                const urlObj = new URL(monitor.url.startsWith('http') ? monitor.url : `https://${monitor.url}`);
                // Include pathname to differentiate /status/200 from /status/429
                cacheKey = `${monitorType}:${urlObj.hostname}${urlObj.pathname}`;
            } catch {
                cacheKey = `${monitorType}:${monitor.url}`;
            }

            // Check verification cache first (avoid redundant API calls)
            const cached = this.verificationCache.get(cacheKey);
            if (cached && (Date.now() - cached.timestamp) < this.verificationCacheTTL) {
                console.log(`⚡ Using cached verification result for ${cacheKey} (${Math.round((Date.now() - cached.timestamp) / 1000)}s old)`);
                globalResults = cached.result;
            } else if (monitorType === 'SSL') {
                globalResults = await this.sslProvider.verify(monitor);
                // Cache the result
                this.verificationCache.set(cacheKey, { result: globalResults, timestamp: Date.now() });
            } else {
                // Use request queue for check-host.net to avoid rate limits
                // Queue handles concurrency (5) and delay (1.5s) for faster verification
                globalResults = await this.requestQueue.add(() => this.checkHostProvider.verify(monitor));
                // Cache the result
                this.verificationCache.set(cacheKey, { result: globalResults, timestamp: Date.now() });
            }

            if (!globalResults || globalResults.length === 0) {
                console.log(`⚠️ Verification API returned no results, using local fallback`);
                // Fallback to local verification
                const localResult = await this.performRemoteVerification(monitor, 'Local Fallback', false, 0);

                // Wrap in array to match globalResults structure
                globalResults = [{
                    nodeId: 'local-fallback',
                    location: 'Local (Fallback)',
                    country: 'Local',
                    city: 'Local',
                    isUp: localResult.isUp,
                    responseTime: localResult.responseTime,
                    statusCode: localResult.statusCode,
                    error: localResult.error,
                    timestamp: localResult.timestamp
                }];
                // Continue to processing...
            }

            // Extract location names for display
            const verificationLocations = globalResults.map(r => r.location);

            // Log each global result
            globalResults.forEach(r => {
                console.log(`   🌍 [${r.location}] ${r.country} → ${r.isUp ? '✅ UP' : '❌ DOWN'} (${r.responseTime}ms)`);
            });

            // Determine final state based on verification results
            const successfulCount = globalResults.filter(v => v.isUp).length;
            const totalCount = globalResults.length;

            // Determine alert type prefix based on current health status
            const isOutage = healthResult.status === 'down';
            const alertPrefix = isOutage ? 'Global Outage' : 'Global Performance Issue';
            const partialPrefix = isOutage ? 'Partial Outage' : 'Local Performance Issue';

            // If majority of locations confirm the failure, it's a global issue
            if (successfulCount === 0) {
                // Global outage - all locations confirm the failure
                let finalMsg = `${alertPrefix}: ${healthResult.reasons?.[0] || 'Service unavailable'} confirmed by all ${totalCount} locations.`;

                // Adjust message if falling back to local verification
                if (totalCount === 1 && verificationLocations[0].includes('Local')) {
                    finalMsg = `Service Failure: ${healthResult.reasons?.[0] || 'Service unavailable'} confirmed by Local Verification (Global Check Failed).`;
                }

                this.publishAlert(monitor, {
                    type: 'ALERT',
                    level: isOutage ? 'CRITICAL' : 'WARNING',
                    msg: finalMsg,
                    monitor: monitor.name,
                    status: healthResult.status,
                    locations: verificationLocations,
                    verifiedAt: new Date().toISOString()
                });
            } else if (successfulCount < totalCount / 2) {
                // Partial outage - some locations confirm, some don't
                this.publishAlert(monitor, {
                    type: 'ALERT',
                    level: 'WARNING',
                    msg: `${partialPrefix}: ${healthResult.reasons?.[0] || 'Service degraded'} confirmed in ${totalCount - successfulCount}/${totalCount} locations.`,
                    monitor: monitor.name,
                    status: healthResult.status,
                    locations: verificationLocations,
                    verifiedAt: new Date().toISOString()
                });
            } else {
                // Regional routing issue - most locations are fine
                this.publishAlert(monitor, {
                    type: 'ALERT',
                    level: 'INFO',
                    msg: `Routing Issue: ${healthResult.reasons?.[0] || 'Service issue'} detected only in origin location, not confirmed by ${successfulCount}/${totalCount} verification locations.`,
                    monitor: monitor.name,
                    status: healthResult.status,
                    locations: verificationLocations,
                    verifiedAt: new Date().toISOString()
                });
            }

            // PERSIST: Save verification results to the ongoing incident
            try {
                let ongoingIncident = null;
                let retries = 0;
                while (!ongoingIncident && retries < 6) {
                    ongoingIncident = await Incident.findOne({ monitor: monitor._id, status: 'ongoing' });
                    if (!ongoingIncident) {
                        await new Promise(resolve => setTimeout(resolve, 500));
                        retries++;
                    }
                }

                if (ongoingIncident) {
                    ongoingIncident.verifications = globalResults.map(r => ({
                        location: r.location,
                        country: r.country,
                        isUp: r.isUp,
                        responseTime: r.responseTime,
                        statusCode: r.statusCode,
                        timestamp: new Date(),
                        errorMessage: r.error || null
                    }));
                    await ongoingIncident.save();
                    console.log(`✅ Saved ${ongoingIncident.verifications.length} global verification results to incident ${ongoingIncident._id}`);
                }

                // PERSIST to Check document if provided
                if (checkId) {
                    const checkDoc = await Check.findById(checkId);
                    if (checkDoc) {
                        checkDoc.verifications = globalResults.map(r => ({
                            location: r.location,
                            country: r.country,
                            isUp: r.isUp,
                            responseTime: r.responseTime,
                            statusCode: r.statusCode,
                            errorMessage: r.error || null
                        }));
                        await checkDoc.save();
                        console.log(`✅ Saved global verification results to check ${checkId}`);

                        // Emit socket event to update UI in real-time
                        // OLD: Pub/Sub (Fire and forget, improved with streams below)
                        // this.redis.publish('monitor_updates', JSON.stringify({ ... }));

                        // NEW: Redis Streams (Reliable Delivery)
                        // Add to stream with specific ID '*' (auto-generated)
                        // Max length 10000 to prevent infinite growth
                        try {
                            await this.redis.xadd(
                                'monitor_updates_stream',
                                'MAXLEN', '~', 10000,
                                '*',
                                'userId', monitor.user._id.toString(),
                                'monitorId', monitor._id.toString(),
                                'data', JSON.stringify({
                                    monitorId: monitor._id,
                                    status: monitor.status,
                                    check: checkDoc.toObject()
                                })
                            );
                        } catch (streamErr) {
                            console.error('Failed to add to Redis Stream:', streamErr.message);
                            // Fallback to direct emit if local (optional, but good for redundancy)
                            if (this.io) {
                                this.io.to(`user_${monitor.user._id.toString()}`).emit('monitor_update', {
                                    monitorId: monitor._id,
                                    status: monitor.status,
                                    check: checkDoc.toObject()
                                });
                            }
                        }
                    }
                }
            } catch (dbErr) {
                console.error('Failed to save verification results:', dbErr.message);
            }

        } catch (err) {
            console.error(`❌ Global verification failed for ${monitor.name}:`, err.message);
        }

        // Clean up old verifications
        setTimeout(() => {
            this.verificationQueue.delete(verificationId);
        }, 300000);
    }

    /**
     * Perform global verification using check-host.net API
     * @param {Object} monitor - The monitor to verify
     * @returns {Array} Array of verification results from global locations
     */


    /**
     * Perform SSL certificate verification using ssl-checker.io API
     * Real-time SSL certificate validation with full details
     * @param {Object} monitor - The SSL monitor to verify
     * @returns {Array} Array of SSL verification results
     */


    /**
     * Perform REAL verification check to the target
     * Makes actual HTTP/TCP/DNS requests instead of simulation
     * @param {Object} monitor - The monitor to verify
     * @param {string} location - The verification attempt label (Retry 1, Retry 2, etc.)
     * @param {boolean} originalIsUp - Original check result
     * @param {number} originalResponseTime - Original response time
     */
    async performRemoteVerification(monitor, location, originalIsUp = false, originalResponseTime = 0) {
        const startTime = Date.now();
        const timeout = Math.min(monitor.timeout || 10000, 15000); // Max 15s for verification

        try {
            const monitorType = (monitor.type || 'HTTPS').toUpperCase();

            // HTTP/HTTPS verification - Real HTTP request
            if (monitorType === 'HTTP' || monitorType === 'HTTPS') {
                const response = await axios.get(monitor.url, {
                    timeout: timeout,
                    validateStatus: () => true, // Accept all status codes
                    maxRedirects: 5,
                    headers: {
                        'User-Agent': `SentinelVerify/1.0 (${location})`,
                        'Accept': '*/*'
                    }
                });

                const responseTime = Date.now() - startTime;
                const isUp = response.status >= 200 && response.status < 400;

                console.log(`   🌍 [${location}] ${monitor.url} → ${response.status} (${responseTime}ms) ${isUp ? '✅' : '❌'}`);

                return {
                    location,
                    isUp,
                    responseTime,
                    statusCode: response.status,
                    timestamp: new Date().toISOString(),
                    success: true,
                    real: true // Flag indicating this is a real check
                };
            }

            // TCP verification - Real socket connection
            if (monitorType === 'TCP') {
                const isUp = await this.performTcpCheck(monitor.url, monitor.port, timeout);
                const responseTime = Date.now() - startTime;
                const hostname = this.checkHostProvider.sanitizeHostForCheckHost(monitor.url, true);
                console.log(`   🌍 [${location}] TCP ${hostname}:${monitor.port || 80} → ${isUp ? 'Connected ✅' : 'Failed ❌'} (${responseTime}ms)`);

                return {
                    location,
                    isUp,
                    responseTime,
                    statusCode: null,
                    timestamp: new Date().toISOString(),
                    success: true,
                    real: true
                };
            }

            // DNS verification - Real DNS lookup
            if (monitorType === 'DNS') {
                const isUp = await this.performDnsCheck(monitor.url, timeout);
                const responseTime = Date.now() - startTime;

                console.log(`   🌍 [${location}] DNS ${monitor.url} → ${isUp ? 'Resolved ✅' : 'Failed ❌'} (${responseTime}ms)`);

                return {
                    location,
                    isUp,
                    responseTime,
                    statusCode: null,
                    timestamp: new Date().toISOString(),
                    success: true,
                    real: true
                };
            }

            // SSL verification - Check certificate
            if (monitorType === 'SSL') {
                // For SSL, we do an HTTPS request and check if connection succeeds
                try {
                    const sslUrl = monitor.url.startsWith('https://') ? monitor.url : `https://${monitor.url}`;
                    await axios.get(sslUrl, {
                        timeout: timeout,
                        validateStatus: () => true,
                        httpsAgent: new (await import('https')).Agent({
                            rejectUnauthorized: true // Reject invalid certs
                        })
                    });
                    const responseTime = Date.now() - startTime;
                    console.log(`   🌍 [${location}] SSL ${monitor.url} → Valid ✅ (${responseTime}ms)`);
                    return { location, isUp: true, responseTime, success: true, real: true, timestamp: new Date().toISOString() };
                } catch (sslErr) {
                    const responseTime = Date.now() - startTime;
                    const isExpired = sslErr.message?.includes('expired') || sslErr.code === 'CERT_HAS_EXPIRED';
                    console.log(`   🌍 [${location}] SSL ${monitor.url} → ${isExpired ? 'Expired' : 'Error'} ❌ (${responseTime}ms)`);
                    return { location, isUp: false, responseTime, error: sslErr.message, success: true, real: true, timestamp: new Date().toISOString() };
                }
            }

            // UDP verification - Send a probe packet
            if (monitorType === 'UDP') {
                const isUp = await this.performUdpCheck(monitor.url, monitor.port, timeout);
                const responseTime = Date.now() - startTime;
                const hostname = this.checkHostProvider.sanitizeHostForCheckHost(monitor.url, true);
                console.log(`   🌍 [${location}] UDP ${hostname}:${monitor.port || 53} → ${isUp ? 'Reachable ✅' : 'No Response ❌'} (${responseTime}ms)`);

                return {
                    location,
                    isUp,
                    responseTime,
                    statusCode: null,
                    timestamp: new Date().toISOString(),
                    success: true,
                    real: true
                };
            }

            // SMTP verification - Connect to mail server
            if (monitorType === 'SMTP') {
                const result = await this.performSmtpCheck(monitor.url, monitor.port, timeout);
                const responseTime = Date.now() - startTime;

                console.log(`   🌍 [${location}] SMTP ${monitor.url}:${monitor.port || 25} → ${result.isUp ? 'Ready ✅' : 'Failed ❌'} (${responseTime}ms)`);

                return {
                    location,
                    isUp: result.isUp,
                    responseTime,
                    statusCode: result.statusCode,
                    timestamp: new Date().toISOString(),
                    success: true,
                    real: true
                };
            }

            // PING verification - ICMP echo
            if (monitorType === 'PING') {
                const result = await this.performPingCheck(monitor.url, timeout);
                const responseTime = Date.now() - startTime;

                console.log(`   🌍 [${location}] PING ${monitor.url} → ${result.isUp ? 'Alive ✅' : 'Unreachable ❌'} (${result.latency || responseTime}ms)`);

                return {
                    location,
                    isUp: result.isUp,
                    responseTime: result.latency || responseTime,
                    statusCode: null,
                    timestamp: new Date().toISOString(),
                    success: true,
                    real: true
                };
            }

            // Fallback for any other types - do HTTP check
            const response = await axios.get(monitor.url, {
                timeout: timeout,
                validateStatus: () => true
            });
            const responseTime = Date.now() - startTime;
            return {
                location,
                isUp: response.status >= 200 && response.status < 400,
                responseTime,
                statusCode: response.status,
                timestamp: new Date().toISOString(),
                success: true,
                real: true
            };

        } catch (error) {
            const responseTime = Date.now() - startTime;
            console.log(`   🌍 [${location}] ${monitor.url} → ERROR: ${error.message} ❌ (${responseTime}ms)`);

            return {
                location,
                isUp: false,
                responseTime,
                error: error.message,
                errorCode: error.code,
                timestamp: new Date().toISOString(),
                success: false,
                real: true
            };
        }
    }

    /**
     * Perform real TCP socket check
     */
    performTcpCheck(url, port, timeout) {
        return new Promise((resolve) => {
            // Parse hostname from URL
            let hostname = url.replace(/^https?:\/\//, '').replace(/^tcp:\/\//, '').split(':')[0].split('/')[0];
            const targetPort = port || 80;

            const socket = new net.Socket();
            socket.setTimeout(timeout);

            socket.on('connect', () => {
                socket.destroy();
                resolve(true);
            });

            socket.on('timeout', () => {
                socket.destroy();
                resolve(false);
            });

            socket.on('error', () => {
                socket.destroy();
                resolve(false);
            });

            socket.connect(targetPort, hostname);
        });
    }

    /**
     * Perform real DNS lookup check
     */
    performDnsCheck(domain, timeout) {
        return new Promise((resolve) => {
            // Clean domain - remove protocol and path
            let cleanDomain = domain.replace(/^https?:\/\//, '').split('/')[0];

            const timer = setTimeout(() => resolve(false), timeout);

            dns.lookup(cleanDomain, (err) => {
                clearTimeout(timer);
                resolve(!err);
            });
        });
    }

    /**
     * Perform real UDP probe check
     */
    performUdpCheck(url, port, timeout) {
        return new Promise((resolve) => {
            let hostname = url.replace(/^https?:\/\//, '').replace(/^udp:\/\//, '').split(':')[0].split('/')[0];
            const targetPort = port || 53; // Default to DNS port

            const client = dgram.createSocket('udp4');
            const timer = setTimeout(() => {
                client.close();
                // For UDP, no response could mean ICMP port unreachable OR just dropped
                // We consider "no response" as potentially UP (connectionless protocol)
                resolve(false);
            }, timeout);

            // Send a simple probe packet
            const message = Buffer.from('PROBE');
            client.send(message, 0, message.length, targetPort, hostname, (err) => {
                if (err) {
                    clearTimeout(timer);
                    client.close();
                    resolve(false);
                }
                // If send succeeded, wait for potential response or timeout
            });

            client.on('message', () => {
                clearTimeout(timer);
                client.close();
                resolve(true);
            });

            client.on('error', () => {
                clearTimeout(timer);
                client.close();
                resolve(false);
            });
        });
    }

    /**
     * Perform real SMTP check
     */
    performSmtpCheck(url, port, timeout) {
        return new Promise((resolve) => {
            let hostname = url.replace(/^https?:\/\//, '').replace(/^smtp:\/\//, '').split(':')[0].split('/')[0];
            const targetPort = port || 25;

            const socket = new net.Socket();
            socket.setTimeout(timeout);
            let statusCode = null;

            socket.on('connect', () => {
                // Wait for SMTP banner
            });

            socket.on('data', (data) => {
                const response = data.toString();
                // Handle multi-line responses (e.g. 250-line1\r\n250 line2)
                const lines = response.split('\r\n').filter(l => l.trim());
                const lastLine = lines[lines.length - 1];

                statusCode = lastLine.substring(0, 3);

                // Wait for the final line (indicated by space instead of dash)
                if (lastLine[3] === '-') return;

                if (statusCode.startsWith('220') || statusCode.startsWith('250')) {
                    socket.write('QUIT\r\n');
                    socket.destroy();
                    resolve({ isUp: true, statusCode });
                } else {
                    socket.destroy();
                    resolve({ isUp: false, statusCode });
                }
            });

            socket.on('timeout', () => {
                socket.destroy();
                resolve({ isUp: false, statusCode: null });
            });

            socket.on('error', () => {
                socket.destroy();
                resolve({ isUp: false, statusCode: null });
            });

            socket.connect(targetPort, hostname);
        });
    }

    /**
     * Perform real Ping (ICMP) check using system ping command
     */
    async performPingCheck(url, timeout) {
        const execAsync = promisify(exec);
        let hostname = url.replace(/^https?:\/\//, '').split(':')[0].split('/')[0];

        const isWindows = process.platform === 'win32';
        const timeoutSec = Math.ceil(timeout / 1000);

        let pingCommand;
        if (isWindows) {
            pingCommand = `ping -n 1 -w ${timeout} ${hostname}`;
        } else {
            pingCommand = `ping -c 1 -W ${timeoutSec} ${hostname}`;
        }

        try {
            const { stdout } = await execAsync(pingCommand, { timeout: timeout + 2000 });

            // Parse latency from output
            const timeMatch = stdout.match(/time[=<](\d+\.?\d*)\s*ms/i);
            const latency = timeMatch ? parseFloat(timeMatch[1]) : null;

            const isUp = stdout.includes('bytes from') ||
                stdout.includes('Reply from') ||
                stdout.includes('time=');

            return { isUp, latency };
        } catch (error) {
            return { isUp: false, latency: null };
        }
    }

    /**
     * Publish alert to real-time systems
     * @param {Object} monitor - The affected monitor
     * @param {Object} alertPayload - The alert data
     */
    publishAlert(monitor, alertPayload) {
        // In a real system, this would emit to Socket.io, publish to Redis, etc.
        // For now, we'll log it
        console.log(`🚨 ALERT: ${alertPayload.msg} | Monitor: ${monitor.name} | Level: ${alertPayload.level}`);

        // Emit to Socket.io if available
        try {
            if (this.io) {
                this.io.to(`monitor_${monitor._id}`).emit('alert', alertPayload);
                this.io.emit('global_alert', alertPayload);
            }
        } catch (error) {
            console.error('Failed to emit alert:', error.message);
        }
    }

    /**
     * Set the Socket.io instance for real-time alerts
     * @param {Object} io - The Socket.io server instance
     */
    setIoInstance(io) {
        this.io = io;
    }
}

export default new HealthStateService();
export { HealthStateService };
