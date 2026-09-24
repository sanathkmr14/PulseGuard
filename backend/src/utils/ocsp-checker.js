import ocsp from 'ocsp';
import { promisify } from 'util';
import { checkCrlRevocation } from './crl-checker.js';

const checkOcspAsync = promisify(ocsp.check.bind(ocsp));

/**
 * Check certificate revocation status using OCSP with CRL fallback
 * @param {Object} options - Revocation check options
 * @param {Buffer} options.cert - The certificate to check (raw DER buffer)
 * @param {Buffer} [options.issuer] - The issuer certificate (raw DER buffer)
 * @param {string} [options.serialNumber] - The certificate serial number in hex
 * @param {number} timeout - Timeout in milliseconds (default: 5000ms)
 * @returns {Promise<Object>} - { revoked: boolean, message: string, status: string, reason?: string, revocationDate?: Date }
 */
export const checkCertificateRevocation = async ({ cert, issuer, serialNumber }, timeout = 5000) => {
    let ocspResult = null;

    // 1. Try OCSP check if issuer is available
    if (cert && issuer) {
        let timeoutId;
        try {
            const timeoutPromise = new Promise((_, reject) => {
                timeoutId = setTimeout(() => reject(new Error('OCSP check timed out')), timeout);
            });

            const checkPromise = checkOcspAsync({ cert, issuer });
            const result = await Promise.race([checkPromise, timeoutPromise]);
            clearTimeout(timeoutId);

            const isRevoked = result && result.type === 'revoked';
            const status = result?.type || 'unknown';
            console.log(`[OCSP] Certificate revocation status: ${status}`);

            if (isRevoked) {
                return {
                    revoked: true,
                    status: 'revoked',
                    message: 'Certificate has been revoked by issuing authority (via OCSP)'
                };
            }

            ocspResult = { revoked: false, status, message: `Certificate revocation status: ${status}` };
        } catch (error) {
            if (error.message && error.message.includes('Unknown signature algorithm')) {
                console.log(`[OCSP] Skipped: Unsupported signature algorithm (likely ECDSA)`);
            } else {
                console.warn(`[OCSP] Revocation check failed:`, error.message);
                console.warn(`[OCSP] Note: Certificate may not support OCSP or responder is unreachable`);
            }
        } finally {
            if (timeoutId) clearTimeout(timeoutId);
        }
    }

    // 2. CRL Fallback: Check Certificate Revocation List if OCSP was unavailable, failed, or skipped
    // (Crucial for modern Let's Encrypt certificates which deprecated OCSP in August 2025 in favor of CRLs)
    if (cert && serialNumber) {
        try {
            const crlResult = await checkCrlRevocation(cert, serialNumber, timeout);
            if (crlResult.revoked) {
                return crlResult;
            }
            if (crlResult.status === 'good') {
                return crlResult;
            }
        } catch (crlError) {
            console.warn(`[CRL] Fallback revocation check failed:`, crlError.message);
        }
    }

    if (ocspResult) {
        return ocspResult;
    }

    return {
        revoked: false,
        status: 'error',
        message: `Revocation check skipped: Certificate doesn't provide OCSP/CRL information or responder is unreachable`
    };
};

/**
 * Extract raw certificate buffers from TLS socket
 * @param {Object} cert - Certificate object from getPeerCertificate(true)
 * @returns {Object|null} - { cert: Buffer, issuer: Buffer, serialNumber: string } or null
 */
export const extractCertificateChain = (cert) => {
    try {
        if (!cert || !cert.raw) {
            console.warn('[OCSP/CRL] No raw certificate data available');
            return null;
        }

        // Get issuer certificate from the chain if present
        const issuerCert = cert.issuerCertificate;

        // Avoid self-signed certificates (issuer === subject)
        if (issuerCert && cert.fingerprint === issuerCert.fingerprint) {
            console.log('[OCSP/CRL] Self-signed certificate detected, skipping revocation checks');
            return null;
        }

        return {
            cert: cert.raw,
            issuer: issuerCert?.raw || null,
            serialNumber: cert.serialNumber || null
        };

    } catch (error) {
        console.error('[OCSP/CRL] Error extracting certificate chain:', error.message);
        return null;
    }
};
