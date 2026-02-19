// Set dummy env variables BEFORE imports to avoid crash
process.env.MONGODB_URI = 'mongodb://localhost:27017/test-incidents';
process.env.JWT_SECRET = 'test-secret';

import enhancedHealthEvaluator from '../src/services/health-evaluator.service.js';
import enhancedAlertService from '../src/services/enhanced-alert.service.js';
import mongoose from 'mongoose';

// Configuration: Alert after 2 checks
const THRESHOLD = 2;

// Mock Mongoose Connection (Prevent actual connection attempts)
mongoose.connect = async () => console.log('Mock DB Connected');

// Mock Monitor Template
const baseMonitor = {
    _id: new mongoose.Types.ObjectId(),
    name: 'Test Monitor Incident',
    type: 'HTTP',
    interval: 60,
    alertThreshold: THRESHOLD,
    consecutiveFailures: 0,
    consecutiveSlowCount: 0,
    status: 'up',
    user: new mongoose.Types.ObjectId() // Mock User ID
};

async function simulateIncidentScenario(scenarioName, errorScenario, expectedIncidentType) {
    console.log(`\n🔹 Scenario: ${scenarioName}`);

    // Clone monitor and reset state
    const monitor = { ...baseMonitor, _id: new mongoose.Types.ObjectId() }; // New ID for each test
    enhancedHealthEvaluator.clearStateHistory(monitor._id);

    // --- Check 1: First Failure ---
    console.log(`   Check #1 (Wait)`);
    let result = await enhancedHealthEvaluator.determineHealthState(errorScenario, monitor, []);
    monitor.status = result.status;

    // Persist state history (as if time passed)
    let history = enhancedHealthEvaluator.stateHistory.get(monitor._id);
    if (history) {
        history.lastStateChange = Date.now() - 300000;
        enhancedHealthEvaluator.stateHistory.set(monitor._id, history);
    }

    // --- Check 2: Second Failure (Trigger) ---
    console.log(`   Check #2 (Trigger)`);
    result = await enhancedHealthEvaluator.determineHealthState(errorScenario, monitor, []);
    monitor.status = result.status;

    // Simulate Incident Logic (Mocking enhancedAlertService behavior)
    // We want to see what KIND of incident WOULD be created
    let incidentType = null;

    if (monitor.status === 'down') {
        incidentType = 'DOWN';
    } else if (monitor.status === 'degraded') {
        incidentType = 'DEGRADED';
    }


    if (incidentType === expectedIncidentType) {
        console.log(`   ✅ Correct: Monitor is ${monitor.status.toUpperCase()} -> Incident Type: ${incidentType}`);
    } else {
        console.log(`   ❌ FAIL: Expected ${expectedIncidentType}, got ${incidentType || 'NONE'}`);
        console.log(`      Final Status: ${monitor.status}`);
        console.log(`      Reasons: ${result.reasons}`);
    }
}

async function verifyIncidentTypes() {
    console.log('🚀 Starting Incident Type Verification\n');

    // 1. HTTP 500 -> DOWN Incident
    await simulateIncidentScenario('HTTP 500 Error', {
        isUp: false,
        statusCode: 500,
        errorType: 'HTTP_SERVER_ERROR',
        errorMessage: 'Internal Server Error'
    }, 'DOWN');

    // 2. HTTP 404 -> DOWN Incident
    await simulateIncidentScenario('HTTP 404 Not Found', {
        isUp: false,
        statusCode: 404,
        errorType: 'HTTP_CLIENT_ERROR',
        errorMessage: 'Not Found'
    }, 'DOWN');

    // 3. TCP Connection Failure -> DOWN Incident
    await simulateIncidentScenario('TCP Connection Refused', {
        isUp: false,
        errorType: 'CONNECTION_REFUSED',
        errorMessage: 'Connection refused'
    }, 'DOWN');

    // 4. Rate Limit (429) -> DEGRADED (Warning/Incident)
    await simulateIncidentScenario('HTTP 429 Rate Limit', {
        isUp: false,
        statusCode: 429,
        errorType: 'HTTP_RATE_LIMIT',
        errorMessage: 'Too Many Requests'
    }, 'DEGRADED');

    // 5. High Latency -> DEGRADED Incident (Needs 3 checks by default)
    console.log('\n🔹 Scenario: High Latency (Performance)');
    const perfMonitor = { ...baseMonitor, _id: new mongoose.Types.ObjectId() };
    enhancedHealthEvaluator.clearStateHistory(perfMonitor._id);

    const slowCheck = {
        isUp: true,
        responseTime: 5000,
        statusCode: 200,
        errorType: 'SLOW_RESPONSE',
        errorMessage: 'Performance degradation',
        isSlowResponse: true,
        isSlowWarning: false
    };

    // Check 1
    let res = await enhancedHealthEvaluator.determineHealthState(slowCheck, perfMonitor, []);
    console.log(`   Check #1: ${res.status}`);

    // Check 2
    res = await enhancedHealthEvaluator.determineHealthState(slowCheck, perfMonitor, []);
    console.log(`   Check #2: ${res.status}`);

    // Check 3 (Should trigger DEGRADED)
    // Manually increment consecutiveSlowCount on monitor as runner.js would
    perfMonitor.consecutiveSlowCount = 3;
    res = await enhancedHealthEvaluator.determineHealthState(slowCheck, perfMonitor, []);
    console.log(`   Check #3: ${res.status}`);

    if (res.status === 'degraded') {
        console.log(`   ✅ Correct: Monitor is DEGRADED -> Incident Type: DEGRADED`);
    } else {
        console.log(`   ❌ FAIL: Expected DEGRADED, got ${res.status}`);
    }

    console.log('\n🏁 Incident Validation Complete');
}

verifyIncidentTypes();
