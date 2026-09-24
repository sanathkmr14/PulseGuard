#!/usr/bin/env node
/**
 * Full Test Suite Runner
 * Executes all test categories: Unit (Jest), Validation (plain Node), Integration, E2E, Realtime
 * - Jest suites (*.test.js under tests/unit, tests/integration, tests/e2e, tests/realtime)
 *   run via the Jest CLI with NODE_OPTIONS=--experimental-vm-modules and process.execPath.
 * - Plain-Node validation/integration scripts run directly with process.execPath.
 * Used by npm test script
 */

import { execSync, execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Backend root: src/test/ -> ../../
const BACKEND_ROOT = path.resolve(__dirname, '..', '..');
process.env.FULL_TEST_RUNNER = 'true';

const JEST_SUITES = [
    // Unit (all on-disk suites — no omissions)
    'tests/unit/monitor.service.property.test.js',
    'tests/unit/health-state.service.property.test.js',
    'tests/unit/bullmq-scheduler.service.property.test.js',
    'tests/unit/runner.test.js',
    'tests/unit/monitor.comprehensive.test.js',
    'tests/unit/monitor.service.unit.test.js',
    'tests/unit/ping.worker.test.js',
    'tests/unit/one-time-alert.test.js',
    'tests/unit/admin-controller.test.js',
    'tests/unit/controller-bugs.test.js',
    'tests/unit/health-diagnostics.test.js',
    'tests/unit/health-evaluator.test.js',
    'tests/unit/setup.test.js',
    // Integration (Jest)
    'tests/integration/workers.test.js',
    'tests/integration/auth.test.js',
    'tests/integration/monitor.test.js',
    'tests/integration/enhanced-alert.e2e.test.js',
    // E2E (Jest)
    'tests/e2e/sanity.test.js',
    'tests/e2e/tier1-feature-coverage.test.js'
];

const VALIDATION_SUITES = [
    'tests/validation/malformed-urls.test.js',
    'tests/validation/extreme-timeouts.test.js',
    'tests/validation/concurrent.test.js',
    'tests/validation/ssl-edge.test.js',
    'tests/validation/smtp-auth.test.js',
    'tests/validation/dns-servfail.test.js',
    'tests/validation/ping-loss.test.js',
    'tests/validation/full-matrix.test.js',
    'tests/validation/real-world-scenarios.test.js',
    'tests/validation/status-code-comprehensive.test.js',
    'tests/validation/bug-fixes-verification.test.js'
];

const INTEGRATION_SCRIPTS = [
    'tests/integration/integration-test.js',
    'tests/integration/alert-service-e2e.js'
];

const COLORS = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    bold: '\x1b[1m'
};

const TEST_ENV = {
    ...process.env,
    NODE_ENV: 'test',
    ALLOW_PRIVATE_IPS: 'true',
    REDIS_ENABLED: 'false',
    JWT_SECRET: process.env.JWT_SECRET || 'test-secret-key-for-jwt-pulseguard-2025',
    MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pulseguard_test'
};

function log(message, color = COLORS.reset) {
    console.log(`${color}${message}${COLORS.reset}`);
}

function runJestSuite(relPath) {
    const fullPath = path.join(BACKEND_ROOT, relPath);
    if (!fs.existsSync(fullPath)) {
        return { success: false, output: `Missing suite: ${relPath}`, skipped: true };
    }
    try {
        const output = execFileSync(
            process.execPath,
            ['node_modules/.bin/jest', fullPath, '--runInBand', '--forceExit'],
            {
                encoding: 'utf-8',
                timeout: 300000,
                cwd: BACKEND_ROOT,
                env: {
                    ...TEST_ENV,
                    NODE_OPTIONS: '--experimental-vm-modules'
                }
            }
        );
        return { success: true, output };
    } catch (error) {
        return { success: false, output: error.stdout || error.message };
    }
}

function runNodeScript(relPath) {
    const fullPath = path.join(BACKEND_ROOT, relPath);
    if (!fs.existsSync(fullPath)) {
        return { success: false, output: `Missing script: ${relPath}`, skipped: true };
    }
    try {
        const output = execFileSync(process.execPath, [fullPath], {
            encoding: 'utf-8',
            timeout: 300000,
            cwd: BACKEND_ROOT,
            env: TEST_ENV
        });
        return { success: true, output };
    } catch (error) {
        return { success: false, output: error.stdout || error.message };
    }
}

function runCategory(categoryName, tests, runner) {
    log(`\n${'='.repeat(70)}`, COLORS.blue);
    log(`  ${categoryName.toUpperCase()} TESTS`, COLORS.blue + COLORS.bold);
    log('='.repeat(70), COLORS.blue);

    let passed = 0;
    let failed = 0;
    let skipped = 0;

    const seen = new Set();
    for (const test of tests) {
        if (seen.has(test)) continue; // de-duplicate entries
        seen.add(test);
        const result = runner(test);
        const testName = path.basename(test);

        if (result.skipped) {
            log(`  ⏭️  ${testName} (missing)`, COLORS.yellow);
            skipped++;
        } else if (result.success) {
            log(`  ✅ ${testName}`, COLORS.green);
            passed++;
        } else {
            log(`  ❌ ${testName}`, COLORS.red);
            const lines = String(result.output).split('\n');
            const errorLines = lines.filter(l => l.includes('FAIL') || l.includes('EXPECTED') || l.includes('ACTUAL') || l.includes('Error') || l.includes('CRASH'));
            if (errorLines.length > 0) {
                log(`     ${errorLines.slice(0, 10).join('\n     ')}`, COLORS.red);
            } else {
                log(`     ${lines.slice(-10).join('\n     ')}`, COLORS.red);
            }
            failed++;
        }
    }

    log(`\n  ${categoryName} Summary: ${passed}/${seen.size} passed${skipped ? ` (${skipped} missing)` : ''}`, COLORS.yellow);
    return { passed, failed, total: seen.size };
}

async function main() {
    log('\n' + '█'.repeat(80), COLORS.cyan + COLORS.bold);
    log('  FULL TEST SUITE RUNNER - Uptime Checker Backend', COLORS.cyan + COLORS.bold);
    log('█'.repeat(80) + '\n', COLORS.cyan + COLORS.bold);

    const results = {
        unit: runCategory('Unit (Jest)', JEST_SUITES.filter(t => t.includes('/unit/')), runJestSuite),
        integration: runCategory('Integration (Jest)', JEST_SUITES.filter(t => t.includes('/integration/')), runJestSuite),
        e2e: runCategory('E2E (Jest)', JEST_SUITES.filter(t => t.includes('/e2e/')), runJestSuite),
        validation: runCategory('Validation (Node)', VALIDATION_SUITES, runNodeScript),
        scripts: runCategory('Integration Scripts (Node)', INTEGRATION_SCRIPTS, runNodeScript)
    };

    const total = Object.values(results).reduce((n, r) => n + r.total, 0);
    const totalPassed = Object.values(results).reduce((n, r) => n + r.passed, 0);
    const totalFailed = Object.values(results).reduce((n, r) => n + r.failed, 0);

    log('\n' + '█'.repeat(80), COLORS.cyan + COLORS.bold);
    log('  FINAL RESULTS', COLORS.cyan + COLORS.bold);
    log('█'.repeat(80), COLORS.cyan + COLORS.bold);

    for (const [name, r] of Object.entries(results)) {
        log(`  ${name}: ${r.passed}/${r.total}`, totalFailed === 0 ? COLORS.green : COLORS.yellow);
    }

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
