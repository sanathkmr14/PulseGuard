import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Database Mode resolution: supports explicit DB_MODE ('local' | 'atlas') or standard MONGODB_URI
const dbMode = (process.env.DB_MODE || '').toLowerCase();
let resolvedMongoUri = process.env.MONGODB_URI;

if (dbMode === 'atlas' && process.env.ATLAS_MONGODB_URI) {
    resolvedMongoUri = process.env.ATLAS_MONGODB_URI;
} else if (dbMode === 'local' && (process.env.LOCAL_MONGODB_URI || process.env.MONGODB_URI)) {
    resolvedMongoUri = process.env.LOCAL_MONGODB_URI || process.env.MONGODB_URI;
} else if (!resolvedMongoUri) {
    resolvedMongoUri = process.env.LOCAL_MONGODB_URI || process.env.ATLAS_MONGODB_URI || 'mongodb://127.0.0.1:27017/pulseguard';
}

export const env = {
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: process.env.PORT || 5011,
    DB_MODE: dbMode || (resolvedMongoUri?.includes('mongodb.net') ? 'atlas' : 'local'),
    MONGODB_URI: resolvedMongoUri,
    LOCAL_MONGODB_URI: process.env.LOCAL_MONGODB_URI || 'mongodb://127.0.0.1:27017/pulseguard',
    ATLAS_MONGODB_URI: process.env.ATLAS_MONGODB_URI,
    REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
    JWT_SECRET: process.env.JWT_SECRET,
    FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
    TESTSPRITE_API_KEY: process.env.TESTSPRITE_API_KEY,
    WORKER_CONCURRENCY: parseInt(process.env.WORKER_CONCURRENCY, 10) || 0, // 0 means auto-detect
    // When false: this instance serves the API only (no BullMQ worker, no master lock).
    // Set to false on local dev so only the cloud instance (Render) runs scheduled checks.
    // "Check Now" (manual) still works because it calls MonitorRunner.run() directly.
    SCHEDULER_WORKER_ENABLED: process.env.SCHEDULER_WORKER_ENABLED !== 'false',
};

// Simple validation
if (!env.MONGODB_URI) {
    // Log clearly but don't exit — allows /ping to respond while the issue is investigated.
    console.error('FATAL: MONGODB_URI is not defined in environment. DB connections will fail.');
}

if (!env.JWT_SECRET) {
    // [L1 SECURITY FIX] A missing JWT_SECRET must be fatal.
    // jsonwebtoken silently accepts `undefined` as a secret, issuing exploitable tokens.
    // NOTE: We log here but do NOT exit — process.exit() at import time would kill the server
    // before httpServer.listen() is reached, making /ping unreachable and breaking keep-alive.
    // The fatal check is enforced in startServer() AFTER the port is bound.
    console.error('FATAL: JWT_SECRET is not defined in environment. API will be disabled.');
}

export default env;
