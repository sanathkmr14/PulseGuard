import ocsp from 'ocsp';
import { promisify } from 'util';

const checkOcspAsync = promisify(ocsp.check.bind(ocsp));

/**
 * Check certificate revocation status using OCSP (Online Certificate Status Protocol)
 * @param {Object} options - OCSP check options
 * @param {Object} options.cert - The certificate to check (raw DER buffer)
 * @param {Object} options.issuer - The issuer certificate (raw DER buffer)
 * @param {number} timeout - Timeout in milliseconds (default: 5000ms)
 * @returns {Promise<Object>} - { revoked: boolean, message: string }
 */
export const checkCertificateRevocation = async ({ cert, issuer }, timeout = 5000) => {
    try {
        // Create promise with timeout
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('OCSP check timed out')), timeout);
        });

        // Perform OCSP check
        const checkPromise = checkOcspAsync({
            cert,
            issuer
        });

        const result = await Promise.race([checkPromise, timeoutPromise]);

        // Result format: { type: 'good' | 'revoked' | 'unknown' }
        const isRevoked = result && result.type === 'revoked';
        const status = result?.type || 'unknown';

        console.log(`[OCSP] Certificate revocation status: ${status}`);

        return {
            revoked: isRevoked,
            status: status,
            message: isRevoked
                ? 'Certificate has been revoked by the issuing authority'
                : `Certificate revocation status: ${status}`
        };

    } catch (error) {
        // Handle specific "Unknown signature algorithm" error from ocsp library (common for ECDSA)
        if (error.message && error.message.includes('Unknown signature algorithm')) {
            console.log(`[OCSP] Skipped: Unsupported signature algorithm (likely ECDSA)`);
            return {
                revoked: false,
                status: 'skipped_unsupported_algo',
                message: `OCSP check skipped: Algorithm not supported by checker`
            };
        }

        console.warn(`[OCSP] Revocation check failed:`, error.message);
        console.warn(`[OCSP] Note: Certificate may not support OCSP or responder is unreachable`);

        // Don't treat OCSP failures as revoked - return unknown
        // This prevents false positives when OCSP servers are unreachable OR
        // when certificates don't include OCSP information (common for older/test certs)
        return {
            revoked: false,
            status: 'error',
            message: `OCSP check skipped: Certificate doesn't provide OCSP information or responder is unreachable`
        };
    }
};

/**
 * Extract raw certificate buffers from TLS socket
 * @param {Object} cert - Certificate object from getPeerCertificate(true)
 * @returns {Object|null} - { cert: Buffer, issuer: Buffer } or null
 */
export const extractCertificateChain = (cert) => {
    try {
        if (!cert || !cert.raw) {
            console.warn('[OCSP] No raw certificate data available');
            return null;
        }

        // Get issuer certificate from the chain
        const issuerCert = cert.issuerCertificate;

        if (!issuerCert || !issuerCert.raw) {
            console.warn('[OCSP] No issuer certificate available for OCSP check');
            return null;
        }

        // Avoid self-signed certificates (issuer === subject)
        if (cert.fingerprint === issuerCert.fingerprint) {
            console.log('[OCSP] Self-signed certificate detected, skipping OCSP');
            return null;
        }

        return {
            cert: cert.raw,
            issuer: issuerCert.raw
        };

    } catch (error) {
        console.error('[OCSP] Error extracting certificate chain:', error.message);
        return null;
    }
};
