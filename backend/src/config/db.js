import mongoose from 'mongoose';
import env from './env.js';

const connectDB = async () => {
    const isAtlas = env.MONGODB_URI?.includes('mongodb.net') || env.MONGODB_URI?.startsWith('mongodb+srv://');
    try {
        const conn = await mongoose.connect(env.MONGODB_URI, {
            serverSelectionTimeoutMS: isAtlas ? 15000 : 5000, // 15s for Cloud Atlas SRV lookup, 5s for local
            socketTimeoutMS: 45000,         // Close idle sockets after 45s
        });
        const targetHost = conn.connection.host;
        console.log(`MongoDB Connected: ${targetHost} (${isAtlas ? 'MongoDB Atlas Cloud' : 'Local MongoDB'})`);

        // Reconnect event handlers for production resilience
        mongoose.connection.on('disconnected', () =>
            console.warn('⚠️ MongoDB disconnected. Mongoose will attempt to reconnect...')
        );
        mongoose.connection.on('reconnected', () =>
            console.log('✅ MongoDB reconnected successfully')
        );

        // Ensure all schema indexes (including sparse deduplication indexes) are built
        import('../models/Check.js').then(m => m.default.syncIndexes()).catch(err => {
            console.debug('Index sync notice:', err.message);
        });

        return conn;
    } catch (error) {
        console.error(`❌ Error connecting to MongoDB (${isAtlas ? 'Atlas Cloud' : 'Local'}): ${error.message}`);
        if (isAtlas) {
            console.warn('💡 Tip: If MongoDB Atlas fails to connect, verify your network IP whitelist on cloud.mongodb.com or set DB_MODE=local in .env to use your local database.');
        } else {
            console.warn('💡 Tip: Make sure your local MongoDB service is running (mongod or brew services start mongodb-community).');
        }
        // Re-throw so the caller can decide whether to exit or run in degraded mode.
        // Do NOT call process.exit(1) here — it prevents /ping from responding on Render.
        throw error;
    }
};

export default connectDB;
