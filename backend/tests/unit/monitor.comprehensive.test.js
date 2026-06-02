import http from 'http';
import net from 'net';
import dgram from 'dgram';
import fs from 'fs';
import { describe, test, beforeAll, afterAll, expect } from '@jest/globals';
import MonitorRunner from '../../src/services/runner.js';
import {
    getAllStatusCodesByCategory,
    shouldTreatAsUp,
    shouldTreatAsDown,
    shouldTreatAsDegraded
} from '../../src/utils/http-status-codes.js';

// --- Configuration ---
const PORT_HTTP = 3001;
const PORT_TCP = 3003;
const PORT_UDP = 3004;
const PORT_SMTP = 3005;

const RESULTS = [];

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

describe('Comprehensive Protocol Testing', () => {
    beforeAll(async () => {
        await startServers();
        await new Promise(r => setTimeout(r, 500));
    });

    afterAll(async () => {
        await stopServers();
        // Generate Summary Report File
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
    });

    test('HTTP Status Codes and Protocols', async () => {
        // --- HTTP Status Codes ---
        const categories = getAllStatusCodesByCategory();
        let allCodes = [];
        Object.values(categories).forEach(list => allCodes = allCodes.concat(list));
        allCodes.sort((a, b) => a.code - b.code);

        for (const { code, name } of allCodes) {
            const monitor = { type: 'HTTP', url: `http://localhost:${PORT_HTTP}/${code}`, timeout: 2000, degradedThresholdMs: 500 };

            try {
                const result = await MonitorRunner.run(monitor);

                let expectedHealth = 'UNKNOWN';
                if (shouldTreatAsUp(code)) expectedHealth = 'UP';
                else if (shouldTreatAsDegraded(code)) expectedHealth = 'DEGRADED';
                else if (shouldTreatAsDown(code)) expectedHealth = 'DOWN';

                const success = result.healthState === expectedHealth;
                logResult('HTTP', `${code} ${name}`, expectedHealth, result.healthState, success);
                expect(result.healthState).toBe(expectedHealth);
            } catch (e) {
                logResult('HTTP', `${code} ${name}`, 'Handled', `Exception: ${e.message}`, false);
                throw e;
            }
        }

        // --- Protocols (TCP, UDP, DNS, SMTP, SSL) ---
        // TCP
        const tcpResult = await MonitorRunner.run({ type: 'TCP', url: 'localhost', port: PORT_TCP });
        logResult('TCP', 'Connect Success', 'UP', tcpResult.healthState, tcpResult.isUp);
        expect(tcpResult.isUp).toBe(true);

        const tcpFail = await MonitorRunner.run({ type: 'TCP', url: 'localhost', port: 9999, timeout: 500 });
        logResult('TCP', 'Connect Refused', 'DOWN', tcpFail.healthState, !tcpFail.isUp);
        expect(tcpFail.isUp).toBe(false);

        // UDP
        const udpResult = await MonitorRunner.run({ type: 'UDP', url: 'localhost', port: PORT_UDP });
        logResult('UDP', 'Send Success', 'UP', udpResult.healthState, udpResult.healthState === 'UP');
        expect(udpResult.healthState).toBe('UP');

        // DNS (Real)
        const dnsResult = await MonitorRunner.run({ type: 'DNS', url: 'google.com' });
        logResult('DNS', 'Resolve google.com', 'UP', dnsResult.healthState, dnsResult.isUp);
        expect(dnsResult.isUp).toBe(true);

        const dnsFail = await MonitorRunner.run({ type: 'DNS', url: 'invalid-domain-name-xyz-123.com' });
        logResult('DNS', 'Resolve Fail', 'DOWN', dnsFail.healthState, !dnsFail.isUp);
        expect(dnsFail.isUp).toBe(false);

        // SMTP
        const smtpResult = await MonitorRunner.run({ type: 'SMTP', url: 'localhost', port: PORT_SMTP });
        logResult('SMTP', 'Connect Success', 'UP', smtpResult.healthState, smtpResult.isUp);
        expect(smtpResult.isUp).toBe(true);

        // SSL (Real World)
        const sslResult = await MonitorRunner.run({ type: 'SSL', url: 'https://google.com' });
        logResult('SSL', 'Connect google.com', 'UP', sslResult.healthState, sslResult.healthState === 'UP');
        expect(sslResult.healthState).toBe('UP');

        // SSL Error (Real World - Self Signed)
        const sslErr = await MonitorRunner.run({ type: 'SSL', url: `https://localhost:${PORT_HTTP}` });
        logResult('SSL', 'Handshake Fail', 'DOWN', sslErr.healthState, !sslErr.isUp);
        expect(sslErr.isUp).toBe(false);
    }, 45000); // 45 seconds timeout for full run
});
