
import MonitorRunner from '../../src/services/runner.js';

// ==========================================
// CONCURRENT REQUESTS TEST SUITE
// ==========================================

// Test configurations for concurrent requests
const TEST_CONFIGS = [
    {
        name: '10 Concurrent HTTP Requests',
        concurrency: 10,
        requests: Array(10).fill({
            type: 'HTTP',
            url: 'https://httpbin.org/status/200',
            timeout: 15000
        })
    },
    {
        name: '25 Concurrent Mixed Protocol Requests',
        concurrency: 25,
        requests: [
            // HTTP requests
            ...Array(8).fill({ type: 'HTTP', url: 'https://httpbin.org/status/200', timeout: 15000 }),
            // TCP requests
            ...Array(5).fill({ type: 'TCP', url: 'google.com', port: 443, timeout: 10000 }),
            // DNS requests
            ...Array(5).fill({ type: 'DNS', url: 'google.com', timeout: 10000 }),
            // PING requests
            ...Array(7).fill({ type: 'PING', url: '8.8.8.8', timeout: 10000 })
        ]
    },
    {
        name: '50 Concurrent Requests to Same Endpoint',
        concurrency: 50,
        requests: Array(50).fill({
            type: 'HTTP',
            url: 'https://httpbin.org/get',
            timeout: 15000
        })
    }
];

// ==========================================
// RUNNER
// ==========================================
async function runConcurrentTests() {
    console.log('🚀 Starting Concurrent Requests Test Suite...');
    console.log('================================================================================');

    let totalPassed = 0;
    let totalFailed = 0;

    for (const testConfig of TEST_CONFIGS) {
        console.log(`\n📊 Test: ${testConfig.name}`);
        console.log(`   Launching ${testConfig.concurrency} concurrent requests...`);

        const startTime = Date.now();

        try {
            // Launch all requests concurrently
            const promises = testConfig.requests.map((config, index) => {
                return MonitorRunner.run(config).then(result => ({
                    index,
                    ...result
                })).catch(err => ({
                    index,
                    error: err.message,
                    healthState: 'ERROR'
                }));
            });

            const results = await Promise.allSettled(promises);
            const duration = Date.now() - startTime;

            // Analyze results
            let completed = 0;
            let successful = 0;
            let failed = 0;
            let errors = [];

            for (const result of results) {
                if (result.status === 'fulfilled') {
                    completed++;
                    if (result.value.healthState === 'UP') {
                        successful++;
                    } else if (result.value.healthState !== 'ERROR') {
                        // Non-UP but completed is still a valid response
                        successful++;
                    } else {
                        failed++;
                        errors.push(`Request ${result.value.index}: ${result.value.errorMessage || result.value.error}`);
                    }
                } else {
                    failed++;
                    errors.push(`Request failed: ${result.reason?.message || 'Unknown error'}`);
                }
            }

            // Calculate metrics
            const successRate = (successful / testConfig.concurrency) * 100;
            const avgTimePerRequest = duration / testConfig.concurrency;

            console.log(`   Completed: ${completed}/${testConfig.concurrency}`);
            console.log(`   Successful: ${successful}/${testConfig.concurrency} (${successRate.toFixed(1)}%)`);
            console.log(`   Failed: ${failed}/${testConfig.concurrency}`);
            console.log(`   Total Duration: ${duration}ms`);
            console.log(`   Avg Time/Request: ${avgTimePerRequest.toFixed(2)}ms`);

            // Validation criteria
            const minSuccessRate = testConfig.name.includes('10 Concurrent') ? 80 : 60;
            const maxAvgTime = 5000; // 5 seconds average

            if (successRate >= minSuccessRate && avgTimePerRequest < maxAvgTime) {
                console.log(`   ✅ PASS - Success rate ${successRate.toFixed(1)}% meets minimum ${minSuccessRate}%`);
                totalPassed++;
            } else {
                console.log(`   ❌ FAIL - Success rate ${successRate.toFixed(1)}% below minimum ${minSuccessRate}%`);
                totalFailed++;
            }

            // Log any errors
            if (errors.length > 0 && errors.length <= 5) {
                console.log(`   Errors: ${errors.join('; ')}`);
            } else if (errors.length > 5) {
                console.log(`   First 5 errors: ${errors.slice(0, 5).join('; ')}`);
            }

        } catch (err) {
            console.log(`   ❌ FAIL - Test crashed: ${err.message}`);
            totalFailed++;
        }
    }

    console.log('\n================================================================================');
    console.log(`SUMMARY: ${totalPassed}/${TEST_CONFIGS.length} Test Suites Passed`);

    if (totalFailed > 0) {
        console.log('❌ Some concurrent tests failed');
        process.exit(1);
    } else {
        console.log('✅ All concurrent tests passed');
        process.exit(0);
    }
}

runConcurrentTests();

