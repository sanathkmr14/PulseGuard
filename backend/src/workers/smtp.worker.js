import net from 'net';
import tls from 'tls';
import dns from 'dns';
import { promisify } from 'util';
import { isPrivateIP } from '../utils/url-validator.js';

const lookup = promisify(dns.lookup);

// Helper to attempt a single socket connection to an IP
const checkSmtpIp = async (ip, port, hostname, timeout, addresses, index, monitor = {}) => {
    return new Promise((resolve, reject) => {
        let socket = new net.Socket();
        const startTime = Date.now();
        let isDone = false;
        let state = 'CONNECTING';
        let bannerCode = null;
        let supportsStartTls = false;
        const explicitlyRequestTls = port === 587 || monitor.requireTls || monitor.starttls;

        socket.setTimeout(timeout);

        const cleanup = () => {
            if (isDone) return;
            isDone = true;
            // Defensive: clear the totalTimeout in case cleanup() is called
            // without a preceding clearTimeout() (e.g. from unexpected code paths).
            clearTimeout(totalTimeout);
            socket.removeAllListeners();
            socket.destroy();
        };

        const totalTimeoutMs = Math.min(timeout, 15000); // 15s per IP max for STARTTLS
        const totalTimeout = setTimeout(() => {
            if (isDone) return;
            cleanup();
            reject(new Error(`SMTP timeout on ${ip} (state: ${state})`));
        }, totalTimeoutMs);

        const handleSmtpData = (data) => {
            if (isDone) return;

            const response = data.toString();
            const lines = response.split('\r\n').filter(l => l);

            for (const line of lines) {
                const statusCode = line.substring(0, 3);
                const isFinalLine = line.charAt(3) === ' ';

                if (state === 'WAITING_BANNER') {
                    if (statusCode === '220') {
                        bannerCode = parseInt(statusCode, 10);
                        if (!isFinalLine) continue;
                        console.log(`[SMTP] Got 220 banner from ${ip}`);

                        // Send EHLO first to check capabilities (including STARTTLS)
                        state = 'EHLO_SENT';
                        socket.write('EHLO pulse-guard\r\n');
                    } else if (statusCode === '250') {
                        clearTimeout(totalTimeout);
                        cleanup();
                        const err = new Error(`Interception detected: Received 250 instead of 220 banner from ${ip}`);
                        err.statusCode = statusCode;
                        reject(err);
                        return;
                    } else {
                        clearTimeout(totalTimeout);
                        cleanup();
                        reject(new Error(`Invalid banner from ${ip}: ${line.trim()}`));
                        return;
                    }
                } else if (state === 'EHLO_SENT') {
                    if (line.toLowerCase().includes('starttls')) {
                        supportsStartTls = true;
                    }

                    if (statusCode === '250') {
                        if (!isFinalLine) continue; // Multi-line response, wait for final

                        // If port 587, or if STARTTLS requested, or if advertised on port 25/2525
                        if (explicitlyRequestTls || ((port === 25 || port === 2525) && supportsStartTls)) {
                            state = 'STARTTLS_SENT';
                            socket.write('STARTTLS\r\n');
                        } else {
                            clearTimeout(totalTimeout);
                            cleanup();
                            resolve({
                                isUp: true,
                                responseTime: Date.now() - startTime,
                                statusCode: parseInt(statusCode, 10),
                                bannerCode: bannerCode || 220,
                                response: line,
                                usedStartTls: false
                            });
                            return;
                        }
                    } else if (isFinalLine) {
                        state = 'HELO_SENT';
                        socket.write('HELO pulse-guard\r\n');
                    }
                } else if (state === 'STARTTLS_SENT') {
                    if (statusCode === '220') {
                        console.log(`[SMTP] STARTTLS accepted, upgrading to TLS on ${ip}`);
                        state = 'TLS_UPGRADING';

                        // CRITICAL: Remove plaintext data listener before upgrading to TLS
                        socket.removeListener('data', handleSmtpData);

                        // Upgrade socket to TLS
                        const tlsSocket = tls.connect({
                            socket: socket,
                            servername: net.isIP(hostname) ? undefined : hostname,
                            rejectUnauthorized: false // Allow self-signed for monitoring
                        }, () => {
                            console.log(`[SMTP] TLS handshake complete on ${ip}`);
                            state = 'EHLO_AFTER_TLS';
                            tlsSocket.write('EHLO pulse-guard\r\n');
                        });

                        tlsSocket.on('data', (tlsData) => {
                            if (isDone) return;
                            const tlsResponse = tlsData.toString();
                            const tlsLines = tlsResponse.split('\r\n').filter(l => l);

                            for (const tlsLine of tlsLines) {
                                const tlsStatusCode = tlsLine.substring(0, 3);
                                const tlsIsFinal = tlsLine.charAt(3) === ' ';

                                if (state === 'EHLO_AFTER_TLS' && tlsStatusCode === '250' && tlsIsFinal) {
                                    clearTimeout(totalTimeout);
                                    cleanup();
                                    resolve({
                                        isUp: true,
                                        responseTime: Date.now() - startTime,
                                        statusCode: parseInt(tlsStatusCode, 10),
                                        bannerCode: bannerCode || 220,
                                        response: tlsLine,
                                        usedStartTls: true
                                    });
                                    return;
                                }
                            }
                        });

                        tlsSocket.on('error', (err) => {
                            clearTimeout(totalTimeout);
                            tlsSocket.removeAllListeners();
                            cleanup();
                            reject(new Error(`TLS upgrade failed on ${ip}: ${err.message}`));
                        });

                        socket = tlsSocket;
                    } else {
                        clearTimeout(totalTimeout);
                        cleanup();
                        reject(new Error(`STARTTLS rejected by ${ip}: ${line}`));
                        return;
                    }
                } else if (state === 'HELO_SENT') {
                    if (statusCode === '250') {
                        if (!isFinalLine) continue;
                        clearTimeout(totalTimeout);
                        cleanup();
                        resolve({
                            isUp: true,
                            responseTime: Date.now() - startTime,
                            statusCode: parseInt(statusCode, 10),
                            bannerCode: bannerCode || 220,
                            response: line,
                            usedStartTls: false
                        });
                        return;
                    } else if (isFinalLine) {
                        clearTimeout(totalTimeout);
                        cleanup();
                        reject(new Error(`Handshake failed on ${ip}`));
                        return;
                    }
                }
            }
        };

        socket.on('connect', () => {
            state = 'WAITING_BANNER';
            console.log(`[SMTP] Connected to ${ip}:${port} (${index + 1}/${addresses.length}), waiting for banner...`);
        });

        socket.on('data', handleSmtpData);

        socket.on('error', (err) => {
            clearTimeout(totalTimeout);
            cleanup();
            reject(err);
        });

        socket.on('timeout', () => {
            clearTimeout(totalTimeout);
            cleanup();
            reject(new Error(`Timeout on ${ip}`));
        });

        const ipCheck = isPrivateIP(ip);
        if (ipCheck.isPrivate) {
            clearTimeout(totalTimeout);
            cleanup();
            const blockedErr = new Error(`Private IP blocked: ${ip}`);
            blockedErr.code = 'SSRF_BLOCKED';
            reject(blockedErr);
            return;
        }

        socket.connect(port, ip);
    });
};

/**
 * Enhanced SMTP Worker with Multi-IP Failover and STARTTLS Support
 * - Port 25: Plain SMTP with opportunistic STARTTLS
 * - Port 587: STARTTLS (submission)
 * - Port 465: Use SSL worker instead
 */
export const checkSmtp = async (monitor, result, options = {}) => {
    const parseUrl = options.parseUrl || ((urlStr, defaultPort) => {
        let u = (urlStr || '').trim();
        if (!/^[a-zA-Z]+:\/\//.test(u)) u = 'smtp://' + u;
        try {
            const parsed = new URL(u);
            return { hostname: parsed.hostname, port: parsed.port ? parseInt(parsed.port, 10) : defaultPort };
        } catch {
            const parts = (urlStr || '').replace(/^[a-zA-Z]+:\/\//, '').split('/')[0].split(':');
            return { hostname: parts[0], port: parts[1] ? parseInt(parts[1], 10) : defaultPort };
        }
    });

    const { detectErrorType, formatErrorMessage, determineHealthStateFromError } = options;
    const startTime = Date.now();
    const timeout = monitor.timeout || 30000;
    const { hostname, port } = parseUrl(monitor.url, monitor.port || 25);

    // Port 465 uses implicit SSL (SMTPS) — plain TCP handshake will always fail.
    if (port === 465) {
        result.healthState = 'DOWN';
        result.isUp = false;
        result.errorType = 'INVALID_CONFIG';
        result.errorMessage = 'Port 465 uses implicit SSL (SMTPS). Create an SSL monitor targeting port 465 instead of an SMTP monitor.';
        result.responseTime = 0;
        result.statusCode = null;
        result.bannerCode = null;
        console.log(`[SMTP] ❌ Port 465 not supported — use an SSL monitor for SMTPS`);
        return result;
    }

    try {
        // Resolve ALL addresses
        const addresses = await lookup(hostname, { all: true, verbatim: true });

        // Prioritize IPv4 (Family 4) over IPv6 (Family 6)
        addresses.sort((a, b) => a.family - b.family);

        if (!addresses || addresses.length === 0) throw new Error('No addresses found');

        // 🛡️ SSRF Protection: Ensure NO resolved address points to a private/internal IP
        for (const addr of addresses) {
            const check = isPrivateIP(addr.address);
            if (check.isPrivate) {
                console.warn(`🛡️ SMTP SSRF Blocked: Hostname "${hostname}" resolved to private IP ${addr.address} (${check.error})`);
                const ssrfErr = new Error(`SSRF_PROTECTION: Access to private/internal IP address "${addr.address}" is blocked.`);
                ssrfErr.code = 'SSRF_BLOCKED';
                throw ssrfErr;
            }
        }

        console.log(`[SMTP DEBUG] Found ${addresses.length} IPs for ${hostname}. Port ${port}. Trying all...`);

        let lastError = null;

        // Iterate through IPs until one works
        for (let i = 0; i < addresses.length; i++) {
            const elapsed = Date.now() - startTime;
            if (elapsed >= timeout) {
                const timeoutErr = new Error(`SMTP connection timed out after ${timeout}ms`);
                timeoutErr.code = 'ETIMEDOUT';
                throw timeoutErr;
            }

            const remainingTime = timeout - elapsed;
            const ip = addresses[i].address;
            try {
                const ipTimeout = Math.max(1, Math.min(remainingTime, Math.max(8000, Math.floor(remainingTime / (addresses.length - i)))));
                const stepResult = await checkSmtpIp(ip, port, hostname, ipTimeout, addresses, i, monitor);

                if (stepResult.isUp) {
                    console.log(`[SMTP SUCCESS] Connected via ${ip}${stepResult.usedStartTls ? ' (STARTTLS)' : ''}`);
                    result.isUp = true;

                    const degradedThreshold = monitor.degradedThresholdMs || 2000;
                    if (stepResult.responseTime > degradedThreshold) {
                        result.healthState = 'DEGRADED';
                        result.errorType = 'SLOW_RESPONSE';
                        result.errorMessage = `Slow SMTP response: ${stepResult.responseTime}ms`;
                    } else {
                        result.healthState = 'UP';
                        result.errorType = null;
                        result.errorMessage = null;
                    }

                    result.responseTime = stepResult.responseTime;
                    result.statusCode = stepResult.statusCode;
                    result.bannerCode = stepResult.bannerCode;
                    result.meta = {
                        smtpResponse: stepResult.response,
                        statusCode: stepResult.statusCode,
                        bannerCode: stepResult.bannerCode,
                        ipUsed: ip,
                        usedStartTls: stepResult.usedStartTls || false
                    };
                    return result;
                }
            } catch (err) {
                console.log(`[SMTP INFO] Failed on ${ip}: ${err.message}`);
                if (err.statusCode) {
                    result.statusCode = parseInt(err.statusCode, 10);
                    result.bannerCode = parseInt(err.statusCode, 10);
                }
                lastError = err;
            }
        }

        throw lastError || new Error('All connection attempts failed');

    } catch (err) {
        const responseTime = Date.now() - startTime;
        result.responseTime = responseTime;

        if (err.code === 'SSRF_BLOCKED' || err.message?.includes('SSRF_PROTECTION') || err.message?.includes('SSRF Blocked')) {
            result.errorType = 'SSRF_BLOCKED';
            result.healthState = 'DOWN';
            result.isUp = false;
            result.errorMessage = err.message;
            result.statusCode = null;
            result.bannerCode = null;
            return result;
        }

        result.errorType = detectErrorType ? detectErrorType(err, 'SMTP', null) : 'SMTP_ERROR';
        result.errorMessage = formatErrorMessage ? formatErrorMessage(err, 'SMTP') : err.message;

        if (err.message && err.message.includes('Interception')) {
            result.errorMessage = 'SMTP Blocked: ISP Interception (Received 250 banner). Try Port 587.';
        }

        // 421 = Temporarily Unavailable: server is reachable, DEGRADED not DOWN
        if (err.message && (err.message.includes('421') || result.errorType === 'SMTP_SERVICE_UNAVAILABLE')) {
            result.healthState = 'DEGRADED';
            result.isUp = true;
            result.errorType = 'SMTP_TEMPORARILY_UNAVAILABLE';
            result.errorMessage = 'SMTP temporarily unavailable (421) — server is reachable, try again later.';
            return result;
        }

        if (determineHealthStateFromError) {
            const hsr = determineHealthStateFromError(result.errorType, null, 'SMTP', responseTime, monitor);
            result.healthState = hsr.healthState;
        } else {
            result.healthState = 'DOWN';
        }
        result.isUp = result.healthState === 'UP' || result.healthState === 'DEGRADED';
        return result;
    }
};

export default {
    checkSmtp
};
