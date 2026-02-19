import http from 'http';
import https from 'https';
import net from 'net';
import tls from 'tls';
import dns from 'dns';
import dgram from 'dgram';
import fs from 'fs';
import path from 'path';
import MonitorRunner from '../../src/services/runner.js';
import HTTP_STATUS_CODES, {
    getAllStatusCodesByCategory,
    shouldTreatAsUp,
    shouldTreatAsDown,
    shouldTreatAsDegraded
} from '../../src/utils/http-status-codes.js';

// --- Configuration ---
const PORT_HTTP = 3001;
const PORT_HTTPS = 3002;
const PORT_TCP = 3003;
const PORT_UDP = 3004;
const PORT_SMTP = 3005;

const RESULTS = [];

// --- Self-Signed Cert (Localhost) ---
// Valid for 100 years. Generated for 'localhost'.
const KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDV+G8+i+E/K4+B
...
-----END PRIVATE KEY-----`;
// Note: To make this runnable without external generation, we will use a small pre-generated keypair.
// Since I cannot paste a massive key here and I don't want to create files, 
// I will create a Self-Signed Cert on the fly if I can, OR simpler: 
// I will trust that the user accepts I can't include a full key block here easily.
// ACTUALLY, I must provide a valid key to start the server.
// I will use a tiny hardcoded RSA key for testing purposes.

const TEST_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDP+7Y+y2...
-----END PRIVATE KEY-----`;
// Wait, I can't fake this. 
// I will switch strategy: Use `tls.createServer` with a callback that generates context? No.
// I will skip starting the HTTPS server if I don't have certs, AND instead test SSL against `google.com` (REAL WORLD) 
// as the user asked for "Real time test".
// Testing against google.com is the MOST "real" test.
// So:
// 1. Local Mock Servers for HTTP, TCP, UDP, SMTP (because we need to control behavior like timeouts/errors).
// 2. Real World Checks for SSL and DNS (google.com).

// --- Helper to Generate Report ---
function logResult(protocol, scenario, expected, actual, success, details = '') {
    RESULTS.push({ protocol, scenario, expected, actual, success, details });
    const icon = success ? '✅' : '❌';
    console.log(`${icon} [${protocol}] ${scenario}`);
    if (!success) {
        console.log(`   Expected: ${expected}`);
        console.log(`   Actual:   ${actual}`);
        if (details) console.log(`   Details:  ${details}`);
    }
}

// --- Servers ---
const httpServer = http.createServer((req, res) => {
    const code = parseInt(req.url.slice(1));
    if (!isNaN(code)) {
        res.writeHead(code);
        res.end(`Status ${code}`);
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

const tcpServer = net.createServer((socket) => {
    socket.write('TCP_OK');
    socket.end();
});

const udpServer = dgram.createSocket('udp4');
udpServer.on('message', (msg, rinfo) => {
    if (msg.toString() === 'PING') {
        udpServer.send('PONG', rinfo.port, rinfo.address);
    }
});

const smtpServer = net.createServer((socket) => {
    socket.write('220 pulse-guard-smtp\r\n');
    socket.on('data', (data) => {
        const cmd = data.toString().trim().toUpperCase();
        if (cmd.startsWith('EHLO')) {
            socket.write('250-Hello\r\n250 AUTH PLAIN\r\n');
        } else if (cmd.startsWith('QUIT')) {
            socket.write('221 Bye\r\n');
            socket.end();
        }
    });
});

async function startServers() {
    return Promise.all([
        new Promise(resolve => httpServer.listen(PORT_HTTP, () => resolve())),
        new Promise(resolve => tcpServer.listen(PORT_TCP, () => resolve())),
        new Promise(resolve => udpServer.bind(PORT_UDP, () => resolve())),
        new Promise(resolve => smtpServer.listen(PORT_SMTP, () => resolve()))
    ]);
}

async function stopServers() {
    return Promise.all([
        new Promise(resolve => httpServer.close(resolve)),
        new Promise(resolve => tcpServer.close(resolve)),
        new Promise(resolve => udpServer.close(resolve)),
        new Promise(resolve => smtpServer.close(resolve))
    ]);
}

// --- Test Suites ---

async function testHttp() {
    console.log('\n--- HTTP Status Codes ---');
    const categories = getAllStatusCodesByCategory();
    let allCodes = [];
    Object.values(categories).forEach(list => allCodes = allCodes.concat(list));
    allCodes.sort((a, b) => a.code - b.code);

    for (const { code, name, category } of allCodes) {
        const monitor = { type: 'HTTP', url: `http://localhost:${PORT_HTTP}/${code}`, timeout: 2000, degradedThresholdMs: 500 };

        try {
            const result = await MonitorRunner.run(monitor);

            let expectedHealth = 'UNKNOWN';
            if (shouldTreatAsUp(code)) expectedHealth = 'UP';
            else if (shouldTreatAsDegraded(code)) expectedHealth = 'DEGRADED';
            else if (shouldTreatAsDown(code)) expectedHealth = 'DOWN';

            logResult('HTTP', `${code} ${name}`, expectedHealth, result.healthState, result.healthState === expectedHealth);
        } catch (e) {
            logResult('HTTP', `${code} ${name}`, 'Handled', `Exception: ${e.message}`, false);
        }
    }
}

async function testProtocols() {
    console.log('\n--- Protocols (Real Network) ---');

    // TCP
    const tcpResult = await MonitorRunner.run({ type: 'TCP', url: 'localhost', port: PORT_TCP });
    logResult('TCP', 'Connect Success', 'UP', tcpResult.healthState, tcpResult.isUp);

    const tcpFail = await MonitorRunner.run({ type: 'TCP', url: 'localhost', port: 9999, timeout: 500 });
    logResult('TCP', 'Connect Refused', 'DOWN', tcpFail.healthState, !tcpFail.isUp);

    // UDP
    const udpResult = await MonitorRunner.run({ type: 'UDP', url: 'localhost', port: PORT_UDP });
    logResult('UDP', 'Send Success', 'UNKNOWN', udpResult.healthState, udpResult.healthState === 'UNKNOWN');

    // DNS (Real)
    const dnsResult = await MonitorRunner.run({ type: 'DNS', url: 'google.com' });
    logResult('DNS', 'Resolve google.com', 'UP', dnsResult.healthState, dnsResult.isUp);

    const dnsFail = await MonitorRunner.run({ type: 'DNS', url: 'invalid-domain-name-xyz-123.com' });
    logResult('DNS', 'Resolve Fail', 'DOWN', dnsFail.healthState, !dnsFail.isUp);

    // SMTP
    const smtpResult = await MonitorRunner.run({ type: 'SMTP', url: 'localhost', port: PORT_SMTP });
    logResult('SMTP', 'Connect Success', 'UP', smtpResult.healthState, smtpResult.isUp);

    // SSL (Real World)
    // We use a known stable site
    const sslResult = await MonitorRunner.run({ type: 'SSL', url: 'https://google.com' });
    logResult('SSL', 'Connect google.com', 'UP', sslResult.healthState, sslResult.healthState === 'UP');

    // SSL Error (Real World - Self Signed / expired check is hard to find reliably online without being flaky)
    // We will simulate SSL error by connecting to our HTTP port (non-ssl) expecting SSL.
    const sslErr = await MonitorRunner.run({ type: 'SSL', url: `https://localhost:${PORT_HTTP}` });
    // This should fail handshake
    logResult('SSL', 'Handshake Fail', 'DOWN', sslErr.healthState, !sslErr.isUp);
}

async function main() {
    try {
        await startServers();
        await new Promise(r => setTimeout(r, 500));

        await testHttp();
        await testProtocols();

        // Generate Summary
        const passed = RESULTS.filter(r => r.success).length;
        const total = RESULTS.length;
        const accuracy = ((passed / total) * 100).toFixed(2);

        const summary = [
            '# Comprehensive Protocol Test Report (Real Network)',
            `Date: ${new Date().toISOString()}`,
            `Accuracy: ${accuracy}% (${passed}/${total})`,
            '',
            '## Failures',
            ...RESULTS.filter(r => !r.success).map(r =>
                `- [${r.protocol}] ${r.scenario}: Expected ${r.expected}, got ${r.actual}`
            ),
            '',
            '## Results',
            `| Protocol | Scenario | Status |`,
            `|---|---|---|`,
            ...RESULTS.map(r => `| ${r.protocol} | ${r.scenario} | ${r.success ? '✅' : '❌'} |`)
        ].join('\n');

        fs.writeFileSync('COMPREHENSIVE-TESTING-SUMMARY.md', summary);
        console.log(`\nReport generated with ${accuracy}% accuracy.`);

        process.exit(passed < total ? 1 : 0);
    } catch (err) {
        console.error('Test Suite Failed:', err);
        process.exit(1);
    } finally {
        await stopServers();
    }
}

main();
