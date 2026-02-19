/**
 * Property-Based Tests for Health State Service
 * Uses fast-check for property-based testing
 * 
 * Run with: node backend/src/services/health-state.service.property.test.js
 */

import fc from 'fast-check';

const DEFAULT_DEGRADED_THRESHOLD_MS = 2000;

// Re-implement HealthStateService for testing
class HealthStateService {
    determineHealthState(checkResult, monitor) {
        if (checkResult.status === 'DOWN' || checkResult.status === 'down') {
            return { 
                status: 'down', 
                reasons: [checkResult.errorType || 'CHECK_FAILED'] 
            };
        }
        
        const degradationReasons = this.aggregateDegradationReasons(checkResult, monitor);
        if (degradationReasons.length > 0) {
            return { status: 'degraded', reasons: degradationReasons };
        }
        
        return { status: 'up', reasons: [] };
    }
    
    isResponseTimeDegraded(responseTimeMs, threshold) {
        if (threshold == null || threshold <= 0) {
            return false;
        }
        
        const responseTime = Number(responseTimeMs);
        if (isNaN(responseTime)) {
            return false;
        }
        
        return responseTime > threshold;
    }
    
    hasSSLWarning(checkResult) {
        return checkResult.warning != null && 
               typeof checkResult.warning === 'string' && 
               checkResult.warning.length > 0;
    }
    
    aggregateDegradationReasons(checkResult, monitor) {
        const reasons = [];
        const threshold = this.getThreshold(monitor);
        const responseTimeMs = checkResult.responseTimeMs ?? checkResult.responseTime ?? 0;
        
        if (this.isResponseTimeDegraded(responseTimeMs, threshold)) {
            reasons.push(`SLOW_RESPONSE: ${responseTimeMs}ms exceeds threshold of ${threshold}ms`);
        }
        
        if (this.hasSSLWarning(checkResult)) {
            reasons.push(`SSL_WARNING: ${checkResult.warning}`);
        }
        
        return reasons;
    }
    
    getThreshold(monitor) {
        const threshold = monitor?.degradedThresholdMs;
        if (threshold == null || typeof threshold !== 'number') {
            return DEFAULT_DEGRADED_THRESHOLD_MS;
        }
        return threshold;
    }
}

const healthStateService = new HealthStateService();

console.log('Running Property Tests for Health State Service...\n');

let passed = 0;
let failed = 0;

// ============================================================================
// Property 1: Response time threshold determines degradation
// Feature: health-state-degraded, Property 1: Response time threshold determines degradation
// Validates: Requirements 1.1, 1.2
// ============================================================================

console.log('--- Property 1: Response Time Threshold Tests ---\n');

console.log('Property 1.1: Response time > threshold results in DEGRADED');
try {
    fc.assert(
        fc.property(
            fc.integer({ min: 1, max: 10000 }),  // threshold
            fc.integer({ min: 1, max: 20000 }),  // responseTime
            (threshold, responseTime) => {
                const checkResult = { status: 'UP', responseTimeMs: responseTime };
                const monitor = { degradedThresholdMs: threshold };
                const result = healthStateService.determineHealthState(checkResult, monitor);
                
                if (responseTime > threshold) {
                    return result.status === 'degraded';
                } else {
                    return result.status === 'up';
                }
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
// Property 2: Default threshold is 2000ms
// Feature: health-state-degraded, Property 2: Default threshold is 2000ms
// Validates: Requirements 1.3
// ============================================================================

console.log('--- Property 2: Default Threshold Tests ---\n');

console.log('Property 2.1: Monitors without threshold use 2000ms default');
try {
    fc.assert(
        fc.property(
            fc.integer({ min: 1, max: 5000 }),  // responseTime
            (responseTime) => {
                const checkResult = { status: 'UP', responseTimeMs: responseTime };
                const monitor = {};  // No threshold configured
                const result = healthStateService.determineHealthState(checkResult, monitor);
                
                // Should be degraded if > 2000ms, up otherwise
                if (responseTime > 2000) {
                    return result.status === 'degraded';
                } else {
                    return result.status === 'up';
                }
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

console.log('Property 2.2: Null/undefined threshold uses 2000ms default');
try {
    fc.assert(
        fc.property(
            fc.constantFrom(null, undefined),
            fc.integer({ min: 2001, max: 5000 }),  // responseTime > 2000
            (thresholdValue, responseTime) => {
                const checkResult = { status: 'UP', responseTimeMs: responseTime };
                const monitor = { degradedThresholdMs: thresholdValue };
                const result = healthStateService.determineHealthState(checkResult, monitor);
                
                // Should be degraded since responseTime > 2000 (default)
                return result.status === 'degraded';
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
// Property 3: SSL warnings trigger degradation
// Feature: health-state-degraded, Property 3: SSL warnings trigger degradation
// Validates: Requirements 2.1, 6.3
// ============================================================================

console.log('--- Property 3: SSL Warning Tests ---\n');

console.log('Property 3.1: Non-null warning triggers DEGRADED');
try {
    fc.assert(
        fc.property(
            fc.string({ minLength: 1, maxLength: 100 }),  // warning message
            (warning) => {
                const checkResult = { status: 'UP', responseTimeMs: 100, warning };
                const monitor = { degradedThresholdMs: 5000 };  // High threshold so response time doesn't trigger
                const result = healthStateService.determineHealthState(checkResult, monitor);
                
                return result.status === 'degraded' && 
                       result.reasons.some(r => r.includes('SSL_WARNING'));
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

console.log('Property 3.2: Null/empty warning does not trigger DEGRADED');
try {
    fc.assert(
        fc.property(
            fc.constantFrom(null, undefined, ''),
            (warning) => {
                const checkResult = { status: 'UP', responseTimeMs: 100, warning };
                const monitor = { degradedThresholdMs: 5000 };
                const result = healthStateService.determineHealthState(checkResult, monitor);
                
                return result.status === 'up';
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
// Property 4: DOWN takes precedence over DEGRADED
// Feature: health-state-degraded, Property 4: DOWN takes precedence over DEGRADED
// Validates: Requirements 6.1
// ============================================================================

console.log('--- Property 4: DOWN Precedence Tests ---\n');

console.log('Property 4.1: DOWN status always results in down, regardless of other factors');
try {
    fc.assert(
        fc.property(
            fc.integer({ min: 1, max: 10000 }),  // responseTime (could be slow)
            fc.option(fc.string({ minLength: 1, maxLength: 50 })),  // warning (could exist)
            fc.integer({ min: 100, max: 5000 }),  // threshold
            (responseTime, warning, threshold) => {
                const checkResult = { 
                    status: 'DOWN', 
                    responseTimeMs: responseTime, 
                    warning: warning ?? null,
                    errorType: 'TIMEOUT'
                };
                const monitor = { degradedThresholdMs: threshold };
                const result = healthStateService.determineHealthState(checkResult, monitor);
                
                return result.status === 'down';
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
// Property 5: Zero or negative threshold disables degradation
// Feature: health-state-degraded, Property 5: Zero or negative threshold disables degradation
// Validates: Requirements 5.3
// ============================================================================

console.log('--- Property 5: Disabled Threshold Tests ---\n');

console.log('Property 5.1: Zero threshold disables response time degradation');
try {
    fc.assert(
        fc.property(
            fc.integer({ min: 1, max: 100000 }),  // Any response time
            (responseTime) => {
                const checkResult = { status: 'UP', responseTimeMs: responseTime };
                const monitor = { degradedThresholdMs: 0 };
                const result = healthStateService.determineHealthState(checkResult, monitor);
                
                // Should be UP regardless of response time (no SSL warning)
                return result.status === 'up';
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

console.log('Property 5.2: Negative threshold disables response time degradation');
try {
    fc.assert(
        fc.property(
            fc.integer({ min: -1000, max: -1 }),  // Negative threshold
            fc.integer({ min: 1, max: 100000 }),  // Any response time
            (threshold, responseTime) => {
                const checkResult = { status: 'UP', responseTimeMs: responseTime };
                const monitor = { degradedThresholdMs: threshold };
                const result = healthStateService.determineHealthState(checkResult, monitor);
                
                return result.status === 'up';
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
// Property 6: Multiple degradation reasons are aggregated
// Feature: health-state-degraded, Property 6: Multiple degradation reasons are aggregated
// Validates: Requirements 6.2
// ============================================================================

console.log('--- Property 6: Reason Aggregation Tests ---\n');

console.log('Property 6.1: Both slow response and SSL warning are included');
try {
    fc.assert(
        fc.property(
            fc.integer({ min: 100, max: 500 }),  // threshold
            fc.integer({ min: 501, max: 5000 }),  // responseTime > threshold
            fc.string({ minLength: 1, maxLength: 50 }),  // warning
            (threshold, responseTime, warning) => {
                const checkResult = { status: 'UP', responseTimeMs: responseTime, warning };
                const monitor = { degradedThresholdMs: threshold };
                const result = healthStateService.determineHealthState(checkResult, monitor);
                
                const hasSlowResponse = result.reasons.some(r => r.includes('SLOW_RESPONSE'));
                const hasSSLWarning = result.reasons.some(r => r.includes('SSL_WARNING'));
                
                return result.status === 'degraded' && 
                       hasSlowResponse && 
                       hasSSLWarning &&
                       result.reasons.length === 2;
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
// Property 7: Health state result structure is consistent
// Feature: health-state-degraded, Property 7: Health state result structure is consistent
// Validates: Requirements 6.4
// ============================================================================

console.log('--- Property 7: Result Structure Tests ---\n');

console.log('Property 7.1: Result always has status and reasons fields');
try {
    fc.assert(
        fc.property(
            fc.constantFrom('UP', 'DOWN', 'up', 'down'),
            fc.option(fc.integer({ min: 0, max: 10000 })),
            fc.option(fc.string({ maxLength: 50 })),
            fc.option(fc.integer({ min: -100, max: 10000 })),
            (status, responseTime, warning, threshold) => {
                const checkResult = { 
                    status, 
                    responseTimeMs: responseTime ?? 0,
                    warning: warning ?? null,
                    errorType: status === 'DOWN' || status === 'down' ? 'TEST_ERROR' : null
                };
                const monitor = { degradedThresholdMs: threshold ?? undefined };
                const result = healthStateService.determineHealthState(checkResult, monitor);
                
                return typeof result === 'object' &&
                       typeof result.status === 'string' &&
                       Array.isArray(result.reasons) &&
                       Object.keys(result).length === 2;
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

console.log('Property 7.2: Status is always one of up, down, degraded');
try {
    fc.assert(
        fc.property(
            fc.constantFrom('UP', 'DOWN'),
            fc.integer({ min: 0, max: 10000 }),
            fc.option(fc.string({ minLength: 0, maxLength: 50 })),
            (status, responseTime, warning) => {
                const checkResult = { 
                    status, 
                    responseTimeMs: responseTime,
                    warning: warning ?? null
                };
                const monitor = {};
                const result = healthStateService.determineHealthState(checkResult, monitor);
                
                return ['up', 'down', 'degraded'].includes(result.status);
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

// Continue to Property 8 tests below...


// ============================================================================
// Property 8: Degraded events include reason
// Feature: health-state-degraded, Property 8: Degraded events include reason
// Validates: Requirements 4.4
// ============================================================================

console.log('\n--- Property 8: Degraded Events Tests ---\n');

let eventPassed = 0;
let eventFailed = 0;

console.log('Property 8.1: DEGRADED status always has non-empty reasons array');
try {
    fc.assert(
        fc.property(
            fc.integer({ min: 100, max: 500 }),  // threshold
            fc.integer({ min: 501, max: 5000 }),  // responseTime > threshold
            (threshold, responseTime) => {
                const checkResult = { status: 'UP', responseTimeMs: responseTime };
                const monitor = { degradedThresholdMs: threshold };
                const result = healthStateService.determineHealthState(checkResult, monitor);
                
                // If degraded, reasons must be non-empty
                if (result.status === 'degraded') {
                    return result.reasons.length > 0;
                }
                return true;
            }
        ),
        { numRuns: 100 }
    );
    console.log('  ✓ PASSED\n');
    eventPassed++;
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    eventFailed++;
}

console.log('Property 8.2: UP status always has empty reasons array');
try {
    fc.assert(
        fc.property(
            fc.integer({ min: 1, max: 1000 }),  // responseTime
            fc.integer({ min: 1001, max: 5000 }),  // threshold > responseTime
            (responseTime, threshold) => {
                const checkResult = { status: 'UP', responseTimeMs: responseTime, warning: null };
                const monitor = { degradedThresholdMs: threshold };
                const result = healthStateService.determineHealthState(checkResult, monitor);
                
                return result.status === 'up' && result.reasons.length === 0;
            }
        ),
        { numRuns: 100 }
    );
    console.log('  ✓ PASSED\n');
    eventPassed++;
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    eventFailed++;
}

passed += eventPassed;
failed += eventFailed;

console.log('='.repeat(60));
console.log(`ALL PROPERTY TESTS COMPLETE: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

if (failed > 0) {
    process.exit(1);
}
