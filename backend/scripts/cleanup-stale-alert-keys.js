import Redis from 'ioredis';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

async function cleanupStaleKeys() {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
        console.error('REDIS_URL not configured in environment.');
        process.exit(1);
    }

    console.log('🔌 Connecting to Redis...');
    const redis = new Redis(redisUrl);

    try {
        const pattern = 'alert:suppression:*';
        let cursor = '0';
        const keysToDelete = [];
        const validKeys = [];

        do {
            const [newCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
            cursor = newCursor;

            for (const key of keys) {
                // Legacy keys have level suffix: e.g. alert:suppression:<id>:degraded:high or :failure:high
                const parts = key.split(':');
                // Standard format is alert:suppression:<id>:<type> (4 parts) or alert:suppression:global:stats
                if (parts.length > 4 && parts[parts.length - 1] && ['high', 'medium', 'low'].includes(parts[parts.length - 1])) {
                    keysToDelete.push(key);
                } else {
                    validKeys.push(key);
                }
            }
        } while (cursor !== '0');

        console.log(`Found ${keysToDelete.length} stale level-suffixed suppression keys to delete.`);
        if (keysToDelete.length > 0) {
            console.log('Deleting:', keysToDelete);
            await redis.del(...keysToDelete);
            console.log('✅ Stale keys deleted.');
        }

        // Ensure active ongoing monitors have clean, unified 30-day suppression keys
        // Test2 monitor ID: 6aa42aa971e5057419329cc8
        const test2Id = '6aa42aa971e5057419329cc8';
        const test2Key = `alert:suppression:${test2Id}:degraded`;
        await redis.set(test2Key, '1', 'EX', 30 * 86400);
        console.log(`✅ Ensured 30-day suppression for Test2 (${test2Key})`);

        console.log('Remaining valid alert suppression keys:');
        for (const k of validKeys) {
            const ttl = await redis.ttl(k);
            console.log(`- ${k} (TTL: ${ttl}s)`);
        }

    } catch (err) {
        console.error('Error during cleanup:', err.message);
    } finally {
        redis.disconnect();
        console.log('🔌 Disconnected from Redis.');
    }
}

cleanupStaleKeys();
