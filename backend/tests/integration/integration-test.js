/**
 * Integration Test Suite
 * Combines protocol testing with health state evaluation
 */
process.env.REDIS_ENABLED = 'false';

// import FullHttpStatusTestSuite from './full-http-status-test.js';
// import HealthStateComprehensiveTest from './health-state-comprehensive-test.js';
import http from 'http';
import MonitorRunner from '../../src/services/runner.js';
import { HealthStateService } from '../../src/services/health-evaluator.service.js';

class IntegrationTestSuite {
    constructor() {
        this.runner = MonitorRunner;
        this.healthService = new HealthStateService();
        this.localServer = null;
        this.localBaseUrl = null;
    }

    async startServer() {
        return new Promise((resolve) => {
            this.localServer = http.createServer((req, res) => {
                if (req.url === '/status/200') {
                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                    res.end('OK');
                } else if (req.url === '/status/404') {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    res.end('Not Found');
                } else if (req.url === '/status/500') {
                    res.writeHead(500, { 'Content-Type': 'text/plain' });
                    res.end('Internal Server Error');
                } else if (req.url.startsWith('/delay/')) {
                    setTimeout(() => {
                        res.writeHead(200, { 'Content-Type': 'text/plain' });
                        res.end('Delayed Response');
                    }, 2200);
                } else {
                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                    res.end('Default Response');
                }
            });

            this.localServer.listen(0, '127.0.0.1', () => {
                const port = this.localServer.address().port;
                this.localBaseUrl = `http://127.0.0.1:${port}`;
                resolve();
            });
        });
    }

    async stopServer() {
        if (this.localServer) {
            await new Promise((resolve) => this.localServer.close(resolve));
            this.localServer = null;
        }
    }

    /**
     * Test protocol results with health state evaluation
     */
    async testProtocolHealthIntegration() {
        console.log('🔄 Testing Protocol Results with Health State Evaluation...\n');
        
        await this.startServer();

        // Test a few key protocols with health state evaluation
        const integrationTests = [
            {
                name: 'HTTP 200 OK',
                monitor: {
                    _id: 'integration-test-200',
                    type: 'HTTP',
                    url: `${this.localBaseUrl}/status/200`,
                    interval: 5,
                    alertThreshold: 1,
                    degradedThresholdMs: 5000 // High threshold to avoid slow response degradation
                },
                expectedHealth: 'up' // Should be up if response is fast enough
            },
            {
                name: 'HTTP 404 Not Found',
                monitor: {
                    _id: 'integration-test-404',
                    type: 'HTTP',
                    url: `${this.localBaseUrl}/status/404`,
                    interval: 5,
                    alertThreshold: 1
                },
                expectedHealth: 'down'
            },
            {
                name: 'HTTP 500 Server Error',
                monitor: {
                    _id: 'integration-test-500',
                    type: 'HTTP',
                    url: `${this.localBaseUrl}/status/500`,
                    interval: 5,
                    alertThreshold: 1
                },
                expectedHealth: 'down'
            },
            {
                name: 'Slow Response Test',
                monitor: {
                    _id: 'integration-test-slow',
                    type: 'HTTP',
                    url: `${this.localBaseUrl}/delay/3`, // 2.2 second delay
                    interval: 5,
                    alertThreshold: 1,
                    degradedThresholdMs: 2000 // 2 second threshold
                },
                expectedHealth: 'degraded' // Should be degraded due to slow response
            }
        ];
        
        let passed = 0;
        let total = integrationTests.length;
        
        try {
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
        } finally {
            await this.stopServer();
        }
        
        console.log(`Integration Test Results: ${passed}/${total} passed`);
        return passed === total;
    }

    /**
     * Run complete integration test suite
     */
    async runIntegrationSuite() {
        console.log('🧪 Starting Integration Test Suite...\n');
        
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