import Monitor from '../models/Monitor.js';
import Check from '../models/Check.js';
import Incident from '../models/Incident.js';
import MonitorRunner from '../services/runner.js';
import schedulerService from '../services/scheduler.service.js';
import enhancedAlertService from '../services/enhanced-alert.service.js';
import healthStateService from '../services/health-evaluator.service.js';
import mongoose from 'mongoose';
import redisClient from '../config/redis-cache.js';
import { validateMonitorUrl, validateTargetHost } from '../utils/url-validator.js'; // [C3]
import safeErrorMessage from '../utils/safe-error.js'; // [H5]
import dbMirror from '../services/db-mirror.service.js';

/**
 * Monitor Controller
 * Handles all logic for monitor-related API endpoints
 */
const ALLOWED_MONITOR_FIELDS = [
    'name', 'type', 'url', 'port', 'interval', 'timeout',
    'alertThreshold', 'degradedThresholdMs', 'sslExpiryThresholdDays',
    'isActive', 'strictMode', 'allowUnauthorized', 'status', 'headers'
];

export const getMonitors = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 8));
        const skip = (page - 1) * limit;
        const status = req.query.status;

        const query = { user: req.user._id };
        if (status && status !== 'all') {
            query.status = status;
        }

        const monitors = await Monitor.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const [totalAll, upCount, downCount, degradedCount, pausedCount] = await Promise.all([
            Monitor.countDocuments({ user: req.user._id }),
            Monitor.countDocuments({ user: req.user._id, status: 'up' }),
            Monitor.countDocuments({ user: req.user._id, status: 'down' }),
            Monitor.countDocuments({ user: req.user._id, status: 'degraded' }),
            Monitor.countDocuments({ user: req.user._id, status: 'paused' })
        ]);

        const currentTotal = status === 'up' ? upCount
            : status === 'down' ? downCount
            : status === 'degraded' ? degradedCount
            : status === 'paused' ? pausedCount
            : totalAll;

        const monitorsWithChecks = await Promise.all(
            monitors.map(async (monitor) => {
                const latestCheck = await Check.findOne({ monitor: monitor._id })
                    .sort({ timestamp: -1 })
                    .limit(1);

                return {
                    ...monitor.toObject(),
                    latestCheck: latestCheck ? {
                        status: latestCheck.status,
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
            counts: {
                all: totalAll,
                up: upCount,
                down: downCount,
                degraded: degradedCount,
                paused: pausedCount
            },
            pagination: {
                current: page,
                pages: Math.ceil(currentTotal / limit) || 1,
                total: currentTotal
            }
        });
    } catch (error) {
        res.status(400).json({ success: false, message: safeErrorMessage(error) });
    }
};

export const createMonitor = async (req, res) => {
    try {
        // SECURITY: Whitelist allowed fields to prevent mass assignment (Phase 11: Audit Fix)
        const monitorData = { user: req.user._id };
        ALLOWED_MONITOR_FIELDS.forEach(field => {
            if (req.body[field] !== undefined) monitorData[field] = req.body[field];
        });

        // [L5 SECURITY FIX] Explicitly cast boolean fields to prevent string 'true' being stored.
        if (monitorData.allowUnauthorized !== undefined) {
            monitorData.allowUnauthorized = Boolean(monitorData.allowUnauthorized === true || monitorData.allowUnauthorized === 'true');
        }
        if (monitorData.strictMode !== undefined) {
            monitorData.strictMode = Boolean(monitorData.strictMode === true || monitorData.strictMode === 'true');
        }
        if (monitorData.isActive !== undefined) {
            monitorData.isActive = Boolean(monitorData.isActive === true || monitorData.isActive === 'true');
        }

        // Validate URL/hostname before saving for all monitor types (SSRF pre-validation)
        const monitorType = (monitorData.type || 'HTTPS').toUpperCase();
        monitorData.type = monitorType;
        if (monitorData.url) {
            if (['HTTP', 'HTTPS'].includes(monitorType)) {
                const urlValidation = validateMonitorUrl(monitorData.url);
                if (!urlValidation.isValid) {
                    return res.status(400).json({ success: false, message: urlValidation.error });
                }
            } else {
                const targetValidation = validateTargetHost(monitorData.url);
                if (!targetValidation.isValid) {
                    return res.status(400).json({ success: false, message: targetValidation.error });
                }
            }
        }

        // Auto-extract port from URL if not explicitly provided
        if (!monitorData.port && monitorData.url) {
            const parsed = MonitorRunner.parseUrl(monitorData.url);
            if (parsed.port) {
                monitorData.port = parsed.port;
            }
        }

        // RACE CONDITION FIX: Check if monitor already exists for this user/url/type/port
        const duplicateQuery = {
            user: req.user._id,
            url: monitorData.url,
            type: monitorData.type
        };
        if (monitorData.port !== undefined && monitorData.port !== null) {
            duplicateQuery.port = monitorData.port;
        } else {
            duplicateQuery.port = { $in: [null, undefined] };
        }

        const existingMonitor = await Monitor.findOne(duplicateQuery);

        if (existingMonitor) {
            const portSuffix = monitorData.port ? ` on port ${monitorData.port}` : '';
            return res.status(409).json({
                success: false,
                message: `A monitor for this URL${portSuffix} already exists.`,
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

        // Emit real-time monitor_created event
        if (req.app.get('io')) {
            try {
                req.app.get('io').to(`user_${req.user._id}`).emit('monitor_created', { monitor });
            } catch (socketErr) {
                console.warn('Socket error on monitor_created:', socketErr.message);
            }
        }

        res.status(201).json({
            success: true,
            data: {
                ...monitor.toObject(),
                latestCheck: latestCheck ? {
                    status: latestCheck.status,
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
        res.status(400).json({ success: false, message: safeErrorMessage(error, 'Failed to create monitor') }); // [H5]
    }
};

export const getMonitor = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(404).json({ success: false, message: 'Monitor not found' });
        }
        const monitor = await Monitor.findById(req.params.id);

        if (!monitor) {
            return res.status(404).json({ success: false, message: 'Monitor not found' });
        }

        // Allow access if owner OR admin
        if (monitor.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(401).json({ success: false, message: 'Not authorized' });
        }

        const latestCheck = await Check.findOne({ monitor: monitor._id }).sort({ timestamp: -1 });

        res.json({
            success: true,
            data: {
                ...monitor.toObject(),
                latestCheck: latestCheck ? {
                    status: latestCheck.status,
                    statusCode: latestCheck.statusCode,
                    errorType: latestCheck.errorType,
                    errorMessage: latestCheck.errorMessage,
                    timestamp: latestCheck.timestamp
                } : null
            }
        });
    } catch (error) {
        res.status(400).json({ success: false, message: safeErrorMessage(error) });
    }
};

export const updateMonitor = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(404).json({ success: false, message: 'Monitor not found' });
        }
        let monitor = await Monitor.findById(req.params.id);

        if (!monitor) {
            return res.status(404).json({ success: false, message: 'Monitor not found' });
        }

        if (monitor.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(401).json({ success: false, message: 'Not authorized' });
        }

        // SECURITY: Whitelist allowed fields to prevent mass assignment (Phase 11: Audit Fix)
        const updateData = {};
        ALLOWED_MONITOR_FIELDS.forEach(field => {
            if (req.body[field] !== undefined) updateData[field] = req.body[field];
        });

        // [L5 SECURITY FIX] Explicitly cast boolean fields on update too
        if (updateData.allowUnauthorized !== undefined) {
            updateData.allowUnauthorized = Boolean(updateData.allowUnauthorized === true || updateData.allowUnauthorized === 'true');
        }
        if (updateData.strictMode !== undefined) {
            updateData.strictMode = Boolean(updateData.strictMode === true || updateData.strictMode === 'true');
        }
        if (updateData.isActive !== undefined) {
            updateData.isActive = Boolean(updateData.isActive === true || updateData.isActive === 'true');
        }

        const oldStatus = monitor.status;
        const oldIsActive = monitor.isActive;

        // Handle pause/resume status transitions explicitly
        if (updateData.isActive === false || updateData.status === 'paused') {
            updateData.isActive = false;
            updateData.status = 'paused';
        } else if (updateData.isActive === true) {
            updateData.isActive = true;
            if (oldStatus === 'paused' || updateData.status === 'paused') {
                // Restore prior status from latest check rather than wiping to 'unknown'
                const latestCheck = await Check.findOne({ monitor: monitor._id }).sort({ timestamp: -1 });
                updateData.status = latestCheck ? latestCheck.status : 'unknown';
            }
        }

        // Validate URL/hostname before updating for all monitor types (SSRF pre-validation)
        const updateType = (updateData.type || monitor.type || 'HTTPS').toUpperCase();
        if (updateData.type) {
            updateData.type = updateType;
        }
        if (updateData.url) {
            if (['HTTP', 'HTTPS'].includes(updateType)) {
                const urlValidation = validateMonitorUrl(updateData.url);
                if (!urlValidation.isValid) {
                    return res.status(400).json({ success: false, message: urlValidation.error });
                }
            } else {
                const targetValidation = validateTargetHost(updateData.url);
                if (!targetValidation.isValid) {
                    return res.status(400).json({ success: false, message: targetValidation.error });
                }
            }
        }

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

        const defaultPortForType = (type) => (type === 'HTTPS' || type === 'SSL') ? 443 : (type === 'HTTP' ? 80 : undefined);
        const oldEffectivePort = monitor.port || defaultPortForType(monitor.type);
        const typeChanged = updateData.type && updateData.type !== monitor.type;
        const portChanged = updateData.port !== undefined && oldEffectivePort !== undefined && updateData.port !== oldEffectivePort;
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
            updateData.totalChecks = 0;
            updateData.successfulChecks = 0;
            updateData.uptimePercentage = 100;
            updateData.last24hUptime = 100;
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
                if (targetChanged) {
                    // Target changed (URL, port, or protocol) -> perform immediate check on new target
                    await schedulerService.scheduleMonitor(monitor);
                } else {
                    // Resumed from pause or non-target settings update -> resume remaining interval
                    // (prevents creating duplicate/unwanted check records if not overdue)
                    await schedulerService.scheduleMonitorForSync(monitor);
                }
            } else {
                await schedulerService.removeMonitor(monitor._id);
            }
        } catch (schedulerError) {
            console.error('⚠️ Scheduler service error during monitor update:', schedulerError.message);
        }

        // Broadcast real-time status update to all connected clients
        try {
            if (schedulerService.io) {
                const roomUserId = monitor.user._id || monitor.user;
                schedulerService.io.to(`user_${roomUserId}`).emit('monitor_update', {
                    monitorId: monitor._id.toString(),
                    status: monitor.status,
                    isActive: monitor.isActive,
                    lastChecked: monitor.lastChecked,
                    lastResponseTime: monitor.lastResponseTime
                });

                if (oldStatus !== monitor.status) {
                    schedulerService.io.to(`user_${roomUserId}`).emit('monitor_status_change', {
                        monitorId: monitor._id.toString(),
                        previousStatus: oldStatus,
                        currentStatus: monitor.status,
                        monitor: {
                            _id: monitor._id,
                            name: monitor.name,
                            url: monitor.url
                        },
                        timestamp: new Date()
                    });
                }
            }
        } catch (socketErr) {
            console.warn('Socket broadcast error during update:', socketErr.message);
        }

        const latestCheck = await Check.findOne({ monitor: monitor._id }).sort({ timestamp: -1 });

        res.json({
            success: true,
            data: {
                ...monitor.toObject(),
                latestCheck: latestCheck ? {
                    status: latestCheck.status,
                    statusCode: latestCheck.statusCode,
                    errorType: latestCheck.errorType,
                    errorMessage: latestCheck.errorMessage,
                    timestamp: latestCheck.timestamp
                } : null
            }
        });
    } catch (error) {
        console.error('Monitor update error:', error);
        res.status(400).json({ success: false, message: safeErrorMessage(error, 'Failed to update monitor') });
    }
};

export const deleteMonitor = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(404).json({ success: false, message: 'Monitor not found' });
        }
        const monitor = await Monitor.findById(req.params.id);

        if (!monitor) {
            return res.status(404).json({ success: false, message: 'Monitor not found' });
        }

        if (monitor.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
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
        dbMirror.mirrorDelete('monitors', monitorObjectId);
        dbMirror.mirrorDeleteMany('checks', { monitor: monitorObjectId });
        dbMirror.mirrorDeleteMany('incidents', { monitor: monitorObjectId });
        console.log('   ✅ Monitor deleted');

        // Step 4: Cleanup health state
        await healthStateService.cleanupState(monitor._id);

        // Step 5: Clear alert suppression
        await enhancedAlertService.clearAlertSuppression(monitor._id);

        // Emit real-time monitor_deleted event
        if (req.app.get('io')) {
            try {
                req.app.get('io').to(`user_${monitor.user}`).emit('monitor_deleted', { monitorId: monitor._id });
            } catch (socketErr) {
                console.warn('Socket error on monitor_deleted:', socketErr.message);
            }
        }

        res.json({ success: true, message: 'Monitor deleted' });
    } catch (error) {
        console.error('❌ Delete monitor error:', error);
        res.status(400).json({ success: false, message: safeErrorMessage(error) });
    }
};

export const getMonitorStats = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(404).json({ success: false, message: 'Monitor not found' });
        }
        const monitor = await Monitor.findById(req.params.id);
        if (!monitor || (monitor.user.toString() !== req.user._id.toString() && req.user.role !== 'admin')) {
            return res.status(404).json({ success: false, message: 'Monitor not found' });
        }

        const total = Number(monitor.totalChecks) || 0;
        const success = Number(monitor.successfulChecks) || 0;
        const uptimePercentage = total > 0 && Number.isFinite(success) && Number.isFinite(total)
            ? parseFloat(((success / total) * 100).toFixed(2))
            : 100;

        const [recentChecks, incidentCount, ongoingIncidents] = await Promise.all([
            Check.find({ monitor: monitor._id })
                .sort({ timestamp: -1 })
                .limit(100),
            Incident.countDocuments({ monitor: monitor._id }),
            Incident.countDocuments({ monitor: monitor._id, status: 'ongoing' })
        ]);

        const checksWithResponseTime = recentChecks.filter(check => check.responseTime !== null && check.responseTime !== undefined);
        const avgResponseTime = checksWithResponseTime.length > 0
            ? checksWithResponseTime.reduce((sum, check) => sum + check.responseTime, 0) / checksWithResponseTime.length
            : 0;

        res.json({
            success: true,
            data: {
                uptimePercentage: Number.isFinite(uptimePercentage) ? uptimePercentage : 100,
                totalChecks: monitor.totalChecks,
                successfulChecks: monitor.successfulChecks,
                failedChecks: Math.max(0, (Number(monitor.totalChecks) || 0) - (Number(monitor.successfulChecks) || 0)),
                avgResponseTime: Math.round(avgResponseTime),
                lastResponseTime: monitor.lastResponseTime,
                incidentCount,
                ongoingIncidents,
                status: monitor.status,
                lastChecked: monitor.lastChecked
            }
        });
    } catch (error) {
        res.status(400).json({ success: false, message: safeErrorMessage(error) });
    }
};

export const getMonitorChecks = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(404).json({ success: false, message: 'Monitor not found' });
        }
        const monitor = await Monitor.findById(req.params.id);
        if (!monitor || (monitor.user.toString() !== req.user._id.toString() && req.user.role !== 'admin')) {
            return res.status(404).json({ success: false, message: 'Monitor not found' });
        }

        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 100));
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const skip = (page - 1) * limit;

        const [checks, total] = await Promise.all([
            Check.find({ monitor: monitor._id })
                .sort({ timestamp: -1 })
                .limit(limit)
                .skip(skip),
            Check.countDocuments({ monitor: monitor._id })
        ]);

        res.json({
            success: true,
            count: checks.length,
            total,
            page,
            pages: Math.ceil(total / limit) || 1,
            data: checks
        });
    } catch (error) {
        res.status(400).json({ success: false, message: safeErrorMessage(error) });
    }
};

export const checkMonitorNow = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(404).json({ success: false, message: 'Monitor not found' });
        }
        const monitor = await Monitor.findById(req.params.id);
        if (!monitor || (monitor.user.toString() !== req.user._id.toString() && req.user.role !== 'admin')) {
            return res.status(404).json({ success: false, message: 'Monitor not found' });
        }

        // 🛡️ SECURITY: Manual check cooldown (10 seconds) using Redis
        const COOLDOWN_SECONDS = 10;
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

        let updatedMonitor = await Monitor.findByIdAndUpdate(monitor._id, updateData, { new: true });

        // --- PERSISTENT UPTIME CALCULATION --- //
        if (updatedMonitor && updatedMonitor.totalChecks > 0) {
            try {
                const t = Number(updatedMonitor.totalChecks) || 0;
                const s = Number(updatedMonitor.successfulChecks) || 0;
                const lifetimeUptime = t > 0 && Number.isFinite(s / t)
                    ? parseFloat(((s / t) * 100).toFixed(2))
                    : 100;
                const startOf24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
                const [checks24h, up24h] = await Promise.all([
                    Check.countDocuments({ monitor: updatedMonitor._id, timestamp: { $gte: startOf24h } }),
                    Check.countDocuments({ monitor: updatedMonitor._id, timestamp: { $gte: startOf24h }, status: { $in: ['up', 'degraded'] } })
                ]);
                const dayUptime = checks24h > 0 && Number.isFinite(up24h / checks24h)
                    ? parseFloat(((up24h / checks24h) * 100).toFixed(2))
                    : lifetimeUptime;
                updatedMonitor = await Monitor.findByIdAndUpdate(
                    updatedMonitor._id,
                    { $set: { uptimePercentage: lifetimeUptime, last24hUptime: dayUptime } },
                    { new: true }
                );
            } catch (uptimeErr) {
                console.error(`⚠️ Failed to update persistent uptime for ${updatedMonitor.name}:`, uptimeErr.message);
            }
        }

        // --- STRICT INTERVAL RESET --- //
        try {
            await schedulerService.removeMonitor(updatedMonitor._id);
            if (updatedMonitor.isActive) {
                await schedulerService.scheduleMonitorForSync(updatedMonitor);
            }
        } catch (schedErr) {
            console.error('Failed to reset schedule after manual check:', schedErr.message);
        }

        // Use enhancedAlertService
        try {
            if (status === 'down') {
                // Transitioning to down: handleFailure updates ongoing incident or creates new one,
                // and sends failure alert if not already notified.
                await enhancedAlertService.handleFailure(updatedMonitor, result, healthStateResult);
            } else if (status === 'up') {
                // True recovery or cleanup: handleRecovery resolves any ongoing incident,
                // sends recovery alert if alerted, and clears suppression. If no incident exists, it's a no-op.
                await enhancedAlertService.handleRecovery(updatedMonitor, healthStateResult);
            } else if (status === 'degraded') {
                // Transitioning to degraded: do NOT resolve ongoing down incident or wipe suppression;
                // handleDegraded updates the incident without duplicate alert emails.
                const degradationReasons = (reasons || []).filter(reason => {
                    const r = String(reason || '').toLowerCase();
                    return r.includes('performance') || r.includes('degradation') || r.includes('slow') ||
                        r.includes('ssl') || r.includes('cert') || r.includes('security') ||
                        r.includes('rate') || r.includes('429') || r.includes('limit');
                });
                const finalReasons = degradationReasons.length > 0 ? degradationReasons : (reasons || []);
                await enhancedAlertService.handleDegraded(updatedMonitor, result, finalReasons, healthStateResult);
            }
        } catch (alertError) {
            console.error('Error in manual check alerts:', alertError);
        }


        // Trigger global verification asynchronously for down/degraded status (do NOT block manual check response)
        if (status === 'down' || status === 'degraded') {
            healthStateService.triggerImmediateVerification(
                updatedMonitor,
                result,
                healthStateResult,
                check._id.toString()
            ).catch(verifyError => {
                console.error('Error in global verification:', verifyError.message);
            });
        }

        // Emit real-time socket events so dashboard & details pages update immediately
        try {
            schedulerService.emitEnhancedSocketEvents(updatedMonitor, check, oldStatus, healthStateResult);
        } catch (socketErr) {
            console.warn('Socket event emission failed on manual check:', socketErr.message);
        }

        res.json({ success: true, data: { check, monitor: updatedMonitor } });
    } catch (error) {
        res.status(400).json({ success: false, message: safeErrorMessage(error) });
    }
};

export const getQueueStats = async (req, res) => {
    try {
        const stats = await schedulerService.getQueueStats?.() || { waiting: 0, active: 0 };
        res.json({ success: true, data: stats });
    } catch (error) {
        res.status(500).json({ success: false, message: safeErrorMessage(error) });
    }
};

export const verifyJobHealth = async (req, res) => {
    try {
        const health = await schedulerService.verifyJobHealth();
        res.json({ success: true, data: health });
    } catch (error) {
        res.status(500).json({ success: false, message: safeErrorMessage(error) });
    }
};
