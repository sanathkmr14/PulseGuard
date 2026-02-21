import http from 'http';
import https from 'https';
import dns from 'dns';
import { promisify } from 'util';
import { URL } from 'url';
import { classifyHttpResponse } from '../utils/status-classifier.js';
import { isPrivateIP } from '../utils/url-validator.js';

const lookup = promisify(dns.lookup);
const MAX_BODY_SIZE = 512 * 1024; // 512KB limit to prevent OOM (Phase 10)

/**
 * Custom HTTP request handler that supports 'information' events for 1xx codes.
 * This fulfills the "Real-time Industry Standard" for uptime checkers.
 */
const performRequest = (monitor, timeout) => {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(monitor.url);
        const protocol = parsedUrl.protocol === 'https:' ? https : http;

        const options = {
            method: 'GET',
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            timeout: timeout,
            headers: {
                // Use a standard browser User-Agent to bypass bot detection on some servers (e.g. httpstat.us)
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                // Add standard browser headers to avoid being blocked
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Connection': 'close' // Ensure connection is closed after request
            },
            // SUPPORT: Skip SSL certificate validation if configured (Phase 10)
            rejectUnauthorized: monitor.allowUnauthorized === true ? false : true
        };

        const req = protocol.request(options);

        // State tracking to prevent race conditions (e.g. timeout vs error)
        let isDone = false;

        const cleanup = () => {
            if (isDone) return;
            isDone = true;
            req.destroy();
        };

        // DNS Rebinding Protection: Resolve hostname first (Phase 10)
        (async () => {
            try {
                const { address } = await lookup(options.hostname);
                const ipCheck = isPrivateIP(address);
                if (ipCheck.isPrivate) {
                    cleanup();
                    return reject(new Error(`Security: DNS resolved to restricted IP ${address} (${ipCheck.error})`));
                }

                // If it's a valid public IP, proceed with the request
                req.end();
            } catch (dnsErr) {
                // If DNS fails, fallback to letting req.end() handle it or reject directly
                cleanup();
                reject(dnsErr);
            }
        })();

        req.on('response', (res) => {
            if (isDone) return;
            // Note: We don't set isDone=true here yet, because we need to read the body.
            // But we have established a connection.

            let data = '';
            let hasLoggedCap = false;
            res.on('data', chunk => {
                if (isDone) return;
                // Cap body size to prevent OOM (Phase 10)
                if (data.length + chunk.length > MAX_BODY_SIZE) {
                    const remaining = MAX_BODY_SIZE - data.length;
                    if (remaining > 0) {
                        data += chunk.slice(0, remaining);
                    }
                    if (!hasLoggedCap) {
                        console.warn(`[HTTP] Response body capped for ${monitor.url} at ${MAX_BODY_SIZE} bytes`);
                        hasLoggedCap = true;
                    }
                    // We don't destroy yet, we just stop accumulating.
                    // This allows the response to "end" naturally.
                } else {
                    data += chunk;
                }
            });

            res.on('end', () => {
                if (isDone) return;
                isDone = true;
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    data: data
                });
            });

            res.on('error', (err) => {
                if (isDone) return;
                isDone = true;
                reject(err);
            });
        });

        // CRITICAL: Capture 'information' events for 1xx codes
        req.on('information', (info) => {
            if (isDone) return;

            if (info.statusCode >= 100 && info.statusCode < 200) {
                // We found an informational response! 
                // In a real-time checker, this is proof of life.
                isDone = true;
                req.destroy(); // Stop waiting for the final response
                resolve({
                    status: info.statusCode,
                    headers: info.headers,
                    data: '',
                    isInformational: true
                });
            }
        });

        req.on('timeout', () => {
            if (isDone) return;
            isDone = true;
            req.destroy();
            reject(new Error('timeout'));
        });

        req.on('error', (err) => {
            if (isDone) return;
            isDone = true;
            req.destroy();

            // SSL Diagnostic Logging
            if (err.code === 'UNABLE_TO_GET_ISSUER_CERT' || err.code === 'CERT_HAS_EXPIRED' || err.code === 'DEPTH_ZERO_SELF_SIGNED_CERT' || err.code === 'CERT_CHAIN_ERROR') {
                console.warn(`[SSL-DIAG] Error: ${err.code} for ${monitor.url}`);
                // Note: The 'cert' might be available in some error contexts or via checking the socket
            }

            reject(err);
        });

        // req.end() is called inside the async DNS resolver closure above
    });
};

export const checkHttp = async (monitor, result, options = {}) => {
    const {
        determineHealthStateFromError,
        detectErrorType,
        formatErrorMessage
    } = options;

    // FIXED: Respect monitor's configured timeout (was hardcoded to 10s max)
    const timeout = monitor.timeout || 30000; // Default 30s, respects user config
    result.checkStartTime = Date.now();
    result.errorType = null; // Initialize errorType
    result.errorMessage = null; // Initialize errorMessage

    // ========================================
    // VALIDATION: Reject non-HTTP protocols
    // ========================================
    if (!monitor.url) {
        result.healthState = 'DOWN';
        result.isUp = false;
        result.errorType = 'INVALID_URL';
        result.errorMessage = 'No URL provided';
        throw new Error('No URL provided');
    }

    // Check for non-HTTP protocols
    // Check for non-HTTP protocols
    let urlLower = monitor.url.toLowerCase().trim();
    let urlToUse = monitor.url;

    // Auto-prepend http:// if no protocol specified (Robustness for protocol-less inputs)
    if (!urlLower.startsWith('http://') && !urlLower.startsWith('https://')) {
        // If it looks like another protocol, reject it. Otherwise assume HTTP.
        const firstColon = urlLower.indexOf(':');
        const hasProtocolSequence = urlLower.includes('://');

        if (hasProtocolSequence) {
            const protocol = urlLower.split('://')[0];
            if (protocol !== 'http' && protocol !== 'https') {
                result.healthState = 'DOWN';
                result.isUp = false;
                result.errorType = 'INVALID_PROTOCOL';
                result.errorMessage = `Unsupported protocol: ${protocol}:// (HTTP monitor only supports http:// and https://)`;
                throw new Error(`Unsupported protocol: ${protocol}://`);
            }
        } else {
            // No protocol detected, assume HTTP
            urlToUse = 'http://' + monitor.url;
            urlLower = urlToUse.toLowerCase();
        }
    }

    // ========================================
    // VALIDATION: Reject malformed URLs like http:///example.com
    // ========================================
    try {
        const parsedUrl = new URL(urlToUse);
        // Check for empty hostname (which happens with http:///example.com)
        if (!parsedUrl.hostname || parsedUrl.hostname === '') {
            result.healthState = 'DOWN';
            result.isUp = false;
            result.errorType = 'INVALID_URL';
            result.errorMessage = 'Malformed URL: missing hostname';
            throw new Error('Malformed URL: missing hostname');
        }
        // Check for triple slash issue (http:/// creates hostname as empty string)
        if (parsedUrl.hostname === '' && parsedUrl.pathname.startsWith('//')) {
            result.healthState = 'DOWN';
            result.isUp = false;
            result.errorType = 'INVALID_URL';
            result.errorMessage = 'Malformed URL: triple slash detected';
            throw new Error('Malformed URL: triple slash detected');
        }
    } catch (urlError) {
        if (!result.errorType) {
            result.healthState = 'DOWN';
            result.isUp = false;
            result.errorType = 'INVALID_URL';
            result.errorMessage = `Invalid URL format: ${urlError.message}`;
        }
        throw urlError;
    }

    try {
        // Create a shallow copy of monitor with the normalized URL
        const monitorWithProtocol = { ...monitor, url: urlToUse };
        const response = await performRequest(monitorWithProtocol, timeout);

        const localResponseTime = Date.now() - result.checkStartTime;
        result.statusCode = response.status;

        const degradedThresholdMs = monitor.degradedThresholdMs || 2000;

        // Content check if applicable
        let keywordMatch = null;
        if (monitor.expectedContent && !response.isInformational) {
            const contentString = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
            keywordMatch = {
                keyword: monitor.expectedContent,
                found: contentString.includes(monitor.expectedContent)
            };
        }

        // Use our advanced classifier
        const classification = classifyHttpResponse(response.status, localResponseTime, {
            latencyThreshold: degradedThresholdMs,
            keywordMatch: keywordMatch,
            timeout: timeout,
            expectedStatusCode: monitor.expectedStatusCode
        });

        // Compatibility with existing result structure
        result.healthState = classification.status.toUpperCase();
        result.isUp = result.healthState === 'UP' || result.healthState === 'DEGRADED';
        // FIX: Set responseTime for database storage
        result.responseTime = localResponseTime;
        result.confidence = classification.confidence;
        result.severity = classification.severity;
        result.errorType = classification.errorType;

        if (!result.isUp || result.healthState === 'DEGRADED') {
            result.errorMessage = classification.reason;
        }

        // Special handling for keyword mismatch
        if (keywordMatch && !keywordMatch.found) {
            result.errorMessage = `Expected content "${monitor.expectedContent}" not found`;
            result.healthState = 'DOWN';
            result.isUp = false;
        }

        console.log(`[HTTP] ${monitor.url} ${response.status} | Status: ${result.healthState} | ${localResponseTime}ms`);

    } catch (error) {
        const latency = Date.now() - result.checkStartTime;

        // Handle actual connection errors
        result.errorType = detectErrorType(error, monitor.type, null);
        result.errorMessage = formatErrorMessage(error, monitor.type);

        const healthStateResult = determineHealthStateFromError(result.errorType, null, monitor.type, latency, monitor);

        result.healthState = healthStateResult.healthState;
        result.isUp = result.healthState === 'UP' || result.healthState === 'DEGRADED';
        // FIX: Set responseTime for error cases too
        result.responseTime = latency;

        console.log(`[HTTP] ${monitor.url} ERROR | Status: ${result.healthState} | ${result.errorType} | ${result.errorMessage}`);

        throw error;
    }
};
