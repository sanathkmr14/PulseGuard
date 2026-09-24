import tls from 'tls';
import net from 'net';
import { resolveSecurely } from '../utils/resolver.js';
import { classifySslCertificate } from '../utils/status-classifier.js';
import { checkCertificateRevocation, extractCertificateChain } from '../utils/ocsp-checker.js';

export const checkSsl = async (monitor, result, options = {}) => {
    const { parseUrl: providedParseUrl, detectErrorType, formatErrorMessage, determineHealthStateFromError } = options;
    const timeout = monitor.timeout || 30000;

    // Fallback parseUrl if not provided in options
    const parseUrl = providedParseUrl || ((url, defaultPort) => {
        let u = (url || '').trim();
        let hostname = u.replace(/^https?:\/\//, '').replace(/^ssl:\/\//, '').replace(/^tcp:\/\//, '').replace(/\/.*$/, '');
        let port = defaultPort || 443;
        if (hostname.includes(':')) {
            const parts = hostname.split(':');
            hostname = parts[0];
            port = parseInt(parts[1], 10) || defaultPort || 443;
        }
        return { hostname, port };
    });

    return new Promise((resolve) => {
        const { hostname, port } = parseUrl(monitor.url, monitor.port || 443);

        // 🛡️ SSRF Protection: Resolve hostname securely BEFORE connecting
        const getResolvedInfo = async () => {
            try {
                return await resolveSecurely(hostname);
            } catch (err) {
                result.healthState = 'DOWN';
                result.isUp = false;
                result.errorType = (err.code === 'SSRF_BLOCKED' || err.message?.includes('SSRF')) ? 'SSRF_BLOCKED' : 'DNS_ERROR';
                result.errorMessage = err.message;
                result.responseTime = 0;
                resolve(result);
                return null;
            }
        };

        const runCheck = async () => {
            const resolved = await getResolvedInfo();
            if (!resolved) return;

            const startTime = Date.now();
            const tlsSocket = tls.connect(port, resolved.address, {
                rejectUnauthorized: false,
                // Omit SNI for IP addresses to eliminate RFC 6066 DEP0123 warning
                servername: net.isIP(hostname) ? undefined : hostname
            });

            let isDone = false;
            tlsSocket.setTimeout(timeout);

            tlsSocket.on('secureConnect', async () => {
                if (isDone) return;
                isDone = true;
                const responseTime = Date.now() - startTime;
                result.responseTime = responseTime;

                try {
                const cert = tlsSocket.getPeerCertificate(true); // Get detailed certificate

                if (!result.meta) result.meta = {};

                // Handle null or empty certificate
                if (!cert || Object.keys(cert).length === 0) {
                    tlsSocket.destroy();
                    result.errorType = detectErrorType ? detectErrorType(new Error('No certificate received'), 'SSL', null) : 'SSL_ERROR';
                    result.errorMessage = formatErrorMessage ? formatErrorMessage(new Error('No certificate received'), 'SSL') : 'No certificate received';
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

                // Populate top-level fields for API contracts and integration tests
                result.daysUntilExpiry = daysUntilExpiry;
                result.issuer = cert.issuer?.O || cert.issuer?.CN || 'Unknown';

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
                    }
                }

                // Domain matching: strip protocol, path, and port
                const domain = monitor.url.replace(/^[a-zA-Z]+:\/\//, '').split('/')[0]?.split(':')[0] || hostname;

                // Check Common Name (CN)
                let hostnameMatch = cert.subject?.CN === domain;

                // Check Subject Alternative Names (SANs) if no match on CN
                if (!hostnameMatch && cert.subjectaltname) {
                    const sans = cert.subjectaltname.split(',').map(s => s.trim().replace('DNS:', ''));
                    hostnameMatch = sans.some(san => {
                        if (san === domain) return true;
                        if (san.startsWith('*.')) {
                            const base = san.slice(2);
                            const parts = domain.split('.');
                            // Strict wildcard matching: must end with '.' + base to prevent foo.badexample.com matching *.example.com
                            return domain.endsWith('.' + base) && parts.length === base.split('.').length + 1;
                        }
                        return false;
                    });
                }
                const isSelfSigned = cert.issuer?.CN === cert.subject?.CN;

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
                result.errorMessage = classification.reason;
                result.confidence = classification.confidence;
                result.severity = classification.severity;

                tlsSocket.destroy();
                console.log(`[SSL] ${hostname}:${port} ${result.healthState} | Days: ${daysUntilExpiry} | Confidence: ${(result.confidence * 100).toFixed(0)}% | Severity: ${(result.severity * 100).toFixed(0)}%`);
                resolve(result);

                } catch (certErr) {
                    // Catch synchronous exceptions during cert processing so the socket
                    // is always destroyed and the promise always resolves.
                    console.error(`[SSL] Unexpected error during cert processing for ${hostname}:${port}:`, certErr.message);
                    try { tlsSocket.destroy(); } catch {}
                    result.healthState = 'DOWN';
                    result.isUp = false;
                    result.errorType = 'SSL_ERROR';
                    result.errorMessage = `Certificate processing error: ${certErr.message}`;
                    resolve(result);
                }
            });

            tlsSocket.on('timeout', () => {
                if (isDone) return;
                isDone = true;
                tlsSocket.destroy();
                const responseTime = Date.now() - startTime;
                result.responseTime = responseTime;

                const err = new Error(`SSL connection timed out after ${timeout}ms`);
                result.errorType = detectErrorType ? detectErrorType(err, 'SSL', null) : 'TIMEOUT';
                result.errorMessage = formatErrorMessage ? formatErrorMessage(err, 'SSL') : err.message;

                const classification = classifySslCertificate({
                    valid: false,
                    selfSigned: false,
                    daysUntilExpiry: null,
                    hostnameMatch: false
                });

                if (determineHealthStateFromError) {
                    const hsr = determineHealthStateFromError(result.errorType, null, 'SSL', responseTime, monitor);
                    result.healthState = hsr.healthState;
                } else {
                    result.healthState = 'DOWN';
                }
                result.isUp = result.healthState === 'UP' || result.healthState === 'DEGRADED';
                result.confidence = classification.confidence;
                result.severity = classification.severity;

                console.log(`[SSL] ${hostname}:${port} TIMEOUT | Status: ${result.healthState} | Confidence: ${(result.confidence * 100).toFixed(0)}% | Severity: ${(result.severity * 100).toFixed(0)}%`);
                resolve(result);
            });

            tlsSocket.on('error', (err) => {
                if (isDone) return;
                isDone = true;
                tlsSocket.destroy();
                const responseTime = Date.now() - startTime;
                result.responseTime = responseTime;
                result.errorType = detectErrorType ? detectErrorType(err, 'SSL', null) : 'SSL_ERROR';
                result.errorMessage = formatErrorMessage ? formatErrorMessage(err, 'SSL') : err.message;

                const isSelfSignedError = err.code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
                    err.code === 'SELF_SIGNED_CERT' ||
                    err.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE';

                const isHostnameMismatch = err.code === 'ERR_TLS_CERT_ALTNAME_INVALID' ||
                    err.message?.includes('Hostname/IP doesn\'t match certificate');

                const isExpiredError = err.code === 'CERT_HAS_EXPIRED' ||
                    err.code === 'CERT_EXPIRED' ||
                    err.message?.includes('certificate has expired');

                const classification = classifySslCertificate({
                    valid: false,
                    selfSigned: isSelfSignedError,
                    daysUntilExpiry: isExpiredError ? -1 : null,
                    hostnameMatch: !isHostnameMismatch
                });

                if (isSelfSignedError || isHostnameMismatch || isExpiredError) {
                    result.healthState = classification.status.toUpperCase();
                    result.errorType = classification.errorType;
                    result.errorMessage = classification.reason;
                } else if (determineHealthStateFromError) {
                    const hsr = determineHealthStateFromError(result.errorType, null, 'SSL', responseTime, monitor);
                    result.healthState = hsr.healthState;
                } else {
                    result.healthState = 'DOWN';
                }

                result.isUp = result.healthState === 'UP' || result.healthState === 'DEGRADED';
                result.confidence = classification.confidence;
                result.severity = classification.severity;

                console.log(`[SSL] ${hostname}:${port} CONNECTION ERROR | Status: ${result.healthState} | Error: ${err.code} | Confidence: ${(result.confidence * 100).toFixed(0)}% | Severity: ${(result.severity * 100).toFixed(0)}%`);
                resolve(result);
            });
        };

        runCheck().catch(err => {
            console.error(`[SSL] Unhandled error during check of ${hostname}:${port}:`, err.message);
            result.healthState = 'DOWN';
            result.isUp = false;
            result.errorMessage = err.message;
            resolve(result);
        });
    });
};

export default {
    checkSsl
};
