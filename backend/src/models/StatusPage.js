import mongoose from 'mongoose';

const statusPageSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    name: {
        type: String,
        required: [true, 'Please provide a status page name'],
        trim: true
    },
    slug: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    monitors: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Monitor'
    }],
    isPublic: {
        type: Boolean,
        default: true
    },
    customDomain: {
        type: String,
        default: ''
    },
    branding: {
        logo: {
            type: String,
            default: ''
        },
        primaryColor: {
            type: String,
            default: '#6366f1'
        },
        title: {
            type: String,
            default: 'System Status'
        },
        description: {
            type: String,
            default: 'Current status of our services'
        }
    },
    showUptime: {
        type: Boolean,
        default: true
    },
    showIncidents: {
        type: Boolean,
        default: true
    },
    showResponseTime: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Index for efficient queries
// Note: slug already has unique index from schema definition (unique: true)
statusPageSchema.index({ user: 1 });

const StatusPage = mongoose.model('StatusPage', statusPageSchema);

export default StatusPage;
