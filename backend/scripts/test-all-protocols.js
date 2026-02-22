/**
 * PulseGuard — Full Protocol Test Suite
 * Runs all scenarios against real-world endpoints and validates expected UP/DEGRADED/DOWN results.
 * Usage:  node --experimental-vm-modules scripts/test-all-protocols.js
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import MonitorRunner from '../src/services/runner.js';

// ─── Colour helpers ───────────────────────────────────────────────────────────
const C = {
    reset: '\x1b[0m', bold: '\x1b[1m',
    green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m',
    cyan: '\x1b[36m', grey: '\x1b[90m', white: '\x1b[97m',
    bgGreen: '\x1b[42m', bgRed: '\x1b[41m', bgYellow: '\x1b[43m'
};

const STATUS_ICON = { up: '✅', degraded: '🟡', down: '❌', unknown: '❓' };
const status_color = s => s === 'up' ? C.green : s === 'degraded' ? C.yellow : C.red;

// ─── Test Scenarios ───────────────────────────────────────────────────────────
const TESTS = [
    // ── 1. HTTP / HTTPS ────────────────────────────────────────────────────────
    { group: 'HTTP / HTTPS', label: '200 OK', type: 'HTTP', url: 'https://httpbin.org/status/200', expected: 'up', degradedThresholdMs: 5000 },
    { group: 'HTTP / HTTPS', label: '404 Not Found', type: 'HTTP', url: 'https://httpbin.org/status/404', expected: 'down' },
    { group: 'HTTP / HTTPS', label: '500 Server Error', type: 'HTTP', url: 'https://httpbin.org/status/500', expected: 'down' },
    { group: 'HTTP / HTTPS', label: '429 Rate Limited', type: 'HTTP', url: 'https://httpbin.org/status/429', expected: 'degraded' },
    { group: 'HTTP / HTTPS', label: 'Slow (5s delay)', type: 'HTTP', url: 'https://httpbin.org/delay/5', expected: 'degraded', degradedThresholdMs: 3000, timeout: 15000 },
    { group: 'HTTP / HTTPS', label: '301 Redirect → UP', type: 'HTTP', url: 'https://httpbin.org/redirect-to?url=https://google.com', expected: 'up', degradedThresholdMs: 5000 },
    { group: 'HTTP / HTTPS', label: 'Redirect Loop → DOWN', type: 'HTTP', url: 'https://httpbin.org/redirect/11', expected: 'down' },
    { group: 'HTTP / HTTPS', label: 'Invalid domain', type: 'HTTP', url: 'https://this-domain-does-not-exist-12345.com', expected: 'down' },
    { group: 'HTTP / HTTPS', label: 'Unreachable port', type: 'HTTP', url: 'http://google.com:81', expected: 'down', timeout: 10000 },

    // ── 2. SSL / TLS ───────────────────────────────────────────────────────────
    { group: 'SSL / HTTPS', label: 'Valid cert (badssl)', type: 'HTTPS', url: 'https://badssl.com/', expected: 'up', degradedThresholdMs: 7000 },
    { group: 'SSL / HTTPS', label: 'Expired cert', type: 'HTTPS', url: 'https://expired.badssl.com/', expected: 'down' },
    { group: 'SSL / HTTPS', label: 'Self-signed cert', type: 'SSL', url: 'https://self-signed.badssl.com/', expected: 'degraded', degradedThresholdMs: 7000 },
    { group: 'SSL / HTTPS', label: 'Wrong hostname', type: 'SSL', url: 'https://wrong.host.badssl.com/', expected: 'down' },
    { group: 'SSL / HTTPS', label: 'Revoked cert', type: 'SSL', url: 'https://revoked.badssl.com/', expected: 'down' },

    // ── 3. TCP ─────────────────────────────────────────────────────────────────
    { group: 'TCP', label: 'Google port 80', type: 'TCP', url: 'google.com', port: 80, expected: 'up' },
    { group: 'TCP', label: 'Google DNS port 53', type: 'TCP', url: '8.8.8.8', port: 53, expected: 'up' },
    { group: 'TCP', label: 'SSH test.rebex.net', type: 'TCP', url: 'test.rebex.net', port: 22, expected: 'up' },
    { group: 'TCP', label: 'Closed port 81', type: 'TCP', url: 'google.com', port: 81, expected: 'down', timeout: 8000 },

    // ── 4. UDP ─────────────────────────────────────────────────────────────────
    { group: 'UDP', label: 'Cloudflare DNS 1.1.1.1', type: 'UDP', url: '1.1.1.1', port: 53, expected: 'up' },
    { group: 'UDP', label: 'Google DNS 8.8.8.8', type: 'UDP', url: '8.8.8.8', port: 53, expected: 'up' },
    { group: 'UDP', label: 'NTP time.google.com', type: 'UDP', url: 'time.google.com', port: 123, expected: 'up' },

    // ── 5. DNS ─────────────────────────────────────────────────────────────────
    { group: 'DNS', label: 'google.com resolves', type: 'DNS', url: 'google.com', expected: 'up' },
    { group: 'DNS', label: 'openai.com resolves', type: 'DNS', url: 'openai.com', expected: 'up' },
    { group: 'DNS', label: 'Non-existent domain', type: 'DNS', url: 'this-domain-does-not-exist-123.com', expected: 'down' },

    // ── 6. SMTP ────────────────────────────────────────────────────────────────
    { group: 'SMTP', label: 'Gmail STARTTLS 587', type: 'SMTP', url: 'smtp.gmail.com', port: 587, expected: 'up', timeout: 15000 },
    { group: 'SMTP', label: 'Outlook 587', type: 'SMTP', url: 'smtp.office365.com', port: 587, expected: 'up', timeout: 15000 },
    { group: 'SMTP', label: 'Brevo 587', type: 'SMTP', url: 'smtp-relay.brevo.com', port: 587, expected: 'up', timeout: 15000 },

    // ── 7. PING ────────────────────────────────────────────────────────────────
    { group: 'PING', label: 'Google DNS 8.8.8.8', type: 'PING', url: '8.8.8.8', expected: 'up' },
    { group: 'PING', label: 'Cloudflare 1.1.1.1', type: 'PING', url: '1.1.1.1', expected: 'up' },
    { group: 'PING', label: 'Dead IP 192.0.2.1', type: 'PING', url: '192.0.2.1', expected: 'down', timeout: 10000 },
];

// ─── Runner ───────────────────────────────────────────────────────────────────
const buildMonitor = (t) => ({
    _id: 'test',
    name: t.label,
    type: t.type.toUpperCase(),
    url: t.url,
    port: t.port || null,
    timeout: t.timeout || 30000,
    degradedThresholdMs: t.degradedThresholdMs || 2000,
    sslExpiryThresholdDays: 30,
    alertThreshold: 1,
    consecutiveFailures: 0,
    consecutiveDegraded: 0,
    interval: 5,
    isActive: true,
    status: 'unknown'
});

async function runTest(t) {
    const monitor = buildMonitor(t);
    const start = Date.now();
    try {
        const result = await MonitorRunner.run(monitor);
        const ms = Date.now() - start;
        const actual = (result.healthState || (result.isUp ? 'up' : 'down')).toLowerCase();
        const pass = actual === t.expected;
        return { pass, actual, expected: t.expected, ms, errorType: result.errorType, errorMessage: result.errorMessage, statusCode: result.statusCode };
    } catch (err) {
        const ms = Date.now() - start;
        return { pass: t.expected === 'down', actual: 'down', expected: t.expected, ms, errorType: err.code || 'ERROR', errorMessage: err.message };
    }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    console.log(`\n${C.bold}${C.white}╔══════════════════════════════════════════════════════╗`);
    console.log(`║        PulseGuard — Full Protocol Test Suite        ║`);
    console.log(`╚══════════════════════════════════════════════════════╝${C.reset}\n`);

    let passed = 0, failed = 0;
    const failures = [];
    let lastGroup = '';

    for (const t of TESTS) {
        if (t.group !== lastGroup) {
            console.log(`\n${C.bold}${C.cyan}── ${t.group} ${'─'.repeat(46 - t.group.length)}${C.reset}`);
            lastGroup = t.group;
        }

        process.stdout.write(`  ${C.grey}${t.label.padEnd(28)}${C.reset} `);
        const r = await runTest(t);

        const icon = r.pass ? '✅' : '❌';
        const actual = status_color(r.actual) + r.actual.toUpperCase() + C.reset;
        const time = `${C.grey}${r.ms}ms${C.reset}`;
        const extra = r.errorType ? `${C.grey}[${r.errorType}]${C.reset}` : '';

        if (r.pass) {
            passed++;
            console.log(`${icon} ${actual} ${time} ${extra}`);
        } else {
            failed++;
            const exp = status_color(r.expected) + r.expected.toUpperCase() + C.reset;
            console.log(`${icon} got ${actual} expected ${exp} ${time} ${extra}`);
            failures.push({ label: `${t.group} / ${t.label}`, actual: r.actual, expected: r.expected, errorType: r.errorType, errorMessage: r.errorMessage });
        }
    }

    // ── Summary ───────────────────────────────────────────────────────────────
    const total = passed + failed;
    const pct = Math.round((passed / total) * 100);
    const bar = '█'.repeat(Math.round(pct / 5)) + '░'.repeat(20 - Math.round(pct / 5));

    console.log(`\n${C.bold}${C.white}╔══════════════════════════════════════╗`);
    console.log(`║             Test Results             ║`);
    console.log(`╠══════════════════════════════════════╣`);
    console.log(`║  ${C.green}Passed: ${String(passed).padEnd(3)}${C.white} │ ${C.red}Failed: ${String(failed).padEnd(3)}${C.white} │ ${pct}%     ║`);
    console.log(`║  ${pct >= 90 ? C.green : pct >= 70 ? C.yellow : C.red}${bar}${C.white}  ║`);
    console.log(`╚══════════════════════════════════════╝${C.reset}`);

    if (failures.length > 0) {
        console.log(`\n${C.bold}${C.red}Failed Tests:${C.reset}`);
        failures.forEach(f => {
            console.log(`  ❌ ${C.bold}${f.label}${C.reset}`);
            console.log(`     got: ${f.actual}  expected: ${f.expected}`);
            if (f.errorType) console.log(`     ${C.grey}${f.errorType}: ${f.errorMessage?.slice(0, 100)}${C.reset}`);
        });
    }

    console.log();
    process.exit(failed === 0 ? 0 : 1);
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
