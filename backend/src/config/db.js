import mongoose from 'mongoose';
import env from './env.js';

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(env.MONGODB_URI, {
            serverSelectionTimeoutMS: 5000, // Fail fast on bad connection
            socketTimeoutMS: 45000,         // Close idle sockets after 45s
        });
        console.log(`MongoDB Connected: ${conn.connection.host}`);

        // Reconnect event handlers for production resilience
        mongoose.connection.on('disconnected', () =>
            console.warn('⚠️ MongoDB disconnected. Mongoose will attempt to reconnect...')
        );
        mongoose.connection.on('reconnected', () =>
            console.log('✅ MongoDB reconnected successfully')
        );

        return conn;
    } catch (error) {
        console.error(`Error connecting to MongoDB: ${error.message}`);
        // Re-throw so the caller can decide whether to exit or run in degraded mode.
        // Do NOT call process.exit(1) here — it prevents /ping from responding on Render.
        throw error;
    }
};

export default connectDB;
