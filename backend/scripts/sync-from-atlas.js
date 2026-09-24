/**
 * sync-from-atlas.js
 * One-time full sync: pulls ALL data from MongoDB Atlas → Local MongoDB
 * Collections: users, monitors, configs, incidents, checks
 *
 * Usage:
 *   node backend/scripts/sync-from-atlas.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const LOCAL_URI = process.env.LOCAL_MONGODB_URI || 'mongodb://127.0.0.1:27017/PulseGuard';
const ATLAS_URI = process.env.ATLAS_MONGODB_URI;

if (!ATLAS_URI) {
    console.error('❌  ATLAS_MONGODB_URI not set in backend/.env');
    process.exit(1);
}

const COLLECTIONS = ['users', 'monitors', 'configs', 'incidents', 'checks'];

async function syncFromAtlas() {
    console.log('\n🔄  Connecting to MongoDB Atlas…');
    const atlas = await mongoose.createConnection(ATLAS_URI, {
        serverSelectionTimeoutMS: 20000,
    }).asPromise();
    console.log('✅  Connected to Atlas');

    console.log('🔄  Connecting to Local MongoDB…');
    const local = await mongoose.createConnection(LOCAL_URI, {
        serverSelectionTimeoutMS: 5000,
    }).asPromise();
    console.log('✅  Connected to Local MongoDB\n');

    let grandTotal = 0;

    for (const name of COLLECTIONS) {
        try {
            const docs = await atlas.collection(name).find({}).toArray();
            console.log(`📦  [${name}]  ${docs.length} document(s) found in Atlas`);

            if (docs.length > 0) {
                // Upsert each document so we never lose locally-created data
                const bulk = local.collection(name).initializeUnorderedBulkOp();
                for (const doc of docs) {
                    bulk.find({ _id: doc._id }).upsert().replaceOne(doc);
                }
                const result = await bulk.execute();
                console.log(`   ✔  upserted ${result.upsertedCount}  |  modified ${result.modifiedCount}`);
                grandTotal += docs.length;
            }
        } catch (err) {
            console.warn(`   ⚠️  Skipped [${name}]: ${err.message}`);
        }
    }

    await atlas.close();
    await local.close();

    console.log(`\n🎉  Done! ${grandTotal} total document(s) synced from Atlas → Local MongoDB.\n`);
}

syncFromAtlas().catch(err => {
    console.error('\n❌  Sync failed:', err.message);
    process.exit(1);
});
