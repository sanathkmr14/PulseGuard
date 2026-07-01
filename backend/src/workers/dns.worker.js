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

    // FIXED: Respect monitor's configured timeout
    const timeout = monitor.timeout || 30000; // Default 30s

    // Validate domain is not empty
    if (!monitor.url || monitor.url.trim() === '') {
        result.healthState = 'DOWN';
        result.isUp = false;
        result.errorType = 'DNS_NOT_FOUND';
        result.errorMessage = 'Empty domain name provided';
        result.responseTime = 0;
        console.log(`🌐 DNS [empty] ❌ DOWN - Empty domain name`);
        return Promise.reject(new Error('Empty domain name'));
    }

    // Validate: DNS monitor expects hostname, not IP:port format
    // Auto-clean: remove protocol and path if present
    let urlInput = monitor.url.trim();
    urlInput = urlInput.replace(/^(https?|tcp|udp|ssl):\/\//, ''); // Remove protocol
    urlInput = urlInput.split('/')[0]; // Remove path
    urlInput = urlInput.split(':')[0]; // Remove port if present (dns.lookup doesn't want ports)

    // Check for IP:port format (common user mistake)
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+$/.test(urlInput)) {
        result.healthState = 'DOWN';
        result.isUp = false;
        result.errorType = 'INVALID_INPUT';
        result.errorMessage = `Invalid format: "${urlInput}". DNS monitor expects a hostname to resolve (e.g., "google.com"), not a DNS server address. Use UDP or TCP monitor to test DNS server availability.`;
        result.responseTime = 0;
        console.log(`🌐 DNS [${urlInput}] ❌ DOWN - Invalid IP:port format`);
        return Promise.reject(new Error(result.errorMessage));
    }

    // Check for IP address without port (also likely a mistake)
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(urlInput)) {
        result.healthState = 'DOWN';
        result.isUp = false;
        result.errorType = 'INVALID_INPUT';
        result.errorMessage = `Invalid format: "${urlInput}". DNS monitor expects a hostname to resolve (e.g., "google.com"), not an IP address.`;
        result.responseTime = 0;
        console.log(`🌐 DNS [${urlInput}] ❌ DOWN - Invalid IP format`);
        return Promise.reject(new Error(result.errorMessage));
    }

    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        let isDone = false;
        const timer = setTimeout(() => {
            if (isDone) return;
            isDone = true;
            const err = new Error(`DNS lookup timed out after ${timeout}ms`);
            result.errorType = detectErrorType(err, 'DNS', null);
            result.errorMessage = formatErrorMessage(err, 'DNS');
            const responseTime = Date.now() - startTime;
            result.responseTime = responseTime;
            const hsr = determineHealthStateFromError(result.errorType, null, 'DNS', responseTime, monitor);
            result.healthState = hsr.healthState;
            result.isUp = result.healthState === 'UP' || result.healthState === 'DEGRADED';
            console.log(`🌐 DNS [${monitor.url}] ❌ ${result.healthState} - TIMEOUT | Message: ${result.errorMessage} | ErrorType: ${result.errorType}`);
            reject(err);
        }, timeout);

        // FIX: Use dns.resolve4 (real network DNS query) instead of dns.lookup (OS cache/hosts file).
        // dns.lookup() reads from /etc/hosts and OS nscd cache — it does NOT make a network DNS request.
        // dns.resolve4() always queries the configured DNS nameserver, which is what a DNS monitor should do.
        resolve4(urlInput).then((addresses) => {
            clearTimeout(timer);
            if (isDone) return;
            isDone = true;
            const responseTime = Date.now() - startTime;
            result.responseTime = responseTime;

            const address = addresses[0]; // Use first resolved address
            const family = 4; // IPv4

            // 🛡️ SSRF Protection: Block resolution to private IPs
            const ipCheck = isPrivateIP(address);
            if (ipCheck.isPrivate) {
                const securityErr = new Error(`SSRF_PROTECTION: Hostname "${urlInput}" resolved to restricted IP ${address} (${ipCheck.error})`);
                result.errorType = 'SSRF_BLOCKED';
                result.errorMessage = securityErr.message;
                result.healthState = 'DOWN';
                result.isUp = false;
                console.warn(`🛡️ DNS SSRF Blocked: ${urlInput} → ${address}`);
                reject(securityErr);
                return;
            }

            // Check for slow resolution (DEGRADED state)
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
                console.log(`🌐 DNS [${monitor.url}] ✅ UP - Resolved to ${address} | Family: IPv4 | ResponseTime: ${responseTime}ms`);
            }
            resolve(result); // FIX: pass result for consistency
        }).catch((err) => {
            clearTimeout(timer);
            if (isDone) return;
            isDone = true;
            const responseTime = Date.now() - startTime;
            result.responseTime = responseTime;
            result.errorType = detectErrorType(err, 'DNS', null);
            result.errorMessage = formatErrorMessage(err, 'DNS');
            const hsr = determineHealthStateFromError(result.errorType, null, 'DNS', responseTime, monitor);
            result.healthState = hsr.healthState;
            result.isUp = result.healthState === 'UP' || result.healthState === 'DEGRADED';
            console.log(`🌐 DNS [${monitor.url}] ❌ Resolution Failed | Message: ${result.errorMessage} | ErrorType: ${result.errorType}`);
            reject(err);
        });
    });
};
