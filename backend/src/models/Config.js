import mongoose from 'mongoose';
import dbMirror from '../services/db-mirror.service.js';

const configSchema = new mongoose.Schema({
    key: {
        type: String,
        required: true,
        unique: true,
        default: 'GLOBAL_SETTINGS'
    },
    value: {
        maintenanceMode: {
            type: Boolean,
            default: false
        },
        globalAlert: {
            type: String,
            default: ''
        },
        allowSignups: {
            type: Boolean,
            default: true
        }
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

// Dual-Write Mirroring hooks — syncs admin config to BOTH Atlas Cloud and Local MongoDB
configSchema.post('save', function (doc) {
    if (doc) dbMirror.mirrorSave('configs', doc);
});

configSchema.post('findOneAndUpdate', function (doc) {
    if (doc) dbMirror.mirrorSave('configs', doc);
});

const Config = mongoose.model('Config', configSchema);

export default Config;
