import mongoose from 'mongoose';

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

const Config = mongoose.model('Config', configSchema);

export default Config;
