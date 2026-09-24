import mongoose from 'mongoose';
import env from '../config/env.js';

class DBMirrorService {
    constructor() {
        this.secondaryConn = null;
        this.isReady = false;
    }

    async initialize() {
        // Disabled during tests to keep test runs fast and isolated
        if (process.env.NODE_ENV === 'test' || process.env.FULL_TEST_RUNNER === 'true') {
            return;
        }

        try {
            const primaryUri = env.MONGODB_URI || '';
            const localUri = env.LOCAL_MONGODB_URI || 'mongodb://127.0.0.1:27017/pulseguard';
            const atlasUri = env.ATLAS_MONGODB_URI;

            if (!atlasUri) {
                console.log('ℹ️  [Dual-Write Mirror] Atlas URI not configured; running in single-database mode.');
                return;
            }

            const isPrimaryAtlas = primaryUri.includes('mongodb.net') || primaryUri.startsWith('mongodb+srv://');
            const targetSecondaryUri = isPrimaryAtlas ? localUri : atlasUri;
            const targetLabel = isPrimaryAtlas ? '💻 Local MongoDB' : '☁️  MongoDB Atlas Cloud';

            console.log(`🔄 [Dual-Write Mirror] Connecting secondary target to ${targetLabel}...`);

            this.secondaryConn = await mongoose.createConnection(targetSecondaryUri, {
                serverSelectionTimeoutMS: isPrimaryAtlas ? 5000 : 10000,
                socketTimeoutMS: 45000
            }).asPromise();

            this.isReady = true;
            console.log(`✅ [Dual-Write Mirror] Ready! All monitor and user updates are mirrored to BOTH Localhost & Atlas Cloud.`);
        } catch (err) {
            this.isReady = false;
            console.warn(`⚠️ [Dual-Write Mirror] Secondary DB connection failed (${err.message}). Primary DB will continue normally.`);
        }
    }

    mirrorSave(collectionName, doc) {
        if (!this.isReady || !this.secondaryConn || !doc) return;
        setImmediate(async () => {
            try {
                const raw = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
                delete raw.__v;
                await this.secondaryConn.collection(collectionName).updateOne(
                    { _id: raw._id },
                    { $set: raw },
                    { upsert: true }
                );
                console.log(`🔄 [Dual-Write] Mirrored ${collectionName} "${raw.name || raw.email || raw._id}" to secondary DB.`);
            } catch (err) {
                console.debug(`[Dual-Write] Mirror save failed for ${collectionName}:`, err.message);
            }
        });
    }

    mirrorDelete(collectionName, id) {
        if (!this.isReady || !this.secondaryConn || !id) return;
        setImmediate(async () => {
            try {
                await this.secondaryConn.collection(collectionName).deleteOne({ _id: id });
                console.log(`🔄 [Dual-Write] Mirrored deletion in ${collectionName} for ${id} to secondary DB.`);
            } catch (err) {
                console.debug(`[Dual-Write] Mirror delete failed for ${collectionName}:`, err.message);
            }
        });
    }

    mirrorDeleteMany(collectionName, filter) {
        if (!this.isReady || !this.secondaryConn || !filter) return;
        setImmediate(async () => {
            try {
                await this.secondaryConn.collection(collectionName).deleteMany(filter);
            } catch (err) {
                console.debug(`[Dual-Write] Mirror deleteMany failed for ${collectionName}:`, err.message);
            }
        });
    }
}

const dbMirror = new DBMirrorService();
export default dbMirror;
