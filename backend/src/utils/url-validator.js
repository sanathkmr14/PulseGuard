import { URL } from 'url';
import net from 'net';

/**
 * Normalizes an IPv4 string (including decimal integer, hex, octal, shorthand)
 * to a 32-bit unsigned integer and dotted-decimal string.
 * Returns null if not a valid IPv4 representation.
 */
export const normalizeIPv4 = (str) => {
    if (typeof str !== 'string') return null;
    str = str.trim();
    if (!str) return null;

    const parts = str.split('.');
    if (parts.length > 4) return null;

    const parsedParts = [];
    for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        let num;
        if (/^0x[0-9a-fA-F]+$/i.test(p)) {
            num = parseInt(p, 16);
        } else if (/^0[0-7]+$/.test(p)) {
            num = parseInt(p, 8);
        } else if (/^\d+$/.test(p)) {
            num = parseInt(p, 10);
        } else {
            return null;
        }
        if (isNaN(num) || num < 0) return null;
        parsedParts.push(num);
    }

    let ipNum = 0;
    if (parsedParts.length === 1) {
        if (parsedParts[0] > 0xffffffff) return null;
        ipNum = parsedParts[0] >>> 0;
    } else if (parsedParts.length === 2) {
        if (parsedParts[0] > 255 || parsedParts[1] > 0xffffff) return null;
        ipNum = ((parsedParts[0] << 24) | parsedParts[1]) >>> 0;
    } else if (parsedParts.length === 3) {
        if (parsedParts[0] > 255 || parsedParts[1] > 255 || parsedParts[2] > 0xffff) return null;
        ipNum = ((parsedParts[0] << 24) | (parsedParts[1] << 16) | parsedParts[2]) >>> 0;
    } else if (parsedParts.length === 4) {
        if (parsedParts.some(p => p > 255)) return null;
        ipNum = ((parsedParts[0] << 24) | (parsedParts[1] << 16) | (parsedParts[2] << 8) | parsedParts[3]) >>> 0;
    }

    const o1 = (ipNum >>> 24) & 255;
    const o2 = (ipNum >>> 16) & 255;
    const o3 = (ipNum >>> 8) & 255;
    const o4 = ipNum & 255;
    return { ipNum, dotted: `${o1}.${o2}.${o3}.${o4}` };
};

/**
 * Parses an IPv6 address string into an array of 8 16-bit words.
 * Handles :: shorthand, uncompressed representation, and embedded IPv4.
 * Returns null if invalid IPv6.
 */
export const parseIPv6 = (ipStr) => {
    if (typeof ipStr !== 'string') return null;
    let ip = ipStr.trim().toLowerCase();
    if (!ip) return null;

    // Handle embedded IPv4 (e.g., ::ffff:192.168.1.1 or ::192.168.1.1)
    let ipv4Part = null;
    const lastColon = ip.lastIndexOf(':');
    if (lastColon !== -1 && ip.slice(lastColon + 1).includes('.')) {
        ipv4Part = ip.slice(lastColon + 1);
        ip = ip.slice(0, lastColon);
    }

    let groups = [];
    if (ip.includes('::')) {
        const parts = ip.split('::');
        if (parts.length > 2) return null; // Only one '::' permitted
        const [left, right] = parts;
        const leftGroups = left ? left.split(':') : [];
        const rightGroups = right ? right.split(':') : [];
        const totalExplicit = leftGroups.length + rightGroups.length + (ipv4Part ? 2 : 0);
        if (totalExplicit > 8) return null;
        const missing = 8 - totalExplicit;
        const middle = new Array(Math.max(0, missing)).fill('0');
        groups = [...leftGroups, ...middle, ...rightGroups];
    } else {
        groups = ip.split(':');
    }

    if (ipv4Part) {
        const norm = normalizeIPv4(ipv4Part);
        if (!norm) return null;
        groups.push((norm.ipNum >>> 16).toString(16));
        groups.push((norm.ipNum & 0xffff).toString(16));
    }

    if (groups.length !== 8) return null;
    const words = groups.map(g => parseInt(g, 16));
    if (words.some(w => isNaN(w) || w < 0 || w > 0xffff)) return null;
    return words;
};

/**
 * Checks if a 32-bit IPv4 integer falls into restricted CIDR ranges.
 */
const checkIPv4NumRestricted = (num) => {
    // 0.0.0.0/8 (Unspecified)
    if ((num & 0xFF000000) >>> 0 === 0x00000000) {
        return { isPrivate: true, error: 'Unspecified address (0.0.0.0/8) not allowed' };
    }
    // 10.0.0.0/8 (Private)
    if ((num & 0xFF000000) >>> 0 === 0x0A000000) {
        return { isPrivate: true, error: 'Private network (10.0.0.0/8) not allowed' };
    }
    // 100.64.0.0/10 (Carrier-Grade NAT)
    if ((num & 0xFFC00000) >>> 0 === 0x64400000) {
        return { isPrivate: true, error: 'Carrier-Grade NAT (100.64.0.0/10) not allowed' };
    }
    // 127.0.0.0/8 (Loopback)
    if ((num & 0xFF000000) >>> 0 === 0x7F000000) {
        return { isPrivate: true, error: 'Loopback address (127.0.0.0/8) not allowed' };
    }
    // 169.254.0.0/16 (Link Local / Metadata)
    if ((num & 0xFFFF0000) >>> 0 === 0xA9FE0000) {
        return { isPrivate: true, error: 'Link-local address (169.254.0.0/16) not allowed' };
    }
    // 172.16.0.0/12 (Private)
    if ((num & 0xFFF00000) >>> 0 === 0xAC100000) {
        return { isPrivate: true, error: 'Private network (172.16.0.0/12) not allowed' };
    }
    // 192.0.0.0/24 (IETF Protocol Assignments)
    if ((num & 0xFFFFFF00) >>> 0 === 0xC0000000) {
        return { isPrivate: true, error: 'IETF protocol assignment (192.0.0.0/24) not allowed' };
    }
    // 192.0.2.0/24 (TEST-NET-1)
    if ((num & 0xFFFFFF00) >>> 0 === 0xC0000200) {
        return { isPrivate: true, error: 'Test network (192.0.2.0/24) not allowed' };
    }
    // 192.168.0.0/16 (Private)
    if ((num & 0xFFFF0000) >>> 0 === 0xC0A80000) {
        return { isPrivate: true, error: 'Private network (192.168.0.0/16) not allowed' };
    }
    // 198.18.0.0/15 (Benchmarking)
    if ((num & 0xFFFE0000) >>> 0 === 0xC6120000) {
        return { isPrivate: true, error: 'Benchmarking network (198.18.0.0/15) not allowed' };
    }
    // 198.51.100.0/24 (TEST-NET-2)
    if ((num & 0xFFFFFF00) >>> 0 === 0xC6336400) {
        return { isPrivate: true, error: 'Test network (198.51.100.0/24) not allowed' };
    }
    // 203.0.113.0/24 (TEST-NET-3)
    if ((num & 0xFFFFFF00) >>> 0 === 0xCB007100) {
        return { isPrivate: true, error: 'Test network (203.0.113.0/24) not allowed' };
    }
    // 224.0.0.0/4 (Multicast)
    if ((num & 0xF0000000) >>> 0 === 0xE0000000) {
        return { isPrivate: true, error: 'Multicast address (224.0.0.0/4) not allowed' };
    }
    // 240.0.0.0/4 (Reserved / Broadcast, including 255.255.255.255)
    if ((num & 0xF0000000) >>> 0 === 0xF0000000) {
        return { isPrivate: true, error: 'Reserved / broadcast address (240.0.0.0/4) not allowed' };
    }

    return { isPrivate: false, error: null };
};

/**
 * Checks if an IP address is private, loopback, or otherwise restricted.
 * @param {string} rawIp 
 * @returns {Object} { isPrivate: boolean, error: string|null }
 */
export const isPrivateIP = (rawIp) => {
    // Override: Allow loopback/private IPs ONLY if explicitly enabled via environment variable
    if (process.env.ALLOW_PRIVATE_IPS === 'true') {
        return { isPrivate: false, error: null };
    }

    if (!rawIp || typeof rawIp !== 'string') return { isPrivate: false, error: null };

    // Strip brackets if present (e.g. [::1], [fe80::1])
    let ip = rawIp.trim().replace(/^\[|\]$/g, '');

    // 1. Try IPv6 parsing first
    const v6Words = parseIPv6(ip);
    if (v6Words) {
        // Loopback: ::1 or 0:0:0:0:0:0:0:1
        const isLoopback = v6Words.slice(0, 7).every(w => w === 0) && v6Words[7] === 1;
        if (isLoopback) return { isPrivate: true, error: 'IPv6 loopback not allowed' };

        // Unspecified: :: or 0:0:0:0:0:0:0:0
        const isUnspecified = v6Words.every(w => w === 0);
        if (isUnspecified) return { isPrivate: true, error: 'IPv6 unspecified address not allowed' };

        // Unique Local: fc00::/7 (fc00:: through fdff::)
        if ((v6Words[0] & 0xfe00) === 0xfc00) {
            return { isPrivate: true, error: 'Private IPv6 network (fc00::/7) not allowed' };
        }

        // Link-Local: fe80::/10 (fe80:: through febf::)
        if ((v6Words[0] & 0xffc0) === 0xfe80) {
            return { isPrivate: true, error: 'Link-local IPv6 address (fe80::/10) not allowed' };
        }

        // Site-Local: fec0::/10 (fec0:: through feff::)
        if ((v6Words[0] & 0xffc0) === 0xfec0) {
            return { isPrivate: true, error: 'Site-local IPv6 address (fec0::/10) not allowed' };
        }

        // Documentation: 2001:db8::/32
        if (v6Words[0] === 0x2001 && v6Words[1] === 0x0db8) {
            return { isPrivate: true, error: 'Documentation IPv6 address (2001:db8::/32) not allowed' };
        }

        // IPv4-mapped IPv6: ::ffff:x.x.x.x (words[0..4] === 0, words[5] === 0xffff)
        if (v6Words.slice(0, 5).every(w => w === 0) && v6Words[5] === 0xffff) {
            const v4Num = ((v6Words[6] << 16) | v6Words[7]) >>> 0;
            return checkIPv4NumRestricted(v4Num);
        }

        // IPv4-compatible IPv6: ::x.x.x.x (words[0..5] === 0)
        if (v6Words.slice(0, 6).every(w => w === 0)) {
            const v4Num = ((v6Words[6] << 16) | v6Words[7]) >>> 0;
            return checkIPv4NumRestricted(v4Num);
        }

        // 6to4: 2002::/16
        if (v6Words[0] === 0x2002) {
            const v4Num = ((v6Words[1] << 16) | v6Words[2]) >>> 0;
            const v4Check = checkIPv4NumRestricted(v4Num);
            if (v4Check.isPrivate) return v4Check;
        }

        return { isPrivate: false, error: null };
    }

    // 2. Try IPv4 parsing and normalization
    const v4 = normalizeIPv4(ip);
    if (v4) {
        return checkIPv4NumRestricted(v4.ipNum);
    }

    return { isPrivate: false, error: null };
};

/**
 * Validates a target host or IP for any monitor type (TCP, UDP, PING, DNS, SMTP, SSL).
 * @param {string} target
 * @returns {Object} { isValid: boolean, error: string|null, host: string|null }
 */
export const validateTargetHost = (target) => {
    if (!target || typeof target !== 'string') {
        return { isValid: false, error: 'Target host is required' };
    }

    let host = target.trim();
    if (!host) {
        return { isValid: false, error: 'Target host cannot be empty' };
    }

    // Strip any protocol scheme if present (e.g. tcp://, dns://, smtp://)
    host = host.replace(/^[a-zA-Z]+:\/\//, '');

    // Strip trailing path if present
    host = host.split('/')[0];

    // Handle bracketed IPv6 with optional port [::1]:8080 or [fe80::1]
    if (host.startsWith('[')) {
        const endBracket = host.indexOf(']');
        if (endBracket !== -1) {
            host = host.substring(1, endBracket);
        }
    } else {
        // Strip port if present for IPv4 or hostname
        host = host.split(':')[0];
    }

    if (!host) {
        return { isValid: false, error: 'Invalid target host' };
    }

    const lower = host.toLowerCase();

    // Localhost check
    if (lower === 'localhost' && process.env.ALLOW_PRIVATE_IPS !== 'true') {
        return { isValid: false, error: 'Monitoring localhost is not allowed' };
    }

    // Internal domains check
    if ((lower.endsWith('.local') || lower.endsWith('.internal') || lower.endsWith('.localhost')) &&
        process.env.ALLOW_PRIVATE_IPS !== 'true') {
        return { isValid: false, error: 'Monitoring internal domains is not allowed' };
    }

    // Private / restricted IP check
    const ipCheck = isPrivateIP(host);
    if (ipCheck.isPrivate && process.env.ALLOW_PRIVATE_IPS !== 'true') {
        return { isValid: false, error: `Target IP blocked: ${ipCheck.error}` };
    }

    return { isValid: true, error: null, host };
};

/**
 * Validates a URL to prevent SSRF (Server-Side Request Forgery) attacks.
 * @param {string} urlString The URL to validate
 * @returns {Object} { isValid: boolean, error: string|null, normalizedUrl: string|null }
 */
export const validateMonitorUrl = (urlString) => {
    try {
        if (!urlString || typeof urlString !== 'string') {
            return { isValid: false, error: 'Invalid URL format' };
        }

        // 1. Basic URL parsing
        // Automatically prepend http:// if missing protocol (common user behavior)
        let urlToCheck = urlString.trim();
        if (!urlToCheck.match(/^[a-zA-Z]+:\/\//)) {
            urlToCheck = 'http://' + urlToCheck;
        }

        const parsed = new URL(urlToCheck);

        // 2. Protocol Validation - Only allow HTTP and HTTPS
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return { isValid: false, error: 'Only HTTP and HTTPS protocols are allowed' };
        }

        const hostname = parsed.hostname.toLowerCase();

        // 3. Localhost and Loopback Validation
        if (hostname === 'localhost' && process.env.ALLOW_PRIVATE_IPS !== 'true') {
            return { isValid: false, error: 'Monitoring localhost is not allowed' };
        }

        // 4. IP Address Validation (Block Private Ranges)
        const ipCheck = isPrivateIP(hostname);
        if (ipCheck.isPrivate && process.env.ALLOW_PRIVATE_IPS !== 'true') {
            return { isValid: false, error: `Direct IP monitoring blocked: ${ipCheck.error}` };
        }

        // 5. Hostname Validation (Internal Domains)
        if ((hostname.endsWith('.local') || hostname.endsWith('.internal') || hostname.endsWith('.localhost')) &&
            process.env.ALLOW_PRIVATE_IPS !== 'true') {
            return { isValid: false, error: 'Monitoring internal domains is not allowed' };
        }

        return { isValid: true, error: null, normalizedUrl: urlToCheck };

    } catch (err) {
        return { isValid: false, error: 'Invalid URL format' };
    }
};

export default {
    isPrivateIP,
    normalizeIPv4,
    parseIPv6,
    validateMonitorUrl,
    validateTargetHost
};
