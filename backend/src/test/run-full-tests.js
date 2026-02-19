#!/usr/bin/env node
/**
 * Full Test Suite Runner
 * Executes all test categories: Unit, Validation, and Integration
 * Used by npm test script
 */

import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_CONFIG = {
    unit: [
        '../tests/unit/monitor.service.property.test.js',
        '../tests/unit/health-state.service.property.test.js',
        '../tests/unit/bullmq-scheduler.service.property.test.js',
        '../tests/unit/runner.test.js',
        '../tests/unit/monitor.comprehensive.test.js',
        '../tests/unit/monitor.service.unit.test.js'
    ],
    validation: [
        '../tests/validation/malformed-urls.test.js',
        '../tests/validation/extreme-timeouts.test.js',
        '../tests/validation/concurrent.test.js',
        '../tests/validation/ssl-edge.test.js',
        '../tests/validation/smtp-auth.test.js',
        '../tests/validation/dns-servfail.test.js',
        '../tests/validation/ping-loss.test.js',
        '../tests/validation/full-matrix.test.js',
        '../tests/validation/real-world-scenarios.test.js',
        '../tests/validation/status-code-comprehensive.test.js',
        '../tests/validation/malformed-urls.test.js'
    ],
    integration: [
        '../tests/integration/integration-test.js',
        '../tests/integration/alert-service-e2e.js',
        '../tests/integration/enhanced-alert.e2e.test.js'
    ]
};

const COLORS = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    bold: '\x1b[1m'
};

function log(message, color = COLORS.reset) {
    console.log(`${color}${message}${COLORS.reset}`);
}

function runTest(filePath) {
    const fullPath = path.join(__dirname, '..', filePath);
    try {
        const output = execSync(`node ${fullPath}`, {
            encoding: 'utf-8',
            timeout: 120000,
            cwd: path.join(__dirname, '..')
        });
        return { success: true, output };
    } catch (error) {
        return { success: false, output: error.stdout || error.message };
    }
}

function runCategory(categoryName, tests) {
    log(`\n${'='.repeat(70)}`, COLORS.blue);
    log(`  ${categoryName.toUpperCase()} TESTS`, COLORS.blue + COLORS.bold);
    log('='.repeat(70), COLORS.blue);

    let passed = 0;
    let failed = 0;

    for (const test of tests) {
        const result = runTest(test);
        const testName = path.basename(test);
        
        if (result.success) {
            log(`  ✅ ${testName}`, COLORS.green);
            passed++;
        } else {
            log(`  ❌ ${testName}`, COLORS.red);
            failed++;
        }
    }

    log(`\n  ${categoryName} Summary: ${passed}/${tests.length} passed`, COLORS.yellow);
    return { passed, failed, total: tests.length };
}

async function main() {
    log('\n' + '█'.repeat(80), COLORS.cyan + COLORS.bold);
    log('  FULL TEST SUITE RUNNER - Uptime Checker Backend', COLORS.cyan + COLORS.bold);
    log('█'.repeat(80) + '\n', COLORS.cyan + COLORS.bold);

    const results = {
        unit: runCategory('Unit', TEST_CONFIG.unit),
        validation: runCategory('Validation', TEST_CONFIG.validation),
        integration: runCategory('Integration', TEST_CONFIG.integration)
    };

    const total = results.unit.total + results.validation.total + results.integration.total;
    const totalPassed = results.unit.passed + results.validation.passed + results.integration.passed;
    const totalFailed = results.unit.failed + results.validation.failed + results.integration.failed;

    log('\n' + '█'.repeat(80), COLORS.cyan + COLORS.bold);
    log('  FINAL RESULTS', COLORS.cyan + COLORS.bold);
    log('█'.repeat(80), COLORS.cyan + COLORS.bold);

    log(`\n  Unit Tests:       ${results.unit.passed}/${results.unit.total}`, totalFailed === 0 ? COLORS.green : COLORS.yellow);
    log(`  Validation Tests: ${results.validation.passed}/${results.validation.total}`, totalFailed === 0 ? COLORS.green : COLORS.yellow);
    log(`  Integration Tests: ${results.integration.passed}/${results.integration.total}`, totalFailed === 0 ? COLORS.green : COLORS.yellow);
    
    log(`\n  ─────────────────────────────────────────`, COLORS.cyan);
    log(`  TOTAL: ${totalPassed}/${total} tests passed`, COLORS.cyan + COLORS.bold);
    log('█'.repeat(80) + '\n', COLORS.cyan + COLORS.bold);

    if (totalFailed === 0) {
        log('  🎉 ALL TESTS PASSED! System is production ready.\n', COLORS.green + COLORS.bold);
        process.exit(0);
    } else {
        log(`  ⚠️  ${totalFailed} test(s) failed.\n`, COLORS.red + COLORS.bold);
        process.exit(1);
    }
}

main().catch(error => {
    log(`\n❌ Test runner error: ${error.message}`, COLORS.red);
    process.exit(1);
});

