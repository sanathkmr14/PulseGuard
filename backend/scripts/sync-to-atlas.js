import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const LOCAL_URI = process.env.LOCAL_MONGODB_URI || 'mongodb://127.0.0.1:27017/pulseguard';
const ATLAS_URI = process.argv[2] || process.env.ATLAS_MONGODB_URI;

if (!ATLAS_URI) {
    console.error('❌ Error: Please provide your MongoDB Atlas connection string.');
    console.log('Usage: node scripts/sync-to-atlas.js "mongodb+srv://<user>:<password>@cluster0.gzdbau3.mongodb.net/Website_checker?retryWrites=true&w=majority"');
    process.exit(1);
}

async function syncToAtlas() {
    console.log('🔄 Connecting to Local MongoDB...');
    const localConn = await mongoose.createConnection(LOCAL_URI).asPromise();
    console.log('✅ Connected to Local MongoDB');

    console.log('🔄 Connecting to MongoDB Atlas Cloud...');
    const atlasConn = await mongoose.createConnection(ATLAS_URI, {
        serverSelectionTimeoutMS: 15000
    }).asPromise();
    console.log('✅ Connected to MongoDB Atlas Cloud');

    const collections = ['users', 'monitors', 'configs', 'incidents'];

    for (const name of collections) {
        const localDocs = await localConn.collection(name).find({}).toArray();
        console.log(`📦 Found ${localDocs.length} documents in local collection "${name}"`);

        if (localDocs.length > 0) {
            await atlasConn.collection(name).deleteMany({});
            await atlasConn.collection(name).insertMany(localDocs);
            console.log(`🚀 Successfully copied ${localDocs.length} documents to Atlas collection "${name}"!`);
        }
    }

    console.log('\n🎉 All local data has been successfully synchronized to MongoDB Atlas Cloud!');
    await localConn.close();
    await atlasConn.close();
}

syncToAtlas().catch(err => {
    console.error('❌ Sync failed:', err.message);
    process.exit(1);
});
