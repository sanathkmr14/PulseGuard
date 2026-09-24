import http from 'http';
import https from 'https';
import rfc5280 from 'asn1.js-rfc5280';
import redisCache from '../config/redis-cache.js';

// In-memory L1 cache to avoid downloading/decoding CRLs repeatedly within short timeframes
const l1Cache = new Map();
const CRL_CACHE_TTL_SECONDS = 3600; // 1 hour

/**
 * Extract CRL Distribution Point URI from raw X.509 certificate buffer
 * @param {Buffer} certRaw - Raw DER certificate buffer
 * @returns {string|null} - CRL URL or null if not found
 */
export const extractCrlUrl = (certRaw) => {
    if (!certRaw || !Buffer.isBuffer(certRaw)) return null;
    try {
        const str = certRaw.toString('binary');
        const match = str.match(/https?:\/\/[^\x00-\x1f\x7f-\xff\s"']+\.crl/i);
        return match ? match[0] : null;
    } catch {
        return null;
    }
};

/**
 * Fetch CRL binary data over HTTP/HTTPS with timeout and multi-tier caching
 * @param {string} url - CRL URL
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<Buffer>} - Raw CRL buffer
 */
const fetchCrlBuffer = async (url, timeoutMs = 5000) => {
    const now = Date.now();

    // 1. Check Memory L1 Cache
    const memCached = l1Cache.get(url);
    if (memCached && memCached.expiresAt > now) {
        return memCached.buffer;
    }

    // 2. Check Redis L2 Cache
    const redisKey = `crl:cache:${url}`;
    try {
        if (redisCache?.get) {
            const cachedHex = await redisCache.get(redisKey);
            if (cachedHex) {
                const buf = Buffer.from(cachedHex, 'hex');
                l1Cache.set(url, { buffer: buf, expiresAt: now + (CRL_CACHE_TTL_SECONDS * 1000) });
                return buf;
            }
        }
    } catch (redisErr) {
        console.warn(`[CRL] Redis cache read failed for ${url}:`, redisErr.message);
    }

    // 3. Network Fetch
    const buffer = await new Promise((resolve, reject) => {
        const client = url.startsWith('https:') ? https : http;
        const req = client.get(url, (res) => {
            if (res.statusCode < 200 || res.statusCode >= 300) {
                return reject(new Error(`HTTP ${res.statusCode} fetching CRL from ${url}`));
            }
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        });

        req.on('error', reject);
        req.setTimeout(timeoutMs, () => {
            req.destroy();
            reject(new Error(`CRL fetch timed out (${timeoutMs}ms) for ${url}`));
        });
    });

    // Populate L1 & L2 caches
    l1Cache.set(url, { buffer, expiresAt: now + (CRL_CACHE_TTL_SECONDS * 1000) });
    try {
        if (redisCache?.set) {
            await redisCache.set(redisKey, buffer.toString('hex'), 'EX', CRL_CACHE_TTL_SECONDS);
        }
    } catch (redisSetErr) {
        console.warn(`[CRL] Redis cache write failed for ${url}:`, redisSetErr.message);
    }

    return buffer;
};

/**
 * Check if an SSL certificate is revoked by checking its CRL distribution point
 * @param {Buffer} certRaw - Raw DER certificate buffer
 * @param {string} serialNumber - Certificate serial number in hex
 * @param {number} timeoutMs - Timeout for CRL check in ms
 * @returns {Promise<Object>} - { revoked: boolean, status: string, message: string, reason?: string, revocationDate?: Date }
 */
export const checkCrlRevocation = async (certRaw, serialNumber, timeoutMs = 5000) => {
    try {
        if (!certRaw || !serialNumber) {
            return {
                revoked: false,
                status: 'no_data',
                message: 'No certificate raw buffer or serial number provided for CRL check'
            };
        }

        const crlUrl = extractCrlUrl(certRaw);
        if (!crlUrl) {
            return {
                revoked: false,
                status: 'no_crl_url',
                message: 'No CRL distribution point found in certificate extensions'
            };
        }

        console.log(`[CRL] Checking CRL distribution point: ${crlUrl}`);
        const crlBuf = await fetchCrlBuffer(crlUrl, timeoutMs);
        const crl = rfc5280.CertificateList.decode(crlBuf, 'der');
        const revokedList = crl?.tbsCertList?.revokedCertificates || [];

        // Normalize target serial (remove colons/spaces, strip leading zeros, lowercase)
        const targetSerial = String(serialNumber).replace(/[:\s]/g, '').replace(/^0+/, '').toLowerCase();

        const matched = revokedList.find(entry => {
            if (!entry?.userCertificate) return false;
            const entrySerial = entry.userCertificate.toString('hex').toLowerCase();
            return entrySerial === targetSerial;
        });

        if (matched) {
            let revDate = null;
            if (matched.revocationDate?.value) {
                revDate = new Date(matched.revocationDate.value);
            }

            let reason = 'Key Compromise';
            if (Array.isArray(matched.crlEntryExtensions)) {
                const reasonExt = matched.crlEntryExtensions.find(e => e.extnID === 'reasonCode');
                if (reasonExt?.extnValue) {
                    reason = String(reasonExt.extnValue);
                }
            }

            console.warn(`[CRL] ⚠️ CERTIFICATE REVOKED in CRL: Serial ${serialNumber} (Reason: ${reason})`);

            return {
                revoked: true,
                status: 'revoked',
                reason: reason,
                revocationDate: revDate,
                message: `Certificate has been revoked by issuing authority via CRL (Reason: ${reason}${revDate ? `, Date: ${revDate.toISOString()}` : ''})`
            };
        }

        return {
            revoked: false,
            status: 'good',
            message: 'Certificate is not listed in CRL'
        };

    } catch (error) {
        console.warn(`[CRL] CRL check skipped:`, error.message);
        // Soft-fail: Do not treat CRL errors or network hiccups as revoked to prevent false positives
        return {
            revoked: false,
            status: 'error',
            message: `CRL check skipped: ${error.message}`
        };
    }
};
