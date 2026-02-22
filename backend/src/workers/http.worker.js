import http from 'http';
import https from 'https';
import dns from 'dns';
import { promisify } from 'util';
import { URL } from 'url';
import { classifyHttpResponse } from '../utils/status-classifier.js';
import { isPrivateIP } from '../utils/url-validator.js';

import { resolveSecurely } from '../utils/resolver.js';

const MAX_BODY_SIZE = 1024 * 1024; // 1MB limit to prevent DoS (Phase 12 Hardening)
const MAX_REDIRECTS = 10;           // Industry standard: follow up to 10 redirects

/**
 * Custom HTTP request handler that supports 'information' events for 1xx codes.
 * This fulfills the "Real-time Industry Standard" for uptime checkers.
 */
/**
 * Make a single HTTP/HTTPS request. Does NOT follow redirects.
 * Returns { status, headers, data, isInformational }
 */
const makeSingleRequest = async (url, timeout, allowUnauthorized) => {
    const parsedUrl = new URL(url);

    // 🛡️ SSRF & DNS Rebinding Protection: Resolve hostname securely BEFORE connecting
    const { address, family } = await resolveSecurely(parsedUrl.hostname);

    return new Promise((resolve, reject) => {
        const protocol = parsedUrl.protocol === 'https:' ? https : http;

        const options = {
            method: 'GET',
            hostname: address, // 🛡️ Connect directly to IP to prevent DNS Rebinding
            port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            timeout: timeout,
            family: family, // Use the family from the secure resolver
            headers: {
                'Host': parsedUrl.hostname, // 🛡️ Maintain original Host header
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Connection': 'close'
            },
            rejectUnauthorized: allowUnauthorized === true ? false : true,
            // 🛡️ SNI (Server Name Indication) is essential when connecting by IP
            servername: parsedUrl.hostname
        };

        const req = protocol.request(options);
        let isDone = false;

        req.end(); // We can end immediately as we don't send a body in GET

        req.on('response', (res) => {
            if (isDone) return;
            let data = '';
            let hasLoggedCap = false;
            res.on('data', chunk => {
                if (isDone) return;
                if (data.length + chunk.length > MAX_BODY_SIZE) {
                    const remaining = MAX_BODY_SIZE - data.length;
                    if (remaining > 0) data += chunk.slice(0, remaining);
                    if (!hasLoggedCap) {
                        console.warn(`[HTTP] Response body capped at ${MAX_BODY_SIZE} bytes`);
                        hasLoggedCap = true;
                    }
                } else {
                    data += chunk;
                }
            });
            res.on('end', () => {
                if (isDone) return;
                isDone = true;
                resolve({ status: res.statusCode, headers: res.headers, data });
            });
            res.on('error', (err) => { if (!isDone) { isDone = true; reject(err); } });
        });

        req.on('information', (info) => {
            if (isDone) return;
            if (info.statusCode >= 100 && info.statusCode < 200) {
                isDone = true;
                req.destroy();
                resolve({ status: info.statusCode, headers: info.headers, data: '', isInformational: true });
            }
        });

        req.on('timeout', () => { if (!isDone) { isDone = true; req.destroy(); reject(new Error('timeout')); } });

        req.on('error', (err) => {
            if (isDone) return;
            isDone = true;
            req.destroy();
            if (err.code === 'UNABLE_TO_GET_ISSUER_CERT' || err.code === 'CERT_HAS_EXPIRED' ||
                err.code === 'DEPTH_ZERO_SELF_SIGNED_CERT' || err.code === 'CERT_CHAIN_ERROR') {
                console.warn(`[SSL-DIAG] ${err.code} for ${url}`);
            }
            reject(err);
        });
    });
};

/**
 * Industry-standard HTTP request with automatic redirect following.
 * Follows up to MAX_REDIRECTS hops (matching Pingdom / UptimeRobot / Site24x7 behaviour).
 * Records the redirect chain so callers can detect redirect loops.
 */
const performRequest = async (monitor, timeout) => {
    let currentUrl = monitor.url;
    let redirectCount = 0;
    const visitedUrls = new Set();

    while (true) {
        // Detect redirect loops
        if (visitedUrls.has(currentUrl)) {
            const err = new Error(`Redirect loop detected after ${redirectCount} hops`);
            err.code = 'REDIRECT_LOOP';
            err.redirectCount = redirectCount;
            throw err;
        }
        if (redirectCount > MAX_REDIRECTS) {
            const err = new Error(`Too many redirects (${redirectCount})`);
            err.code = 'REDIRECT_LOOP';
            err.redirectCount = redirectCount;
            throw err;
        }

        visitedUrls.add(currentUrl);

        const response = await makeSingleRequest(currentUrl, timeout, monitor.allowUnauthorized);

        const isRedirect = response.status >= 300 && response.status < 400 && response.headers?.location;

        if (!isRedirect || response.isInformational) {
            // Final response (not a redirect, or 1xx informational)
            // Attach redirect metadata for logging/debugging
            response.redirectCount = redirectCount;
            response.finalUrl = currentUrl;
            return response;
        }

        // Follow the redirect
        const location = response.headers.location;
        redirectCount++;

        try {
            // Handle relative redirects (e.g. /login  or //example.com/path)
            currentUrl = new URL(location, currentUrl).toString();
        } catch {
            // Malformed Location header — return what we have
            response.redirectCount = redirectCount;
            response.finalUrl = currentUrl;
            return response;
        }

        console.log(`[HTTP] Redirect ${redirectCount}: ${monitor.url} → ${currentUrl} (${response.status})`);
    }
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
        // Ensure monitor is a plain object if it's a Mongoose document to support spread
        const monitorObj = typeof monitor.toObject === 'function' ? monitor.toObject() : monitor;
        const monitorWithProtocol = { ...monitorObj, url: urlToUse };
        const response = await performRequest(monitorWithProtocol, timeout);

        const localResponseTime = Date.now() - result.checkStartTime;
        result.statusCode = response.status;

        const degradedThresholdMs = monitor.degradedThresholdMs || 2000;

        // Use our advanced classifier
        const classification = classifyHttpResponse(response.status, localResponseTime, {
            latencyThreshold: degradedThresholdMs,
            timeout: timeout
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

        console.log(`[HTTP] ${monitor.url} ${response.status} | Status: ${result.healthState} | ${localResponseTime}ms`);

    } catch (error) {
        const latency = Date.now() - result.checkStartTime;

        // Handle actual connection errors
        result.errorType = detectErrorType(error, monitor.type, null);
        result.errorMessage = formatErrorMessage(error, monitor.type);

        const healthStateResult = determineHealthStateFromError(result.errorType, null, monitor.type, latency, monitor);

        result.healthState = healthStateResult.healthState;
        // Connection errors are DOWN. Only allow isUp=true if error classifier
        // explicitly returns DEGRADED (e.g. SSL chain warning, slow-but-connected).
        // Network failures (ECONNRESET, DNS, ECONNREFUSED, etc.) must be DOWN.
        const networkErrors = ['TIMEOUT', 'DNS_ERROR', 'CONNECTION_REFUSED', 'ECONNABORTED',
            'CONNECTION_RESET', 'ECONNRESET', 'ENOTFOUND', 'EHOSTUNREACH',
            'ENETUNREACH', 'INVALID_URL', 'REDIRECT_LOOP'];
        if (networkErrors.includes(result.errorType)) {
            result.healthState = 'DOWN';
            result.isUp = false;
        } else {
            result.isUp = result.healthState === 'UP' || result.healthState === 'DEGRADED';
        }
        result.responseTime = latency;

        console.log(`[HTTP] ${monitor.url} ERROR | Status: ${result.healthState} | ${result.errorType} | ${result.errorMessage}`);

        throw error;
    }
};
