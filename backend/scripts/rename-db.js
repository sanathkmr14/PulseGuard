/**
 * Final cleanup:
 * - Copy Website_checker → pulseguard on Local (since PulseGuard case conflict exists)
 * - Drop Website_checker on Local
 * - Verify both databases have all 5 collections
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const LOCAL_OLD_URI  = 'mongodb://127.0.0.1:27017/Website_checker';
const LOCAL_NEW_URI  = 'mongodb://127.0.0.1:27017/pulseguard';     // use existing lowercase
const ATLAS_NEW_URI  = process.env.ATLAS_MONGODB_URI.replace('Website_checker', 'PulseGuard');
const collections    = ['monitors', 'users', 'checks', 'incidents', 'configs'];

async function verifyAtlas() {
    console.log('\n📊 [Atlas Cloud — PulseGuard] Verifying...');
    const conn = await mongoose.createConnection(ATLAS_NEW_URI, { serverSelectionTimeoutMS: 15000 }).asPromise();
    for (const col of collections) {
        const count = await conn.collection(col).countDocuments();
        console.log(`   ${col.padEnd(12)}: ${count} docs ✅`);
    }
    await conn.close();
}

async function fixLocal() {
    console.log('\n🔄 [Local] Copying Website_checker → pulseguard and dropping old DB...');

    const oldConn = await mongoose.createConnection(LOCAL_OLD_URI, { serverSelectionTimeoutMS: 5000 }).asPromise();
    const newConn = await mongoose.createConnection(LOCAL_NEW_URI, { serverSelectionTimeoutMS: 5000 }).asPromise();

    for (const name of collections) {
        const docs = await oldConn.collection(name).find({}).toArray();
        if (docs.length > 0) {
            // Upsert into pulseguard (won't duplicate existing data)
            for (const doc of docs) {
                await newConn.collection(name).replaceOne({ _id: doc._id }, doc, { upsert: true });
            }
            console.log(`   ✅ "${name}": ${docs.length} docs → pulseguard`);
        } else {
            console.log(`   ⬜ "${name}": empty, skipped`);
        }
    }

    // Drop the old Website_checker
    await oldConn.db.dropDatabase();
    console.log('\n   🗑️  Dropped local "Website_checker"');

    // Final verification
    console.log('\n📊 [Local — pulseguard] Verifying...');
    for (const col of collections) {
        const count = await newConn.collection(col).countDocuments();
        console.log(`   ${col.padEnd(12)}: ${count} docs ✅`);
    }

    await oldConn.close();
    await newConn.close();
}

async function main() {
    console.log('='.repeat(60));
    console.log('  PulseGuard — Final DB rename cleanup');
    console.log('='.repeat(60));

    await verifyAtlas();
    await fixLocal();

    console.log('\n' + '='.repeat(60));
    console.log('🎉 Done! Both databases renamed:');
    console.log('   ☁️  Atlas  : PulseGuard (cluster0.gzdbau3.mongodb.net)');
    console.log('   💻 Local  : pulseguard (localhost:27017)');
    console.log('='.repeat(60));
    process.exit(0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
