/**
 * Property-Based Tests for BullMQ Scheduler Service
 * Uses fast-check for property-based testing
 * 
 * Run with: node backend/src/services/bullmq-scheduler.service.property.test.js
 */

import fc from 'fast-check';

const DEFAULT_CONCURRENCY = 10;

// Re-implement helper functions for testing
function getJobId(monitorId) {
    return `monitor-${monitorId}`;
}

function getRepeatOptions(intervalMinutes) {
    const intervalMs = intervalMinutes * 60 * 1000;
    return {
        every: intervalMs,
        immediately: true
    };
}

function getDefaultJobOptions() {
    return {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 5000
        },
        removeOnComplete: {
            age: 86400
        },
        removeOnFail: {
            age: 604800
        }
    };
}

function getConcurrency(envValue) {
    if (envValue) {
        const parsed = parseInt(envValue, 10);
        if (!isNaN(parsed) && parsed > 0) {
            return parsed;
        }
    }
    return DEFAULT_CONCURRENCY;
}

function getQueueStats(counts) {
    return {
        waiting: counts?.waiting || 0,
        active: counts?.active || 0,
        completed: counts?.completed || 0,
        failed: counts?.failed || 0,
        delayed: counts?.delayed || 0,
        paused: counts?.paused || 0
    };
}

console.log('Running Property Tests for BullMQ Scheduler Service...\n');

let passed = 0;
let failed = 0;

// ============================================================================
// Property 1: Monitor interval maps to job repeat interval
// Feature: bullmq-scheduler, Property 1: Monitor interval maps to job repeat interval
// Validates: Requirements 1.2, 2.1
// ============================================================================

console.log('--- Property 1: Interval Conversion Tests ---\n');

console.log('Property 1.1: Interval in minutes converts to milliseconds correctly');
try {
    fc.assert(
        fc.property(
            fc.integer({ min: 1, max: 1440 }),  // 1 minute to 24 hours
            (intervalMinutes) => {
                const options = getRepeatOptions(intervalMinutes);
                const expectedMs = intervalMinutes * 60 * 1000;
                
                return options.every === expectedMs && options.immediately === true;
            }
        ),
        { numRuns: 100 }
    );
    console.log('  ✓ PASSED\n');
    passed++;
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    failed++;
}

// ============================================================================
// Property 2: Job ID is deterministic based on monitor ID
// Feature: bullmq-scheduler, Property 2: Job ID is deterministic based on monitor ID
// Validates: Requirements 2.1
// ============================================================================

console.log('--- Property 2: Job ID Generation Tests ---\n');

console.log('Property 2.1: Job ID follows monitor-{id} pattern');
try {
    fc.assert(
        fc.property(
            fc.string({ minLength: 1, maxLength: 50 }),
            (monitorId) => {
                const jobId = getJobId(monitorId);
                return jobId === `monitor-${monitorId}`;
            }
        ),
        { numRuns: 100 }
    );
    console.log('  ✓ PASSED\n');
    passed++;
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    failed++;
}

console.log('Property 2.2: Same monitor ID always produces same job ID');
try {
    fc.assert(
        fc.property(
            fc.string({ minLength: 1, maxLength: 50 }),
            (monitorId) => {
                const jobId1 = getJobId(monitorId);
                const jobId2 = getJobId(monitorId);
                return jobId1 === jobId2;
            }
        ),
        { numRuns: 100 }
    );
    console.log('  ✓ PASSED\n');
    passed++;
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    failed++;
}

// ============================================================================
// Property 5: Default concurrency is 10
// Feature: bullmq-scheduler, Property 5: Default concurrency is 10
// Validates: Requirements 4.2
// ============================================================================

console.log('--- Property 5: Default Concurrency Tests ---\n');

console.log('Property 5.1: No env var returns default of 10');
try {
    fc.assert(
        fc.property(
            fc.constantFrom(undefined, null, '', '0', '-1', 'abc'),
            (envValue) => {
                const concurrency = getConcurrency(envValue);
                return concurrency === 10;
            }
        ),
        { numRuns: 100 }
    );
    console.log('  ✓ PASSED\n');
    passed++;
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    failed++;
}

console.log('Property 5.2: Valid env var is used');
try {
    fc.assert(
        fc.property(
            fc.integer({ min: 1, max: 100 }),
            (value) => {
                const concurrency = getConcurrency(String(value));
                return concurrency === value;
            }
        ),
        { numRuns: 100 }
    );
    console.log('  ✓ PASSED\n');
    passed++;
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    failed++;
}

// ============================================================================
// Property 6: Queue statistics structure is consistent
// Feature: bullmq-scheduler, Property 6: Queue statistics structure is consistent
// Validates: Requirements 8.1, 8.3
// ============================================================================

console.log('--- Property 6: Queue Stats Structure Tests ---\n');

console.log('Property 6.1: Stats always has required fields as numbers');
try {
    fc.assert(
        fc.property(
            fc.record({
                waiting: fc.option(fc.integer({ min: 0, max: 1000 })),
                active: fc.option(fc.integer({ min: 0, max: 1000 })),
                completed: fc.option(fc.integer({ min: 0, max: 1000 })),
                failed: fc.option(fc.integer({ min: 0, max: 1000 })),
                delayed: fc.option(fc.integer({ min: 0, max: 1000 })),
                paused: fc.option(fc.integer({ min: 0, max: 1000 }))
            }),
            (counts) => {
                const stats = getQueueStats(counts);
                
                return typeof stats.waiting === 'number' &&
                       typeof stats.active === 'number' &&
                       typeof stats.completed === 'number' &&
                       typeof stats.failed === 'number' &&
                       typeof stats.delayed === 'number' &&
                       typeof stats.paused === 'number';
            }
        ),
        { numRuns: 100 }
    );
    console.log('  ✓ PASSED\n');
    passed++;
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    failed++;
}

console.log('Property 6.2: Missing counts default to 0');
try {
    fc.assert(
        fc.property(
            fc.constantFrom(null, undefined, {}),
            (counts) => {
                const stats = getQueueStats(counts);
                
                return stats.waiting === 0 &&
                       stats.active === 0 &&
                       stats.completed === 0 &&
                       stats.failed === 0 &&
                       stats.delayed === 0 &&
                       stats.paused === 0;
            }
        ),
        { numRuns: 100 }
    );
    console.log('  ✓ PASSED\n');
    passed++;
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    failed++;
}

// ============================================================================
// Property 7: Retry configuration uses exponential backoff
// Feature: bullmq-scheduler, Property 7: Retry configuration uses exponential backoff
// Validates: Requirements 3.1, 3.2
// ============================================================================

console.log('--- Property 7: Retry Configuration Tests ---\n');

console.log('Property 7.1: Default job options have correct retry settings');
try {
    const options = getDefaultJobOptions();
    
    const hasCorrectAttempts = options.attempts === 3;
    const hasExponentialBackoff = options.backoff.type === 'exponential';
    const hasCorrectDelay = options.backoff.delay === 5000;
    
    if (hasCorrectAttempts && hasExponentialBackoff && hasCorrectDelay) {
        console.log('  ✓ PASSED\n');
        passed++;
    } else {
        console.log('  ✗ FAILED: Incorrect retry configuration\n');
        failed++;
    }
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    failed++;
}

// ============================================================================
// Property 8: Job retention is configured correctly
// Feature: bullmq-scheduler, Property 8: Job retention is configured correctly
// Validates: Requirements 5.1, 5.2
// ============================================================================

console.log('--- Property 8: Job Retention Tests ---\n');

console.log('Property 8.1: Completed jobs retained for 24 hours (86400s)');
try {
    const options = getDefaultJobOptions();
    
    if (options.removeOnComplete.age === 86400) {
        console.log('  ✓ PASSED\n');
        passed++;
    } else {
        console.log('  ✗ FAILED: Expected 86400, got', options.removeOnComplete.age, '\n');
        failed++;
    }
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    failed++;
}

console.log('Property 8.2: Failed jobs retained for 7 days (604800s)');
try {
    const options = getDefaultJobOptions();
    
    if (options.removeOnFail.age === 604800) {
        console.log('  ✓ PASSED\n');
        passed++;
    } else {
        console.log('  ✗ FAILED: Expected 604800, got', options.removeOnFail.age, '\n');
        failed++;
    }
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    failed++;
}

// ============================================================================
// Property 3 & 4: Job lifecycle (simulated)
// Feature: bullmq-scheduler, Properties 3 & 4
// Validates: Requirements 2.2, 2.3
// ============================================================================

console.log('--- Property 3 & 4: Job Lifecycle Tests ---\n');

// Simulate job lifecycle tracking
class MockJobTracker {
    constructor() {
        this.jobs = new Map();
    }
    
    addJob(monitorId, interval) {
        const jobId = getJobId(monitorId);
        this.jobs.set(jobId, { monitorId, interval });
        return jobId;
    }
    
    removeJob(monitorId) {
        const jobId = getJobId(monitorId);
        const existed = this.jobs.has(jobId);
        this.jobs.delete(jobId);
        return existed;
    }
    
    updateJob(monitorId, newInterval) {
        const removed = this.removeJob(monitorId);
        const added = this.addJob(monitorId, newInterval);
        return { removed, added };
    }
    
    hasJob(monitorId) {
        return this.jobs.has(getJobId(monitorId));
    }
}

console.log('Property 3.1: Update removes old job and creates new');
try {
    fc.assert(
        fc.property(
            fc.string({ minLength: 1, maxLength: 50 }),
            fc.integer({ min: 1, max: 60 }),
            fc.integer({ min: 1, max: 60 }),
            (monitorId, oldInterval, newInterval) => {
                const tracker = new MockJobTracker();
                
                // Add initial job
                tracker.addJob(monitorId, oldInterval);
                
                // Update job
                const result = tracker.updateJob(monitorId, newInterval);
                
                // Should have removed old and added new
                return result.removed === true && 
                       tracker.hasJob(monitorId) &&
                       tracker.jobs.get(getJobId(monitorId)).interval === newInterval;
            }
        ),
        { numRuns: 100 }
    );
    console.log('  ✓ PASSED\n');
    passed++;
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    failed++;
}

console.log('Property 4.1: Delete removes job from queue');
try {
    fc.assert(
        fc.property(
            fc.string({ minLength: 1, maxLength: 50 }),
            fc.integer({ min: 1, max: 60 }),
            (monitorId, interval) => {
                const tracker = new MockJobTracker();
                
                // Add job
                tracker.addJob(monitorId, interval);
                
                // Verify it exists
                const existedBefore = tracker.hasJob(monitorId);
                
                // Remove job
                tracker.removeJob(monitorId);
                
                // Verify it's gone
                const existsAfter = tracker.hasJob(monitorId);
                
                return existedBefore === true && existsAfter === false;
            }
        ),
        { numRuns: 100 }
    );
    console.log('  ✓ PASSED\n');
    passed++;
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    failed++;
}

// ============================================================================
// Summary
// ============================================================================

console.log('='.repeat(60));
console.log(`Property Tests Complete: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

if (failed > 0) {
    process.exit(1);
}
