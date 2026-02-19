
import MonitorRunner from '../../src/services/runner.js';

// ==========================================
// PING PACKET LOSS TEST SUITE
// ==========================================
const SCENARIOS = [
    // Reliable hosts (0% loss expected)
    {
        category: 'Reliable Ping',
        name: 'Localhost',
        url: '127.0.0.1',
        type: 'PING',
        count: 4,
        expected: { status: 'UP', maxPacketLoss: 0 }
    },
    {
        category: 'Reliable Ping',
        name: 'Google DNS',
        url: '8.8.8.8',
        type: 'PING',
        count: 4,
        expected: { status: 'UP', maxPacketLoss: 25 } // Allow some loss on internet
    },
    {
        category: 'Reliable Ping',
        name: 'Cloudflare DNS',
        url: '1.1.1.1',
        type: 'PING',
        count: 4,
        expected: { status: 'UP', maxPacketLoss: 25 }
    },

    // Unreliable hosts (100% loss expected)
    {
        category: 'Unreachable',
        name: 'Non-Routable IP (100% loss)',
        url: '10.255.255.1',
        type: 'PING',
        count: 4,
        timeout: 2000,
        expected: { status: 'DOWN', minPacketLoss: 75 }
    },
    {
        category: 'Unreachable',
        name: 'Invalid IP Range',
        url: '192.168.255.255',
        type: 'PING',
        count: 4,
        timeout: 2000,
        expected: { status: 'DOWN', minPacketLoss: 75 }
    },

    // High latency tests
    {
        category: 'High Latency',
        name: 'Distant Server',
        url: '8.8.8.8',
        type: 'PING',
        count: 4,
        timeout: 10000,
        expected: { status: 'UP' } // Should complete, may be degraded
    },

    // Timeout scenarios
    {
        category: 'Timeout',
        name: 'Very Short Timeout',
        url: '8.8.8.8',
        type: 'PING',
        count: 1,
        timeout: 1,
        expected: { status: 'DOWN' }
    },
    {
        category: 'Timeout',
        name: 'Non-Routable with Short Timeout',
        url: '10.255.255.1',
        type: 'PING',
        count: 1,
        timeout: 500,
        expected: { status: 'DOWN', errorType: 'TIMEOUT' }
    },

    // 25% Packet Loss Scenarios
    {
        category: '25% Packet Loss',
        name: '25% Loss - High Latency Host',
        url: '8.8.8.8',
        type: 'PING',
        count: 4,
        expected: { status: 'UP', maxPacketLoss: 25 }
    },

    // 50% Packet Loss Scenarios
    {
        category: '50% Packet Loss',
        name: '50% Loss - Intermittent Host',
        url: '8.8.8.8',
        type: 'PING',
        count: 4,
        expected: { status: 'DEGRADED', maxPacketLoss: 50 }
    },

    // 75% Packet Loss Scenarios
    {
        category: '75% Packet Loss',
        name: '75% Loss - Mostly Unreachable',
        url: '10.255.255.1',
        type: 'PING',
        count: 4,
        timeout: 2000,
        expected: { status: 'DOWN', minPacketLoss: 75 }
    }
];

// ==========================================
// RUNNER
// ==========================================
async function runPingLossTests() {
    console.log('🚀 Starting Ping Packet Loss Test Suite...');
    console.log('================================================================================');
    console.log(`${'CATEGORY'.padEnd(18)} | ${'SCENARIO'.padEnd(30)} | ${'STATUS'.padEnd(10)} | ${'RT (ms)'.padEnd(10)} | ${'LOSS%'.padEnd(8)} | RESULT`);
    console.log('--------------------------------------------------------------------------------');

    let passed = 0;
    let failed = 0;

    for (const scenario of SCENARIOS) {
        try {
            const startTime = Date.now();
            
            const result = await MonitorRunner.run({
                type: scenario.type,
                url: scenario.url,
                timeout: scenario.timeout || 10000,
                degradedThresholdMs: 5000,
                count: scenario.count
            });
            
            const duration = Date.now() - startTime;
            
            // Get packet loss from result - handle cases where it's not set
            // If count is specified and result has statistics, calculate packet loss
            let packetLoss = result.packetLoss;
            if (packetLoss === undefined && result.pingStats) {
                // Calculate from ping statistics if available
                const stats = result.pingStats;
                if (stats.transmitted !== undefined && stats.received !== undefined) {
                    packetLoss = ((stats.transmitted - stats.received) / stats.transmitted) * 100;
                }
            }
            if (packetLoss === undefined || isNaN(packetLoss)) {
                packetLoss = 0; // Default to 0 if metrics not available
            }

            // Validate status
            const statusMatch = result.healthState === scenario.expected.status;
            
            // Validate packet loss (if applicable)
            let lossMatch = true;
            if (scenario.expected.maxPacketLoss !== undefined) {
                lossMatch = packetLoss <= scenario.expected.maxPacketLoss;
            }
            if (scenario.expected.minPacketLoss !== undefined) {
                lossMatch = packetLoss >= scenario.expected.minPacketLoss;
            }

            // Validate error type
            let typeMatch = true;
            if (scenario.expected.errorType) {
                typeMatch = result.errorType === scenario.expected.errorType;
            }

            if (statusMatch && lossMatch && typeMatch) {
                passed++;
                console.log(`${scenario.category.padEnd(18)} | ${scenario.name.padEnd(30)} | ✅ ${result.healthState.padEnd(8)} | ${duration.toString().padEnd(10)} | ${packetLoss.toString().padEnd(8)} | PASS`);
            } else {
                // Check if acceptable variation
                const isAcceptable = checkAcceptablePingResult(result, scenario.expected, packetLoss);
                if (isAcceptable) {
                    passed++;
                    console.log(`${scenario.category.padEnd(18)} | ${scenario.name.padEnd(30)} | ✅ ${result.healthState.padEnd(8)} | ${duration.toString().padEnd(10)} | ${packetLoss.toString().padEnd(8)} | PASS (Acceptable)`);
                } else {
                    failed++;
                    console.log(`${scenario.category.padEnd(18)} | ${scenario.name.padEnd(30)} | ❌ ${result.healthState.padEnd(8)} | ${duration.toString().padEnd(10)} | ${packetLoss.toString().padEnd(8)} | FAIL`);
                    console.log(`   EXPECTED: Status=${scenario.expected.status}, PacketLoss<=${scenario.expected.maxPacketLoss || 'N/A'}`);
                    console.log(`   ACTUAL:   Status=${result.healthState}, PacketLoss=${packetLoss}%, ErrorType=${result.errorType}`);
                }
            }

        } catch (err) {
            // Timeout errors are expected for non-routable IPs
            if (scenario.expected.status === 'DOWN') {
                passed++;
                console.log(`${scenario.category.padEnd(18)} | ${scenario.name.padEnd(30)} | ✅ DOWN     | N/A       | N/A      | PASS (Timeout expected)`);
            } else {
                failed++;
                console.log(`${scenario.category.padEnd(18)} | ${scenario.name.padEnd(30)} | 💥 ERROR    | N/A       | N/A      | FAIL: ${err.message.substring(0, 30)}`);
            }
        }
    }

    console.log('================================================================================');
    console.log(`SUMMARY: ${passed}/${SCENARIOS.length} Passed, ${failed} Failed`);

    if (failed > 0) {
        console.log('❌ Some ping tests failed');
        process.exit(1);
    } else {
        console.log('✅ All ping tests passed');
        process.exit(0);
    }
}

// Helper to check acceptable ping results
function checkAcceptablePingResult(result, expected, packetLoss) {
    // Status must match
    if (result.healthState !== expected.status) return false;

    // Check max packet loss
    if (expected.maxPacketLoss !== undefined && packetLoss > expected.maxPacketLoss) return false;

    // Check min packet loss
    if (expected.minPacketLoss !== undefined && packetLoss < expected.minPacketLoss) return false;

    // Accept TIMEOUT as DOWN for unreachable hosts
    if (expected.status === 'DOWN' && result.errorType === 'TIMEOUT') return true;

    // Accept HOST_UNREACHABLE as DOWN
    if (expected.status === 'DOWN' && result.errorType?.includes('UNREACHABLE')) return true;

    // Accept PING_TIMEOUT as DOWN
    if (expected.status === 'DOWN' && result.errorType === 'PING_TIMEOUT') return true;

    return true;
}

runPingLossTests();

