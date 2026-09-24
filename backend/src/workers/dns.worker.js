import dns from 'dns';
import { promisify } from 'util';
import { isPrivateIP } from '../utils/url-validator.js';

const resolve4 = promisify(dns.resolve4);
const resolve6 = promisify(dns.resolve6);

export const checkDns = async (monitor, result, options = {}) => {
    const {
        detectErrorType,
        formatErrorMessage,
        determineHealthStateFromError
    } = options;

    // Respect monitor's configured timeout
    const timeout = monitor.timeout || 30000;

    // Validate domain is not empty
    if (!monitor.url || monitor.url.trim() === '') {
        result.healthState = 'DOWN';
        result.isUp = false;
        result.errorType = 'DNS_NOT_FOUND';
        result.errorMessage = 'Empty domain name provided';
        result.responseTime = 0;
        console.log(`🌐 DNS [empty] ❌ DOWN - Empty domain name`);
        return result;
    }

    // Auto-clean: remove protocol and path if present
    let urlInput = monitor.url.trim();
    urlInput = urlInput.replace(/^[a-zA-Z]+:\/\//, ''); // Strip any protocol schema (e.g. dns://)
    urlInput = urlInput.split('/')[0].split('?')[0]; // Remove path/query

    // Check for IP:port format (common user mistake) — BEFORE stripping port
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+$/.test(urlInput)) {
        result.healthState = 'DOWN';
        result.isUp = false;
        result.errorType = 'INVALID_INPUT';
        result.errorMessage = `Invalid format: "${urlInput}". DNS monitor expects a hostname to resolve (e.g., "google.com"), not a DNS server address. Use UDP or TCP monitor to test DNS server availability.`;
        result.responseTime = 0;
        console.log(`🌐 DNS [${urlInput}] ❌ DOWN - Invalid IP:port format`);
        return result;
    }

    // Handle [IPv6] / [IPv6]:port bracket notation
    if (urlInput.startsWith('[')) {
        const closeIdx = urlInput.indexOf(']');
        if (closeIdx !== -1) {
            urlInput = urlInput.slice(1, closeIdx);
        } else {
            urlInput = urlInput.replace(/[\[\]]/g, '');
        }
    } else if (/:/.test(urlInput) && !/^\d{1,3}(\.\d{1,3}){3}$/.test(urlInput)) {
        // Contains colons: could be IPv6 or hostname:port.
        // Only strip a single :port suffix (host:port); leave bare IPv6 intact.
        const lastColon = urlInput.lastIndexOf(':');
        const after = urlInput.slice(lastColon + 1);
        const before = urlInput.slice(0, lastColon);
        if (/^\d+$/.test(after) && !before.includes(':')) {
            urlInput = before;
        }
    } else {
        urlInput = urlInput.split(':')[0]; // Remove port if present (IPv4/hostname)
    }

    // Check for IP address without port (also likely a mistake)
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(urlInput)) {
        result.healthState = 'DOWN';
        result.isUp = false;
        result.errorType = 'INVALID_INPUT';
        result.errorMessage = `Invalid format: "${urlInput}". DNS monitor expects a hostname to resolve (e.g., "google.com"), not an IP address.`;
        result.responseTime = 0;
        console.log(`🌐 DNS [${urlInput}] ❌ DOWN - Invalid IP format`);
        return result;
    }

    return new Promise((resolve) => {
        const startTime = Date.now();
        let isDone = false;
        const timer = setTimeout(() => {
            if (isDone) return;
            isDone = true;
            const err = new Error(`DNS lookup timed out after ${timeout}ms`);
            result.errorType = detectErrorType ? detectErrorType(err, 'DNS', null) : 'TIMEOUT';
            result.errorMessage = formatErrorMessage ? formatErrorMessage(err, 'DNS') : err.message;
            const responseTime = Date.now() - startTime;
            result.responseTime = responseTime;
            if (determineHealthStateFromError) {
                const hsr = determineHealthStateFromError(result.errorType, null, 'DNS', responseTime, monitor);
                result.healthState = hsr.healthState;
            } else {
                result.healthState = 'DOWN';
            }
            result.isUp = result.healthState === 'UP' || result.healthState === 'DEGRADED';
            console.log(`🌐 DNS [${monitor.url}] ❌ ${result.healthState} - TIMEOUT | Message: ${result.errorMessage} | ErrorType: ${result.errorType}`);
            resolve(result);
        }, timeout);

        const performQuery = async () => {
            let addresses;
            let family = 4;

            try {
                addresses = await resolve4(urlInput);
            } catch (err4) {
                // If IPv4 lookup returned ENODATA or NODATA, fall back to resolve6 (IPv6 AAAA)
                if (err4.code === 'ENODATA' || err4.code === 'NODATA') {
                    try {
                        addresses = await resolve6(urlInput);
                        family = 6;
                    } catch (err6) {
                        throw err4; // Report original error if resolve6 also fails
                    }
                } else {
                    throw err4;
                }
            }

            return { addresses, family };
        };

        performQuery().then(({ addresses, family }) => {
            clearTimeout(timer);
            if (isDone) return;
            isDone = true;
            const responseTime = Date.now() - startTime;
            result.responseTime = responseTime;

            const address = addresses[0];

            // 🛡️ SSRF Protection: Block resolution if ANY resolved IP is private
            for (const addr of addresses) {
                const ipCheck = isPrivateIP(addr);
                if (ipCheck.isPrivate) {
                    const securityErr = new Error(`SSRF_PROTECTION: Hostname "${urlInput}" resolved to restricted IP ${addr} (${ipCheck.error})`);
                    result.errorType = 'SSRF_BLOCKED';
                    result.errorMessage = securityErr.message;
                    result.healthState = 'DOWN';
                    result.isUp = false;
                    console.warn(`🛡️ DNS SSRF Blocked: ${urlInput} → ${addr}`);
                    resolve(result);
                    return;
                }
            }

            // Populate top-level fields for API contracts and tests
            result.addresses = addresses;
            result.address = address;

            const degradedThreshold = monitor.degradedThresholdMs || 2000;
            if (responseTime > degradedThreshold) {
                result.healthState = 'DEGRADED';
                result.isUp = true;
                result.errorType = 'SLOW_RESPONSE';
                result.errorMessage = `Slow DNS resolution: ${responseTime}ms`;
                if (!result.meta) result.meta = {};
                result.meta.address = address;
                result.meta.family = family;
                console.log(`🌐 DNS [${monitor.url}] ⚠️ DEGRADED - Slow resolution | Resolved to ${address} | ResponseTime: ${responseTime}ms (threshold: ${degradedThreshold}ms)`);
            } else {
                result.healthState = 'UP';
                result.isUp = true;
                result.errorType = null;
                result.errorMessage = null;
                if (!result.meta) result.meta = {};
                result.meta.address = address;
                result.meta.family = family;
                console.log(`🌐 DNS [${monitor.url}] ✅ UP - Resolved to ${address} | Family: IPv${family} | ResponseTime: ${responseTime}ms`);
            }
            resolve(result);
        }).catch((err) => {
            clearTimeout(timer);
            if (isDone) return;
            isDone = true;
            const responseTime = Date.now() - startTime;
            result.responseTime = responseTime;

            // Map ECONNREFUSED on port 53 to DNS_SERVER_FAILURE
            if (err.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) {
                result.errorType = 'DNS_SERVER_FAILURE';
            } else {
                result.errorType = detectErrorType ? detectErrorType(err, 'DNS', null) : 'DNS_ERROR';
            }

            result.errorMessage = formatErrorMessage ? formatErrorMessage(err, 'DNS') : err.message;
            if (determineHealthStateFromError) {
                const hsr = determineHealthStateFromError(result.errorType, null, 'DNS', responseTime, monitor);
                result.healthState = hsr.healthState;
            } else {
                result.healthState = 'DOWN';
            }
            result.isUp = result.healthState === 'UP' || result.healthState === 'DEGRADED';
            console.log(`🌐 DNS [${monitor.url}] ❌ Resolution Failed | Message: ${result.errorMessage} | ErrorType: ${result.errorType}`);
            resolve(result);
        });
    });
};

export default {
    checkDns
};
