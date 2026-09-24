import http from 'http';
import https from 'https';
import rfc5280 from 'asn1.js-rfc5280';
import redisCache from '../config/redis-cache.js';

// In-memory L1 cache to avoid downloading/decoding CRLs repeatedly within short timeframes
const l1Cache = new Map();
const CRL_CACHE_TTL_SECONDS = 3600; // 1 hour
const MAX_CRL_DOWNLOAD_BYTES = 512 * 1024; // 512 KB max download size (skips commercial mega-CRLs)
const MAX_CRL_REDIS_BYTES = 64 * 1024; // 64 KB max Redis storage size (never bloats Redis Cloud)

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

    // 2. Check Redis L2 Cache (only cached if small)
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

    // 3. Network Fetch with Strict Size Caps
    const buffer = await new Promise((resolve, reject) => {
        let aborted = false;
        const client = url.startsWith('https:') ? https : http;
        const req = client.get(url, (res) => {
            if (res.statusCode < 200 || res.statusCode >= 300) {
                return reject(new Error(`HTTP ${res.statusCode} fetching CRL from ${url}`));
            }

            // Check Content-Length header if present
            const clHeader = res.headers['content-length'];
            if (clHeader) {
                const len = parseInt(clHeader, 10);
                if (len > MAX_CRL_DOWNLOAD_BYTES) {
                    aborted = true;
                    res.destroy();
                    req.destroy();
                    return reject(new Error(`CRL size (${(len / 1024).toFixed(0)}KB) exceeds safety limit of 512KB`));
                }
            }

            const chunks = [];
            let totalBytes = 0;
            res.on('data', chunk => {
                if (aborted) return;
                totalBytes += chunk.length;
                if (totalBytes > MAX_CRL_DOWNLOAD_BYTES) {
                    aborted = true;
                    res.destroy();
                    req.destroy();
                    return reject(new Error(`CRL stream exceeded safety limit of 512KB`));
                }
                chunks.push(chunk);
            });
            res.on('end', () => {
                if (!aborted) {
                    resolve(Buffer.concat(chunks));
                }
            });
        });

        req.on('error', (err) => {
            if (!aborted) reject(err);
        });

        req.setTimeout(timeoutMs, () => {
            aborted = true;
            req.destroy();
            reject(new Error(`CRL fetch timed out (${timeoutMs}ms) for ${url}`));
        });
    });

    // Populate L1 cache (in-process memory)
    l1Cache.set(url, { buffer, expiresAt: now + (CRL_CACHE_TTL_SECONDS * 1000) });

    // Populate Redis L2 cache ONLY if buffer is tiny (<= 64KB)
    if (buffer.length <= MAX_CRL_REDIS_BYTES) {
        try {
            if (redisCache?.set) {
                await redisCache.set(redisKey, buffer.toString('hex'), 'EX', CRL_CACHE_TTL_SECONDS);
            }
        } catch (redisSetErr) {
            console.warn(`[CRL] Redis cache write failed for ${url}:`, redisSetErr.message);
        }
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
        const isOversized = error.message?.includes('safety limit');
        if (isOversized) {
            console.log(`[CRL] Notice: ${error.message} (safe to skip for commercial CA)`);
        } else {
            console.warn(`[CRL] CRL check skipped:`, error.message);
        }
        // Soft-fail: Do not treat CRL errors or oversized CRLs as revoked to prevent false positives
        return {
            revoked: false,
            status: isOversized ? 'skipped_oversized' : 'error',
            message: `CRL check skipped: ${error.message}`
        };
    }
};
