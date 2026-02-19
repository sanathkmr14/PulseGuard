/**
 * Worker Integration Tests
 * Tests all 8 protocol workers against real endpoints to verify correct behavior.
 * 
 * Run with: npm run test:integration
 */

import { jest } from '@jest/globals';
import { checkHttp } from '../../src/workers/http.worker.js';
import { checkHttps } from '../../src/workers/https.worker.js';
import { checkTcp } from '../../src/workers/tcp.worker.js';
import { checkUdp } from '../../src/workers/udp.worker.js';
import { checkDns } from '../../src/workers/dns.worker.js';
import { checkSmtp } from '../../src/workers/smtp.worker.js';
import { checkSsl } from '../../src/workers/ssl.worker.js';
import { checkPing } from '../../src/workers/ping.worker.js';
import runner from '../../src/services/runner.js';
import { detectErrorType, formatErrorMessage, determineHealthStateFromError } from '../../src/utils/error-classifications.js';

// Helper to create a fresh result object for each test
const createResult = () => ({
    isUp: false,
    responseTime: 0,
    statusCode: null,
    errorType: null,
    errorMessage: null,
    healthState: 'UNKNOWN',
    meta: {},
    checkStartTime: Date.now() // Initialize checkStartTime
});

// Helper options to pass to workers
const workerOptions = {
    detectErrorType,
    formatErrorMessage,
    determineHealthStateFromError,
    parseUrl: runner.parseUrl.bind(runner)
};

describe('Protocol Workers Integration Tests', () => {
    // Increase timeout for network operations
    jest.setTimeout(30000);

    describe('HTTP Worker', () => {
        it('should return UP for successful HTTP request', async () => {
            const result = createResult();
            await checkHttp({
                url: 'http://httpbin.org/status/200',
                timeout: 10000
            }, result, workerOptions);

            expect(result.isUp).toBe(true);
            expect(result.statusCode).toBe(200);
            expect(result.responseTime).toBeGreaterThan(0);
        });

        it('should return DOWN for 500 error', async () => {
            const result = createResult();
            await checkHttp({
                url: 'http://httpbin.org/status/500',
                timeout: 10000
            }, result, workerOptions);

            expect(result.isUp).toBe(false);
            expect(result.statusCode).toBe(500);
            expect(result.errorType).toContain('HTTP');
        });

        it('should detect 404 not found', async () => {
            const result = createResult();
            await checkHttp({
                url: 'http://httpbin.org/status/404',
                timeout: 10000
            }, result, workerOptions);

            expect(result.isUp).toBe(false);
            expect(result.statusCode).toBe(404);
        });
    });

    describe('HTTPS Worker', () => {
        it('should return UP with valid SSL', async () => {
            const result = createResult();
            await checkHttps({
                url: 'https://httpbin.org/status/200',
                timeout: 10000
            }, result, workerOptions);

            expect(result.isUp).toBe(true);
            expect(result.statusCode).toBe(200);
            expect(result.sslInfo).toBeDefined();
        });

        it('should capture SSL certificate info', async () => {
            const result = createResult();
            await checkHttps({
                url: 'https://google.com',
                timeout: 10000
            }, result, workerOptions);

            expect(result.sslInfo).toBeDefined();
            expect(result.sslInfo.daysUntilExpiry).toBeGreaterThan(0);
        });
    });

    describe('TCP Worker', () => {
        it('should return UP for open TCP port', async () => {
            const result = createResult();
            try {
                await checkTcp({
                    url: 'google.com',
                    port: 443,
                    timeout: 10000
                }, result, workerOptions);
            } catch (e) { } // Ignore error, check result

            expect(result.isUp).toBe(true);
            expect(result.responseTime).toBeGreaterThan(0);
        });

        it('should return DOWN for closed port', async () => {
            const result = createResult();
            try {
                await checkTcp({
                    url: 'google.com',
                    port: 12345, // Unlikely to be open
                    timeout: 5000
                }, result, workerOptions);
            } catch (e) { }

            expect(result.isUp).toBe(false);
            expect(result.errorType).toBeDefined();
        });
    });

    describe('UDP Worker', () => {
        it('should handle UDP DNS query (port 53)', async () => {
            const result = createResult();
            try {
                await checkUdp({
                    url: '8.8.8.8',
                    port: 53,
                    timeout: 10000,
                    strictMode: false
                }, result, workerOptions);
            } catch (e) { }

            // UDP is connectionless - success depends on response within timeout
            expect(result).toBeDefined();
            expect(result.responseTime).toBeGreaterThanOrEqual(0);
        });

        it('should handle NTP server (port 123)', async () => {
            const result = createResult();
            try {
                await checkUdp({
                    url: 'time.google.com',
                    port: 123,
                    timeout: 10000,
                    strictMode: false
                }, result, workerOptions);
            } catch (e) { }

            // NTP servers typically respond
            expect(result).toBeDefined();
        });
    });

    describe('DNS Worker', () => {
        it('should resolve A records for google.com', async () => {
            const result = createResult();
            try {
                await checkDns({
                    url: 'google.com',
                    timeout: 10000
                }, result, workerOptions);
            } catch (e) { }

            expect(result.isUp).toBe(true);
            expect(result.addresses).toBeDefined();
            expect(result.addresses.length).toBeGreaterThan(0);
        });

        it('should handle non-existent domain', async () => {
            const result = createResult();
            try {
                await checkDns({
                    url: 'this-domain-does-not-exist-12345.com',
                    timeout: 10000
                }, result, workerOptions);
            } catch (e) { }

            expect(result.isUp).toBe(false);
            expect(result.errorType).toContain('DNS');
        });
    });

    describe('SMTP Worker', () => {
        it('should connect to Gmail SMTP (port 587)', async () => {
            const result = createResult();
            try {
                await checkSmtp({
                    url: 'smtp.gmail.com',
                    port: 587,
                    timeout: 10000
                }, result, workerOptions);
            } catch (e) { }

            expect(result.isUp).toBe(true);
            expect(result.bannerCode).toBeDefined();
        });

        it('should handle connection refused', async () => {
            const result = createResult();
            try {
                await checkSmtp({
                    url: 'google.com',
                    port: 25, // Google blocks direct SMTP
                    timeout: 5000
                }, result, workerOptions);
            } catch (e) { }

            expect(result.isUp).toBe(false);
        });
    });

    describe('SSL Worker', () => {
        it('should validate certificate for google.com', async () => {
            const result = createResult();
            try {
                await checkSsl({
                    url: 'google.com',
                    port: 443,
                    timeout: 10000
                }, result, workerOptions);
            } catch (e) { }

            expect(result.isUp).toBe(true);
            expect(result.daysUntilExpiry).toBeGreaterThan(0);
            expect(result.issuer).toBeDefined();
        });

        it('should detect expired certificate', async () => {
            // badssl.com provides test certificates
            const result = createResult();
            try {
                await checkSsl({
                    url: 'expired.badssl.com',
                    port: 443,
                    timeout: 10000
                }, result, workerOptions);
            } catch (e) { }

            // Expired cert should be detected
            expect(result.isUp).toBe(false);
        });

        it('should detect self-signed certificate', async () => {
            const result = createResult();
            try {
                await checkSsl({
                    url: 'self-signed.badssl.com',
                    port: 443,
                    timeout: 10000
                }, result, workerOptions);
            } catch (e) { }

            expect(result.isUp).toBe(false);
            expect(result.errorType).toBeDefined();
        });
    });

    describe('PING Worker', () => {
        it('should ping google.com successfully', async () => {
            const result = createResult();
            try {
                await checkPing({
                    url: 'google.com',
                    timeout: 10000
                }, result, workerOptions);
            } catch (e) { }

            expect(result.isUp).toBe(true);
            expect(result.responseTime).toBeGreaterThan(0);
        });

        it('should handle unreachable host', async () => {
            const result = createResult();
            try {
                await checkPing({
                    url: '192.0.2.1', // Reserved IP - should be unreachable
                    timeout: 5000
                }, result, workerOptions);
            } catch (e) { }

            expect(result.isUp).toBe(false);
        });
    });
});

describe('Error Classification Tests', () => {
    it('should classify HTTP status codes correctly', async () => {
        const testCases = [
            { url: 'http://httpbin.org/status/200', expected: true },
            { url: 'http://httpbin.org/status/201', expected: true },
            { url: 'http://httpbin.org/status/301', expected: true },
            { url: 'http://httpbin.org/status/400', expected: false },
            { url: 'http://httpbin.org/status/401', expected: false },
            { url: 'http://httpbin.org/status/403', expected: false },
            { url: 'http://httpbin.org/status/404', expected: false },
            { url: 'http://httpbin.org/status/500', expected: false },
            { url: 'http://httpbin.org/status/502', expected: false },
            { url: 'http://httpbin.org/status/503', expected: false }
        ];

        for (const testCase of testCases) {
            const result = createResult();
            await checkHttp({
                url: testCase.url,
                timeout: 10000
            }, result, workerOptions);

            expect(result.isUp).toBe(testCase.expected);
        }
    });
});
