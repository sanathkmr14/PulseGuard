
import MonitorRunner from '../../src/services/runner.js';

// ==========================================
// EXTREME TIMEOUTS TEST SUITE
// ==========================================
const PROTOCOLS = ['HTTP', 'TCP', 'DNS', 'SMTP', 'PING'];
const TIMEOUTS = [
    { value: 0, description: 'Zero timeout' },
    { value: 1, description: '1ms timeout' },
    { value: 5000, description: '5s timeout (standard)' },
    { value: 60000, description: '60s timeout (long)' }
];

// Build scenarios for each protocol
function buildScenarios() {
    const scenarios = [];
    const baseConfigs = {
        HTTP: { url: 'https://httpbin.org/delay/1', type: 'HTTP' },
        TCP: { url: 'google.com', port: 443, type: 'TCP' },
        DNS: { url: 'google.com', type: 'DNS' },
        SMTP: { url: 'smtp.gmail.com', port: 587, type: 'SMTP' },
        PING: { url: '8.8.8.8', type: 'PING' }
    };

    for (const protocol of PROTOCOLS) {
        for (const timeout of TIMEOUTS) {
            const config = baseConfigs[protocol];
            scenarios.push({
                category: protocol,
                name: `${timeout.description}`,
                url: config.url,
                port: config.port,
                type: config.type,
                timeout: timeout.value,
                expected: {
                    // 0 timeout should use default (not crash)
                    // 1ms should timeout quickly for slow services
                    // 60s should complete for responsive services
                    // All should handle gracefully
                }
            });
        }
    }

    return scenarios;
}

const SCENARIOS = buildScenarios();

// ==========================================
// TIMEOUT BEHAVIOR VALIDATION
// ==========================================
function validateTimeoutBehavior(timeoutValue, result, actualDuration) {
    // Validate that timeout behavior is correct for each timeout value
    
    if (timeoutValue === 0) {
        // 0 timeout should use default behavior (not crash, should complete or timeout normally)
        // The actual duration should be reasonable (not extremely fast like <1ms which would indicate no wait)
        return result.healthState && actualDuration >= 500;
    }
    
    if (timeoutValue === 1) {
        // 1ms timeout should either timeout immediately OR complete very quickly if service is fast
        // Should either be TIMEOUT error or very short duration
        const isTimeout = result.errorType === 'TIMEOUT' || result.healthState === 'DOWN';
        const isVeryFast = actualDuration < 100;
        return isTimeout || isVeryFast;
    }
    
    if (timeoutValue === 5000) {
        // 5s timeout - standard behavior, should complete within reasonable time
        // Duration should be consistent with 5s timeout (allow some margin)
        return result.healthState && actualDuration >= 4000 && actualDuration < 15000;
    }
    
    if (timeoutValue === 60000) {
        // 60s timeout - long timeout, should complete for responsive services
        // Duration should be consistent with longer timeout
        return result.healthState && actualDuration >= 50000 && actualDuration < 120000;
    }
    
    return false;
}

// ==========================================
// RUNNER
// ==========================================
async function runExtremeTimeoutTests() {
    console.log('🚀 Starting Extreme Timeouts Test Suite...');
    console.log('================================================================================');
    console.log(`${'PROTOCOL'.padEnd(10)} | ${'TIMEOUT'.padEnd(15)} | ${'STATUS'.padEnd(10)} | ${'RT (ms)'.padEnd(10)} | ${'RESULT'}`);
    console.log('--------------------------------------------------------------------------------');

    let passed = 0;
    let failed = 0;
    let skipped = 0;

    for (const scenario of SCENARIOS) {
        try {
            const startTime = Date.now();
            const result = await MonitorRunner.run({
                type: scenario.type,
                url: scenario.url,
                port: scenario.port,
                timeout: scenario.timeout,
                degradedThresholdMs: 5000
            });
            const duration = Date.now() - startTime;

            // Validate timeout behavior based on timeout value
            const isValidTimeout = validateTimeoutBehavior(scenario.timeout, result, duration);

            if (isValidTimeout && result.healthState) {
                passed++;
                console.log(`${scenario.category.padEnd(10)} | ${scenario.timeout.toString().padEnd(15)} | ${result.healthState.padEnd(10)} | ${duration.toString().padEnd(10)} | PASS`);
            } else {
                failed++;
                console.log(`${scenario.category.padEnd(10)} | ${scenario.timeout.toString().padEnd(15)} | ❌ UNKNOWN  | ${duration.toString().padEnd(10)} | FAIL (Invalid result)`);
            }

        } catch (err) {
            // Timeout errors are expected for very short timeouts
            const isExpectedError = err.message?.includes('timeout') || 
                                   err.message?.includes('Timeout') ||
                                   err.message?.includes('ETIMEDOUT');

            if (isExpectedError || scenario.timeout <= 1) {
                passed++;
                console.log(`${scenario.category.padEnd(10)} | ${scenario.timeout.toString().padEnd(15)} | ⏱️ TIMEOUT | N/A       | PASS (Expected: ${err.message.substring(0, 30)})`);
            } else {
                failed++;
                console.log(`${scenario.category.padEnd(10)} | ${scenario.timeout.toString().padEnd(15)} | 💥 ERROR   | N/A       | FAIL: ${err.message.substring(0, 40)}`);
            }
        }
    }

    console.log('================================================================================');
    console.log(`SUMMARY: ${passed}/${SCENARIOS.length} Passed, ${failed} Failed`);

    if (failed > 0) {
        console.log('❌ Some timeout tests failed');
        process.exit(1);
    } else {
        console.log('✅ All extreme timeout tests passed');
        process.exit(0);
    }
}

runExtremeTimeoutTests();

