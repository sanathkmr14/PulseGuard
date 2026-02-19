
/**
 * Edge Case Test Runner
 * Runs all edge case validation tests sequentially
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TEST_FILES = [
    'malformed-urls.test.js',
    'extreme-timeouts.test.js',
    'concurrent.test.js',
    'ssl-edge.test.js',
    'smtp-auth.test.js',
    'dns-servfail.test.js',
    'ping-loss.test.js'
];

const TEST_DESCRIPTIONS = {
    'malformed-urls.test.js': 'Malformed URL handling',
    'extreme-timeouts.test.js': 'Extreme timeout values',
    'concurrent.test.js': 'Concurrent request handling',
    'ssl-edge.test.js': 'SSL certificate edge cases',
    'smtp-auth.test.js': 'SMTP authentication scenarios',
    'dns-servfail.test.js': 'DNS error handling',
    'ping-loss.test.js': 'Ping packet loss scenarios'
};

async function runAllEdgeTests() {
    console.log('🚀 Starting All Edge Case Tests...');
    console.log('================================================================================\n');

    const results = [];
    let totalPassed = 0;
    let totalFailed = 0;

    for (const testFile of TEST_FILES) {
        const testPath = path.join(__dirname, testFile);
        const description = TEST_DESCRIPTIONS[testFile] || testFile;

        console.log(`\n📋 Running: ${description}`);
        console.log(`   File: ${testFile}`);
        console.log('--------------------------------------------------------------------------------');

        try {
            const { stdout, stderr } = await execAsync(`node ${testPath}`, {
                timeout: 120000 // 2 minutes per test
            });

            console.log(stdout);
            if (stderr) {
                console.error('STDERR:', stderr);
            }

            // Check if test passed (exit code 0)
            if (stdout.includes('✅ All') || stdout.includes('All tests passed')) {
                results.push({ test: testFile, status: 'PASS' });
                totalPassed++;
            } else if (stdout.includes('SUMMARY:')) {
                // Parse summary line
                const summaryMatch = stdout.match(/SUMMARY:\s*(\d+)\/(\d+)\s*Passed/);
                if (summaryMatch) {
                    const passed = parseInt(summaryMatch[1]);
                    const total = parseInt(summaryMatch[2]);
                    if (passed === total) {
                        results.push({ test: testFile, status: 'PASS', details: `${passed}/${total}` });
                        totalPassed++;
                    } else {
                        results.push({ test: testFile, status: 'FAIL', details: `${passed}/${total}` });
                        totalFailed++;
                    }
                }
            } else {
                results.push({ test: testFile, status: 'UNKNOWN' });
            }

        } catch (err) {
            if (err.code === 1) {
                // Test failed with exit code 1
                console.log(`❌ Test failed with exit code 1`);
                results.push({ test: testFile, status: 'FAIL', details: err.message.substring(0, 100) });
                totalFailed++;
            } else if (err.code === 'ETIMEDOUT') {
                console.log(`❌ Test timed out`);
                results.push({ test: testFile, status: 'TIMEOUT' });
                totalFailed++;
            } else {
                console.log(`❌ Test crashed: ${err.message}`);
                results.push({ test: testFile, status: 'CRASH', details: err.message.substring(0, 100) });
                totalFailed++;
            }

            if (err.stdout) console.log(err.stdout);
            if (err.stderr) console.log(err.stderr);
        }
    }

    // Print final summary
    console.log('\n================================================================================');
    console.log('📊 EDGE CASE TESTS FINAL SUMMARY');
    console.log('================================================================================');
    console.log(`${'TEST FILE'.padEnd(30)} | ${'STATUS'.padEnd(10)} | ${'DETAILS'}`);
    console.log('--------------------------------------------------------------------------------');

    for (const result of results) {
        const icon = result.status === 'PASS' ? '✅' : result.status === 'FAIL' ? '❌' : '⚠️';
        console.log(`${result.test.padEnd(30)} | ${icon} ${result.status.padEnd(8)} | ${result.details || ''}`);
    }

    console.log('--------------------------------------------------------------------------------');
    console.log(`TOTAL: ${totalPassed} Passed, ${totalFailed} Failed out of ${TEST_FILES.length} test suites`);

    if (totalFailed > 0) {
        console.log('\n❌ Some edge case tests failed');
        process.exit(1);
    } else {
        console.log('\n✅ All edge case tests passed!');
        process.exit(0);
    }
}

runAllEdgeTests().catch(err => {
    console.error('Test runner crashed:', err);
    process.exit(1);
});

