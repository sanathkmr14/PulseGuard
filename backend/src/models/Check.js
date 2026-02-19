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
checkSchema.index({ monitor: 1, createdAt: -1 }); // Redundant but safe for createdAt sorting

// TTL index to automatically delete old checks after 90 days
checkSchema.index({ timestamp: 1 }, { expireAfterSeconds: 7776000 });

const Check = mongoose.model('Check', checkSchema);

export default Check;
