import Check from '../models/Check.js';
import Monitor from '../models/Monitor.js';
import Incident from '../models/Incident.js';

/**
 * Real-time Analytics Service
 * Provides industry-standard monitoring analytics with:
 * - Real-time health state distribution
 * - Performance trend analysis  
 * - Incident correlation and patterns
 * - Predictive failure detection
 * - SLA/SLO compliance tracking
 */

class RealtimeAnalyticsService {
    constructor() {
        this.analyticsCache = new Map();
        this.cacheTimeout = 30000; // 30 seconds
        this.trendAnalysisWindow = 24; // hours
        this.aggregationIntervals = {
            minute: 60 * 1000,
            hour: 60 * 60 * 1000,
            day: 24 * 60 * 60 * 1000
        };

        // Protocol-specific thresholds for "No-Guesswork" monitoring
        this.protocolThresholds = {
            HTTP: 5000,
            HTTPS: 5000,
            PING: 1500,
            TCP: 3000,
            UDP: 3000,
            DNS: 2000,
            SMTP: 3000,
            SSL: 3000
        };
    }

    /**
     * Get the appropriate slow response threshold for a monitor based on its type
     * @param {Object} monitor - The monitor object with type property
     * @returns {number} - Threshold in milliseconds
     */
    getThresholdForMonitor(monitor) {
        if (!monitor) return 2000;

        // If monitor has explicit threshold, use it
        if (monitor.degradedThresholdMs && monitor.degradedThresholdMs > 0) {
            return monitor.degradedThresholdMs;
        }

        // Otherwise, use protocol-specific default
        const protocolType = monitor.type?.toUpperCase();
        return this.protocolThresholds[protocolType] || 2000;
    }

    /**
     * Get real-time health state distribution
     */
    async getHealthStateDistribution(userId) {
        const cacheKey = `health_dist_${userId}`;

        if (this.analyticsCache.has(cacheKey)) {
            const cached = this.analyticsCache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheTimeout) {
                return cached.data;
            }
        }

        try {
            const monitors = await Monitor.find({ user: userId, isActive: true });
            const monitorIds = monitors.map(m => m._id);

            if (monitorIds.length === 0) {
                return {
                    up: 0,
                    down: 0,
                    degraded: 0,
                    unknown: 0,
                    total: 0,
                    percentage: {
                        up: 0,
                        down: 0,
                        degraded: 0,
                        unknown: 0
                    }
                };
            }

            // Get current status distribution
            const distribution = {
                up: 0,
                down: 0,
                degraded: 0,
                unknown: 0,
                total: monitors.length,
                percentage: {}
            };

            monitors.forEach(monitor => {
                const status = monitor.status || 'unknown';
                if (distribution.hasOwnProperty(status)) {
                    distribution[status]++;
                } else {
                    distribution.unknown++;
                }
            });

            // Calculate percentages
            Object.keys(distribution).forEach(key => {
                if (key !== 'total' && typeof distribution[key] === 'number') {
                    distribution.percentage[key] = Math.round(
                        (distribution[key] / distribution.total) * 100
                    );
                }
            });

            const result = {
                ...distribution,
                timestamp: new Date(),
                cacheExpires: new Date(Date.now() + this.cacheTimeout)
            };

            this.analyticsCache.set(cacheKey, {
                data: result,
                timestamp: Date.now()
            });

            return result;
        } catch (error) {
            console.error('Error getting health state distribution:', error);
            return {
                up: 0,
                down: 0,
                degraded: 0,
                unknown: 0,
                total: 0,
                percentage: { up: 0, down: 0, degraded: 0, unknown: 0 },
                error: error.message
            };
        }
    }

    /**
     * Get performance trend analysis
     */
    async getPerformanceTrends(userId, timeRange = '24h') {
        const cacheKey = `perf_trends_${userId}_${timeRange}`;

        if (this.analyticsCache.has(cacheKey)) {
            const cached = this.analyticsCache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheTimeout) {
                return cached.data;
            }
        }

        try {
            const monitors = await Monitor.find({ user: userId, isActive: true });
            const monitorIds = monitors.map(m => m._id);

            if (monitorIds.length === 0) {
                return {
                    responseTimeTrend: [],
                    errorRateTrend: [],
                    availabilityTrend: [],
                    summary: {}
                };
            }

            const timeRangeMs = this.parseTimeRange(timeRange);
            const startTime = new Date(Date.now() - timeRangeMs);

            // Aggregate checks by time intervals
            const checks = await Check.find({
                monitor: { $in: monitorIds },
                timestamp: { $gte: startTime }
            }).sort({ timestamp: 1 });

            const aggregatedData = this.aggregateChecksByInterval(checks, timeRangeMs);

            const result = {
                responseTimeTrend: aggregatedData.map(point => ({
                    timestamp: point.timestamp,
                    avgResponseTime: point.avgResponseTime,
                    p95ResponseTime: point.p95ResponseTime,
                    p99ResponseTime: point.p99ResponseTime,
                    samples: point.samples
                })),
                errorRateTrend: aggregatedData.map(point => ({
                    timestamp: point.timestamp,
                    errorRate: point.errorRate,
                    totalChecks: point.totalChecks,
                    failedChecks: point.failedChecks
                })),
                availabilityTrend: aggregatedData.map(point => ({
                    timestamp: point.timestamp,
                    availability: point.availability,
                    uptimeMinutes: point.uptimeMinutes,
                    totalMinutes: point.totalMinutes
                })),
                summary: this.calculatePerformanceSummary(aggregatedData),
                timestamp: new Date()
            };

            this.analyticsCache.set(cacheKey, {
                data: result,
                timestamp: Date.now()
            });

            return result;
        } catch (error) {
            console.error('Error getting performance trends:', error);
            return {
                responseTimeTrend: [],
                errorRateTrend: [],
                availabilityTrend: [],
                summary: {},
                error: error.message
            };
        }
    }

    /**
     * Get incident analytics and patterns
     */
    async getIncidentAnalytics(userId, timeRange = '7d') {
        const cacheKey = `incident_analytics_${userId}_${timeRange}`;

        if (this.analyticsCache.has(cacheKey)) {
            const cached = this.analyticsCache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheTimeout) {
                return cached.data;
            }
        }

        try {
            const monitors = await Monitor.find({ user: userId, isActive: true });
            const monitorIds = monitors.map(m => m._id);

            if (monitorIds.length === 0) {
                return {
                    totalIncidents: 0,
                    byType: {},
                    bySeverity: {},
                    mttd: 0,
                    mttr: 0,
                    patterns: [],
                    recentIncidents: []
                };
            }

            const timeRangeMs = this.parseTimeRange(timeRange);
            const startTime = new Date(Date.now() - timeRangeMs);

            const incidents = await Incident.find({
                monitor: { $in: monitorIds },
                startTime: { $gte: startTime }
            }).populate('monitor', 'name url');

            // Aggregate incident data
            const analytics = {
                totalIncidents: incidents.length,
                byType: {},
                bySeverity: {},
                byMonitor: {},
                mttd: 0, // Mean Time To Detect
                mttr: 0, // Mean Time To Resolve
                patterns: [],
                recentIncidents: incidents
                    .sort((a, b) => b.startTime - a.startTime)
                    .slice(0, 10)
                    .map(incident => ({
                        id: incident._id,
                        monitorName: incident.monitor.name,
                        errorType: incident.errorType,
                        severity: incident.severity,
                        startTime: incident.startTime,
                        duration: incident.duration,
                        resolved: incident.status === 'resolved'
                    }))
            };

            // Calculate metrics
            let totalDetectionTime = 0;
            let totalResolutionTime = 0;
            let resolvedIncidents = 0;

            incidents.forEach(incident => {
                // Count by type
                analytics.byType[incident.errorType] = (analytics.byType[incident.errorType] || 0) + 1;

                // Count by severity
                analytics.bySeverity[incident.severity] = (analytics.bySeverity[incident.severity] || 0) + 1;

                // Count by monitor
                const monitorName = incident.monitor.name;
                analytics.byMonitor[monitorName] = (analytics.byMonitor[monitorName] || 0) + 1;

                // Calculate detection and resolution times
                if (incident.createdAt && incident.startTime) {
                    // Start time is when the incident theoretically began (can be backdated)
                    // CreatedAt is when the system actually detected and recorded it
                    const detectionTime = Math.max(0, incident.createdAt - incident.startTime);
                    totalDetectionTime += detectionTime;
                }

                if (incident.duration) {
                    totalResolutionTime += incident.duration;
                    resolvedIncidents++;
                }
            });

            analytics.mttd = incidents.length > 0 ? totalDetectionTime / incidents.length : 0;
            analytics.mttr = resolvedIncidents > 0 ? totalResolutionTime / resolvedIncidents : 0;

            // Detect patterns
            analytics.patterns = this.detectIncidentPatterns(incidents);

            const result = {
                ...analytics,
                timestamp: new Date()
            };

            this.analyticsCache.set(cacheKey, {
                data: result,
                timestamp: Date.now()
            });

            return result;
        } catch (error) {
            console.error('Error getting incident analytics:', error);
            return {
                totalIncidents: 0,
                byType: {},
                bySeverity: {},
                mttd: 0,
                mttr: 0,
                patterns: [],
                recentIncidents: [],
                error: error.message
            };
        }
    }

    /**
     * Get predictive failure analysis
     */
    async getPredictiveAnalysis(userId) {
        const cacheKey = `predictive_${userId}`;

        if (this.analyticsCache.has(cacheKey)) {
            const cached = this.analyticsCache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheTimeout) {
                return cached.data;
            }
        }

        try {
            const monitors = await Monitor.find({ user: userId, isActive: true });
            const monitorIds = monitors.map(m => m._id);

            if (monitorIds.length === 0) {
                return {
                    atRiskMonitors: [],
                    trendAnalysis: {},
                    recommendations: []
                };
            }

            const analysis = {
                atRiskMonitors: [],
                trendAnalysis: {},
                recommendations: [],
                riskScore: 0
            };

            for (const monitor of monitors) {
                const riskAssessment = await this.assessMonitorRisk(monitor);
                if (riskAssessment.riskLevel > 0.6) {
                    analysis.atRiskMonitors.push({
                        monitorId: monitor._id,
                        name: monitor.name,
                        url: monitor.url,
                        riskLevel: riskAssessment.riskLevel,
                        riskFactors: riskAssessment.riskFactors,
                        prediction: riskAssessment.prediction
                    });
                }
            }

            // Calculate overall risk score
            analysis.riskScore = analysis.atRiskMonitors.length / monitors.length;

            // Generate recommendations
            analysis.recommendations = this.generateRecommendations(analysis.atRiskMonitors);

            const result = {
                ...analysis,
                timestamp: new Date()
            };

            this.analyticsCache.set(cacheKey, {
                data: result,
                timestamp: Date.now()
            });

            return result;
        } catch (error) {
            console.error('Error getting predictive analysis:', error);
            return {
                atRiskMonitors: [],
                trendAnalysis: {},
                recommendations: [],
                error: error.message
            };
        }
    }

    /**
     * Get SLA/SLO compliance tracking
     */
    async getSLACompliance(userId, timeRange = '30d') {
        const cacheKey = `sla_compliance_${userId}_${timeRange}`;

        if (this.analyticsCache.has(cacheKey)) {
            const cached = this.analyticsCache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheTimeout) {
                return cached.data;
            }
        }

        try {
            const monitors = await Monitor.find({ user: userId, isActive: true });
            const monitorIds = monitors.map(m => m._id);

            if (monitorIds.length === 0) {
                return {
                    overallAvailability: 0,
                    targetAvailability: 99.9,
                    compliance: false,
                    byMonitor: [],
                    violations: []
                };
            }

            const timeRangeMs = this.parseTimeRange(timeRange);
            const startTime = new Date(Date.now() - timeRangeMs);

            // Default SLA targets
            const slaTargets = {
                availability: 99.9, // 99.9% uptime
                responseTime: 2000, // 2 seconds max
                errorRate: 0.1 // 0.1% max error rate
            };

            const compliance = {
                overallAvailability: 0,
                targetAvailability: slaTargets.availability,
                compliance: false,
                byMonitor: [],
                violations: [],
                summary: {}
            };

            let totalAvailability = 0;
            let validMonitors = 0;

            for (const monitor of monitors) {
                const checks = await Check.find({
                    monitor: monitor._id,
                    timestamp: { $gte: startTime }
                }).sort({ timestamp: 1 });

                if (checks.length > 0) {
                    const monitorCompliance = this.calculateMonitorCompliance(checks, slaTargets);
                    compliance.byMonitor.push({
                        monitorId: monitor._id,
                        name: monitor.name,
                        availability: monitorCompliance.availability,
                        avgResponseTime: monitorCompliance.avgResponseTime,
                        errorRate: monitorCompliance.errorRate,
                        slaCompliant: monitorCompliance.slaCompliant,
                        violations: monitorCompliance.violations
                    });

                    totalAvailability += monitorCompliance.availability;
                    validMonitors++;

                    // Track violations
                    compliance.violations.push(...monitorCompliance.violations);
                }
            }

            compliance.overallAvailability = validMonitors > 0 ? totalAvailability / validMonitors : 0;
            compliance.compliance = compliance.overallAvailability >= slaTargets.availability;

            const result = {
                ...compliance,
                timestamp: new Date()
            };

            this.analyticsCache.set(cacheKey, {
                data: result,
                timestamp: Date.now()
            });

            return result;
        } catch (error) {
            console.error('Error getting SLA compliance:', error);
            return {
                overallAvailability: 0,
                targetAvailability: 99.9,
                compliance: false,
                byMonitor: [],
                violations: [],
                error: error.message
            };
        }
    }

    /**
     * Parse time range string to milliseconds
     */
    parseTimeRange(timeRange) {
        const match = timeRange.match(/^(\d+)([mhd])$/);
        if (!match) return 24 * 60 * 60 * 1000; // Default 24 hours

        const value = parseInt(match[1]);
        const unit = match[2];

        switch (unit) {
            case 'm': return value * 60 * 1000;
            case 'h': return value * 60 * 60 * 1000;
            case 'd': return value * 24 * 60 * 60 * 1000;
            default: return 24 * 60 * 60 * 1000;
        }
    }

    /**
     * Aggregate checks by time intervals
     */
    aggregateChecksByInterval(checks, timeRangeMs) {
        const intervalSize = Math.max(timeRangeMs / 24, 60 * 1000); // At least 1 minute intervals
        const buckets = new Map();

        checks.forEach(check => {
            const bucketTime = Math.floor(check.timestamp.getTime() / intervalSize) * intervalSize;
            const key = bucketTime.toString();

            if (!buckets.has(key)) {
                buckets.set(key, {
                    timestamp: new Date(bucketTime),
                    responseTimes: [],
                    statuses: [],
                    checks: []
                });
            }

            const bucket = buckets.get(key);
            bucket.responseTimes.push(check.responseTime);
            bucket.statuses.push(check.status);
            bucket.checks.push(check);
        });

        return Array.from(buckets.values())
            .sort((a, b) => a.timestamp - b.timestamp)
            .map(bucket => this.calculateBucketStats(bucket));
    }

    /**
     * Calculate statistics for a time bucket
     */
    calculateBucketStats(bucket) {
        const sortedResponseTimes = bucket.responseTimes.sort((a, b) => a - b);
        const totalChecks = bucket.checks.length;
        const successfulChecks = bucket.statuses.filter(status => status === 'up').length;
        const failedChecks = totalChecks - successfulChecks;

        return {
            timestamp: bucket.timestamp,
            avgResponseTime: sortedResponseTimes.length > 0
                ? sortedResponseTimes.reduce((a, b) => a + b, 0) / sortedResponseTimes.length
                : 0,
            p95ResponseTime: sortedResponseTimes.length > 0
                ? sortedResponseTimes[Math.floor(sortedResponseTimes.length * 0.95)]
                : 0,
            p99ResponseTime: sortedResponseTimes.length > 0
                ? sortedResponseTimes[Math.floor(sortedResponseTimes.length * 0.99)]
                : 0,
            errorRate: totalChecks > 0 ? (failedChecks / totalChecks) * 100 : 0,
            totalChecks,
            failedChecks,
            availability: totalChecks > 0 ? (successfulChecks / totalChecks) * 100 : 0,
            samples: totalChecks
        };
    }

    /**
     * Calculate performance summary
     */
    calculatePerformanceSummary(aggregatedData) {
        if (aggregatedData.length === 0) {
            return {};
        }

        const validPoints = aggregatedData.filter(p => p.samples > 0);

        if (validPoints.length === 0) {
            return {};
        }

        return {
            avgAvailability: validPoints.reduce((sum, p) => sum + p.availability, 0) / validPoints.length,
            avgResponseTime: validPoints.reduce((sum, p) => sum + p.avgResponseTime, 0) / validPoints.length,
            avgErrorRate: validPoints.reduce((sum, p) => sum + p.errorRate, 0) / validPoints.length,
            totalSamples: validPoints.reduce((sum, p) => sum + p.samples, 0),
            trend: this.calculateTrend(validPoints.map(p => p.availability))
        };
    }

    /**
     * Calculate trend direction
     */
    calculateTrend(values) {
        if (values.length < 2) return 'stable';

        const firstHalf = values.slice(0, Math.floor(values.length / 2));
        const secondHalf = values.slice(Math.floor(values.length / 2));

        const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

        const change = (secondAvg - firstAvg) / firstAvg;

        if (Math.abs(change) < 0.05) return 'stable';
        return change > 0 ? 'improving' : 'declining';
    }

    /**
     * Detect incident patterns
     */
    detectIncidentPatterns(incidents) {
        const patterns = [];

        // Pattern 1: Recurring incidents on same monitor
        const monitorIncidents = {};
        incidents.forEach(incident => {
            const key = incident.monitor._id.toString();
            if (!monitorIncidents[key]) {
                monitorIncidents[key] = [];
            }
            monitorIncidents[key].push(incident);
        });

        Object.entries(monitorIncidents).forEach(([monitorId, monitorIncidents]) => {
            if (monitorIncidents.length >= 3) {
                patterns.push({
                    type: 'recurring_incidents',
                    monitorId,
                    frequency: monitorIncidents.length,
                    description: `Monitor has ${monitorIncidents.length} incidents in the time period`
                });
            }
        });

        // Pattern 2: Time-based patterns
        const hourCounts = {};
        incidents.forEach(incident => {
            const hour = incident.startTime.getHours();
            hourCounts[hour] = (hourCounts[hour] || 0) + 1;
        });

        const maxHour = Object.entries(hourCounts).reduce((a, b) =>
            hourCounts[a[0]] > hourCounts[b[0]] ? a : b
        );

        if (maxHour[1] >= incidents.length * 0.3) {
            patterns.push({
                type: 'time_pattern',
                peakHour: parseInt(maxHour[0]),
                description: `Peak incident time: ${maxHour[0]}:00 (${maxHour[1]} incidents)`
            });
        }

        return patterns;
    }

    /**
     * Assess monitor risk level
     */
    async assessMonitorRisk(monitor) {
        const recentChecks = await Check.find({
            monitor: monitor._id,
            timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        }).sort({ timestamp: -1 }).limit(20);

        const riskFactors = [];
        let riskScore = 0;

        // Factor 1: Recent failure rate
        const recentFailures = recentChecks.filter(check => check.status === 'down').length;
        const failureRate = recentChecks.length > 0 ? recentFailures / recentChecks.length : 0;

        if (failureRate > 0.2) {
            riskFactors.push({
                factor: 'high_failure_rate',
                severity: 'high',
                value: failureRate,
                description: `${Math.round(failureRate * 100)}% failure rate in last 24h`
            });
            riskScore += 0.3;
        } else if (failureRate > 0.1) {
            riskFactors.push({
                factor: 'elevated_failure_rate',
                severity: 'medium',
                value: failureRate,
                description: `${Math.round(failureRate * 100)}% failure rate in last 24h`
            });
            riskScore += 0.15;
        }

        // Factor 2: Response time degradation
        const avgResponseTime = recentChecks.length > 0
            ? recentChecks.reduce((sum, check) => sum + check.responseTime, 0) / recentChecks.length
            : 0;

        // Get protocol-specific threshold
        const degradedThresholdMs = this.getThresholdForMonitor(monitor);

        if (avgResponseTime > degradedThresholdMs) {
            riskFactors.push({
                factor: 'slow_response',
                severity: avgResponseTime > degradedThresholdMs * 2 ? 'high' : 'medium',
                value: avgResponseTime,
                description: `Average response time: ${Math.round(avgResponseTime)}ms (threshold: ${degradedThresholdMs}ms)`
            });
            riskScore += (avgResponseTime > degradedThresholdMs * 2 ? 0.3 : 0.15);
        }

        // Factor 3: Consecutive failures
        if (monitor.consecutiveFailures > 2) {
            riskFactors.push({
                factor: 'consecutive_failures',
                severity: 'high',
                value: monitor.consecutiveFailures,
                description: `${monitor.consecutiveFailures} consecutive failures`
            });
            riskScore += 0.25;
        }

        // Factor 4: No recent checks
        const lastCheck = monitor.lastChecked;
        const hoursSinceLastCheck = lastCheck ? (Date.now() - lastCheck.getTime()) / (60 * 60 * 1000) : Infinity;

        if (hoursSinceLastCheck > monitor.interval * 1.5) {
            riskFactors.push({
                factor: 'stale_checks',
                severity: 'medium',
                value: hoursSinceLastCheck,
                description: `No checks for ${Math.round(hoursSinceLastCheck)} hours`
            });
            riskScore += 0.15;
        }

        const prediction = riskScore > 0.7 ? 'high_risk' : riskScore > 0.4 ? 'medium_risk' : 'low_risk';

        return {
            riskLevel: Math.min(riskScore, 1.0),
            riskFactors,
            prediction,
            confidence: Math.min(recentChecks.length / 10, 1.0) // Higher confidence with more data
        };
    }

    /**
     * Generate recommendations based on risk assessment
     */
    generateRecommendations(atRiskMonitors) {
        const recommendations = [];

        if (atRiskMonitors.length === 0) {
            recommendations.push({
                type: 'maintenance',
                priority: 'low',
                message: 'All monitors are operating within normal parameters',
                action: 'Continue regular monitoring'
            });
            return recommendations;
        }

        recommendations.push({
            type: 'immediate_attention',
            priority: 'high',
            message: `${atRiskMonitors.length} monitors require immediate attention`,
            action: 'Review and address high-risk monitors',
            affectedMonitors: atRiskMonitors.map(m => m.name)
        });

        // Specific recommendations based on common risk factors
        const highFailureRateCount = atRiskMonitors.filter(m =>
            m.riskFactors.some(f => f.factor.includes('failure'))
        ).length;

        if (highFailureRateCount > 0) {
            recommendations.push({
                type: 'investigation',
                priority: 'high',
                message: 'High failure rates detected across multiple monitors',
                action: 'Investigate underlying infrastructure issues',
                affectedCount: highFailureRateCount
            });
        }

        const slowResponseCount = atRiskMonitors.filter(m =>
            m.riskFactors.some(f => f.factor.includes('slow'))
        ).length;

        if (slowResponseCount > 0) {
            recommendations.push({
                type: 'performance',
                priority: 'medium',
                message: 'Performance degradation detected',
                action: 'Consider scaling resources or optimizing performance',
                affectedCount: slowResponseCount
            });
        }

        return recommendations;
    }

    /**
     * Calculate monitor compliance with SLA targets
     */
    calculateMonitorCompliance(checks, slaTargets) {
        const validChecks = checks.filter(check => check.responseTime > 0);

        if (validChecks.length === 0) {
            return {
                availability: 0,
                avgResponseTime: 0,
                errorRate: 0,
                slaCompliant: false,
                violations: []
            };
        }

        const successfulChecks = validChecks.filter(check => check.status === 'up').length;
        const availability = (successfulChecks / validChecks.length) * 100;

        const avgResponseTime = validChecks.reduce((sum, check) => sum + check.responseTime, 0) / validChecks.length;
        const failedChecks = validChecks.length - successfulChecks;
        const errorRate = (failedChecks / validChecks.length) * 100;

        const violations = [];

        if (availability < slaTargets.availability) {
            violations.push({
                type: 'availability',
                expected: slaTargets.availability,
                actual: availability,
                severity: 'high'
            });
        }

        if (avgResponseTime > slaTargets.responseTime) {
            violations.push({
                type: 'response_time',
                expected: slaTargets.responseTime,
                actual: avgResponseTime,
                severity: 'medium'
            });
        }

        if (errorRate > slaTargets.errorRate) {
            violations.push({
                type: 'error_rate',
                expected: slaTargets.errorRate,
                actual: errorRate,
                severity: 'medium'
            });
        }

        return {
            availability,
            avgResponseTime,
            errorRate,
            slaCompliant: violations.length === 0,
            violations
        };
    }

    /**
     * Clear analytics cache
     */
    clearCache() {
        this.analyticsCache.clear();
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        const now = Date.now();
        let validEntries = 0;
        let expiredEntries = 0;

        for (const [key, value] of this.analyticsCache.entries()) {
            if (now - value.timestamp < this.cacheTimeout) {
                validEntries++;
            } else {
                expiredEntries++;
            }
        }

        return {
            totalEntries: this.analyticsCache.size,
            validEntries,
            expiredEntries,
            cacheTimeout: this.cacheTimeout
        };
    }
}

export default new RealtimeAnalyticsService();
export { RealtimeAnalyticsService };
