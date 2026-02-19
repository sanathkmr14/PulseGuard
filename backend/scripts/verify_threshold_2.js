import enhancedHealthEvaluator from '../src/services/health-evaluator.service.js';

// Configuration: Alert after 2 checks (Default)
const THRESHOLD = 2;
const MONITOR_ID = 'test-monitor-404-threshold-2';

const mockMonitor = {
    _id: MONITOR_ID,
    name: 'Test Monitor Threshold 2',
    type: 'HTTP',
    interval: 60,
    alertThreshold: THRESHOLD,
    consecutiveFailures: 0,
    consecutiveSlowCount: 0,
    status: 'up' // Start as UP
};

const checkResult404 = {
    isUp: false,
    responseTime: 100,
    statusCode: 404,
    errorType: 'HTTP_CLIENT_ERROR',
    errorMessage: 'Not Found'
};

async function verifyThreshold2() {
    console.log(`\n🔹 Verifying Alert Flow with Threshold = ${THRESHOLD}`);

    // Reset state
    enhancedHealthEvaluator.clearStateHistory(MONITOR_ID);

    // --- Check 1: First 404 ---
    // Expected: DEGRADED (Waiting 1/2) - No Alert
    console.log('\n--- Check #1 (First 404) ---');
    let result = await enhancedHealthEvaluator.determineHealthState(checkResult404, mockMonitor, []);
    console.log(`Result: ${result.status.toUpperCase()}`);
    console.log(`Reason: ${result.reasons[0]}`);

    if (result.status === 'degraded') {
        console.log('✅ Correct: System is WAITING (Degraded), NOT Down.');
    } else {
        console.log('❌ Incorrect status.');
    }

    // Simulate time passing (avoid flapping)
    let history = enhancedHealthEvaluator.stateHistory.get(MONITOR_ID);
    if (history) {
        history.lastStateChange = Date.now() - 300000;
        enhancedHealthEvaluator.stateHistory.set(MONITOR_ID, history);
    }
    mockMonitor.status = result.status; // Persist status

    // --- Check 2: Second 404 ---
    // Expected: DOWN (Confirmed 2/2) -> ALERT TRIGGERED
    console.log('\n--- Check #2 (Second 404) ---');
    result = await enhancedHealthEvaluator.determineHealthState(checkResult404, mockMonitor, []);
    console.log(`Result: ${result.status.toUpperCase()}`);
    console.log(`Reason: ${result.reasons[0]}`);

    if (result.status === 'down') {
        console.log('✅ Correct: Threshold met (2/2). System is now DOWN. 🚨 ALERT SENT.');
    } else {
        console.log('❌ Incorrect status.');
    }
}

verifyThreshold2();
