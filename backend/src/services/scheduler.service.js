import { Queue, Worker, QueueEvents } from 'bullmq';
import Redis from 'ioredis'; // Dedicated Redis for BullMQ
import { EventEmitter } from 'events';
import { request } from 'undici'; // High-performance HTTP client with 1xx support
import net from 'net';
import tls from 'tls';
import dgram from 'dgram';
import dns from 'dns';
import ping from 'ping';
import MonitorRunner from './runner.js';
import Monitor from '../models/Monitor.js';
import Check from '../models/Check.js';
import Incident from '../models/Incident.js';
import enhancedAlertService from './enhanced-alert.service.js';
import enhancedHealthStateService from './health-evaluator.service.js';
import env from '../config/env.js';

import os from 'os';

// Configuration
const QUEUE_NAME = 'monitor-queue';
const LOCK_KEY = 'scheduler:master:lock';
const LOCK_TTL = 60000; // 60 seconds

// Dynamic Concurrency: Use CPU count or ENV, minimum 2, maximum 10 (to prevent overloading Redis)
// For I/O bound tasks, we can go higher than CPU count.
const CPU_COUNT = os.cpus().length;
const DEFAULT_CONCURRENCY = Math.max(2, Math.min(CPU_COUNT * 2, 20)); // Heuristic: 2x CPUs, max 20
const WORKER_CONCURRENCY = env.WORKER_CONCURRENCY > 0 ? env.WORKER_CONCURRENCY : DEFAULT_CONCURRENCY;

console.log(`🚀 Scheduler Worker Concurrency set to: ${WORKER_CONCURRENCY} (CPUs: ${CPU_COUNT})`);

const isTestEnv = process.env.NODE_ENV === 'test' || process.env.REDIS_ENABLED === 'false';

let queueConnection, workerConnection, lockConnection;

if (isTestEnv) {
    const createMockConnection = (name) => {
        const emitter = new EventEmitter();
        emitter.status = 'ready';
        emitter.options = { name };
        emitter.set = async () => 'OK';
        emitter.get = async () => null;
        emitter.del = async () => 1;
        emitter.eval = async () => 1;
        emitter.quit = async () => 'OK';
        emitter.disconnect = async () => 'OK';
        emitter.ping = async () => 'PONG';
        return emitter;
    };
    queueConnection = createMockConnection('queue');
    workerConnection = createMockConnection('worker');
    lockConnection = createMockConnection('lock');
} else {
    // Create a dedicated Redis connection for BullMQ to avoid connection conflicts
    // BullMQ REQUIRES maxRetriesPerRequest: null for blocking operations (BLPOP, etc.)
    // Create base configuration for BullMQ Redis connections
    const redisOptions = {
        maxRetriesPerRequest: null, // REQUIRED by BullMQ for blocking operations
        retryDelayOnFailover: 100,
        lazyConnect: false,
        connectTimeout: 20000,
        commandTimeout: 30000, // Increased to 30s to survive transient Redis lag
        enableReadyCheck: true,
        maxRetries: 10, // Allow some retries for general stability
        retryStrategy: (times) => Math.min(times * 50, 2000), // Exponential backoff for reconnection
        keepAlive: 30000,
        family: 4,
        db: 0
    };

    // 1. Connection for Queue operations (metadata, counts, adding jobs)
    queueConnection = new Redis(env.REDIS_URL, { ...redisOptions });

    // 2. Connection for Worker operations (blocking BRPOP, etc.) 
    workerConnection = new Redis(env.REDIS_URL, { ...redisOptions });

    // 3. Connection for Master Lock (standard operations)
    lockConnection = new Redis(env.REDIS_URL, { ...redisOptions, maxRetriesPerRequest: 20 });

    // Handle errors for all connections
    [queueConnection, workerConnection, lockConnection].forEach(conn => {
        conn.on('error', (err) => console.debug(`Redis [${conn.options.name || 'Conn'}] Error:`, err.message));
    });
}


/**
 * Robust Scheduler
 * Uses Redis Locking to ensure only ONE instance schedules jobs ("Master").
 * All instances can process jobs ("Workers").
 */
class SchedulerService {
    constructor() {
        // Shared state
        this.nodeId = Math.random().toString(36).substring(2, 6).toUpperCase();
        this.redis = lockConnection; // Master lock operations
        if (isTestEnv) {
            this.queue = {
                add: async () => ({ id: 'mock-job-id', getState: async () => 'completed', remove: async () => { } }),
                getJob: async () => null,
                getJobs: async () => [],
                getJobCounts: async () => ({ waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 }),
                getRepeatableJobs: async () => [],
                removeRepeatableByKey: async () => { },
                clean: async () => [],
                drain: async () => { },
                close: async () => { },
                on: () => { },
                off: () => { }
            };
            this.worker = null;
            this.isMaster = true;
            this.hasInitialSync = true;
            this.lockInterval = null;
            this.io = null;
            this.isReady = true;
        } else {
            this.queue = new Queue(QUEUE_NAME, {
                connection: queueConnection,
                defaultJobOptions: {
                    removeOnComplete: true,
                    removeOnFail: { age: 3600, count: 20 }
                },
                streams: {
                    events: {
                        maxLen: 100 // Cap event history to 100 for minimal Redis footprint
                    }
                }
            });
            this.worker = null;
            this.isMaster = false;
            this.hasInitialSync = false;
            this.lockInterval = null;
            this.io = null;
            this.isReady = false; // Add readiness indicator
        }
        console.log(`📡 Scheduler instance created [Node: ${this.nodeId}]`);
    }

    async initialize() {
        if (isTestEnv) {
            console.log('🔄 Initializing Scheduler Service (Test Mode - skipping Redis worker)...');
            this.isMaster = true;
            this.isReady = true;
            this.hasInitialSync = true;
            return;
        }

        // API-only mode: do not start the BullMQ worker or try to acquire the master lock.
        // This prevents the local dev server from consuming scheduled jobs that belong to the
        // cloud instance (Render), which eliminates the dual-writer interleaving problem.
        // Manual "Check Now" still works — it calls MonitorRunner.run() directly (not via the queue).
        if (!env.SCHEDULER_WORKER_ENABLED) {
            console.log('⏸️  Scheduler Worker DISABLED (SCHEDULER_WORKER_ENABLED=false). This instance is API-only.');
            console.log('   ✅ Check Now (manual) still works — runs MonitorRunner.run() directly.');
            console.log('   ⏭️  Scheduled checks will be handled by the cloud instance only.');
            this.isMaster = false;
            this.isReady = true; // API is ready; just no background workers
            return;
        }

        console.log('🔄 Initializing Scheduler Service...');


        // 1. Initialize Worker with concurrency=1 for consistent timing
        this.worker = new Worker(QUEUE_NAME, async (job) => {
            return await this.processJob(job);
        }, {
            connection: workerConnection,
            concurrency: WORKER_CONCURRENCY,
            lockDuration: 180000, // 3 mins (Max monitor timeout is 2 mins + overhead)
            lockRenewTime: 90000, // Renew lock halfway through
            maxStalledCount: 1 // Don't retry stalled jobs indefinitely
        });

        this.worker.on('completed', (job) => {
            // console.log(`✓ Job ${job.id} done`);
        });

        this.worker.on('failed', (job, err) => {
            // Robust logging that never crashes
            // Handle cases where err is undefined, null, or doesn't have .message or reason
            // Also check job.failedReason which BullMQ may set
            const errorSource = err?.message || err?.reason || job?.failedReason || err || 'Unknown internal error';
            const monitorId = job?.data?.monitorId || 'Unknown ID';
            console.error(`✗ [Job Failed] Monitor: ${monitorId} | Job ID: ${job?.id || 'N/A'} | Reason: ${errorSource}`);
        });

        // 2. Try to acquire Master Lock (skip sync here, we'll do it below)
        // Wait for a brief moment to allow Redis connection to stabilize
        await new Promise(resolve => setTimeout(resolve, 100));
        await this.tryAcquireLock(true);

        // 3. Start Lock Refresh Loop
        this.lockInterval = setInterval(() => this.tryAcquireLock(), LOCK_TTL / 2);

        console.log(`✅ [Node: ${this.nodeId}] Scheduler Initialized. Is Master? ${this.isMaster}`);
        // NOTE: isReady is only set true AFTER syncMonitors() completes to avoid false positives
        // this.isReady = true; ← DO NOT set here; syncMonitors() will set it

        if (this.isMaster && !this.hasInitialSync) {
            console.log(`👑 [Node: ${this.nodeId}] Master Node - Performing initial sync`);
            await this.cleanQueue();
            await this.syncMonitors();
            this.isReady = true;
        }

        // Consolidate initialization and sync logic to prevent race conditions
        // In local/dev environments, we often want to become master immediately
        const isDevelopment = !process.env.NODE_ENV || process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'dev' || process.env.NODE_ENV === 'test';
        const syncTimeout = isDevelopment ? 500 : 2000;

        setTimeout(async () => {
            if (!this.isMaster) {
                await this.tryAcquireLock(true);

                // If we're still not master and we suspect we are the only server
                // (e.g. single-node prod or development environment), force it
                // Only steal when explicitly forced via env — never unconditionally in dev,
                // and always use NX so a live master is not overwritten.
                const forceMaster = process.env.FORCE_MASTER === 'true';
                if (!this.isMaster && forceMaster) {
                    console.log(`🔄 Forcing master election (ForceMaster=${forceMaster})...`);
                    try {
                        if (!this.lockId) {
                            this.lockId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
                        }
                        const forced = await this.redis.set(LOCK_KEY, this.lockId, 'NX', 'PX', LOCK_TTL);
                        if (forced === 'OK') {
                            this.isMaster = true;
                            console.log('👑 Forced Master Status - Lock Acquired');
                        } else {
                            console.log('ℹ️ Force-master skipped: lock held by live master');
                        }
                    } catch (err) {
                        console.error('Failed to force master status:', err.message);
                    }
                }
            }

            if (this.isMaster && !this.hasInitialSync) {
                console.log(`👑 [Node: ${this.nodeId}] Became Master - Performing initial sync`);
                await this.cleanQueue();
                await this.syncMonitors();
                this.isReady = true;
            }
        }, syncTimeout);
    }

    setIO(io) {
        this.io = io;
        // Pass IO instance to services that generate real-time events
        enhancedAlertService.setIoInstance(io);
        enhancedHealthStateService.setIoInstance(io);
    }

    /**
     * Attempt to become the Master Node
     * @param {boolean} skipSync - Skip sync when called from initialize() to avoid duplicate sync
     */
    async tryAcquireLock(skipSync = false) {
        try {
            // Check if Redis is ready before attempting to acquire lock
            if (this.redis.status !== 'ready') {
                console.debug('Redis not ready, skipping lock acquisition');
                return;
            }

            // Generate a unique lock ID for this instance (to allow identifying who owns the lock)
            // If we don't have one, generate it
            if (!this.lockId) {
                this.lockId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
            }

            // Set NX (Not Exists) PX (Expiry in ms)
            // Value is our unique lockId so we know WE own it
            const res = await this.redis.set(LOCK_KEY, this.lockId, 'NX', 'PX', LOCK_TTL);

            if (res === 'OK') {
                if (!this.isMaster) {
                    console.log(`👑 [Node: ${this.nodeId}] Acquired Master Lock [${this.lockId}] - This node is now the Scheduler.`);
                    this.isMaster = true;
                    // Trigger sync on promotion (but not during initialize - it handles sync separately)
                    if (!skipSync) {
                        await this.syncMonitors();
                        this.isReady = true; // Mark as ready after promotion sync
                    }
                }
            } else {
                // Lock exists. Atomically renew only if WE still own it (Lua: no TOCTOU).
                const renewed = await this.redis.eval(
                    `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("pexpire", KEYS[1], ARGV[2]) else return 0 end`,
                    1,
                    LOCK_KEY,
                    this.lockId,
                    String(LOCK_TTL)
                );

                if (renewed === 1) {
                    if (!this.isMaster) {
                        // We recovered our own lock (rare but possible during quick restart)
                        this.isMaster = true;
                        console.log(`👑 Recovered Master Lock [${this.lockId}]`);
                    }
                } else {
                    const currentLockValue = await this.redis.get(LOCK_KEY);
                    // We don't own the lock
                    if (this.isMaster) {
                        console.log(`ℹ️ [Node: ${this.nodeId}] Standby Mode: Master status transferred to another instance (Lock owned by: ${currentLockValue})`);
                        this.isMaster = false;
                        if (this.sentinelInterval) {
                            clearInterval(this.sentinelInterval);
                            this.sentinelInterval = null;
                        }
                    } else if (currentLockValue) {
                        // Periodic log only if lock is held by another instance
                        // We use a internal counter to avoid log spamming
                        this._lockCheckCount = (this._lockCheckCount || 0) + 1;
                        if (this._lockCheckCount % 10 === 0) {
                            console.log(`ℹ️ [Node: ${this.nodeId}] Scheduler lock held by instance: ${currentLockValue}`);
                        }
                    }
                }
            }
        } catch (err) {
            // Don't log Redis timeout errors as errors - they can happen during temporary issues
            if (err.message.includes('Command timed out') || err.message.includes('Connection')) {
                console.debug('Lock operation skipped due to temporary Redis issue:', err.message);
            } else {
                console.error('Lock Error:', err.message);
            }
        }
    }

    /**
     * Master Only: Ensure DB and Queue are in sync
     * Uses "Soft Sync" - removes repeatable job configurations but NOT active/locked jobs
     */
    async syncMonitors() {
        if (!this.isMaster) return;

        // Prevent duplicate sync calls - set flag IMMEDIATELY
        if (this.hasInitialSync) {
            console.log('📦 Sync skipped - already synced');
            return;
        }
        this.hasInitialSync = true;

        console.log('📦 Syncing Monitors (Master)...');

        // 1. AGGRESSIVE CLEANUP: Wait for active jobs and remove ALL pending jobs
        try {
            console.log("🧹 Cleaning ALL jobs from queue...");

            // Get all jobs in all states
            const allJobs = await this.queue.getJobs(['delayed', 'waiting', 'active', 'prioritized', 'failed', 'completed']);

            if (allJobs.length > 0) {
                console.log(`🧹 Found ${allJobs.length} total jobs, cleaning up...`);

                // Wait for active jobs to complete (max 5 seconds)
                const activeJobs = allJobs.filter(j => j.data); // Filter valid jobs only
                if (activeJobs.length > 0) {
                    console.log(`⏳ Waiting for ${activeJobs.length} active jobs to complete...`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }

                // Now remove all non-active jobs
                let removedCount = 0;
                for (const job of allJobs) {
                    try {
                        const state = await job.getState();

                        // FIX: Aggressive Zombie Purge
                        // Legacy hyphen/colon IDs are purged; current deterministic IDs use underscore prefix (scheduled_<id>, immediate_<id>).
                        const isOldPattern = (job.id.startsWith('scheduled-') || job.id.startsWith('immediate-') || job.id.includes(':'));

                        if (state === 'active') {
                            console.log(`   ⚠️ Skipping active job ${job.id}`);
                            continue;
                        }

                        if (isOldPattern) {
                            console.log(`   🧹 Removing zombie job: ${job.id}`);
                            await job.remove();
                            removedCount++;
                        } else {
                            // Also remove standard jobs to ensure a clean sync starting point
                            await job.remove();
                            removedCount++;
                        }
                    } catch (err) {
                        console.debug(`   ⚠️ Could not process job ${job.id}: ${err.message}`);
                    }
                }
                console.log(`🧹 Removed ${removedCount} old jobs`);
            } else {
                console.log('🧹 No pending jobs to clean up');
            }

            // Also clean repeatable job configurations
            const repeatableJobs = await this.queue.getRepeatableJobs();
            if (repeatableJobs.length > 0) {
                for (const job of repeatableJobs) {
                    await this.queue.removeRepeatableByKey(job.key);
                }
                console.log(`🧹 Removed ${repeatableJobs.length} repeatable job configs`);
            }

        } catch (err) {
            console.warn('⚠️ Could not clean jobs during sync:', err.message);
        }

        // 3. Schedule Active Monitors (Sync Mode - No immediate checks)
        const monitors = await Monitor.find({ isActive: true });
        console.log(`📅 Scheduling ${monitors.length} active monitors for sync...`);

        for (const monitor of monitors) {
            // Use scheduleMonitor which triggers an IMMEDIATE check
            // This ensures the dashboard is fresh upon server launch
            await this.scheduleMonitorForSync(monitor);
        }

        console.log(`✅ Sync complete - ${monitors.length} monitors scheduled.`);
        this.isReady = true; // Mark as ready

        // Start Health Sentinel here so it activates on EVERY promotion path
        // (both the delayed setTimeout path and the tryAcquireLock() promotion path).
        console.log('🛡️ Health Sentinel (Safety Net) Active');
        if (this.sentinelInterval) clearInterval(this.sentinelInterval);
        this.sentinelInterval = setInterval(() => {
            this.verifyJobHealth();
            this.autoCleanRedisMemory();
        }, 5 * 60 * 1000); // 5 minutes
    }

    /**
     * Generate interval in milliseconds for consistent scheduling
     */
    generateIntervalMs(intervalMinutes) {
        return intervalMinutes * 60 * 1000;
    }

    /**
     * Schedule a specific monitor - RECURSIVE DELAYED JOB PATTERN
     * This replaces BullMQ's native repeatable jobs to ensure "Fairness":
     * 1. Manual checks reset the timer.
     * 2. Interval starts AFTER previous check finishes.
     */
    async scheduleMonitor(monitor) {

        // Remove any existing job (scheduled or immediate) to "reset" the timer
        await this.removeMonitor(monitor._id);

        console.log(`⚡ Scheduling IMMEDIATE check for ${monitor.name}`);

        // Add Immediate check
        await this.addImmediateCheck(monitor);

        // Note: The recursive part happens in processJob() 
        // after the check finishes.
    }

    /**
     * Schedule monitor for sync - creates ONLY a delayed job
     * Used during server startup to prevent duplicate immediate checks
     */
    async scheduleMonitorForSync(monitor) {
        // Prevent duplicate scheduled jobs for the same monitor
        await this.removeMonitor(monitor._id);

        let intervalMs = this.generateIntervalMs(monitor.interval);

        // Smart Sync: Calculate remaining time if monitor was checked previously
        // This prevents full interval wait after server restart
        if (monitor.lastChecked) {
            const timeSinceLastCheck = Date.now() - new Date(monitor.lastChecked).getTime();
            const remainingTime = intervalMs - timeSinceLastCheck;

            if (remainingTime <= 0) {
                console.log(`⏱️ Sync: ${monitor.name} is overdue by ${Math.abs(remainingTime)}ms. Scheduling IMMEDIATELY.`);
                intervalMs = 0; // Schedule immediately
            } else {
                console.log(`⏱️ Sync: ${monitor.name} was checked recently. Resuming schedule in ${Math.round(remainingTime / 1000)}s.`);
                intervalMs = remainingTime;
            }
        } else {
            // If never checked, schedule immediately (0 delay) instead of waiting full interval
            console.log(`⏱️ Sync: ${monitor.name} has never been checked. Scheduling IMMEDIATELY.`);
            intervalMs = 0;
        }

        console.log(`⏱️ Sync scheduling ${monitor.name}: Next check in ${Math.round(intervalMs / 1000)}s`);

        // Add a delayed job for the next check using a unique timestamped Job ID.
        const scheduledJobId = `scheduled_${monitor._id.toString()}_${Date.now()}`;

        await this.queue.add('check', {
            monitorId: monitor._id.toString(),
            type: monitor.type,
            url: monitor.url,
            isScheduled: true
        }, {
            jobId: scheduledJobId,
            delay: intervalMs,
            attempts: 1,
            removeOnComplete: true,
            removeOnFail: { age: 3600, count: 50 }
        });
    }

    /**
     * Add immediate check - Industry Standard
     * Executes once within milliseconds when monitor is created
     * User gets instant feedback before interval-based checks begin
     */
    async addImmediateCheck(monitor) {
        const immediateJobId = `immediate_${monitor._id.toString()}_${Date.now()}`;

        try {
            // Clean up any pending or scheduled jobs for this monitor first to avoid duplicate execution
            await this.removeMonitor(monitor._id);

            // Add high-priority immediate job with unique ID to avoid Redis collisions
            const job = await this.queue.add('check', {
                monitorId: monitor._id.toString(),
                type: monitor.type,
                url: monitor.url,
                isImmediate: true
            }, {
                jobId: immediateJobId,
                priority: 100,         // High priority
                removeOnComplete: true,
                removeOnFail: { age: 3600, count: 50 }
            });

            console.log(`   ⚡ Immediate check queued for ${monitor.name} (Job ID: ${immediateJobId})`);
            return job;
        } catch (err) {
            console.error(`Failed to add immediate check for ${monitor.name}:`, err.message);
            // Don't throw, just log. Immediate check failure shouldn't block creation/update
        }
    }

    /**
     * Remove a monitor from the schedule - removes ALL matching jobs
     */
    async removeMonitor(monitorId) {
        const monitorIdStr = monitorId.toString();

        // 1. Clean up any wandering jobs across ALL states
        try {
            // Also explicitly check direct legacy ID if any
            const legacyIds = [`scheduled_${monitorIdStr}`, `immediate_${monitorIdStr}`];
            for (const legId of legacyIds) {
                try {
                    const j = await this.queue.getJob(legId);
                    if (j) {
                        const st = await j.getState();
                        if (st !== 'active') await j.remove();
                    }
                } catch (e) { /* ignore */ }
            }

            const jobs = await this.queue.getJobs(['delayed', 'waiting', 'active', 'prioritized', 'failed', 'completed']);
            const matches = jobs.filter(j =>
                j.data?.monitorId === monitorIdStr ||
                (j.id && String(j.id).includes(monitorIdStr))
            );

            for (const match of matches) {
                try {
                    const state = await match.getState();
                    if (state !== 'active') {
                        await match.remove();
                    }
                } catch (err) {
                    console.warn(`Failed to remove job ${match.id}: ${err.message}`);
                }
            }
            if (matches.length > 0) {
                console.log(`✅ Cleaned up ${matches.length} jobs for ${monitorIdStr}`);
            }
        } catch (err) {
            console.error('Cleanup error:', err.message);
        }
    }

    // Process the actual Check with Enhanced Health State Logic
    async processJob(job) {
        const { monitorId, isImmediate, isScheduled } = job.data;

        // Defensive: Validate monitorId exists
        if (!monitorId) {
            console.warn('processJob: missing monitorId in job data');
            return;
        }

        const monitor = await Monitor.findById(monitorId);
        // Defensive: Check monitor exists and is active
        if (!monitor) {
            console.warn(`processJob: monitor ${monitorId} not found`);
            return;
        }

        // If monitor was paused while job was in queue, don't execute and don't reschedule
        if (!monitor.isActive) {
            console.log(`Skipping inactive monitor: ${monitor.name}`);
            return;
        }

        const checkType = isImmediate ? '⚡ IMMEDIATE' : (isScheduled ? '⏱️ SCHEDULED' : '🔄');
        console.log(`${checkType} Checking: ${monitor.name} (${monitor.url})`);

        let updatedMonitor = monitor;
        let result = null;
        let healthStateResult = null;
        let check = null;
        let jobError = null; // Captures errors so we can re-throw AFTER finally (rescheduling) runs

        try {
            result = await MonitorRunner.run(monitor);

            // Get recent checks for enhanced health state analysis
            const recentChecks = await this.getRecentChecks(monitorId, 10);

            // Determine health state using Enhanced Health State Service (Industry Standard)
            healthStateResult = await enhancedHealthStateService.determineHealthState(result, monitor, recentChecks);

            // Check status: An individual failed check execution (isUp === false or SSRF_BLOCKED)
            // must NEVER be stored as 'up' in the Check logs.
            const isFailedCheck = !result.isUp || result.errorType === 'SSRF_BLOCKED' || healthStateResult.status === 'down';
            const checkStatus = (isFailedCheck && healthStateResult.status === 'up')
                ? 'down'
                : healthStateResult.status;

            // Deduplication: for scheduled checks, check if another instance (e.g. Render cloud vs Local)
            // already recorded a check for this monitor within the last 45 seconds.
            // This prevents duplicate/interleaved check logs across multiple active workers.
            if (isScheduled) {
                const recentDuplicate = await Check.findOne({
                    monitor: monitor._id,
                    timestamp: { $gte: new Date(Date.now() - 45000) }
                }).lean();
                if (recentDuplicate) {
                    console.log(`⏭️  [Node: ${this.nodeId}] Duplicate check skipped for "${monitor.name}" — check already recorded ${Math.round((Date.now() - new Date(recentDuplicate.timestamp).getTime()) / 1000)}s ago.`);
                    return;
                }
            }

            // Also compute a 1-minute time-bucket key for MongoDB unique index enforcement
            const cycleKey = isScheduled ? Math.floor(Date.now() / 60000) : null;

            // Create and save Check Result
            check = new Check({
                monitor: monitor._id,
                status: checkStatus,
                responseTime: result.responseTime,
                statusCode: result.statusCode,
                errorMessage: result.errorMessage,
                errorType: result.errorType,
                cycleKey,
                degradationReasons: (healthStateResult.reasons || []).length > 0 ? healthStateResult.reasons : undefined,
                sslInfo: result.meta && result.meta.validTo ? {
                    valid: result.isUp,
                    validFrom: result.meta.validFrom,
                    validTo: result.meta.validTo,
                    daysRemaining: Math.floor((new Date(result.meta.validTo) - new Date()) / (1000 * 60 * 60 * 24))
                } : undefined
            });

            try {
                await check.save();
            } catch (saveErr) {
                // E11000 = duplicate key — another instance already recorded this cycle.
                // Silently skip all downstream processing; finally block still reschedules.
                if (saveErr.code === 11000) {
                    console.log(`⏭️  [Node: ${this.nodeId}] Duplicate check skipped for "${monitor.name}" (cycleKey: ${cycleKey}) — another instance already recorded this cycle.`);
                    return; // skip stats / alerts / socket events for this cycle
                }
                throw saveErr; // surface any other DB errors
            }


            // ATOMIC UPDATE: Ensure monitor stats are updated correctly even with concurrent checks
            const oldStatus = monitor.status;
            const updateData = {
                $set: {
                    status: healthStateResult.status,
                    lastChecked: new Date(),
                    lastResponseTime: result.responseTime
                },
                $inc: {
                    totalChecks: 1
                }
            };

            if (healthStateResult.status === 'down') {
                updateData.$inc.consecutiveFailures = 1;
                updateData.$set.consecutiveDegraded = 0;
            } else if (healthStateResult.status === 'degraded') {
                updateData.$inc.consecutiveDegraded = 1;
                updateData.$set.consecutiveFailures = 0;
                updateData.$inc.successfulChecks = 1;
            } else {
                updateData.$set.consecutiveFailures = 0;
                updateData.$set.consecutiveDegraded = 0;
                updateData.$inc.successfulChecks = 1;
            }

            updatedMonitor = await Monitor.findByIdAndUpdate(monitor._id, updateData, { new: true });

            // --- PERSISTENT UPTIME CALCULATION (Phase 11: Audit Fix) --- //
            // Ensure uptime percentages are updated incrementally to avoid expensive full-collection scans in stats service.
            if (updatedMonitor && updatedMonitor.totalChecks > 0) {
                try {
                    const t = Number(updatedMonitor.totalChecks) || 0;
                    const s = Number(updatedMonitor.successfulChecks) || 0;
                    const lifetimeUptime = t > 0 && Number.isFinite(s / t)
                        ? parseFloat(((s / t) * 100).toFixed(2))
                        : 100;

                    // Efficient sliding 24h calculation using covered index { monitor, timestamp }
                    const startOf24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
                    const [checks24h, up24h] = await Promise.all([
                        Check.countDocuments({ monitor: updatedMonitor._id, timestamp: { $gte: startOf24h } }),
                        Check.countDocuments({ monitor: updatedMonitor._id, timestamp: { $gte: startOf24h }, status: { $in: ['up', 'degraded'] } })
                    ]);

                    const dayUptime = checks24h > 0 && Number.isFinite(up24h / checks24h)
                        ? parseFloat(((up24h / checks24h) * 100).toFixed(2))
                        : lifetimeUptime;

                    // Update percentages on monitor document
                    updatedMonitor = await Monitor.findByIdAndUpdate(
                        updatedMonitor._id,
                        { $set: { uptimePercentage: lifetimeUptime, last24hUptime: dayUptime } },
                        { new: true }
                    );
                } catch (uptimeErr) {
                    console.error(`⚠️ Failed to update persistent uptime for ${updatedMonitor.name}:`, uptimeErr.message);
                }
            }

            // Defensive: Monitor might have been deleted during the check
            if (!updatedMonitor) {
                console.warn(`Monitor ${monitor._id} was deleted during check execution. Aborting update.`);
                // Clean up and return early to prevent crash
                return { ...result, healthState: healthStateResult };
            }

            // --- Alerts & Incidents --- //
            let newIncident = null;
            try {
                if (updatedMonitor.status === 'down') {
                    // Transitioning to down: handleFailure updates ongoing incident or creates new one,
                    // and sends failure alert if not already notified.
                    newIncident = await enhancedAlertService.handleFailure(updatedMonitor, result, healthStateResult);
                } else if (updatedMonitor.status === 'up') {
                    // True recovery or cleanup: handleRecovery resolves any ongoing incident,
                    // sends recovery alert if alerted, and clears suppression. If no incident exists, it's a no-op.
                    await enhancedAlertService.handleRecovery(updatedMonitor, healthStateResult);
                } else if (updatedMonitor.status === 'degraded') {
                    // Transitioning to degraded: do NOT resolve ongoing down incident or wipe suppression;
                    // handleDegraded updates the incident without duplicate alert emails.
                    const degradationReasons = (healthStateResult.reasons || []).filter(reason => {
                        const r = String(reason || '').toLowerCase();
                        return r.includes('performance') || r.includes('degradation') || r.includes('slow') ||
                            r.includes('ssl') || r.includes('cert') || r.includes('security') ||
                            r.includes('content') || r.includes('keyword') ||
                            r.includes('rate') || r.includes('429') || r.includes('limit');
                    });
                    const finalReasons = degradationReasons.length > 0 ? degradationReasons : (healthStateResult.reasons || []);
                    newIncident = await enhancedAlertService.handleDegraded(updatedMonitor, result, finalReasons, healthStateResult);
                }
            } catch (alertErr) {
                console.error('Alert processing error (non-fatal):', alertErr.message);
            }


            // Trigger immediate verification for DOWN and DEGRADED states
            if (updatedMonitor && (healthStateResult.status === 'down' || healthStateResult.status === 'degraded')) {
                // Background task - don't await to avoid delaying the scheduler
                enhancedHealthStateService.triggerImmediateVerification(updatedMonitor, result, healthStateResult, check._id);
            }

            // Emit socket events
            if (updatedMonitor && check) {
                this.emitEnhancedSocketEvents(updatedMonitor, check, oldStatus, healthStateResult, newIncident);
            }
        } catch (err) {
            jobError = err;
            console.error(`🔴 Critical failure in processJob for ${monitor.name}:`, err.message);
        } finally {
            // --- RECURSIVE SCHEDULING (SAFETY NET) --- //
            // Ensure next check is ALWAYS scheduled, even if the current one crashed.
            // NOTE: No return here — return is AFTER the try/catch/finally block so
            // BullMQ can correctly mark jobs as failed when an error occurs.
            if (updatedMonitor && updatedMonitor.isActive) {
                const intervalMs = this.generateIntervalMs(updatedMonitor.interval);
                console.log(`🔄 Attempting to reschedule ${updatedMonitor.name} in ${updatedMonitor.interval}m...`);

                try {
                    // Prevent duplicate scheduling streams: clean any leftover pending jobs for this monitor
                    await this.removeMonitor(updatedMonitor._id);

                    // Use unique timestamped Job ID so BullMQ doesn't reject scheduling due to the currently active job
                    const scheduledJobId = `scheduled_${updatedMonitor._id.toString()}_${Date.now()}`;

                    // RETRY LOOP: Rescheduling is critical to the monitor's lifecycle.
                    // If Redis times out here, the monitor "stops" until auto-healed.
                    let retryCount = 0;
                    const maxRetries = 3;
                    let schedSuccess = false;

                    while (retryCount < maxRetries && !schedSuccess) {
                        try {
                            await this.queue.add('check', {
                                monitorId: updatedMonitor._id.toString(),
                                type: updatedMonitor.type,
                                url: updatedMonitor.url,
                                isScheduled: true
                            }, {
                                jobId: scheduledJobId,
                                delay: intervalMs,
                                attempts: 1,
                                removeOnComplete: true,
                                removeOnFail: { age: 3600, count: 50 }
                            });
                            schedSuccess = true;
                        } catch (schedErr) {
                            retryCount++;
                            const isTimeout = schedErr.message.includes('Command timed out');
                            console.warn(`[Node: ${this.nodeId}] Reschedule attempt ${retryCount} failed for ${updatedMonitor.name}${isTimeout ? ' (Redis Timeout)' : ''}:`, schedErr.message);
                            if (retryCount < maxRetries) {
                                await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
                            }
                        }
                    }

                    if (schedSuccess) {
                        console.log(`✅ [Node: ${this.nodeId}] Successfully rescheduled ${updatedMonitor.name} (Job: ${scheduledJobId})`);
                    } else {
                        console.error(`🔴 [Node: ${this.nodeId}] Failed to reschedule ${updatedMonitor.name} after ${maxRetries} attempts. Monitor may stall until Safety Net heals it.`);
                    }
                } catch (err) {
                    console.error(`🔴 [Node: ${this.nodeId}] Unexpected error during reschedule attempt for ${updatedMonitor.name}:`, err.message);
                }
            } else {
                console.warn(`⚠️ Reschedule failed: updatedMonitor=${!!updatedMonitor}, isActive=${updatedMonitor?.isActive}`);
            }
        }

        // Propagate error AFTER finally (rescheduling) so BullMQ marks job as failed
        if (jobError) throw jobError;

        return {
            ...result,
            healthState: healthStateResult,
            checkId: check ? check._id : null
        };
    }

    /**
     * Get recent checks for enhanced health state analysis
     */
    async getRecentChecks(monitorId, limit = 10) {
        try {
            return await Check.find({ monitor: monitorId })
                .sort({ timestamp: -1 })
                .limit(limit)
                .lean();
        } catch (error) {
            console.error('Error fetching recent checks:', error);
            return [];
        }
    }

    // --- THE CORE DETECTION LOGIC WITH UNDICI FOR 1XX DETECTION --- //

    // --- LEGACY CHECKS REMOVED (Delegated to MonitorRunner) ---

    // --- REAL-TIME NOTIFICATIONS WITH REDIS PUB/SUB --- //

    /**
     * Notify real-time updates via Socket.IO (same process) or Redis Pub/Sub (cross-dyno)
     */
    notifyRealTime(monitor, result) {
        try {
            const payload = {
                monitorId: monitor._id || monitor.monitorId,
                ...result,
                timestamp: new Date()
            };

            // Method A: Same process (Monolith) - emit directly via Socket.IO
            if (this.io) {
                const userId = monitor.user || monitor.userId;
                if (userId) {
                    this.io.to(`user_${userId}`).emit('monitor_update', payload);
                }
            }

            // Method B: Cross-dyno (Heroku) - publish to Redis so server.js can relay
            // Defensive: Check both publisher and monitor.user exist
            if (this.publisher && monitor.user) {
                try {
                    this.publisher.publish('monitor_updates', JSON.stringify({
                        userId: monitor.user,
                        payload
                    }));
                } catch (publishErr) {
                    console.debug('Redis publish failed:', publishErr.message);
                }
            }
        } catch (err) {
            console.debug('notifyRealTime error:', err.message);
        }
    }

    /**
     * Emit enhanced socket events with detailed analysis data
     */
    emitEnhancedSocketEvents(monitor, check, previousStatus, healthStateResult, newIncident = null) {
        // Defensive: Check if io is available
        if (!this.io) return;

        // Defensive: Ensure monitor and user exist
        if (!monitor || !monitor.user) {
            console.debug('emitEnhancedSocketEvents: missing monitor or user');
            return;
        }

        // Always emit real-time update with enhanced data
        const roomUserId = monitor.user._id || monitor.user;
        this.io.to(`user_${roomUserId}`).emit('monitor_update', {
            monitorId: monitor._id,
            status: monitor.status,
            lastChecked: monitor.lastChecked,
            lastResponseTime: monitor.lastResponseTime,
            check: {
                _id: check._id,
                status: check.status,
                responseTime: check.responseTime,
                statusCode: check.statusCode,
                errorType: check.errorType,
                errorMessage: check.errorMessage,
                timestamp: check.timestamp,
                degradationReasons: check.degradationReasons || []
            },
            // Enhanced health state analysis
            healthState: {
                status: healthStateResult.status,
                confidence: healthStateResult.confidence,
                reasons: healthStateResult.reasons,
                analysis: healthStateResult.analysis
            }
        });

        // Emit status changes with enhanced information
        if (previousStatus !== monitor.status) {
            this.io.to(`user_${roomUserId}`).emit('monitor_status_change', {
                monitorId: monitor._id,
                previousStatus,
                currentStatus: monitor.status,
                monitor: {
                    _id: monitor._id,
                    name: monitor.name,
                    url: monitor.url
                },
                timestamp: new Date(),
                // Enhanced transition information
                transition: {
                    reason: healthStateResult.analysis?.stateTransition?.reason,
                    preventedFlapping: healthStateResult.analysis?.stateTransition?.preventedFlapping,
                    confidence: healthStateResult.confidence
                }
            });

            // Special events for different states
            if (monitor.status === 'degraded') {
                this.io.to(`user_${roomUserId}`).emit('monitor_degraded', {
                    monitorId: monitor._id,
                    monitorName: monitor.name,
                    responseTime: monitor.lastResponseTime,
                    reasons: healthStateResult.reasons,
                    confidence: healthStateResult.confidence,
                    analysis: healthStateResult.analysis,
                    severity: healthStateResult.confidence > 0.8 ? 'warning' : 'minor',
                    timestamp: new Date()
                });
            } else if (monitor.status === 'down') {
                this.io.to(`user_${roomUserId}`).emit('monitor_down', {
                    monitorId: monitor._id,
                    monitorName: monitor.name,
                    errorMessage: check.errorMessage,
                    errorType: check.errorType,
                    confidence: healthStateResult.confidence,
                    analysis: healthStateResult.analysis,
                    severity: 'critical',
                    timestamp: new Date()
                });
            } else if (monitor.status === 'unknown') {
                this.io.to(`user_${roomUserId}`).emit('monitor_unknown', {
                    monitorId: monitor._id,
                    monitorName: monitor.name,
                    reasons: healthStateResult.reasons,
                    analysis: healthStateResult.analysis,
                    timestamp: new Date()
                });
            }
        }

        // Emit incident events
        if (newIncident) {
            this.io.to(`user_${roomUserId}`).emit('incident_created', {
                _id: newIncident._id,
                monitor: monitor._id,
                monitorName: monitor.name,
                startTime: newIncident.startTime,
                errorMessage: newIncident.errorMessage,
                errorType: newIncident.errorType,
                statusCode: newIncident.statusCode,
                status: newIncident.status,
                timestamp: new Date()
            });
        }

        // Emit health state analytics (for dashboard updates)
        this.io.to(`user_${roomUserId}`).emit('health_analytics', {
            monitorId: monitor._id,
            currentHealth: {
                status: healthStateResult.status,
                confidence: healthStateResult.confidence,
                reasons: healthStateResult.reasons
            },
            analytics: {
                windowAnalysis: healthStateResult.analysis?.window,
                baselineAnalysis: healthStateResult.analysis?.baseline,
                performanceTrend: healthStateResult.analysis?.baseline?.trend,
                reliabilityScore: healthStateResult.analysis?.baseline?.reliabilityScore
            },
            timestamp: new Date()
        });
    }

    async cleanQueue() {
        try {
            await this.queue.drain();
            await this.queue.clean(0, 0, 'completed');
            await this.queue.clean(0, 0, 'failed');
            await this.queue.clean(0, 0, 'delayed');
            await this.queue.clean(0, 0, 'wait');
        } catch (err) {
            console.warn('cleanQueue error:', err.message);
        }
    }

    /**
     * Health check for scheduling system
     * Detects "stale" monitors that haven't been checked within their expected interval
     * unaffected by the internal scheduling mechanism (recursive vs repeatable)
     */
    /**
     * Get queue statistics
     * Returns counts of jobs in different states
     */
    async getQueueStats() {
        const counts = await this.queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
        return {
            waiting: counts.waiting + counts.delayed,
            active: counts.active,
            completed: counts.completed,
            failed: counts.failed,
            total: counts.waiting + counts.active + counts.completed + counts.failed + counts.delayed
        };
    }

    /**
     * Automatic Redis Memory Optimization & Garbage Collection
     * Runs every 5 minutes to keep Redis memory permanently under 3MB
     */
    async autoCleanRedisMemory() {
        if (!this.isMaster || !this.queue) return;
        try {
            // 1. Clean completed jobs older than 15 minutes (keep max 50)
            await this.queue.clean(15 * 60 * 1000, 50, 'completed').catch(() => {});
            // 2. Clean failed jobs older than 1 hour (keep max 20)
            await this.queue.clean(60 * 60 * 1000, 20, 'failed').catch(() => {});

            // 3. Trim Redis event streams so memory is capped
            if (this.redis && this.redis.status === 'ready') {
                await this.redis.xtrim('bull:monitor-queue:events', 'MAXLEN', '~', 100).catch(() => {});
                await this.redis.xtrim('monitor_updates_stream', 'MAXLEN', '~', 100).catch(() => {});

                // 4. Memory Guardian: purge any oversized CRL cache keys (> 128KB)
                const crlKeys = await this.redis.keys('crl:cache:*').catch(() => []);
                for (const key of crlKeys) {
                    try {
                        const usage = await this.redis.memory('USAGE', key);
                        if (usage && usage > 128 * 1024) {
                            console.warn(`[Redis Guardian] Purging oversized key: ${key} (${(usage / 1024).toFixed(1)} KB)`);
                            await this.redis.del(key);
                        }
                    } catch {
                        // Ignore individual key check errors
                    }
                }

                // 5. Emergency threshold protection: if used_memory exceeds 15MB (50% of 30MB limit), flush all CRL caches
                const memInfo = await this.redis.info('memory').catch(() => '');
                const usedMatch = memInfo.match(/used_memory:(\d+)/);
                if (usedMatch && parseInt(usedMatch[1], 10) > 15 * 1024 * 1024) {
                    console.warn(`[Redis Guardian] Memory pressure detected (${(parseInt(usedMatch[1], 10) / 1024 / 1024).toFixed(1)}MB). Flushing volatile caches...`);
                    for (const key of crlKeys) {
                        await this.redis.del(key).catch(() => {});
                    }
                    await this.redis.xtrim('bull:monitor-queue:events', 'MAXLEN', '~', 20).catch(() => {});
                    await this.redis.xtrim('monitor_updates_stream', 'MAXLEN', '~', 20).catch(() => {});
                }
            }
        } catch (err) {
            console.debug('[Redis Auto-Clean] Non-fatal cleanup notification:', err.message);
        }
    }

    /**
     * Verify health of scheduled jobs
     * Checks if all active monitors have a corresponding job in the queue
     */
    async verifyJobHealth() {
        if (!this.isMaster) return { status: 'standby', message: 'Not master — skipping heal' };
        try {
            const monitors = await Monitor.find({ isActive: true });
            const now = Date.now();
            const stuckMonitors = [];

            for (const monitor of monitors) {
                // Sentinel Aggression (Phase 8 Fix): 
                // If never checked, use a strict 2-minute threshold regardless of interval.
                // This ensures new monitors don't stay "Never Checked" if the first job fails.
                const isNew = !monitor.lastChecked;
                const lastActivity = monitor.lastChecked ? new Date(monitor.lastChecked).getTime() : new Date(monitor.updatedAt).getTime();

                // Expected interval in ms
                const intervalMs = monitor.interval * 60 * 1000;

                // Add buffer to avoid false positives
                // For new monitors, we only give 2 minutes grace.
                const buffer = isNew ? 120000 : Math.max(120000, intervalMs);
                const threshold = lastActivity + (isNew ? 0 : intervalMs) + buffer;

                if (now > threshold) {
                    stuckMonitors.push({
                        id: monitor._id,
                        name: monitor.name,
                        lastChecked: monitor.lastChecked,
                        isNew,
                        overdueBy: Math.floor((now - threshold) / 1000) + 's'
                    });

                    console.log(`🔧 Auto-healing: Rescheduling stuck monitor ${monitor.name} (${monitor._id})`);
                    try {
                        // Force reschedule
                        await this.scheduleMonitor(monitor);
                    } catch (err) {
                        console.error(`Failed to reschedule ${monitor.name}:`, err.message);
                    }
                }
            }

            if (stuckMonitors.length > 0) {
                console.warn(`⚠️ Health Check: Found ${stuckMonitors.length} stuck monitors. Auto-healing attempted.`);
                return {
                    status: 'healed',
                    stuckCount: stuckMonitors.length,
                    stuckMonitors
                };
            }

            return {
                status: 'healthy',
                totalMonitors: monitors.length,
                message: 'All monitors are running on schedule'
            };
        } catch (err) {
            console.error('Health Check Error:', err.message);
            return { error: err.message };
        }
    }

    /**
     * Graceful shutdown - close worker and queue connections
     */
    async shutdown() {
        console.log('🛑 Shutting down Scheduler Service...');

        // Stop the lock refresh interval
        if (this.lockInterval) {
            clearInterval(this.lockInterval);
            this.lockInterval = null;
        }

        // Stop the sentinel interval
        if (this.sentinelInterval) {
            clearInterval(this.sentinelInterval);
            this.sentinelInterval = null;
        }

        if (isTestEnv) {
            console.log('✅ Scheduler Service shutdown complete (Test Mode)');
            return;
        }

        // Close the worker
        if (this.worker) {
            await this.worker.close();
            console.log('   Worker closed');
        }

        // Close the queue
        if (this.queue) {
            await this.queue.close();
            console.log('   Queue closed');
        }

        // Close the dedicated BullMQ Redis connection
        if (this.bullRedis) {
            try {
                await this.bullRedis.quit();
                console.log('   BullMQ Redis connection closed');
            } catch (err) {
                console.warn('   Error closing BullMQ Redis connection:', err.message);
            }
        }

        // Close the shared Redis connections
        // NOTE: this.redis === lockConnection, which is already closed above.
        // Calling quit() again would cause 'Connection is already closed' error.
        // We only need to ensure queueConnection and workerConnection are closed.
        try {
            if (queueConnection.status !== 'end') await queueConnection.quit();
            if (workerConnection.status !== 'end') await workerConnection.quit();
            if (lockConnection.status !== 'end') await lockConnection.quit();
            console.log('   Shared Redis connections closed');
        } catch (err) {
            console.warn('   Error closing shared Redis connections:', err.message);
        }

        console.log('✅ Scheduler Service shutdown complete');
    }
}

export default new SchedulerService();
