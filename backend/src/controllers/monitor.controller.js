import Monitor from '../models/Monitor.js';
import Check from '../models/Check.js';
import Incident from '../models/Incident.js';
import MonitorRunner from '../services/runner.js';
import schedulerService from '../services/scheduler.service.js';
import enhancedAlertService from '../services/enhanced-alert.service.js';
import healthStateService from '../services/health-evaluator.service.js';
import mongoose from 'mongoose';
import redisClient from '../config/redis-cache.js';

/**
 * Monitor Controller
 * Handles all logic for monitor-related API endpoints
 */
const ALLOWED_MONITOR_FIELDS = [
    'name', 'type', 'url', 'port', 'interval', 'timeout',
    'alertThreshold', 'degradedThresholdMs', 'sslExpiryThresholdDays',
    'isActive', 'strictMode', 'allowUnauthorized'
];

export const getMonitors = async (req, res) => {
    try {
        const { page = 1, limit = 12 } = req.query;
        const skip = (page - 1) * limit;

        const monitors = await Monitor.find({ user: req.user._id })
            .sort({ createdAt: -1 })
            .skip(parseInt(skip))
            .limit(parseInt(limit));

        const total = await Monitor.countDocuments({ user: req.user._id });

        const monitorsWithChecks = await Promise.all(
            monitors.map(async (monitor) => {
                const latestCheck = await Check.findOne({ monitor: monitor._id })
                    .sort({ timestamp: -1 })
                    .limit(1);

                return {
                    ...monitor.toObject(),
                    latestCheck: latestCheck ? {
                        statusCode: latestCheck.statusCode,
                        errorType: latestCheck.errorType,
                        errorMessage: latestCheck.errorMessage,
                        timestamp: latestCheck.timestamp
                    } : null
                };
            })
        );

        res.json({
            success: true,
            count: monitorsWithChecks.length,
            data: monitorsWithChecks,
            pagination: {
                current: parseInt(page),
                pages: Math.ceil(total / limit),
                total
            }
        });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const createMonitor = async (req, res) => {
    try {
        // SECURITY: Whitelist allowed fields to prevent mass assignment (Phase 11: Audit Fix)
        const monitorData = { user: req.user._id };
        ALLOWED_MONITOR_FIELDS.forEach(field => {
            if (req.body[field] !== undefined) monitorData[field] = req.body[field];
        });

        // Auto-extract port from URL if not explicitly provided
        if (!monitorData.port && monitorData.url) {
            const parsed = MonitorRunner.parseUrl(monitorData.url);
            if (parsed.port) {
                monitorData.port = parsed.port;
            }
        }

        // RACE CONDITION FIX: Check if monitor already exists for this user/url
        const existingMonitor = await Monitor.findOne({
            user: req.user._id,
            url: monitorData.url,
            type: monitorData.type || 'http' // Default to http if not set
        });

        if (existingMonitor) {
            return res.status(409).json({
                success: false,
                message: 'A monitor for this URL already exists.',
                data: existingMonitor
            });
        }

        const monitor = await Monitor.create(monitorData);

        // Run immediate check if monitor is active
        if (monitor.isActive) {
            try {
                // Async: Offload to background worker for instant API response
                // This adds an immediate check to the queue and handles cleanup
                await schedulerService.scheduleMonitor(monitor);
                console.log(`✅ Monitor scheduled for background check: ${monitor.name}`);
            } catch (err) {
                console.error(`❌ Failed to schedule monitor ${monitor.name}:`, err.message);
                // We don't fail the request, but we log the error
            }
        }

        // Fetch the updated monitor with latestCheck
        const latestCheck = await Check.findOne({ monitor: monitor._id })
            .sort({ timestamp: -1 })
            .limit(1);

        res.status(201).json({
            success: true,
            data: {
                ...monitor.toObject(),
                latestCheck: latestCheck ? {
                    statusCode: latestCheck.statusCode,
                    errorType: latestCheck.errorType,
                    errorMessage: latestCheck.errorMessage,
                    timestamp: latestCheck.timestamp
                } : null
            },
            message: 'Monitor created'
        });
    } catch (error) {
        // Handle duplicate key error if race condition slips through (MongoDB unique index)
        if (error.code === 11000) {
            return res.status(409).json({ success: false, message: 'Monitor already exists.' });
        }
        res.status(400).json({ success: false, message: error.message });
    }
};

export const getMonitor = async (req, res) => {
    try {
        const monitor = await Monitor.findById(req.params.id);

        if (!monitor) {
            return res.status(404).json({ success: false, message: 'Monitor not found' });
        }

        // Allow access if owner OR admin
        if (monitor.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(401).json({ success: false, message: 'Not authorized' });
        }

        res.json({ success: true, data: monitor });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const updateMonitor = async (req, res) => {
    try {
        let monitor = await Monitor.findById(req.params.id);

        if (!monitor) {
            return res.status(404).json({ success: false, message: 'Monitor not found' });
        }

        if (monitor.user.toString() !== req.user._id.toString()) {
            return res.status(401).json({ success: false, message: 'Not authorized' });
        }

        // SECURITY: Whitelist allowed fields to prevent mass assignment (Phase 11: Audit Fix)
        const updateData = {};
        ALLOWED_MONITOR_FIELDS.forEach(field => {
            if (req.body[field] !== undefined) updateData[field] = req.body[field];
        });

        // Smart Reset: Detect if monitoring target changed (URL, type, or port = fresh start)
        const oldUrl = monitor.url;
        const newUrl = updateData.url;
        const urlChanged = newUrl && newUrl !== oldUrl;
        // Auto-extract port from URL if URL is updated but port is not explicitly provided
        if (updateData.url && updateData.port === undefined) {
            const parsed = MonitorRunner.parseUrl(updateData.url);
            if (parsed.port) {
                updateData.port = parsed.port;
            }
        }

        const typeChanged = updateData.type && updateData.type !== monitor.type;
        const portChanged = updateData.port !== undefined && updateData.port !== monitor.port;
        const targetChanged = urlChanged || typeChanged || portChanged;

        if (targetChanged) {
            const changes = [];
            if (urlChanged) changes.push(`URL: ${oldUrl} → ${newUrl}`);
            if (typeChanged) changes.push(`Type: ${monitor.type} → ${updateData.type}`);
            if (portChanged) changes.push(`Port: ${monitor.port} → ${updateData.port}`);
            console.log(`🔄 Target changed for ${monitor.name}: ${changes.join(', ')}`);
            console.log(`   Full reset: clearing all old data for fresh start...`);

            // Reset consecutive counters + stats for fresh monitoring
            updateData.consecutiveFailures = 0;
            updateData.consecutiveDegraded = 0;
            updateData.consecutiveSlowCount = 0;
            updateData.totalChecks = 0;
            updateData.successfulChecks = 0;
            updateData.lastResponseTime = null;
            updateData.lastChecked = null;
            updateData.status = 'unknown';

            const monitorObjectId = new mongoose.Types.ObjectId(monitor._id);

            // Delete all old checks and incidents (they belong to the old URL)
            const [deletedChecks, deletedIncidents] = await Promise.all([
                Check.deleteMany({ monitor: monitorObjectId }),
                Incident.deleteMany({ monitor: monitorObjectId })
            ]);

            console.log(`   ✅ Deleted ${deletedChecks.deletedCount} old checks, ${deletedIncidents.deletedCount} old incidents`);

            // Clear health state history (hysteresis data for old URL)
            await healthStateService.cleanupState(monitor._id);

            // Clear Redis alert suppression keys (old URL's suppression should not block new URL alerts)
            await enhancedAlertService.clearAlertSuppression(monitor._id);

            console.log(`   ✅ Cleared health state + alert suppression`);
            console.log(`   ✅ Fresh start ready for: ${newUrl || monitor.url}`);
        }

        monitor = await Monitor.findByIdAndUpdate(req.params.id, updateData, {
            new: true,
            runValidators: true
        });

        // Wrap scheduler operations in try-catch to prevent database update from being rolled back
        try {
            if (monitor.isActive) {
                await schedulerService.scheduleMonitor(monitor);
            } else {
                await schedulerService.removeMonitor(monitor._id);
            }
        } catch (schedulerError) {
            console.error('⚠️ Scheduler service error during monitor update:', schedulerError.message);
        }

        res.json({ success: true, data: monitor });
    } catch (error) {
        console.error('Monitor update error:', error);
        res.status(400).json({ success: false, message: error.message || 'Failed to update monitor' });
    }
};

export const deleteMonitor = async (req, res) => {
    try {
        const monitor = await Monitor.findById(req.params.id);

        if (!monitor) {
            return res.status(404).json({ success: false, message: 'Monitor not found' });
        }

        if (monitor.user.toString() !== req.user._id.toString()) {
            return res.status(401).json({ success: false, message: 'Not authorized' });
        }

        console.log(`🗑️  Deleting monitor: ${monitor._id} (${monitor.name})`);

        // Step 1: Remove from scheduler FIRST
        await schedulerService.removeMonitor(monitor._id);
        console.log('   ✅ Removed from scheduler');

        const monitorObjectId = new mongoose.Types.ObjectId(monitor._id);

        // Step 2: Delete all related data (parallel but ordered)
        const [checksResult, incidentsResult] = await Promise.all([
            Check.deleteMany({ monitor: monitorObjectId }),
            Incident.deleteMany({ monitor: monitorObjectId })
        ]);
        console.log(`   ✅ Deleted ${checksResult.deletedCount} checks, ${incidentsResult.deletedCount} incidents`);

        // Step 3: Delete the monitor itself
        await monitor.deleteOne();
        console.log('   ✅ Monitor deleted');

        // Step 4: Cleanup health state
        await healthStateService.cleanupState(monitor._id);

        res.json({ success: true, message: 'Monitor deleted' });
    } catch (error) {
        console.error('❌ Delete monitor error:', error);
        res.status(400).json({ success: false, message: error.message });
    }
};

export const getMonitorStats = async (req, res) => {
    try {
        const monitor = await Monitor.findById(req.params.id);
        if (!monitor || monitor.user.toString() !== req.user._id.toString()) {
            return res.status(404).json({ success: false, message: 'Monitor not found' });
        }

        const uptimePercentage = monitor.totalChecks > 0
            ? ((monitor.successfulChecks / monitor.totalChecks) * 100).toFixed(2)
            : 0;

        const recentChecks = await Check.find({ monitor: monitor._id })
            .sort({ timestamp: -1 })
            .limit(100);

        const checksWithResponseTime = recentChecks.filter(check => check.responseTime !== null && check.responseTime !== undefined);
        const avgResponseTime = checksWithResponseTime.length > 0
            ? checksWithResponseTime.reduce((sum, check) => sum + check.responseTime, 0) / checksWithResponseTime.length
            : 0;

        const incidentCount = await Incident.countDocuments({ monitor: monitor._id });
        const ongoingIncidents = await Incident.countDocuments({ monitor: monitor._id, status: 'ongoing' });

        res.json({
            success: true,
            data: {
                uptimePercentage: parseFloat(uptimePercentage),
                totalChecks: monitor.totalChecks,
                successfulChecks: monitor.successfulChecks,
                failedChecks: (monitor.totalChecks || 0) - (monitor.successfulChecks || 0),
                avgResponseTime: Math.round(avgResponseTime),
                lastResponseTime: monitor.lastResponseTime,
                incidentCount,
                ongoingIncidents,
                status: monitor.status,
                lastChecked: monitor.lastChecked
            }
        });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const getMonitorChecks = async (req, res) => {
    try {
        const monitor = await Monitor.findById(req.params.id);
        if (!monitor || monitor.user.toString() !== req.user._id.toString()) {
            return res.status(404).json({ success: false, message: 'Monitor not found' });
        }

        const limit = parseInt(req.query.limit) || 100;
        const page = parseInt(req.query.page) || 1;
        const skip = (page - 1) * limit;

        const checks = await Check.find({ monitor: monitor._id })
            .sort({ timestamp: -1 })
            .limit(limit)
            .skip(skip);

        const total = await Check.countDocuments({ monitor: monitor._id });

        res.json({
            success: true,
            count: checks.length,
            total,
            page,
            pages: Math.ceil(total / limit),
            data: checks
        });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const checkMonitorNow = async (req, res) => {
    try {
        const monitor = await Monitor.findById(req.params.id);
        if (!monitor || monitor.user.toString() !== req.user._id.toString()) {
            return res.status(404).json({ success: false, message: 'Monitor not found' });
        }

        // 🛡️ SECURITY: Manual check cooldown (30 seconds) using Redis
        const COOLDOWN_SECONDS = 30;
        const cooldownKey = `cooldown:manual-check:${monitor._id}`;

        const remainingTtl = await redisClient.ttl(cooldownKey);
        if (remainingTtl > 0) {
            return res.status(429).json({
                success: false,
                message: `Manual check cooldown active. Please wait ${remainingTtl}s.`
            });
        }

        // Set cooldown in Redis with TTL
        await redisClient.set(cooldownKey, 'active', 'EX', COOLDOWN_SECONDS);

        const result = await MonitorRunner.run(monitor);
        const healthStateResult = await healthStateService.determineHealthState(result, monitor);
        const { status, reasons } = healthStateResult;
        const responseTime = result.responseTimeMs || result.responseTime || 0;

        const check = await Check.create({
            monitor: monitor._id,
            status: status,
            responseTime: responseTime,
            statusCode: result.statusCode,
            errorMessage: result.errorMessage,
            errorType: result.errorType,
            sslInfo: result.meta && result.meta.validTo ? {
                valid: result.isUp,
                validFrom: result.meta.validFrom,
                validTo: result.meta.validTo,
                daysRemaining: Math.floor((new Date(result.meta.validTo) - new Date()) / (1000 * 60 * 60 * 24))
            } : undefined,
            degradationReasons: reasons.length > 0 ? reasons : undefined
        });

        // ATOMIC UPDATE: Ensure monitor stats are updated correctly even with concurrent checks
        const oldStatus = monitor.status;
        const updateData = {
            $set: {
                status: status,
                lastChecked: new Date(),
                lastResponseTime: responseTime
            },
            $inc: {
                totalChecks: 1
            }
        };

        if (status === 'down') {
            updateData.$inc.consecutiveFailures = 1;
            updateData.$set.consecutiveDegraded = 0;
        } else if (status === 'degraded') {
            updateData.$inc.consecutiveDegraded = 1;
            updateData.$set.consecutiveFailures = 0;
            updateData.$inc.successfulChecks = 1;
        } else {
            updateData.$set.consecutiveFailures = 0;
            updateData.$set.consecutiveDegraded = 0;
            updateData.$inc.successfulChecks = 1;
        }

        const updatedMonitor = await Monitor.findByIdAndUpdate(monitor._id, updateData, { new: true });

        // --- STRICT INTERVAL RESET --- //
        try {
            await schedulerService.scheduleMonitorForSync(updatedMonitor);
        } catch (schedErr) {
            console.error('Failed to reset schedule after manual check:', schedErr.message);
        }

        // Use enhancedAlertService
        try {
            if (status === 'down') {
                if (oldStatus === 'degraded') {
                    await enhancedAlertService.handleRecovery(updatedMonitor);
                }
                await enhancedAlertService.handleFailure(updatedMonitor, result);
            } else if (status === 'up') {
                if (oldStatus === 'down' || oldStatus === 'degraded') {
                    await enhancedAlertService.handleRecovery(updatedMonitor);
                }
            } else if (status === 'degraded') {
                if (oldStatus === 'down') {
                    await enhancedAlertService.handleRecovery(updatedMonitor);
                }
                const degradationReasons = reasons.filter(reason => {
                    const r = reason.toLowerCase();
                    return r.includes('performance') || r.includes('degradation') || r.includes('slow') ||
                        r.includes('ssl') || r.includes('cert') || r.includes('security') ||
                        r.includes('rate') || r.includes('429') || r.includes('limit');
                });
                await enhancedAlertService.handleDegraded(updatedMonitor, result, degradationReasons, healthStateResult);
            }
        } catch (alertError) {
            console.error('Error in manual check alerts:', alertError);
        }

        // Trigger global verification for down/degraded status (same as scheduled checks)
        if (status === 'down' || status === 'degraded') {
            try {
                await healthStateService.triggerImmediateVerification(
                    updatedMonitor,
                    result,
                    healthStateResult,
                    check._id.toString()
                );
            } catch (verifyError) {
                console.error('Error in global verification:', verifyError.message);
            }
        }

        res.json({ success: true, data: { check, monitor: updatedMonitor } });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const getQueueStats = async (req, res) => {
    try {
        const stats = await schedulerService.getQueueStats?.() || { waiting: 0, active: 0 };
        res.json({ success: true, data: stats });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const verifyJobHealth = async (req, res) => {
    try {
        const health = await schedulerService.verifyJobHealth();
        res.json({ success: true, data: health });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
