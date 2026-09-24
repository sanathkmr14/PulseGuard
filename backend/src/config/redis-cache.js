import Redis from 'ioredis';
import env from './env.js';

// General Purpose Redis Client for Caching (Alert History, Session Store, etc.)
// Unlike the BullMQ client, this one supports retries and reasonable timeouts.

const isRedisDisabled = process.env.REDIS_ENABLED === 'false' || process.env.NODE_ENV === 'test';

let redisCacheClient;

if (isRedisDisabled) {
    console.log('[Redis-Cache] Redis disabled for testing - using in-memory mock client');
    const strings = new Map();
    const lists = new Map();
    const hashes = new Map();

    redisCacheClient = {
        status: 'ready',
        connect: () => Promise.resolve(),
        disconnect: () => Promise.resolve(),
        quit: () => Promise.resolve('OK'),
        get: async (key) => strings.has(key) ? strings.get(key) : null,
        set: async (key, val, ...args) => {
            strings.set(key, String(val));
            return 'OK';
        },
        del: async (...keys) => {
            let count = 0;
            for (const key of keys.flat()) {
                if (strings.delete(key)) count++;
                if (lists.delete(key)) count++;
                if (hashes.delete(key)) count++;
            }
            return count;
        },
        exists: async (key) => (strings.has(key) || lists.has(key) || hashes.has(key)) ? 1 : 0,
        ttl: async () => 3600,
        expire: async () => 1,
        keys: async () => Array.from(new Set([...strings.keys(), ...lists.keys(), ...hashes.keys()])),
        scan: async (cursor, ...args) => {
            const allKeys = Array.from(new Set([...strings.keys(), ...lists.keys(), ...hashes.keys()]));
            return ['0', allKeys];
        },
        lrange: async (key, start, stop) => {
            const list = lists.get(key) || [];
            const end = stop < 0 ? list.length + stop + 1 : stop + 1;
            return list.slice(start, end);
        },
        lpush: async (key, ...values) => {
            if (!lists.has(key)) lists.set(key, []);
            const list = lists.get(key);
            list.unshift(...values);
            return list.length;
        },
        rpush: async (key, ...values) => {
            if (!lists.has(key)) lists.set(key, []);
            const list = lists.get(key);
            list.push(...values);
            return list.length;
        },
        ltrim: async (key, start, stop) => {
            if (lists.has(key)) {
                const list = lists.get(key);
                const end = stop < 0 ? list.length + stop + 1 : stop + 1;
                lists.set(key, list.slice(start, end));
            }
            return 'OK';
        },
        hget: async (key, field) => hashes.get(key)?.[field] || null,
        hset: async (key, field, val) => {
            if (!hashes.has(key)) hashes.set(key, {});
            hashes.get(key)[field] = String(val);
            return 1;
        },
        hgetall: async (key) => hashes.get(key) || {},
        hincrby: async (key, field, increment) => {
            if (!hashes.has(key)) hashes.set(key, {});
            const cur = parseInt(hashes.get(key)[field] || '0', 10);
            const next = cur + parseInt(increment, 10);
            hashes.get(key)[field] = String(next);
            return next;
        },
        xadd: async () => `${Date.now()}-0`,
        pipeline: function () {
            const ops = [];
            const p = {
                hincrby(k, f, i) { ops.push(() => redisCacheClient.hincrby(k, f, i)); return p; },
                expire(k, s) { ops.push(() => redisCacheClient.expire(k, s)); return p; },
                set(k, v, ...a) { ops.push(() => redisCacheClient.set(k, v, ...a)); return p; },
                get(k) { ops.push(() => redisCacheClient.get(k)); return p; },
                del(...k) { ops.push(() => redisCacheClient.del(...k)); return p; },
                exec: async () => {
                    const results = [];
                    for (const op of ops) {
                        try {
                            results.push([null, await op()]);
                        } catch (err) {
                            results.push([err, null]);
                        }
                    }
                    return results;
                }
            };
            return p;
        },
        on: () => { },
        off: () => { }
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
