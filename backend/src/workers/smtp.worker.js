import net from 'net';
import tls from 'tls';
import dns from 'dns';
import { promisify } from 'util';
import { isPrivateIP } from '../utils/url-validator.js';

const lookup = promisify(dns.lookup);

// Helper to attempt a single socket connection to an IP
const checkSmtpIp = async (ip, port, hostname, timeout, addresses, index) => {
    return new Promise((resolve, reject) => {
        let socket = new net.Socket();
        const startTime = Date.now();
        let isDone = false;
        let state = 'CONNECTING';
        const useStartTls = port === 587; // Port 587 requires STARTTLS

        socket.setTimeout(timeout);

        const cleanup = () => {
            if (isDone) return;
            isDone = true;
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
                        if (!isFinalLine) continue;
                        console.log(`[SMTP] Got 220 banner from ${ip}`);

                        if (useStartTls) {
                            // Port 587: Need to do EHLO first, then STARTTLS
                            state = 'EHLO_FOR_STARTTLS';
                            socket.write('EHLO pulse-guard\r\n');
                        } else {
                            // Port 25: Direct EHLO
                            state = 'EHLO_SENT';
                            socket.write('EHLO pulse-guard\r\n');
                        }
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
                } else if (state === 'EHLO_FOR_STARTTLS') {
                    if (statusCode === '250') {
                        if (!isFinalLine) continue; // Multi-line response, wait for final
                        // EHLO successful, now send STARTTLS
                        state = 'STARTTLS_SENT';
                        socket.write('STARTTLS\r\n');
                    } else if (isFinalLine) {
                        clearTimeout(totalTimeout);
                        cleanup();
                        reject(new Error(`EHLO failed on ${ip}: ${line}`));
                        return;
                    }
                } else if (state === 'STARTTLS_SENT') {
                    if (statusCode === '220') {
                        // Server ready for TLS upgrade
                        console.log(`[SMTP] STARTTLS accepted, upgrading to TLS on ${ip}`);
                        state = 'TLS_UPGRADING';

                        // Upgrade socket to TLS
                        const tlsSocket = tls.connect({
                            socket: socket,
                            servername: hostname,
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
                                    // Success!
                                    clearTimeout(totalTimeout);
                                    cleanup();
                                    resolve({
                                        isUp: true,
                                        responseTime: Date.now() - startTime,
                                        statusCode: tlsStatusCode,
                                        response: tlsLine,
                                        usedStartTls: true
                                    });
                                    return;
                                }
                            }
                        });

                        tlsSocket.on('error', (err) => {
                            cleanup();
                            reject(new Error(`TLS upgrade failed on ${ip}: ${err.message}`));
                        });

                        // Replace socket reference for cleanup
                        socket = tlsSocket;
                    } else {
                        clearTimeout(totalTimeout);
                        cleanup();
                        reject(new Error(`STARTTLS rejected by ${ip}: ${line}`));
                        return;
                    }
                } else if (state === 'EHLO_SENT') {
                    // Non-STARTTLS path (port 25)
                    if (statusCode === '250') {
                        if (!isFinalLine) continue;
                        clearTimeout(totalTimeout);
                        cleanup();
                        resolve({ isUp: true, responseTime: Date.now() - startTime, statusCode, response: line });
                        return;
                    } else if (isFinalLine) {
                        state = 'HELO_SENT';
                        socket.write('HELO pulse-guard\r\n');
                    }
                } else if (state === 'HELO_SENT') {
                    if (statusCode === '250') {
                        if (!isFinalLine) continue;
                        clearTimeout(totalTimeout);
                        cleanup();
                        resolve({ isUp: true, responseTime: Date.now() - startTime, statusCode, response: line });
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
            cleanup();
            reject(new Error(`Private IP blocked: ${ip}`));
            return;
        }

        socket.connect(port, ip);
    });
};

/**
 * Enhanced SMTP Worker with Multi-IP Failover and STARTTLS Support
 * - Port 25: Plain SMTP
 * - Port 587: STARTTLS (submission)
 * - Port 465: Use SSL worker instead
 */
export const checkSmtp = async (monitor, result, options = {}) => {
    const { parseUrl, detectErrorType, formatErrorMessage, determineHealthStateFromError } = options;
    const timeout = monitor.timeout || 30000;
    const { hostname, port } = parseUrl(monitor.url, monitor.port || 25);

    try {
        // Resolve ALL addresses
        const addresses = await lookup(hostname, { all: true, verbatim: true });

        // Prioritize IPv6 (Family 6) over IPv4 (Family 4)
        addresses.sort((a, b) => b.family - a.family);

        if (!addresses || addresses.length === 0) throw new Error('No addresses found');

        console.log(`[SMTP DEBUG] Found ${addresses.length} IPs for ${hostname}. Port ${port}. Trying all...`);

        let lastError = null;

        // Iterate through IPs until one works
        for (let i = 0; i < addresses.length; i++) {
            const ip = addresses[i].address;
            try {
                const ipTimeout = Math.max(8000, Math.floor(timeout / addresses.length));
                const stepResult = await checkSmtpIp(ip, port, hostname, ipTimeout, addresses, i);

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
                    result.meta = {
                        smtpResponse: stepResult.response,
                        statusCode: stepResult.statusCode,
                        ipUsed: ip,
                        usedStartTls: stepResult.usedStartTls || false
                    };
                    return;
                }
            } catch (err) {
                console.log(`[SMTP INFO] Failed on ${ip}: ${err.message}`);
                if (err.statusCode) result.statusCode = err.statusCode;
                lastError = err;
            }
        }

        throw lastError || new Error('All connection attempts failed');

    } catch (err) {
        const responseTime = 0;
        result.responseTime = responseTime;
        result.errorType = detectErrorType(err, 'SMTP', null);
        result.errorMessage = formatErrorMessage(err, 'SMTP');

        if (err.message && err.message.includes('Interception')) {
            result.errorMessage = 'SMTP Blocked: ISP Interception (Received 250 banner). Try Port 587.';
        }

        // 421 = Temporarily Unavailable: server is reachable, DEGRADED not DOWN
        if (err.message && (err.message.includes('421') || result.errorType === 'SMTP_SERVICE_UNAVAILABLE')) {
            result.healthState = 'DEGRADED';
            result.isUp = true;
            result.errorType = 'SMTP_TEMPORARILY_UNAVAILABLE';
            result.errorMessage = 'SMTP temporarily unavailable (421) — server is reachable, try again later.';
            return;
        }

        const hsr = determineHealthStateFromError(result.errorType, null, 'SMTP', responseTime, monitor);
        result.healthState = hsr.healthState;
        result.isUp = result.healthState === 'UP' || result.healthState === 'DEGRADED';
    }
};

export default {
    checkSmtp
};

