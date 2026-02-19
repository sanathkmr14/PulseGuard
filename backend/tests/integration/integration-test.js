/**
 * Integration Test Suite
 * Combines protocol testing with health state evaluation
 */

// import FullHttpStatusTestSuite from './full-http-status-test.js';
// import HealthStateComprehensiveTest from './health-state-comprehensive-test.js';
import MonitorRunner from '../../src/services/runner.js';
import { HealthStateService } from '../../src/services/health-evaluator.service.js';

class IntegrationTestSuite {
    constructor() {
        // this.protocolTester = new FullHttpStatusTestSuite();
        // this.healthTester = new HealthStateComprehensiveTest();
        this.runner = MonitorRunner;
        this.healthService = new HealthStateService();
    }

    /**
     * Test protocol results with health state evaluation
     */
    async testProtocolHealthIntegration() {
        console.log('🔄 Testing Protocol Results with Health State Evaluation...\n');
        
        // Test a few key protocols with health state evaluation
        const integrationTests = [
            {
                name: 'HTTP 200 OK',
                monitor: {
                    type: 'HTTP',
                    url: 'https://httpbin.org/status/200',
                    interval: 5,
                    degradedThresholdMs: 5000 // High threshold to avoid slow response degradation
                },
                expectedHealth: 'up' // Should be up if response is fast enough
            },
            {
                name: 'HTTP 404 Not Found',
                monitor: {
                    type: 'HTTP',
                    url: 'https://httpbin.org/status/404',
                    interval: 5
                },
                expectedHealth: 'degraded' // 404 is a client error - degraded, not down
            },
            {
                name: 'HTTP 500 Server Error',
                monitor: {
                    type: 'HTTP',
                    url: 'https://httpbin.org/status/500',
                    interval: 5
                },
                expectedHealth: 'degraded' // 500 is a server error - degraded (or down depending on logic)
            },
            {
                name: 'Slow Response Test',
                monitor: {
                    type: 'HTTP',
                    url: 'https://httpbin.org/delay/3', // 3 second delay
                    interval: 5
                },
                expectedHealth: 'degraded', // Should be degraded due to slow response
                monitorConfig: {
                    degradedThresholdMs: 2000 // 2 second threshold
                }
            }
        ];
        
        let passed = 0;
        let total = integrationTests.length;
        
        for (const test of integrationTests) {
            try {
                console.log(`Testing: ${test.name}`);
                
                // Run the monitor check
                const result = await this.runner.run(test.monitor);
                console.log(`  Check Result: ${result.isUp ? 'UP' : 'DOWN'} (${result.statusCode})`);
                
                // Evaluate health state
                const monitorConfig = test.monitorConfig || {};
                const monitor = { ...test.monitor, ...monitorConfig };
                const health = await this.healthService.determineHealthState(result, monitor, []);
                console.log(`  Health State: ${health.status.toUpperCase()}`);
                
                // Check if health state matches expectation
                const isPass = health.status === test.expectedHealth;
                if (isPass) {
                    console.log('  ✅ PASS\n');
                    passed++;
                } else {
                    console.log(`  ❌ FAIL - Expected: ${test.expectedHealth}, Got: ${health.status}\n`);
                }
                
                // Show details if degraded
                if (health.status === 'degraded') {
                    console.log(`  Degradation Reasons: ${health.reasons.join(', ')}\n`);
                }
                
            } catch (error) {
                console.log(`  ❌ ERROR: ${error.message}\n`);
            }
        }
        
        console.log(`Integration Test Results: ${passed}/${total} passed`);
        return passed === total;
    }

    /**
     * Run complete integration test suite
     */
    async runIntegrationSuite() {
        console.log('🧪 Starting Integration Test Suite...\n');
        
        // Run protocol tests (disabled - missing dependencies)
        // console.log('1. Running Protocol Tests...');
        // await this.protocolTester.runFullTestSuite();
        
        // console.log('\n' + '='.repeat(60) + '\n');
        
        // Run health state tests (disabled - missing dependencies)
        // console.log('2. Running Health State Tests...');
        // await this.healthTester.runAllTests();
        
        // console.log('\n' + '='.repeat(60) + '\n');
        
        // Run integration tests
        console.log('Running Integration Tests...');
        const integrationPassed = await this.testProtocolHealthIntegration();
        
        console.log('\n' + '='.repeat(60));
        console.log('INTEGRATION TEST SUITE COMPLETE');
        console.log('='.repeat(60));
        
        if (integrationPassed) {
            console.log('✅ All integration tests passed!');
        } else {
            console.log('❌ Some integration tests failed!');
        }
        
        return integrationPassed;
    }
}

// Export for use
export default IntegrationTestSuite;

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const suite = new IntegrationTestSuite();
    suite.runIntegrationSuite().then(success => {
        if (!success) {
            process.exit(1);
        }
    }).catch(err => {
        console.error('Integration test suite failed:', err);
        process.exit(1);
    });
}