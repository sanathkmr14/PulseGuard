import enhancedHealthEvaluator from '../src/services/health-evaluator.service.js';

// Mock objects
const mockMonitor = {
    _id: 'test-monitor-id',
    name: 'Test Monitor',
    type: 'HTTP',
    interval: 5,
    alertThreshold: 2,
    consecutiveFailures: 0,
    consecutiveSlowCount: 0,
    status: 'unknown'
};

const mockCheckResult = {
    isUp: false,
    responseTime: 100,
    statusCode: 404,
    errorType: 'HTTP_CLIENT_ERROR',
    errorMessage: 'HTTP 404: Not Found',
    healthState: 'DOWN' // Initial result from runner
};

const mockRecentChecks = []; // No history

async function verifyLogic() {
    console.log('--- Simulating First Check (404 Error) ---');
    console.log(`Alert Threshold: ${mockMonitor.alertThreshold}`);
    console.log(`Previous Status: ${mockMonitor.status}`);

    // Manually clean up state history to ensure fresh start
    enhancedHealthEvaluator.cleanupState(mockMonitor._id);

    const result = await enhancedHealthEvaluator.determineHealthState(
        mockCheckResult,
        mockMonitor,
        mockRecentChecks
    );

    console.log('\n--- Result ---');
    console.log(`Status: ${result.status}`);
    console.log(`Confidence: ${result.confidence}`);
    console.log(`Reasons: ${JSON.stringify(result.reasons, null, 2)}`);

    if (result.status === 'degraded' && result.reasons[0].includes('awaiting confirmation')) {
        console.log('\n✅ PASS: First check resulted in DEGRADED (awaiting confirmation).');
    } else {
        console.log('\n❌ FAIL: Expected DEGRADED, got ' + result.status);
    }
}

verifyLogic();
