import path from 'path';
import { fileURLToPath } from 'url';
import { checkHttp } from '../workers/http.worker.js';
import { checkHttps } from '../workers/https.worker.js';
import { checkTcp } from '../workers/tcp.worker.js';
import { checkUdp } from '../workers/udp.worker.js';
import { checkDns } from '../workers/dns.worker.js';
import { checkSmtp } from '../workers/smtp.worker.js';
import { checkSsl } from '../workers/ssl.worker.js';
import { checkPing } from '../workers/ping.worker.js';

// Import comprehensive error classification and HTTP status code systems
// These will be loaded dynamically to avoid circular dependencies
let comprehensiveSystemLoaded = false;
let getStatusCodeCategory, shouldTreatAsUp, shouldTreatAsDown, shouldTreatAsDegraded;
let detectErrorType, determineHealthStateFromError, formatErrorMessage;

async function loadComprehensiveSystem() {
    if (comprehensiveSystemLoaded) return;

    try {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const httpStatusCodesPath = path.join(__dirname, '../utils/http-status-codes.js');
        const errorClassificationsPath = path.join(__dirname, '../utils/error-classifications.js');

        const httpStatusModule = await import(httpStatusCodesPath);
        getStatusCodeCategory = httpStatusModule.getStatusCodeCategory;
        shouldTreatAsUp = httpStatusModule.shouldTreatAsUp;
        shouldTreatAsDown = httpStatusModule.shouldTreatAsDown;
        shouldTreatAsDegraded = httpStatusModule.shouldTreatAsDegraded;

        const errorModule = await import(errorClassificationsPath);
        detectErrorType = errorModule.detectErrorType;
        determineHealthStateFromError = errorModule.determineHealthStateFromError;
        formatErrorMessage = errorModule.formatErrorMessage;

        comprehensiveSystemLoaded = true;
        console.log('✅ Comprehensive error classification system loaded');
    } catch (error) {
        console.warn('Could not import comprehensive error classification system. Using fallback logic.');
        // Fallback functions
        getStatusCodeCategory = (code) => code >= 500 ? 'SERVER_ERROR' : code >= 400 ? 'CLIENT_ERROR' : 'SUCCESS';
        shouldTreatAsUp = (code) => code >= 200 && code < 400;
        shouldTreatAsDown = (code) => code >= 400;
        shouldTreatAsDegraded = (code) => [400, 401, 403, 404, 408, 429].includes(code);
        detectErrorType = (error) => error.message?.includes('timeout') ? 'TIMEOUT' : 'UNKNOWN_ERROR';
        determineHealthStateFromError = () => ({ healthState: 'DOWN', severity: 0.8 });
        formatErrorMessage = (error) => error.message || 'Unknown error';
        comprehensiveSystemLoaded = true;
    }
}

/**
 * Robust Monitor Runner with Comprehensive Protocol Testing
 */
class MonitorRunner {
    constructor() {
        this.comprehensiveSystemLoaded = false;
    }

    /**
     * Validates URL and returns error details if invalid
     * @param {string} url - The URL to validate
     * @param {string} protocol - Expected protocol (HTTP, HTTPS, etc.)
     * @returns {{valid: boolean, errorType?: string, errorMessage?: string}} - Validation result
     */
    validateUrl(url, protocol) {
        // Check for empty or null URL
        if (!url || (typeof url === 'string' && url.trim() === '')) {
            return {
                valid: false,
                errorType: 'MISSING_TARGET',
                errorMessage: 'DNS Error: No domain name provided.'
            };
        }

        // Check for non-HTTP protocols in HTTP/HTTPS monitors
        const urlLower = url.toLowerCase().trim();

        // For TCP/UDP/DNS/PING, we might just get a hostname (e.g. google.com)
        // If no protocol is present, temporarily add http:// for validation purposes
        // Strip trailing descriptions: "google.com:80 TCP" -> "google.com:80"
        let urlClean = urlLower.split(/\s+/)[0];

        // If no protocol is present, temporarily add http:// for validation purposes
        let urlInternal = urlClean;
        let hasProtocol = urlClean.includes('://');

        if (!hasProtocol) {
            urlInternal = 'http://' + urlClean;
        }

        // Check for triple slash issue: http:///example.com
        const protocolSeparator = '://';
        const protocolIndex = urlInternal.indexOf(protocolSeparator);
        if (protocolIndex !== -1) {
            const afterProtocol = urlInternal.substring(protocolIndex + protocolSeparator.length);
            if (afterProtocol.startsWith('/')) {
                return {
                    valid: false,
                    errorType: 'MALFORMED_STRUCTURE',
                    errorMessage: 'Invalid URL Structure: Missing hostname (Triple slash error).'
                };
            }
        }

        if (protocol.match(/HTTP|HTTPS/) && hasProtocol) {
            if (!urlLower.startsWith('http://') && !urlLower.startsWith('https://')) {
                // Check for other protocols
                const firstColon = urlLower.indexOf(':');
                if (firstColon !== -1) {
                    const proto = urlLower.substring(0, firstColon);
                    if (proto !== 'http' && proto !== 'https') {
                        return {
                            valid: false,
                            errorType: 'PROTOCOL_MISMATCH',
                            errorMessage: `Protocol Mismatch: Expected HTTP/S but received ${proto}://.`
                        };
                    }
                }
            }
        }

        // Try to parse the URL
        let parsedUrl;
        try {
            parsedUrl = new URL(urlInternal);
        } catch (urlError) {
            console.error(`[Runner] URL Validation Failed for input: '${url}' (As: '${urlInternal}') - Error: ${urlError.message}`);
            return {
                valid: false,
                errorType: 'INVALID_URL',
                errorMessage: `Malformed URL: ${urlError.message} (Input: ${url})`
            };
        }

        // Check for empty hostname
        if (!parsedUrl.hostname || parsedUrl.hostname === '') {
            return {
                valid: false,
                errorType: 'INVALID_URL',
                errorMessage: 'Invalid URL Structure: Missing hostname.'
            };
        }

        // Check for special characters
        const hostname = parsedUrl.hostname;
        const invalidChars = /[<>\[\]|}\\{^`\\]/;
        if (invalidChars.test(hostname)) {
            return {
                valid: false,
                errorType: 'INVALID_URL',
                errorMessage: 'Malformed URL: Hostname contains invalid characters.'
            };
        }

        return { valid: true };
    }

    async run(monitor) {
        const startTime = Date.now();
        const result = {
            isUp: false,
            responseTime: 0,
            statusCode: null,
            errorType: null,
            errorMessage: null,
            healthState: 'UNKNOWN',
            meta: {} // Initialize meta to prevent null reference errors
        };

        if (!this.comprehensiveSystemLoaded) {
            await loadComprehensiveSystem();
            this.comprehensiveSystemLoaded = true;
        }

        // Shared options for workers
        const workerOptions = {
            getStatusCodeCategory,
            shouldTreatAsUp,
            shouldTreatAsDown,
            shouldTreatAsDegraded,
            detectErrorType,
            determineHealthStateFromError,
            formatErrorMessage,
            parseUrl: this.parseUrl.bind(this)
        };

        // Pre-validation for ALL monitors
        // This prevents malformed inputs from reaching workers
        const validation = this.validateUrl(monitor.url, monitor.type);
        if (!validation.valid) {
            result.healthState = 'DOWN';
            result.isUp = false;
            result.errorType = validation.errorType;
            result.errorMessage = validation.errorMessage;
            result.responseTime = Date.now() - startTime;
            return result;
        }

        try {
            switch (monitor.type.toUpperCase()) {
                case 'HTTP':
                    await checkHttp(monitor, result, workerOptions);
                    break;
                case 'HTTPS':
                    await checkHttps(monitor, result, workerOptions);
                    break;
                case 'TCP':
                    await checkTcp(monitor, result, workerOptions);
                    break;
                case 'UDP':
                    await checkUdp(monitor, result, workerOptions);
                    break;
                case 'DNS':
                    await checkDns(monitor, result, workerOptions);
                    break;
                case 'SMTP':
                    await checkSmtp(monitor, result, workerOptions);
                    break;
                case 'SSL':
                    await checkSsl(monitor, result, workerOptions);
                    break;
                case 'PING':
                    await checkPing(monitor, result, workerOptions);
                    break;
                default:
                    throw new Error(`Unsupported monitor type: ${monitor.type}`);
            }
        } catch (error) {
            // Error handling already mostly handled inside workers, but as a fallback:
            if (result.healthState === 'UNKNOWN') {
                result.errorType = detectErrorType(error, monitor.type, null);
                result.errorMessage = formatErrorMessage(error, monitor.type);
                // Fix: Pass arguments in correct order matching function signature
                const hsr = determineHealthStateFromError(result.errorType, null, monitor.type, Date.now() - startTime, monitor);
                result.healthState = hsr.healthState;
                result.isUp = result.healthState === 'UP' || result.healthState === 'DEGRADED';
            }
        } finally {
            // FIX: Only set responseTime if worker didn't set it (fallback)
            // Workers like PING parse actual RTT from output, don't override with command execution time
            if (result.responseTime === 0 || result.responseTime === undefined) {
                result.responseTime = Date.now() - startTime;
            }
        }

        return result;
    }

    parseUrl(rawUrl, defaultPort) {
        let urlStr = rawUrl.trim();
        // Ensure protocol for URL parsing
        if (!urlStr.match(/^[a-zA-Z]+:\/\//)) {
            urlStr = 'http://' + urlStr;
        }

        try {
            const parsed = new URL(urlStr);
            // Determine default port based on protocol if not provided
            let finalDefaultPort = defaultPort || 80;
            if (!defaultPort) {
                if (parsed.protocol === 'https:') finalDefaultPort = 443;
                if (parsed.protocol === 'ftp:') finalDefaultPort = 21;
            }

            return {
                hostname: parsed.hostname,
                port: parsed.port ? parseInt(parsed.port, 10) : finalDefaultPort,
                protocol: parsed.protocol,
                path: parsed.pathname + parsed.search
            };
        } catch (e) {
            // Fallback for simple cases if URL parse fails
            let hostname = rawUrl.replace(/^[a-zA-Z]+:\/\//, '').split('/')[0].split('?')[0];
            let port = defaultPort || 80;

            if (hostname.includes(':')) {
                const parts = hostname.split(':');
                hostname = parts[0];
                port = parseInt(parts[1], 10);
            }
            // Fallback object with minimal fields
            return { hostname, port, protocol: 'http:', path: '/' };
        }
    }
}

export default new MonitorRunner();
