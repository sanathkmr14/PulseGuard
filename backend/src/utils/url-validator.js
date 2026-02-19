import { URL } from 'url';
import net from 'net';

/**
 * Checks if an IP address is private, loopback, or otherwise restricted.
 * @param {string} ip 
 * @returns {Object} { isPrivate: boolean, error: string|null }
 */
export const isPrivateIP = (ip) => {
    if (!net.isIP(ip)) return { isPrivate: false, error: null };

    // IPv4 Checks
    if (net.isIPv4(ip)) {
        // 127.0.0.1
        if (ip === '127.0.0.1') return { isPrivate: true, error: 'Loopback address not allowed' };
        // 10.0.0.0/8
        if (ip.startsWith('10.')) return { isPrivate: true, error: 'Private network (10.0.0.0/8) not allowed' };
        // 192.168.0.0/16
        if (ip.startsWith('192.168.')) return { isPrivate: true, error: 'Private network (192.168.0.0/16) not allowed' };
        // 172.16.0.0/12 (172.16.x.x - 172.31.x.x)
        if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) return { isPrivate: true, error: 'Private network (172.16.0.0/12) not allowed' };
        // 169.254.0.0/16 (Link Local / Metadata)
        if (ip.startsWith('169.254.')) return { isPrivate: true, error: 'Link-local address (169.254.0.0/16) not allowed' };
    }

    // IPv6 Checks
    if (net.isIPv6(ip)) {
        const lowerIp = ip.toLowerCase();
        // ::1
        if (lowerIp === '::1' || lowerIp === '[::1]') return { isPrivate: true, error: 'IPv6 loopback not allowed' };
        // fc00::/7 (Unique Local)
        if (lowerIp.startsWith('fc') || lowerIp.startsWith('fd')) return { isPrivate: true, error: 'Private IPv6 network not allowed' };
        // fe80::/10 (Link Local)
        if (lowerIp.startsWith('fe80')) return { isPrivate: true, error: 'Link-local IPv6 address not allowed' };
    }

    return { isPrivate: false, error: null };
};

/**
 * Validates a URL to prevent SSRF (Server-Side Request Forgery) attacks.
 * @param {string} urlString The URL to validate
 * @returns {Object} { isValid: boolean, error: string|null, normalizedUrl: string|null }
 */
export const validateMonitorUrl = (urlString) => {
    try {
        // 1. Basic URL parsing
        // Automatically prepend http:// if missing protocol (common user behavior)
        let urlToCheck = urlString;
        if (!urlString.match(/^[a-zA-Z]+:\/\//)) {
            urlToCheck = 'http://' + urlString;
        }

        const parsed = new URL(urlToCheck);

        // 2. Protocol Validation
        // Only allow HTTP and HTTPS
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return { isValid: false, error: 'Only HTTP and HTTPS protocols are allowed' };
        }

        const hostname = parsed.hostname.toLowerCase();

        // 3. Localhost and Loopback Validation
        if (hostname === 'localhost') {
            return { isValid: false, error: 'Monitoring localhost is not allowed' };
        }

        // 4. IP Address Validation (Block Private Ranges)
        const ipCheck = isPrivateIP(hostname);
        if (ipCheck.isPrivate) {
            return { isValid: false, error: `Direct IP monitoring blocked: ${ipCheck.error}` };
        }

        // 5. Hostname Validation (Internal Domains)
        if (hostname.endsWith('.local') || hostname.endsWith('.internal') || hostname.endsWith('.localhost')) {
            return { isValid: false, error: 'Monitoring internal domains is not allowed' };
        }

        return { isValid: true, error: null, normalizedUrl: urlToCheck };

    } catch (err) {
        return { isValid: false, error: 'Invalid URL format' };
    }
};
