import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

export const env = {
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: process.env.PORT || 5000,
    MONGODB_URI: process.env.MONGODB_URI,
    REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
    JWT_SECRET: process.env.JWT_SECRET,
    FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
    TESTSPRITE_API_KEY: process.env.TESTSPRITE_API_KEY,
    WORKER_CONCURRENCY: parseInt(process.env.WORKER_CONCURRENCY, 10) || 0, // 0 means auto-detect
    // Add other environment variables here as needed
};

// Simple validation
if (!env.MONGODB_URI) {
    // Log clearly but don't exit — allows /ping to respond while the issue is investigated.
    console.error('FATAL: MONGODB_URI is not defined in environment. DB connections will fail.');
}

if (!env.JWT_SECRET) {
    // [L1 SECURITY FIX] A missing JWT_SECRET must be fatal.
    // jsonwebtoken silently accepts `undefined` as a secret, issuing exploitable tokens.
    console.error('FATAL: JWT_SECRET is not defined in environment. Refusing to start.');
    process.exit(1);
}

export default env;
