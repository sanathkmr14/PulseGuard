import mongoose from 'mongoose';
import healthStateService from '../services/health-evaluator.service.js';

const monitorSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    name: {
        type: String,
        required: [true, 'Please provide a monitor name'],
        trim: true
    },
    type: {
        type: String,
        enum: ['HTTP', 'HTTPS', 'TCP', 'UDP', 'DNS', 'SMTP', 'SSL', 'PING'],
        required: true,
        default: 'HTTPS'
    },
    url: {
        type: String,
        required: [true, 'Please provide a URL or hostname']
    },
    interval: {
        type: Number,
        default: 5, // minutes
        min: [5, 'Monitoring interval must be at least 5 minutes to prevent resource exhaustion'],
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
        min: 1
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
        default: 30,
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
    consecutiveSlowCount: {
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

// FIXED: Pre-remove hook for proper cascading delete of checks and incidents
monitorSchema.pre('deleteOne', { document: true, query: false }, async function () {
    try {
        const Check = mongoose.model('Check');
        const Incident = mongoose.model('Incident');
        const schedulerService = (await import('../services/scheduler.service.js')).default;

        console.log(`🗑️  Cascading delete for monitor: ${this._id}`);

        // Remove from scheduler first
        await schedulerService.removeMonitor(this._id).catch(err =>
            console.error(`   Scheduler remove failed:`, err.message)
        );

        // Delete all checks and incidents associated with this monitor
        const [checksResult, incidentsResult] = await Promise.all([
            Check.deleteMany({ monitor: this._id }),
            Incident.deleteMany({ monitor: this._id })
        ]);

        console.log(`   ✅ Deleted ${checksResult.deletedCount} checks and ${incidentsResult.deletedCount} incidents`);

        // Cleanup health state
        await healthStateService.cleanupState(this._id);
    } catch (error) {
        console.error('❌ Monitor cascading delete error:', error);
    }
});

monitorSchema.post('findOneAndDelete', async function (doc) {
    if (doc) {
        await healthStateService.cleanupState(doc._id);
    }
});

const Monitor = mongoose.model('Monitor', monitorSchema);

export default Monitor;
