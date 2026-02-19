import enhancedHealthEvaluator from '../src/services/health-evaluator.service.js';

// Configuration: Alert after 3 checks
const THRESHOLD = 3;
const MONITOR_ID = 'test-monitor-404-flow';

const mockMonitor = {
    _id: MONITOR_ID,
    name: 'Test Monitor 404',
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

async function verify404Flow() {
    console.log(`\n🔹 Verifying 404 Alert Flow (Threshold: ${THRESHOLD})`);

    // Reset state
    enhancedHealthEvaluator.clearStateHistory(MONITOR_ID);

    // --- Check 1: First 404 ---
    // Expected: DEGRADED (Waiting 1/3) - No Alert
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
    // Expected: DEGRADED (Waiting 2/3) - No Alert
    console.log('\n--- Check #2 (Second 404) ---');
    result = await enhancedHealthEvaluator.determineHealthState(checkResult404, mockMonitor, []);
    console.log(`Result: ${result.status.toUpperCase()}`);
    console.log(`Reason: ${result.reasons[0]}`);

    if (result.status === 'degraded') {
        console.log('✅ Correct: System is STILL WAITING (Degraded), NOT Down.');
    } else {
        console.log('❌ Incorrect status.');
    }

    // Simulate time passing
    history = enhancedHealthEvaluator.stateHistory.get(MONITOR_ID);
    if (history) {
        history.lastStateChange = Date.now() - 300000;
        enhancedHealthEvaluator.stateHistory.set(MONITOR_ID, history);
    }
    mockMonitor.status = result.status;

    // --- Check 3: Third 404 ---
    // Expected: DOWN (Confirmed 3/3) -> ALERT TRIGGERED
    console.log('\n--- Check #3 (Third 404) ---');
    result = await enhancedHealthEvaluator.determineHealthState(checkResult404, mockMonitor, []);
    console.log(`Result: ${result.status.toUpperCase()}`);
    console.log(`Reason: ${result.reasons[0]}`);

    if (result.status === 'down') {
        console.log('✅ Correct: Threshold met. System is now DOWN. 🚨 ALERT SENT.');
    } else {
        console.log('❌ Incorrect status.');
    }
}

verify404Flow();
