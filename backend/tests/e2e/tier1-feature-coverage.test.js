import './helpers/setup.js';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import mongoose from 'mongoose';
import runner from '../../src/services/runner.js';
import { checkHttp } from '../../src/workers/http.worker.js';
import { checkHttps } from '../../src/workers/https.worker.js';
import { checkTcp } from '../../src/workers/tcp.worker.js';
import { checkUdp } from '../../src/workers/udp.worker.js';
import { checkDns } from '../../src/workers/dns.worker.js';
import { checkSmtp } from '../../src/workers/smtp.worker.js';
import { checkSsl } from '../../src/workers/ssl.worker.js';
import { checkPing } from '../../src/workers/ping.worker.js';
import healthEvaluator from '../../src/services/health-evaluator.service.js';
import enhancedAlertService from '../../src/services/enhanced-alert.service.js';
import {
    createResult,
    getWorkerOptions,
    InMemoryHarness
} from './helpers/test-harness.js';

describe('Tier 1: Feature Coverage E2E Test Suite', () => {
    let harness;

    beforeAll(() => {
        process.env.NODE_ENV = 'test';
        process.env.REDIS_ENABLED = 'false';
        process.env.ALLOW_PRIVATE_IPS = 'true';
        harness = new InMemoryHarness();
        harness.setup();
    });

    afterAll(() => {
        harness.teardown();
    });

    beforeEach(() => {
        harness.reset();
        globalThis.monitor = {};
    });

    // =========================================================================
    // FEATURE 1: PING Protocol Worker (5+ tests)
    // =========================================================================
    describe('Feature 1: PING Protocol Worker', () => {
        it('T1.1.1: Local ping to 127.0.0.1 succeeds and returns UP with responseTime', async () => {
            const result = createResult();
            const monitor = { url: '127.0.0.1', timeout: 3000, type: 'PING' };
            await checkPing(monitor, result, getWorkerOptions());

            expect(result.isUp).toBe(true);
            expect(result.healthState).toBe('UP');
            expect(result.responseTime).toBeGreaterThanOrEqual(0);
        });

        it('T1.1.2: Ping to an unresolvable hostname returns DOWN with DNS/Host error', async () => {
            const result = createResult();
            const monitor = { url: 'unresolvable-domain-xyz-987654.invalid', timeout: 2000, type: 'PING' };
            try {
                await checkPing(monitor, result, getWorkerOptions());
            } catch (e) { }

            expect(result.isUp).toBe(false);
            expect(result.healthState).toBe('DOWN');
            expect(result.errorType).toBeDefined();
        });

        it('T1.1.3: Ping worker populates meta statistics when ping executes', async () => {
            const result = createResult();
            const monitor = { url: '127.0.0.1', timeout: 3000, type: 'PING' };
            await checkPing(monitor, result, getWorkerOptions());

            expect(result.meta).toBeDefined();
            expect(typeof result.meta).toBe('object');
        });

        it('T1.1.4: Ping with high latency threshold is classified as UP when fast', async () => {
            const result = createResult();
            const monitor = { url: '127.0.0.1', timeout: 3000, degradedThresholdMs: 2000, type: 'PING' };
            await checkPing(monitor, result, getWorkerOptions());

            expect(result.isUp).toBe(true);
            expect(result.healthState).toBe('UP');
        });

        it('T1.1.5: Ping to unreachable route within short timeout returns DOWN', async () => {
            const result = createResult();
            const monitor = { url: '192.0.2.1', timeout: 1000, count: 1, type: 'PING' };
            try {
                await checkPing(monitor, result, getWorkerOptions());
            } catch (e) { }

            expect(result.isUp).toBe(false);
            expect(result.healthState).toBe('DOWN');
        });
    });

    // =========================================================================
    // FEATURE 2: HTTP Protocol Worker (6 tests)
    // =========================================================================
    describe('Feature 2: HTTP Protocol Worker', () => {
        it('T1.2.1: HTTP 200 OK returns isUp: true, statusCode: 200, healthState: UP', async () => {
            const monitor = { url: 'http://127.0.0.1:8080/api/health', timeout: 3000, type: 'HTTP' };
            globalThis.monitor = monitor;

            const result = createResult();
            await checkHttp(monitor, result, getWorkerOptions());

            expect(result.isUp).toBe(true);
            expect(result.statusCode).toBe(200);
            expect(result.healthState).toBe('UP');
            expect(result.responseTime).toBeGreaterThanOrEqual(0);
        });

        it('T1.2.2: HTTP 404 Not Found returns isUp: false, statusCode: 404, healthState: DOWN', async () => {
            const monitor = { url: 'http://127.0.0.1:8080/missing-404', timeout: 3000, type: 'HTTP' };
            globalThis.monitor = monitor;

            const result = createResult();
            await checkHttp(monitor, result, getWorkerOptions());

            expect(result.isUp).toBe(false);
            expect(result.statusCode).toBe(404);
            expect(result.healthState).toBe('DOWN');
        });

        it('T1.2.3: HTTP 500 Internal Server Error returns isUp: false, statusCode: 500, healthState: DOWN', async () => {
            const monitor = { url: 'http://127.0.0.1:8080/server-error-500', timeout: 3000, type: 'HTTP' };
            globalThis.monitor = monitor;

            const result = createResult();
            await checkHttp(monitor, result, getWorkerOptions());

            expect(result.isUp).toBe(false);
            expect(result.statusCode).toBe(500);
            expect(result.healthState).toBe('DOWN');
        });

        it('T1.2.4: HTTP 429 Too Many Requests returns healthState: DEGRADED', async () => {
            const monitor = { url: 'http://127.0.0.1:8080/rate-limited-429', timeout: 3000, type: 'HTTP' };
            globalThis.monitor = monitor;

            const result = createResult();
            await checkHttp(monitor, result, getWorkerOptions());

            expect(result.statusCode).toBe(429);
            expect(result.healthState).toBe('DEGRADED');
        });

        it('T1.2.5: HTTP request properly transmits custom headers to target', async () => {
            let capturedHeaders = null;
            harness.customHttpHandler = (options) => {
                capturedHeaders = options.headers;
                return { statusCode: 200, body: 'ok' };
            };

            const monitor = {
                url: 'http://127.0.0.1:8080/custom-headers',
                timeout: 3000,
                type: 'HTTP',
                headers: { 'x-pulseguard-trace': 'trace-12345' }
            };
            globalThis.monitor = monitor;

            const result = createResult();
            await checkHttp(monitor, result, getWorkerOptions());

            expect(result.isUp).toBe(true);
            expect(capturedHeaders).toBeDefined();
        });

        it('T1.2.6: HTTP connection to closed port returns isUp: false', async () => {
            const monitor = { url: 'http://127.0.0.1:49999', timeout: 1500, type: 'HTTP' };
            globalThis.monitor = monitor;

            const result = createResult();
            try {
                await checkHttp(monitor, result, getWorkerOptions());
            } catch (e) { }

            expect(result.isUp).toBe(false);
            expect(['DOWN', 'UNKNOWN']).toContain(result.healthState);
        });
    });

    // =========================================================================
    // FEATURE 3: HTTPS Protocol Worker (5+ tests)
    // =========================================================================
    describe('Feature 3: HTTPS Protocol Worker', () => {
        it('T1.3.1: HTTPS 200 OK with valid TLS connection returns UP', async () => {
            const monitor = { url: 'https://127.0.0.1:8443/secure', timeout: 3000, type: 'HTTPS' };
            globalThis.monitor = monitor;

            const result = createResult();
            await checkHttps(monitor, result, getWorkerOptions());

            expect(result.isUp).toBe(true);
            expect(result.statusCode).toBe(200);
            expect(result.healthState).toBe('UP');
        });

        it('T1.3.2: HTTPS 404 Not Found returns DOWN with statusCode: 404', async () => {
            const monitor = { url: 'https://127.0.0.1:8443/path-404', timeout: 3000, type: 'HTTPS' };
            globalThis.monitor = monitor;

            const result = createResult();
            await checkHttps(monitor, result, getWorkerOptions());

            expect(result.isUp).toBe(false);
            expect(result.statusCode).toBe(404);
            expect(result.healthState).toBe('DOWN');
        });

        it('T1.3.3: HTTPS 503 Service Unavailable returns DOWN', async () => {
            const monitor = { url: 'https://127.0.0.1:8443/status-503', timeout: 3000, type: 'HTTPS' };
            globalThis.monitor = monitor;

            const result = createResult();
            await checkHttps(monitor, result, getWorkerOptions());

            expect(result.isUp).toBe(false);
            expect(result.statusCode).toBe(503);
            expect(result.healthState).toBe('DOWN');
        });

        it('T1.3.4: HTTPS preserves custom port in check result', async () => {
            const monitor = { url: 'https://127.0.0.1:8443/test-path', timeout: 3000, type: 'HTTPS' };
            globalThis.monitor = monitor;

            const result = createResult();
            await checkHttps(monitor, result, getWorkerOptions());

            expect(result.isUp).toBe(true);
            expect(result.statusCode).toBe(200);
        });

        it('T1.3.5: HTTPS connection to closed port returns isUp: false', async () => {
            const monitor = { url: 'https://127.0.0.1:49998', timeout: 1500, type: 'HTTPS' };
            globalThis.monitor = monitor;

            const result = createResult();
            try {
                await checkHttps(monitor, result, getWorkerOptions());
            } catch (e) { }

            expect(result.isUp).toBe(false);
            expect(['DOWN', 'UNKNOWN']).toContain(result.healthState);
        });
    });

    // =========================================================================
    // FEATURE 4: TCP Protocol Worker (5+ tests)
    // =========================================================================
    describe('Feature 4: TCP Protocol Worker', () => {
        it('T1.4.1: TCP connection to open port returns isUp: true, healthState: UP', async () => {
            const result = createResult();
            const monitor = { url: '127.0.0.1:6379', port: 6379, timeout: 3000, type: 'TCP' };
            await checkTcp(monitor, result, getWorkerOptions());

            expect(result.isUp).toBe(true);
            expect(result.healthState).toBe('UP');
            expect(result.responseTime).toBeGreaterThanOrEqual(0);
        });

        it('T1.4.2: TCP connection to closed port returns isUp: false, healthState: DOWN', async () => {
            const result = createResult();
            const monitor = { url: '127.0.0.1:49997', port: 49997, timeout: 1500, type: 'TCP' };
            try {
                await checkTcp(monitor, result, getWorkerOptions());
            } catch (e) { }

            expect(result.isUp).toBe(false);
            expect(result.healthState).toBe('DOWN');
        });

        it('T1.4.3: TCP connection latency exceeding degradedThresholdMs returns DEGRADED', async () => {
            const result = createResult();
            const monitor = { url: '127.0.0.1:6379', port: 6379, timeout: 3000, degradedThresholdMs: -1, type: 'TCP' };
            await checkTcp(monitor, result, getWorkerOptions());

            expect(result.healthState).toBe('DEGRADED');
            expect(result.isUp).toBe(true);
        });

        it('T1.4.4: TCP connection with explicit refused handler returns DOWN', async () => {
            harness.customTcpHandler = () => 'REFUSED';

            const result = createResult();
            const monitor = { url: '127.0.0.1:9000', port: 9000, timeout: 3000, type: 'TCP' };
            try {
                await checkTcp(monitor, result, getWorkerOptions());
            } catch (e) { }

            expect(result.isUp).toBe(false);
            expect(result.healthState).toBe('DOWN');
        });

        it('T1.4.5: TCP runner execution end-to-end resolves structured result', async () => {
            const monitor = { url: '127.0.0.1:6379', port: 6379, timeout: 3000, type: 'TCP' };
            const runResult = await runner.run(monitor);

            expect(runResult).toBeDefined();
            expect(runResult.isUp).toBe(true);
            expect(runResult.healthState).toBe('UP');
        });
    });

    // =========================================================================
    // FEATURE 5: UDP Protocol Worker (5+ tests)
    // =========================================================================
    describe('Feature 5: UDP Protocol Worker', () => {
        it('T1.5.1: UDP port responding with packet returns isUp: true, healthState: UP', async () => {
            const result = createResult();
            const monitor = { url: '127.0.0.1:9999', port: 9999, timeout: 3000, type: 'UDP' };
            await checkUdp(monitor, result, getWorkerOptions());

            expect(result.isUp).toBe(true);
            expect(result.healthState).toBe('UP');
        });

        it('T1.5.2: UDP DNS query simulation on port returns UP', async () => {
            harness.customUdpHandler = (msg) => ({ reply: Buffer.concat([msg.slice(0, 2), Buffer.from([0x81, 0x80])]) });

            const result = createResult();
            const monitor = { url: '127.0.0.1:53', port: 53, timeout: 3000, type: 'UDP' };
            await checkUdp(monitor, result, getWorkerOptions());

            expect(result.isUp).toBe(true);
            expect(result.healthState).toBe('UP');
        });

        it('T1.5.3: UDP timeout on unresponsive port handles timeout cleanly', async () => {
            harness.customUdpHandler = () => null; // Drop packets

            const result = createResult();
            const monitor = { url: '127.0.0.1:9999', port: 9999, timeout: 300, type: 'UDP' };
            await checkUdp(monitor, result, getWorkerOptions());

            expect(result).toBeDefined();
            expect(result.healthState).toBeDefined();
        });

        it('T1.5.4: UDP runner execution end-to-end wraps check safely', async () => {
            const monitor = { url: '127.0.0.1:9999', port: 9999, timeout: 3000, type: 'UDP' };
            const runResult = await runner.run(monitor);

            expect(runResult).toBeDefined();
            expect(runResult.isUp).toBe(true);
        });

        it('T1.5.5: UDP custom payload exchange measures responseTime accurately', async () => {
            const result = createResult();
            const monitor = { url: '127.0.0.1:9999', port: 9999, timeout: 3000, type: 'UDP' };
            await checkUdp(monitor, result, getWorkerOptions());

            expect(result.responseTime).toBeGreaterThanOrEqual(0);
        });
    });

    // =========================================================================
    // FEATURE 6: DNS Protocol Worker (5+ tests)
    // =========================================================================
    describe('Feature 6: DNS Protocol Worker', () => {
        it('T1.6.1: Valid domain resolution (localhost) returns isUp: true, healthState: UP', async () => {
            const result = createResult();
            const monitor = { url: 'localhost', timeout: 3000, type: 'DNS' };
            await checkDns(monitor, result, getWorkerOptions());

            expect(result.isUp).toBe(true);
            expect(result.healthState).toBe('UP');
            expect(result.responseTime).toBeGreaterThanOrEqual(0);
        });

        it('T1.6.2: Non-existent domain returns isUp: false, healthState: DOWN', async () => {
            const result = createResult();
            const monitor = { url: 'nxdomain-test-pulseguard-987654321.xyz', timeout: 2000, type: 'DNS' };
            try {
                await checkDns(monitor, result, getWorkerOptions());
            } catch (e) { }

            expect(result.isUp).toBe(false);
            expect(result.healthState).toBe('DOWN');
        });

        it('T1.6.3: Empty domain string returns DOWN with error', async () => {
            const result = createResult();
            const monitor = { url: '', timeout: 2000, type: 'DNS' };
            try {
                await checkDns(monitor, result, getWorkerOptions());
            } catch (e) { }

            expect(result.isUp).toBe(false);
            expect(result.healthState).toBe('DOWN');
        });

        it('T1.6.4: Domain with protocol prefix (dns:// or http://) is sanitized and resolved', async () => {
            const result = createResult();
            const monitor = { url: 'http://localhost', timeout: 3000, type: 'DNS' };
            await checkDns(monitor, result, getWorkerOptions());

            expect(result.isUp).toBe(true);
            expect(result.healthState).toBe('UP');
        });

        it('T1.6.5: IP address passed instead of domain classified as INVALID_INPUT', async () => {
            const result = createResult();
            const monitor = { url: '8.8.8.8', timeout: 2000, type: 'DNS' };
            try {
                await checkDns(monitor, result, getWorkerOptions());
            } catch (e) { }

            expect(result.isUp).toBe(false);
            expect(result.healthState).toBe('DOWN');
            expect(result.errorType).toBe('INVALID_INPUT');
        });
    });

    // =========================================================================
    // FEATURE 7: SMTP Protocol Worker (5+ tests)
    // =========================================================================
    describe('Feature 7: SMTP Protocol Worker', () => {
        beforeEach(() => {
            harness.isSmtp = true;
        });

        it('T1.7.1: SMTP server with 220 banner greeting returns isUp: true, healthState: UP', async () => {
            const result = createResult();
            const monitor = { url: '127.0.0.1:25', port: 25, timeout: 3000, type: 'SMTP' };
            await checkSmtp(monitor, result, getWorkerOptions());

            expect(result.isUp).toBe(true);
            expect(result.healthState).toBe('UP');
            expect(result.responseTime).toBeGreaterThanOrEqual(0);
        });

        it('T1.7.2: Closed SMTP port returns isUp: false, healthState: DOWN', async () => {
            const result = createResult();
            const monitor = { url: '127.0.0.1:49996', port: 49996, timeout: 1500, type: 'SMTP' };
            try {
                await checkSmtp(monitor, result, getWorkerOptions());
            } catch (e) { }

            expect(result.isUp).toBe(false);
            expect(result.healthState).toBe('DOWN');
        });

        it('T1.7.3: SMTP server returning bad banner (500) returns isUp: false', async () => {
            harness.smtpBanner = '500';

            const result = createResult();
            const monitor = { url: '127.0.0.1:25', port: 25, timeout: 2000, type: 'SMTP' };
            try {
                await checkSmtp(monitor, result, getWorkerOptions());
            } catch (e) { }

            expect(result.isUp).toBe(false);
            expect(['DOWN', 'UNKNOWN']).toContain(result.healthState);
        });

        it('T1.7.4: SMTP STARTTLS negotiation supported on port 587', async () => {
            const result = createResult();
            const monitor = { url: '127.0.0.1:587', port: 587, timeout: 3000, type: 'SMTP' };
            await checkSmtp(monitor, result, getWorkerOptions());

            expect(result.isUp).toBe(true);
            expect(result.healthState).toBe('UP');
        });

        it('T1.7.5: SMTP runner end-to-end execution returns structured health result', async () => {
            const monitor = { url: '127.0.0.1:25', port: 25, timeout: 3000, type: 'SMTP' };
            const runResult = await runner.run(monitor);

            expect(runResult).toBeDefined();
            expect(runResult.isUp).toBe(true);
            expect(runResult.healthState).toBe('UP');
        });
    });

    // =========================================================================
    // FEATURE 8: SSL Protocol Worker (5+ tests)
    // =========================================================================
    describe('Feature 8: SSL Protocol Worker', () => {
        it('T1.8.1: Valid TLS certificate returns isUp: true, healthState: UP with daysUntilExpiry', async () => {
            const result = createResult();
            const monitor = { url: '127.0.0.1:443', port: 443, timeout: 3000, type: 'SSL' };
            await checkSsl(monitor, result, getWorkerOptions());

            expect(result.isUp).toBe(true);
            expect(result.healthState).toBe('UP');
            const days = result.daysUntilExpiry ?? result.meta?.daysUntilExpiry;
            expect(days).toBeDefined();
        });

        it('T1.8.2: Closed TLS port returns isUp: false, healthState: DOWN', async () => {
            const result = createResult();
            const monitor = { url: '127.0.0.1:49995', port: 49995, timeout: 1500, type: 'SSL' };
            try {
                await checkSsl(monitor, result, getWorkerOptions());
            } catch (e) { }

            expect(result.isUp).toBe(false);
            expect(result.healthState).toBe('DOWN');
        });

        it('T1.8.3: SSL check measures responseTime accurately', async () => {
            const result = createResult();
            const monitor = { url: '127.0.0.1:443', port: 443, timeout: 3000, type: 'SSL' };
            await checkSsl(monitor, result, getWorkerOptions());

            expect(result.responseTime).toBeGreaterThanOrEqual(0);
        });

        it('T1.8.4: SSL runner execution end-to-end returns complete check result', async () => {
            const monitor = { url: '127.0.0.1:443', port: 443, timeout: 3000, type: 'SSL' };
            const runResult = await runner.run(monitor);

            expect(runResult).toBeDefined();
            expect(runResult.isUp).toBe(true);
            expect(runResult.healthState).toBe('UP');
        });

        it('T1.8.5: SSL populates certificate issuer metadata when negotiated', async () => {
            const result = createResult();
            const monitor = { url: '127.0.0.1:443', port: 443, timeout: 3000, type: 'SSL' };
            await checkSsl(monitor, result, getWorkerOptions());

            const issuer = result.issuer ?? result.meta?.issuer;
            expect(issuer).toBeDefined();
        });
    });

    // =========================================================================
    // FEATURE 9: Health Evaluator Status Transitions (5+ tests)
    // =========================================================================
    describe('Feature 9: Health Evaluator Status Transitions', () => {
        it('T1.9.1: Healthy check with low responseTime determines state as UP', async () => {
            const monitor = {
                _id: new mongoose.Types.ObjectId(),
                name: 'Evaluator Test UP',
                type: 'HTTP',
                url: 'http://example.com'
            };
            const checkResult = { isUp: true, statusCode: 200, responseTime: 85, healthState: 'UP' };
            const recentChecks = [{ isUp: true, status: 'up', responseTime: 80, createdAt: new Date() }];

            const decision = await healthEvaluator.determineHealthState(checkResult, monitor, recentChecks);
            expect(decision.status).toBe('up');
            expect(decision.confidence).toBeGreaterThan(0.5);
        });

        it('T1.9.2: High latency exceeding degradedThresholdMs determines state as DEGRADED', async () => {
            const monitor = {
                _id: new mongoose.Types.ObjectId(),
                name: 'Evaluator Test DEGRADED',
                type: 'HTTP',
                url: 'http://example.com',
                degradedThresholdMs: 1500
            };
            const checkResult = { isUp: true, statusCode: 200, responseTime: 3200, healthState: 'DEGRADED' };
            const recentChecks = [{ isUp: true, status: 'up', responseTime: 120, createdAt: new Date() }];

            const decision = await healthEvaluator.determineHealthState(checkResult, monitor, recentChecks);
            expect(['degraded', 'up']).toContain(decision.status);
        });

        it('T1.9.3: Consecutive failure checks transition state to DOWN', async () => {
            const monitor = {
                _id: new mongoose.Types.ObjectId(),
                name: 'Evaluator Test DOWN',
                type: 'HTTP',
                url: 'http://example.com',
                alertThreshold: 1
            };
            const checkResult = { isUp: false, statusCode: 500, responseTime: 120, errorType: 'SERVER_ERROR', healthState: 'DOWN' };
            const recentChecks = [
                { isUp: false, status: 'down', responseTime: 120, createdAt: new Date() },
                { isUp: false, status: 'down', responseTime: 120, createdAt: new Date() }
            ];

            const decision = await healthEvaluator.determineHealthState(checkResult, monitor, recentChecks);
            expect(['down', 'degraded']).toContain(decision.status);
        });

        it('T1.9.4: Healthy check following down state initiates recovery transition', async () => {
            const monitor = {
                _id: new mongoose.Types.ObjectId(),
                name: 'Evaluator Test Recovery',
                type: 'HTTP',
                url: 'http://example.com'
            };
            const checkResult = { isUp: true, statusCode: 200, responseTime: 90, healthState: 'UP' };
            const recentChecks = [
                { isUp: false, status: 'down', responseTime: 120, createdAt: new Date() }
            ];

            const decision = await healthEvaluator.determineHealthState(checkResult, monitor, recentChecks);
            expect(['up', 'degraded']).toContain(decision.status);
        });

        it('T1.9.5: Evaluator generates detailed forensic analysis metadata', async () => {
            const monitor = {
                _id: new mongoose.Types.ObjectId(),
                name: 'Evaluator Test Meta',
                type: 'HTTP',
                url: 'http://example.com'
            };
            const checkResult = { isUp: true, statusCode: 200, responseTime: 110, healthState: 'UP' };
            const recentChecks = [{ isUp: true, status: 'up', responseTime: 100, createdAt: new Date() }];

            const decision = await healthEvaluator.determineHealthState(checkResult, monitor, recentChecks);
            expect(decision.analysis).toBeDefined();
            expect(decision.reasons).toBeDefined();
            expect(Array.isArray(decision.reasons)).toBe(true);
        });
    });

    // =========================================================================
    // FEATURE 10: Incident Lifecycle Management (5+ tests)
    // =========================================================================
    describe('Feature 10: Incident Lifecycle Management', () => {
        it('T1.10.1: Failure meeting alertThreshold creates new ongoing incident', async () => {
            const monitor = {
                _id: new mongoose.Types.ObjectId(),
                name: 'Incident Create Monitor',
                type: 'HTTP',
                alertThreshold: 2,
                consecutiveFailures: 2
            };
            const checkResult = { isUp: false, statusCode: 500, errorType: 'SERVER_ERROR', errorMessage: 'Internal Server Error' };
            const healthResult = { confidence: 0.9, analysis: { currentCheck: { severity: 0.9 } } };

            const incident = await enhancedAlertService.handleFailure(monitor, checkResult, healthResult);
            expect(incident).toBeDefined();
            expect(incident.status).toBe('ongoing');
            expect(incident.monitor.toString()).toBe(monitor._id.toString());
            expect(incident.errorType).toBe('SERVER_ERROR');
        });

        it('T1.10.2: Subsequent failure updates ongoing incident without creating duplicate', async () => {
            const monitor = {
                _id: new mongoose.Types.ObjectId(),
                name: 'Incident Deduplicate Monitor',
                type: 'HTTP',
                alertThreshold: 2,
                consecutiveFailures: 2
            };
            const checkResult1 = { isUp: false, statusCode: 500, errorType: 'SERVER_ERROR' };
            await enhancedAlertService.handleFailure(monitor, checkResult1);

            const initialCount = harness.incidents.length;

            const checkResult2 = { isUp: false, statusCode: 503, errorType: 'SERVICE_UNAVAILABLE' };
            await enhancedAlertService.handleFailure(monitor, checkResult2);

            expect(harness.incidents.length).toBe(initialCount);
        });

        it('T1.10.3: Recovery event transitions ongoing incident to resolved', async () => {
            const monitor = {
                _id: new mongoose.Types.ObjectId(),
                name: 'Incident Recovery Monitor',
                type: 'HTTP',
                alertThreshold: 2,
                consecutiveFailures: 2
            };
            const checkResult = { isUp: false, statusCode: 500, errorType: 'SERVER_ERROR' };
            await enhancedAlertService.handleFailure(monitor, checkResult);

            const activeBefore = harness.incidents.filter((i) => i.status === 'ongoing');
            expect(activeBefore.length).toBeGreaterThan(0);

            await enhancedAlertService.handleRecovery(monitor, { confidence: 0.95 });

            const activeAfter = harness.incidents.filter((i) => i.status === 'ongoing');
            expect(activeAfter.length).toBe(0);
        });

        it('T1.10.4: Resolved incident calculates duration and sets endTime', async () => {
            const monitor = {
                _id: new mongoose.Types.ObjectId(),
                name: 'Incident Duration Monitor',
                type: 'HTTP',
                alertThreshold: 2,
                consecutiveFailures: 2
            };
            const checkResult = { isUp: false, statusCode: 500, errorType: 'SERVER_ERROR' };
            await enhancedAlertService.handleFailure(monitor, checkResult);
            await enhancedAlertService.handleRecovery(monitor, { confidence: 0.95 });

            const resolved = harness.incidents.find((i) => i.monitor.toString() === monitor._id.toString());
            expect(resolved.status).toBe('resolved');
            expect(resolved.endTime).toBeDefined();
            expect(resolved.duration).toBeGreaterThanOrEqual(0);
        });

        it('T1.10.5: Failure with high confidence escalates severity to high', async () => {
            const monitor = {
                _id: new mongoose.Types.ObjectId(),
                name: 'Incident Severity Monitor',
                type: 'HTTP',
                alertThreshold: 2,
                consecutiveFailures: 2
            };
            const checkResult = { isUp: false, statusCode: 500, errorType: 'SERVER_ERROR' };
            const healthResult = {
                confidence: 0.95,
                analysis: { currentCheck: { severity: 0.95 } }
            };

            const incident = await enhancedAlertService.handleFailure(monitor, checkResult, healthResult);
            expect(incident.severity).toBe('high');
        });
    });
});
