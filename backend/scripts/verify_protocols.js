import enhancedHealthEvaluator from '../src/services/health-evaluator.service.js';

const THRESHOLD = 2; // Default validation

async function simulateProtocol(type, errorScenario) {
    const monitorId = `test-monitor-${type.toLowerCase()}`;
    console.log(`\n🔹 Verifying Protocol: ${type} (Threshold: ${THRESHOLD})`);

    const mockMonitor = {
        _id: monitorId,
        name: `Test ${type} Monitor`,
        type: type, // 'TCP', 'UDP', 'DNS', 'SSL'
        interval: 60,
        alertThreshold: THRESHOLD,
        consecutiveFailures: 0,
        consecutiveSlowCount: 0,
        status: 'unknown'
    };

    // Reset state
    enhancedHealthEvaluator.clearStateHistory(monitorId);

    // --- Check 1: First Failure ---
    console.log(`   Check #1 (${errorScenario.errorType})`);
    let result = await enhancedHealthEvaluator.determineHealthState(errorScenario, mockMonitor, []);

    // Validate
    if (result.status === 'degraded' && result.reasons[0].includes('awaiting confirmation')) {
        console.log(`   ✅ Correct: DEGRADED (Waiting 1/${THRESHOLD})`);
    } else {
        console.log(`   ❌ FAIL: Expected DEGRADED, got ${result.status}`);
        console.log(`      Reason: ${result.reasons[0]}`);
    }

    // Simulate State Persistence & Time
    mockMonitor.status = result.status;
    let history = enhancedHealthEvaluator.stateHistory.get(monitorId);
    if (history) {
        history.lastStateChange = Date.now() - 300000;
        enhancedHealthEvaluator.stateHistory.set(monitorId, history);
    }

    // --- Check 2: Second Failure ---
    console.log(`   Check #2 (${errorScenario.errorType})`);
    result = await enhancedHealthEvaluator.determineHealthState(errorScenario, mockMonitor, []);

    // Validate
    if (result.status === 'down') {
        console.log(`   ✅ Correct: DOWN (Confirmed ${THRESHOLD}/${THRESHOLD}) -> 🚨 ALERT`);
    } else {
        console.log(`   ❌ FAIL: Expected DOWN, got ${result.status}`);
        console.log(`      Reason: ${result.reasons[0]}`);
    }
}

async function verifyAllProtocols() {
    console.log('🚀 Starting Protocol Verification\n');

    // 1. TCP Failure (Connection Refused)
    await simulateProtocol('TCP', {
        isUp: false,
        responseTime: 0,
        statusCode: null,
        errorType: 'CONNECTION_REFUSED',
        errorMessage: 'Connection refused'
    });

    // 2. DNS Failure (Domain Not Found)
    await simulateProtocol('DNS', {
        isUp: false,
        responseTime: 0,
        statusCode: null,
        errorType: 'DNS_NOT_FOUND',
        errorMessage: 'Domain name not found'
    });

    // 3. UDP Failure (No Response)
    await simulateProtocol('UDP', {
        isUp: false,
        responseTime: 0,
        statusCode: null,
        errorType: 'UDP_NO_RESPONSE',
        errorMessage: 'UDP service not responding'
    });

    // 4. SSL Failure (Certificate Expired)
    await simulateProtocol('SSL', {
        isUp: false,
        responseTime: 100,
        statusCode: null,
        errorType: 'SSL_EXPIRED',
        errorMessage: 'Certificate has expired',
        meta: { sslInfo: { error: { code: 'CERT_HAS_EXPIRED' } } }
    });

    console.log('\n🏁 Protocol Verification Complete');
}

verifyAllProtocols();
