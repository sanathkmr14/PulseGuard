import mongoose from 'mongoose';

const incidentSchema = new mongoose.Schema({
    monitor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Monitor',
        required: true
    },
    startTime: {
        type: Date,
        required: true,
        default: Date.now
    },
    endTime: {
        type: Date,
        default: null
    },
    duration: {
        type: Number, // in milliseconds
        default: null
    },
    status: {
        type: String,
        enum: ['ongoing', 'resolved'],
        default: 'ongoing'
    },
    errorMessage: {
        type: String,
        default: ''
    },
    errorType: {
        type: String,
        default: ''
    },
    statusCode: {
        type: Number,
        default: null
    },
    severity: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'medium'
    },
    confidence: {
        type: Number,
        default: 0
    },
    degradationCategory: {
        type: String,
        default: null
    },
    healthStateAnalysis: {
        type: Object,
        default: null
    },
    recoveryConfidence: {
        type: Number,
        default: null
    },
    failureRate: {
        type: Number,
        default: null
    },
    patternDetected: {
        type: String,
        default: null
    },
    notificationsSent: {
        email: {
            type: Boolean,
            default: false
        },
        // Optional per-recipient details for auditing (to, success, messageId, error)
        emailDetails: {
            type: [
                {
                    to: { type: String },
                    success: { type: Boolean },
                    messageId: { type: String },
                    error: { type: String }
                }
            ],
            default: []
        },
        slack: {
            type: Boolean,
            default: false
        },
        sms: {
            type: Boolean,
            default: false
        },
        webhook: {
            type: Boolean,
            default: false
        }
    },
    resolvedBy: {
        type: String,
        enum: ['auto', 'manual'],
        default: 'auto'
    },
    verifications: [
        {
            location: String,
            isUp: Boolean,
            responseTime: Number,
            timestamp: { type: Date, default: Date.now },
            errorMessage: String
        }
    ]
}, {
    timestamps: true,
    toJSON: {
        transform: function (doc, ret) {
            // PII Protection: Mask notification details and internal verification logs
            // Only keep broad indicators for public/unprivileged views
            if (ret.notificationsSent) {
                if (ret.notificationsSent.emailDetails) delete ret.notificationsSent.emailDetails;
            }
            return ret;
        }
    },
    toObject: {
        transform: function (doc, ret) {
            if (ret.notificationsSent && ret.notificationsSent.emailDetails) delete ret.notificationsSent.emailDetails;
            return ret;
        }
    }
});

// Index for efficient queries
incidentSchema.index({ monitor: 1, startTime: -1 });
incidentSchema.index({ status: 1 });
incidentSchema.index({ monitor: 1, status: 1 }); // Compound index for frequent "ongoing incident for monitor" checks
incidentSchema.index({ createdAt: -1 }); // For "Recent Incidents" global lists

// Calculate duration when incident is resolved
incidentSchema.pre('save', function (next) {
    if (this.endTime && this.startTime) {
        this.duration = this.endTime - this.startTime;
    }
    next();
});

const Incident = mongoose.model('Incident', incidentSchema);

export default Incident;
