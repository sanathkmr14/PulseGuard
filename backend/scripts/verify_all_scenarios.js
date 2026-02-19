import enhancedHealthEvaluator from '../src/services/health-evaluator.service.js';

// Configuration
const THRESHOLD = 3; // Use 3 to be sure it waits
const MONITOR_ID = 'test-monitor-all-scenarios';

const mockMonitor = {
    _id: MONITOR_ID,
    name: 'Test Monitor',
    type: 'HTTP',
    interval: 60,
    alertThreshold: THRESHOLD,
    consecutiveFailures: 0,
    consecutiveSlowCount: 0,
    status: 'unknown'
};

function resetMonitor() {
    mockMonitor.status = 'unknown';
    mockMonitor.consecutiveFailures = 0;
    enhancedHealthEvaluator.clearStateHistory(MONITOR_ID);
}

async function simulateScenario(name, checkResult, expectedFlow) {
    console.log(`\n🔹 Scenario: ${name}`);
    console.log(`   Config: Threshold=${THRESHOLD}`);
    resetMonitor();

    for (let i = 1; i <= expectedFlow.length; i++) {
        const expectedStatus = expectedFlow[i - 1];

        // Hack: Backdate lastStateChange to avoid flapping protection
        const history = enhancedHealthEvaluator.stateHistory.get(MONITOR_ID);
        if (history) {
            history.lastStateChange = Date.now() - 300000; // 5 minutes ago
            enhancedHealthEvaluator.stateHistory.set(MONITOR_ID, history);
        }

        // Pass the check result
        const result = await enhancedHealthEvaluator.determineHealthState(
            checkResult,
            mockMonitor,
            []
        );

        // Update monitor status for next iteration (simulating runner.js behavior)
        // Note: runner.js usually updates DB, here we update object to simulate state persistence
        // The evaluator uses its own memory stateHistory, so that's the source of truth for hysteresis

        const isMatch = result.status === expectedStatus;
        const icon = isMatch ? '✅' : '❌';

        console.log(`   Check #${i}: Got ${result.status.toUpperCase()} ${icon} (Expected: ${expectedStatus.toUpperCase()})`);

        if (!isMatch) {
            console.log(`   ⚠️ Reason: ${JSON.stringify(result.reasons)}`);
        }

        // IMPORTANT: The evaluator's internal state is updated automatically.
        // We just need to update the monitor's display status for context, though evaluator relies on its map.
        mockMonitor.status = result.status;
    }
}

async function runVerification() {
    console.log('🚀 Starting Comprehensive Verification\n');

    // 1. Success Case
    await simulateScenario('200 OK (Healthy)', {
        isUp: true,
        responseTime: 100,
        statusCode: 200,
        errorType: null,
        errorMessage: null
    }, ['up', 'up']); // Should be UP immediately and stay UP

    // 2. 404 Failure (Respect Threshold)
    // Threshold is 3.
    // Check 1: DEGRADED (Awaiting 1/3)
    // Check 2: DEGRADED (Awaiting 2/3)
    // Check 3: DOWN (Confirmed)
    await simulateScenario('404 Not Found (Client Error)', {
        isUp: false,
        responseTime: 100,
        statusCode: 404,
        errorType: 'HTTP_CLIENT_ERROR',
        errorMessage: 'Not Found'
    }, ['degraded', 'degraded', 'down']);

    // 3. 500 Failure (Respect Threshold)
    await simulateScenario('500 Internal Server Error', {
        isUp: false,
        responseTime: 100,
        statusCode: 500,
        errorType: 'HTTP_SERVER_ERROR',
        errorMessage: 'Internal Server Error'
    }, ['degraded', 'degraded', 'down']);

    // 4. Timeout (Respect Threshold)
    await simulateScenario('Connection Timeout', {
        isUp: false,
        responseTime: 10000,
        statusCode: null,
        errorType: 'TIMEOUT',
        errorMessage: 'Connection timed out'
    }, ['degraded', 'degraded', 'down']);

    // 5. 429 Rate Limit (Immediate Degraded)
    // 429 is usually treated as a warning immediately, not waiting for threshold to show *some* status,
    // but it shouldn't go DOWN.
    await simulateScenario('429 Rate Limit', {
        isUp: false, // 429 is treated as failure/degradation in logic when analyzing severity
        responseTime: 100,
        statusCode: 429,
        errorType: 'HTTP_RATE_LIMIT',
        errorMessage: 'Too Many Requests'
    }, ['degraded', 'degraded']); // Should stay DEGRADED

    console.log('\n🏁 Verification Complete');
}

runVerification();
