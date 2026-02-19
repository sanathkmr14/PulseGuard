import tls from 'tls';
import { classifySslCertificate } from '../utils/status-classifier.js';
import { checkCertificateRevocation, extractCertificateChain } from '../utils/ocsp-checker.js';

export const checkSsl = async (monitor, result, options = {}) => {
    const { parseUrl: providedParseUrl, detectErrorType, formatErrorMessage, determineHealthStateFromError } = options;
    // FIXED: Respect monitor's configured timeout
    const timeout = monitor.timeout || 30000; // Default 30s

    // Fallback parseUrl if not provided in options
    const parseUrl = providedParseUrl || ((url, defaultPort) => {
        let hostname = url.replace(/^https?:\/\//, '').replace(/^tcp:\/\//, '').replace(/\/$/, '');
        let port = defaultPort || 443;
        if (hostname.includes(':')) {
            const parts = hostname.split(':');
            hostname = parts[0];
            port = parseInt(parts[1], 10);
        }
        return { hostname, port };
    });

    return new Promise((resolve, reject) => {
        const { hostname, port } = parseUrl(monitor.url, monitor.port || 443);
        const startTime = Date.now();
        const tlsSocket = tls.connect(port, hostname, {
            rejectUnauthorized: false,
            servername: hostname // Explicitly set SNI
        });

        let isDone = false;

        tlsSocket.setTimeout(timeout);



        // Ensure the socket is destroyed if the promise settles (prevent leaks)
        // actually we can't do 'finally' here easily inside Promise constructor.
        // We rely on the event handlers.

        tlsSocket.on('secureConnect', async () => {
            if (isDone) return;
            isDone = true;
            const responseTime = Date.now() - startTime;
            result.responseTime = responseTime;
            const cert = tlsSocket.getPeerCertificate(true); // Get detailed certificate

            if (cert) console.log(`[SSL Debug Keys] ${Object.keys(cert).join(', ')}`);
            if (cert) console.log(`[SSL Debug SAN] ${cert.subjectaltname}`);

            if (!result.meta) result.meta = {};

            // Handle null or empty certificate
            if (!cert || Object.keys(cert).length === 0) {
                tlsSocket.destroy();
                result.errorType = detectErrorType(new Error('No certificate received'), 'SSL', null);
                result.errorMessage = formatErrorMessage(new Error('No certificate received'), 'SSL');
                result.healthState = 'DOWN';
                result.isUp = false;
                result.confidence = 1.0;
                result.severity = 1.0;
                console.log(`[SSL] ${hostname}:${port} NO CERTIFICATE | Status: ${result.healthState}`);
                resolve(result);
                return;
            }

            result.meta.subject = cert.subject || {};
            result.meta.issuer = cert.issuer || {};
            result.meta.validFrom = cert.valid_from || null;
            result.meta.validTo = cert.valid_to || null;
            result.meta.fingerprint = cert.fingerprint || null;

            // Calculate days until expiry
            let daysUntilExpiry = null;
            if (cert.valid_to) {
                const expiryDate = new Date(cert.valid_to);
                const now = new Date();
                daysUntilExpiry = Math.floor((expiryDate - now) / (1000 * 60 * 60 * 24));
            }
            result.meta.daysUntilExpiry = daysUntilExpiry;

            // OCSP Revocation Check - Priority check before other validations
            let isRevoked = false;
            const certChain = extractCertificateChain(cert);
            if (certChain) {
                try {
                    const ocspResult = await checkCertificateRevocation(certChain, 5000);
                    isRevoked = ocspResult.revoked;

                    if (isRevoked) {
                        console.log(`[SSL] ${hostname}:${port} CERTIFICATE REVOKED`);
                        tlsSocket.destroy();
                        result.errorType = 'CERT_REVOKED';
                        result.errorMessage = ocspResult.message;
                        result.healthState = 'DOWN';
                        result.isUp = false;
                        result.confidence = 1.0;
                        result.severity = 1.0;
                        resolve(result);
                        return;
                    }
                } catch (ocspError) {
                    console.log(`[SSL] OCSP check not available (certificate may not support OCSP), continuing with standard SSL validation`);
                    // Continue with other checks - OCSP failure doesn't mean certificate is invalid
                }
            }

            // NEW: Use advanced SSL classifier
            const domain = monitor.url.split('//')[1]?.split(':')[0] || hostname;

            // Check Common Name (CN)
            let hostnameMatch = cert.subject?.CN === domain;

            // Check Subject Alternative Names (SANs) if no match on CN
            if (!hostnameMatch && cert.subjectaltname) {
                const sans = cert.subjectaltname.split(',').map(s => s.trim().replace('DNS:', ''));
                hostnameMatch = sans.some(san => {
                    if (san === domain) return true;
                    if (san.startsWith('*.')) {
                        const base = san.slice(2);
                        // Matches subdomains: *.google.com matches mail.google.com
                        // But strictly does NOT match google.com (unless implied by CA specific rules, but standard says no)
                        // However, google.com cert usually has "DNS:google.com" in SANs explicitly.
                        const parts = domain.split('.');
                        return domain.endsWith(base) && parts.length === base.split('.').length + 1;
                    }
                    return false;
                });
            }
            const isSelfSigned = cert.issuer?.CN === cert.subject?.CN;

            // Extract signature algorithm for weak algorithm detection (SHA-1, MD5)
            // Node.js doesn't always expose this field in the cert object
            const signatureAlgorithm = cert.sigalg || cert.signatureAlgorithm || 'Unknown (Not exposed by Node.js)';
            if (signatureAlgorithm !== 'Unknown (Not exposed by Node.js)') {
                console.log(`[SSL Debug] Signature Algorithm: ${signatureAlgorithm}`);
            }

            const classification = classifySslCertificate({
                valid: true,
                selfSigned: isSelfSigned,
                daysUntilExpiry: daysUntilExpiry,
                hostnameMatch: hostnameMatch,
                issuedBy: cert.issuer?.O || 'Unknown',
                expiryThreshold: monitor.sslExpiryThresholdDays || 14,
                signatureAlgorithm: signatureAlgorithm
            });

            // Combine results
            result.isUp = classification.status === 'UP' || classification.status === 'DEGRADED';
            result.healthState = classification.status.toUpperCase();
            result.errorType = classification.errorType;
            result.errorMessage = classification.reason; // Ensure message is passed to result
            result.confidence = classification.confidence;
            result.severity = classification.severity;

            tlsSocket.destroy();
            console.log(`[SSL] ${hostname}:${port} ${result.healthState} | Days: ${daysUntilExpiry} | Confidence: ${(result.confidence * 100).toFixed(0)}% | Severity: ${(result.severity * 100).toFixed(0)}%`);
            resolve(result);
        });

        tlsSocket.on('timeout', () => {
            if (isDone) return;
            isDone = true;
            tlsSocket.destroy();
            const responseTime = Date.now() - startTime;
            result.responseTime = responseTime;

            const err = new Error(`SSL connection timed out after ${timeout}ms`);
            result.errorType = detectErrorType(err, 'SSL', null);
            result.errorMessage = formatErrorMessage(err, 'SSL');

            // NEW: Use classifier for timeout
            const classification = classifySslCertificate({
                valid: false,
                selfSigned: false,
                daysUntilExpiry: null,
                hostnameMatch: false
            });

            const hsr = determineHealthStateFromError(result.errorType, null, 'SSL', responseTime, monitor);
            result.healthState = hsr.healthState;
            result.isUp = result.healthState === 'UP' || result.healthState === 'DEGRADED';
            result.confidence = classification.confidence;
            result.severity = classification.severity;

            console.log(`[SSL] ${hostname}:${port} TIMEOUT | Status: ${result.healthState} | Confidence: ${(result.confidence * 100).toFixed(0)}% | Severity: ${(result.severity * 100).toFixed(0)}%`);
            reject(err);
        });

        tlsSocket.on('error', (err) => {
            if (isDone) return;
            isDone = true;
            tlsSocket.destroy();
            const responseTime = Date.now() - startTime;
            result.responseTime = responseTime;
            result.errorType = detectErrorType(err, 'SSL', null);
            result.errorMessage = formatErrorMessage(err, 'SSL');

            // Determine if this is a self-signed cert error
            const isSelfSignedError = err.code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
                err.code === 'SELF_SIGNED_CERT' ||
                err.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE';

            // Check for hostname mismatch errors
            const isHostnameMismatch = err.code === 'ERR_TLS_CERT_ALTNAME_INVALID' ||
                err.message?.includes('Hostname/IP doesn\'t match certificate');

            // Check for expiry errors
            const isExpiredError = err.code === 'CERT_HAS_EXPIRED' ||
                err.code === 'CERT_EXPIRED' ||
                err.message?.includes('certificate has expired');

            // Use classifier with appropriate parameters based on error type
            const classification = classifySslCertificate({
                valid: false,
                selfSigned: isSelfSignedError,
                daysUntilExpiry: isExpiredError ? -1 : null, // -1 indicates expired
                hostnameMatch: !isHostnameMismatch
            });

            // Use the classifier's status for certificate-specific errors
            if (isSelfSignedError || isHostnameMismatch || isExpiredError) {
                result.healthState = classification.status.toUpperCase();
                result.errorType = classification.errorType;
                result.errorMessage = classification.reason;
            } else {
                const hsr = determineHealthStateFromError(result.errorType, null, 'SSL', responseTime, monitor);
                result.healthState = hsr.healthState;
            }

            result.isUp = result.healthState === 'UP' || result.healthState === 'DEGRADED';
            result.confidence = classification.confidence;
            result.severity = classification.severity;

            console.log(`[SSL] ${hostname}:${port} CONNECTION ERROR | Status: ${result.healthState} | Error: ${err.code} | Confidence: ${(result.confidence * 100).toFixed(0)}% | Severity: ${(result.severity * 100).toFixed(0)}%`);

            // For certificate-specific errors, resolve instead of reject so HTTPS worker can handle properly
            if (err.code === 'CERT_HAS_EXPIRED' ||
                err.code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
                err.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
                err.code === 'CERT_EXPIRED' ||
                err.code === 'CERT_NOT_YET_VALID' ||
                err.code === 'CERT_SIGNATURE_FAILURE' ||
                err.code === 'CERT_SUBJECT_FIELD_EMPTY' ||
                err.code === 'CERT_REVOKED' ||
                err.code === 'ERR_TLS_CERT_ALTNAME_INVALID' ||
                err.message?.includes('certificate has expired') ||
                err.message?.includes('certificate is not yet valid') ||
                err.message?.includes('revoked') ||
                err.message?.includes('Hostname/IP doesn\'t match certificate')) {
                resolve(result);
            } else {
                reject(err);
            }
        });
    });
};
