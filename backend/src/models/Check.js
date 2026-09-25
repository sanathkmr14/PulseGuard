import mongoose from 'mongoose';

const checkSchema = new mongoose.Schema({
    monitor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Monitor',
        required: true
    },
    timestamp: {
        type: Date,
        required: true,
        default: Date.now
    },
    status: {
        type: String,
        enum: ['up', 'down', 'degraded'],
        required: true
    },
    responseTime: {
        type: Number, // in milliseconds
        default: null
    },
    statusCode: {
        type: Number,
        default: null
    },
    errorMessage: {
        type: String,
        default: ''
    },
    errorType: {
        type: String,
        default: ''
    },
    sslInfo: {
        valid: {
            type: Boolean,
            default: null
        },
        validFrom: {
            type: Date,
            default: null
        },
        validTo: {
            type: Date,
            default: null
        },
        daysRemaining: {
            type: Number,
            default: null
        }
    },
    degradationReasons: {
        type: [String],
        default: undefined
    },
    // Deduplication key for scheduled checks: Math.floor(timestamp / 60000).
    // Both the local dev server and the cloud instance set the same cycleKey for checks
    // within the same 1-minute window. MongoDB's sparse unique index rejects the second
    // write (E11000), so only the faster instance's result is recorded per cycle.
    // null for manual "Check Now" — sparse index ignores nulls so they are never deduplicated.
    cycleKey: {
        type: Number,
        default: null
    },
    verifications: [
        {
            location: String,
            country: String,
            isUp: Boolean,
            responseTime: Number,
            statusCode: Number,
            errorMessage: String
        }
    ]
}, {
    timestamps: false
});

// Index for efficient queries
checkSchema.index({ monitor: 1, timestamp: -1 });
checkSchema.index({ timestamp: -1 });
checkSchema.index({ monitor: 1, status: 1 }); // For uptime calculations

// TTL index to automatically delete old checks after 90 days
checkSchema.index({ timestamp: 1 }, { expireAfterSeconds: 7776000 });

// Deduplication: partialFilterExpression ensures only documents with a numeric cycleKey are indexed.
// Documents with null cycleKey (manual checks) are completely ignored by the unique index.
checkSchema.index(
    { monitor: 1, cycleKey: 1 },
    { unique: true, partialFilterExpression: { cycleKey: { $type: 'number' } } }
);


// Dual-Write Mirroring hook
import dbMirror from '../services/db-mirror.service.js';

checkSchema.post('save', function (doc) {
    if (doc) dbMirror.mirrorSave('checks', doc);
});

const Check = mongoose.model('Check', checkSchema);

export default Check;
