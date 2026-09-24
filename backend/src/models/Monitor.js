import mongoose from 'mongoose';
import healthStateService from '../services/health-evaluator.service.js';
import enhancedAlertService from '../services/enhanced-alert.service.js';

const monitorSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    name: {
        type: String,
        required: [true, 'Please provide a monitor name'],
        trim: true,
        maxlength: [200, 'Monitor name cannot exceed 200 characters'] // [H1]
    },
    type: {
        type: String,
        enum: ['HTTP', 'HTTPS', 'TCP', 'UDP', 'DNS', 'SMTP', 'SSL', 'PING'],
        required: true,
        default: 'HTTPS'
    },
    url: {
        type: String,
        required: [true, 'Please provide a URL or hostname'],
        maxlength: [2048, 'URL cannot exceed 2048 characters'] // [H1] Standard browser URL max
    },
    interval: {
        type: Number,
        default: 5, // minutes
        min: [1, 'Monitoring interval must be at least 1 minute'],
        max: 1440
    },
    timeout: {
        type: Number,
        default: 10000, // 10 seconds is usually enough for well-behaved sites
        min: [1000, 'Timeout must be at least 1 second'],
        max: [30000, 'Timeout cannot exceed 30 seconds for stability and fair usage']
    },
    port: {
        type: Number,
        default: null,
        min: [1, 'Port must be at least 1'],
        max: [65535, 'Port must be less than 65536']
    },
    alertThreshold: {
        type: Number,
        default: 2, // Alert after 2 consecutive failures (confirm downtime)
        min: 1,
        max: [20, 'Alert threshold cannot exceed 20'] // [H1] Prevent absurdly large values
    },
    headers: {
        type: Map,
        of: String,
        default: undefined
    },
    status: {
        type: String,
        enum: ['up', 'down', 'degraded', 'paused', 'unknown'],
        default: 'unknown'
    },
    degradedThresholdMs: {
        type: Number,
        // Protocol-specific default thresholds are applied in services
        // Default fallback is 2000ms, services override based on monitor type
        default: 2000,
        min: 0
    },
    sslExpiryThresholdDays: {
        type: Number,
        default: 14,
        min: 1,
        max: 365
    },
    isActive: {
        type: Boolean,
        default: true
    },
    lastChecked: {
        type: Date,
        default: null
    },
    lastResponseTime: {
        type: Number,
        default: null
    },
    consecutiveFailures: {
        type: Number,
        default: 0
    },
    consecutiveDegraded: {
        type: Number,
        default: 0
    },
    totalChecks: {
        type: Number,
        default: 0
    },
    successfulChecks: {
        type: Number,
        default: 0
    },
    uptimePercentage: {
        type: Number,
        default: 100,
        min: 0,
        max: 100
    },
    last24hUptime: {
        type: Number,
        default: 100,
        min: 0,
        max: 100
    }
}, {
    timestamps: true
});

// Index for efficient queries
// Primary compound index for common lookups
monitorSchema.index({ user: 1, status: 1 });
monitorSchema.index({ isActive: 1 });
monitorSchema.index({ type: 1 });
monitorSchema.index({ user: 1, url: 1, type: 1 }, { unique: true });

// Shared monitor cascading cleanup helper
async function cleanupMonitorDependencies(monitorId) {
    try {
        const Check = mongoose.model('Check');
        const Incident = mongoose.model('Incident');
        const schedulerService = (await import('../services/scheduler.service.js')).default;
        const redisClient = (await import('../config/redis-cache.js')).default;

        console.log(`🗑️  Cascading delete for monitor: ${monitorId}`);

        // 1. Remove from BullMQ scheduler
        await schedulerService.removeMonitor(monitorId).catch(err =>
            console.error(`   Scheduler remove failed for ${monitorId}:`, err.message)
        );

        // 2. Delete all related checks and incidents from MongoDB
        const [checksResult, incidentsResult] = await Promise.all([
            Check.deleteMany({ monitor: monitorId }),
            Incident.deleteMany({ monitor: monitorId })
        ]);

        console.log(`   ✅ Deleted ${checksResult.deletedCount} checks and ${incidentsResult.deletedCount} incidents for ${monitorId}`);

        // 3. Clean up Redis keys (health state, alert suppression, and manual-check cooldown)
        await Promise.all([
            healthStateService.cleanupState(monitorId).catch(err => console.error('HealthState cleanup failed:', err.message)),
            enhancedAlertService.clearAlertSuppression(monitorId).catch(err => console.error('Alert suppression cleanup failed:', err.message)),
            redisClient.del(`cooldown:manual-check:${monitorId}`).catch(() => {})
        ]);
        console.log(`   ✅ Cleaned up all Redis keys for monitor ${monitorId}`);
    } catch (error) {
        console.error('❌ Monitor cascading delete error:', error);
    }
}

// Cascading delete hooks
monitorSchema.pre('deleteOne', { document: true, query: false }, async function () {
    await cleanupMonitorDependencies(this._id);
});

// Dual-Write Mirroring hooks
import dbMirror from '../services/db-mirror.service.js';

monitorSchema.post('save', function (doc) {
    if (doc) dbMirror.mirrorSave('monitors', doc);
});

monitorSchema.post('findOneAndUpdate', function (doc) {
    if (doc) dbMirror.mirrorSave('monitors', doc);
});

monitorSchema.post('findOneAndDelete', async function (doc) {
    if (doc) {
        dbMirror.mirrorDelete('monitors', doc._id);
        await cleanupMonitorDependencies(doc._id);
    }
});

monitorSchema.post('deleteOne', { document: true, query: false }, function (doc) {
    if (doc) dbMirror.mirrorDelete('monitors', doc._id);
});

const Monitor = mongoose.model('Monitor', monitorSchema);

export default Monitor;
