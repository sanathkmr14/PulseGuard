import Redis from 'ioredis';
import env from './env.js';

// General Purpose Redis Client for Caching (Alert History, Session Store, etc.)
// Unlike the BullMQ client, this one supports retries and reasonable timeouts.

const isRedisDisabled = process.env.REDIS_ENABLED === 'false' || process.env.NODE_ENV === 'test';

let redisCacheClient;

if (isRedisDisabled) {
    console.log('[Redis-Cache] Redis disabled for testing - using mock client');
    redisCacheClient = {
        connect: () => Promise.resolve(),
        disconnect: () => Promise.resolve(),
        get: () => Promise.resolve(null),
        set: () => Promise.resolve(),
        del: () => Promise.resolve(),
        exists: () => Promise.resolve(0),
        on: () => { },
        off: () => { },
        // Minimal API for caching
        keys: () => Promise.resolve([])
    };
} else {
    // Standard Reliable Configuration
    redisCacheClient = new Redis(env.REDIS_URL, {
        maxRetriesPerRequest: 3, // Enable retries for reliability
        connectTimeout: 10000,
        enableReadyCheck: true,
        retryStrategy: (times) => Math.min(times * 100, 3000), // Linear backoff
        // Keep-alive to prevent connection drops in low-traffic periods
        keepAlive: 10000,
        family: 4,
        db: 0
    });

    redisCacheClient.on('error', (err) => {
        // Log errors but don't crash app (ioredis handles reconnection)
        if (process.env.NODE_ENV !== 'test') {
            console.error('[Redis-Cache] Connection Error:', err.message);
        }
    });

    redisCacheClient.on('connect', () => {
        console.log('[Redis-Cache] Connected successfully');
    });
}

export default redisCacheClient;
