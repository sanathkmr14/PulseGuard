import mongoose from 'mongoose';
import { beforeAll, afterAll } from '@jest/globals';

process.env.NODE_ENV = 'test';
process.env.ALLOW_PRIVATE_IPS = 'true';
process.env.REDIS_ENABLED = 'false';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_pulseguard_key_32_bytes_long!!';

const TEST_MONGO_URI = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017/pulseguard_test';
process.env.MONGODB_URI = TEST_MONGO_URI;

beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
        try {
            await mongoose.connect(TEST_MONGO_URI, {
                serverSelectionTimeoutMS: 3000
            });
        } catch (e) {
            console.warn('[test-setup] Could not connect to local MongoDB:', e.message);
        }
    }
});

afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
        try {
            await mongoose.disconnect();
        } catch (e) {
            // Ignore disconnect errors
        }
    }
});
