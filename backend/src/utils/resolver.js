import dns from 'dns';
import { promisify } from 'util';
import { isPrivateIP } from './url-validator.js';

const lookupAsync = promisify(dns.lookup);

/**
 * Secure DNS Resolver
 * 
 * Performs DNS resolution and enforces SSRF protection by blocking 
 * private, loopback, and metadata IP addresses.
 * 
 * @param {string} hostname - The hostname to resolve
 * @param {Object} [options] - Resolution options
 * @param {boolean} [options.preferIpv4] - Prioritize IPv4 when dual-stack
 * @returns {Promise<{address: string, family: number}>} Resolved IP and address family (4 or 6)
 * @throws {Error} If resolution fails or IP is private/blocked
 */
export const resolveSecurely = async (hostname, options = {}) => {
    try {
        const cleanHost = (hostname || '').trim().replace(/^\[|\]$/g, '');
        // Resolve all addresses to ensure we catch any hidden private IPs
        const addresses = await lookupAsync(cleanHost, { all: true, verbatim: true });

        if (!addresses || addresses.length === 0) {
            const notFoundErr = new Error(`ENOTFOUND: Could not resolve hostname "${hostname}"`);
            notFoundErr.code = 'ENOTFOUND';
            throw notFoundErr;
        }

        // Check if ANY of the resolved IPs are private/blocked
        // We block the entire hostname if it resolves even partially to a private IP
        for (const addr of addresses) {
            const check = isPrivateIP(addr.address);
            if (check.isPrivate) {
                console.warn(`🛡️ SSRF Blocked: Hostname "${hostname}" resolved to private IP ${addr.address} (${check.error})`);
                const ssrfErr = new Error(`SSRF_PROTECTION: Access to private/internal IP address "${addr.address}" is blocked.`);
                ssrfErr.code = 'SSRF_BLOCKED';
                throw ssrfErr;
            }
        }

        let sortedAddresses = [...addresses];
        if (options.preferIpv4) {
            sortedAddresses.sort((a, b) => {
                if (a.family === 4 && b.family !== 4) return -1;
                if (a.family !== 4 && b.family === 4) return 1;
                return 0;
            });
        }

        // Return the selected valid address
        return {
            address: sortedAddresses[0].address,
            family: sortedAddresses[0].family
        };
    } catch (err) {
        // Preserving original error code if it's a DNS failure
        if (err.code === 'ENOTFOUND' || err.message.includes('EAI_AGAIN')) {
            throw err;
        }

        // Preserving SSRF_BLOCKED error code
        if (err.code === 'SSRF_BLOCKED' || err.message.includes('SSRF_PROTECTION')) {
            if (!err.code) err.code = 'SSRF_BLOCKED';
            throw err;
        }

        // Wrap other errors in security context if not already
        throw new Error(`RESOLVER_ERROR: ${err.message}`);
    }
};

export default {
    resolveSecurely
};
