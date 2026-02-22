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
 * @returns {Promise<{address: string, family: number}>} Resolved IP and address family (4 or 6)
 * @throws {Error} If resolution fails or IP is private/blocked
 */
export const resolveSecurely = async (hostname) => {
    try {
        // Resolve all addresses to ensure we catch any hidden private IPs
        const addresses = await lookupAsync(hostname, { all: true, verbatim: true });

        if (!addresses || addresses.length === 0) {
            throw new Error(`ENOTFOUND: Could not resolve hostname "${hostname}"`);
        }

        // Check if ANY of the resolved IPs are private/blocked
        // We block the entire hostname if it resolves even partially to a private IP
        for (const addr of addresses) {
            const check = isPrivateIP(addr.address);
            if (check.isPrivate) {
                console.warn(`🛡️ SSRF Blocked: Hostname "${hostname}" resolved to private IP ${addr.address} (${check.error})`);
                throw new Error(`SSRF_PROTECTION: Access to private/internal IP address "${addr.address}" is blocked.`);
            }
        }

        // Return the first valid address (prioritizing the order from dns.lookup)
        return {
            address: addresses[0].address,
            family: addresses[0].family
        };
    } catch (err) {
        // Preserving original error code if it's a DNS failure
        if (err.code === 'ENOTFOUND' || err.message.includes('EAI_AGAIN')) {
            throw err;
        }

        // Wrap other errors in security context if not already
        if (!err.message.includes('SSRF_PROTECTION')) {
            throw new Error(`RESOLVER_ERROR: ${err.message}`);
        }

        throw err;
    }
};

export default {
    resolveSecurely
};
