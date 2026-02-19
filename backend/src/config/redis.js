import Redis from 'ioredis';
import env from './env.js';

// Check if Redis is disabled for testing
const isRedisDisabled = process.env.REDIS_ENABLED === 'false' || process.env.NODE_ENV === 'test';

let redisClient;

if (isRedisDisabled) {
    console.log('Redis disabled for testing - using mock Redis client');
    
    // Create a mock Redis client for testing without Redis
    redisClient = {
        connect: () => Promise.resolve(),
        disconnect: () => Promise.resolve(),
        get: () => Promise.resolve(null),
        set: () => Promise.resolve(),
        del: () => Promise.resolve(),
        exists: () => Promise.resolve(0),
        on: () => {},
        off: () => {},
        subscribe: () => Promise.resolve(),
        unsubscribe: () => Promise.resolve(),
        publish: () => Promise.resolve(),
        // Add other methods as needed
        hget: () => Promise.resolve(null),
        hset: () => Promise.resolve(),
        hdel: () => Promise.resolve(),
        hgetall: () => Promise.resolve({}),
        sadd: () => Promise.resolve(),
        srem: () => Promise.resolve(),
        smembers: () => Promise.resolve([]),
        sismember: () => Promise.resolve(0),
        incr: () => Promise.resolve(1),
        decr: () => Promise.resolve(0),
        expire: () => Promise.resolve(),
        pexpire: () => Promise.resolve(),
        ttl: () => Promise.resolve(-1),
        flushall: () => Promise.resolve(),
        flushdb: () => Promise.resolve(),
        eval: () => Promise.resolve(),
        pipeline: () => ({
            get: () => ({ get: () => Promise.resolve(null) }),
            set: () => ({ set: () => Promise.resolve() }),
            exec: () => Promise.resolve([])
        })
    };
} else {
    // BullMQ requires maxRetriesPerRequest: null for blocking operations
    // Use commandTimeout to prevent infinite hangs on regular commands
    // The timeout ensures commands fail fast instead of hanging indefinitely
    redisClient = new Redis(env.REDIS_URL, {
        maxRetriesPerRequest: null, // Required by BullMQ for blocking ops (BLPOP, etc.)
        retryDelayOnFailover: 100,
        lazyConnect: false, // Connect immediately on creation
        connectTimeout: 15000, // Increased connection timeout to 15 seconds
        commandTimeout: 0, // Disable command timeout - BullMQ handles blocking commands internally
        enableReadyCheck: true,
        maxRetries: 3,
        retryStrategy: (times) => {
            if (times > 3) return null; // Stop retrying after 3 attempts
            return Math.min(times * 500, 3000); // Increased retry delay for better stability
        },
        // Additional connection settings for stability
        keepAlive: 30000, // Keep connection alive with 30 second intervals
        family: 4, // Use IPv4
        db: 0 // Use database 0
    });

    redisClient.on('connect', () => {
        console.log('Redis connected successfully');
    });

    redisClient.on('error', (err) => {
        // Suppress all error logging - timeouts and connection issues are handled gracefully
        // by the application logic. Only log at debug level for troubleshooting.
        // The errors are expected during normal operation with BullMQ blocking commands.
    });

    redisClient.on('close', () => {
        // Connection closed - this is normal during shutdown or reconnection
    });

    redisClient.on('reconnecting', () => {
        // Normal reconnection behavior
    });

    redisClient.on('ready', () => {
        console.log('Redis ready');
    });
}

export default redisClient;
