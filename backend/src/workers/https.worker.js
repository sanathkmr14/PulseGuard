import { checkHttp } from './http.worker.js';
import { checkSsl } from './ssl.worker.js';

/**
 * HTTPS worker - Performs standard HTTP check AND extracts SSL certificate details.
 * 
 * ARCHITECTURAL RULES:
 * 1. HTTP availability takes precedence over SSL quality
 * 2. SSL failures should NOT override HTTP UP status
 * 3. Only SSL "quality" issues (expired, expiring soon) should cause DEGRADED
 * 4. SSL connectivity failures are warnings, not availability issues
 */
export const checkHttps = async (monitor, result, options = {}) => {
    // 1. Run the standard HTTP status check FIRST
    await checkHttp(monitor, result, options);

    // Store HTTP result before SSL check
    const httpHealthState = result.healthState;
    const httpIsUp = result.isUp;
    const httpStatusCode = result.statusCode;

    // 2. Extract SSL certificate info
    let sslHostname;
    const { parseUrl: providedParseUrl } = options;
    const parseUrl = providedParseUrl || ((url) => {
        try {
            const u = new URL(url.includes('://') ? url : `https://${url}`);
            return { hostname: u.hostname };
        } catch (e) {
            return { hostname: url.split('://').pop().split('/')[0].split(':')[0] };
        }
    });

    try {
        const parsed = parseUrl(monitor.url);
        sslHostname = parsed.hostname;
    } catch (e) {
        sslHostname = monitor.url.split('://').pop().split('/')[0].split(':')[0] || monitor.url;
    }

    try {
        // Create a modified monitor object with just the hostname for SSL check
        const sslMonitor = {
            ...monitor,
            url: `https://${sslHostname}` // Only hostname, no path
        };

        const sslResult = { isUp: true, meta: {} };

        // Add timeout wrapper for SSL check to prevent hanging
        const timeoutPromise = new Promise((resolve) => {
            const sslTimeout = monitor.timeout || 30000;
            const timeout = setTimeout(() => {
                clearTimeout(timeout);
                resolve();
            }, sslTimeout);

            checkSsl(sslMonitor, sslResult, options)
                .then(result => {
                    clearTimeout(timeout);
                    resolve(result);
                })
                .catch(error => {
                    clearTimeout(timeout);
                    console.log(`[HTTPS] SSL check error for ${sslHostname}: ${error.message}`);
                    resolve();
                });
        });

        await timeoutPromise;

        // Merge certificate info into main result meta
        if (sslResult && sslResult.meta) {
            if (!result.meta) result.meta = {};
            result.meta = { ...result.meta, ...sslResult.meta };
        }

        if (httpIsUp) {
            // Check for critical SSL quality issues (expired, expiring soon)
            const daysUntilExpiry = sslResult?.meta?.daysUntilExpiry;
            const isExpired = daysUntilExpiry !== null && daysUntilExpiry < 0;
            const expiryThreshold = monitor.sslExpiryThresholdDays || 14;
            const isExpiringSoon = daysUntilExpiry !== null && daysUntilExpiry >= 0 && daysUntilExpiry <= expiryThreshold;

            if (!sslResult?.isUp || isExpired || isExpiringSoon) {
                // SSL issues should cause DEGRADED state but keep isUp: true
                result.healthState = 'DEGRADED';
                result.isUp = true;
                result.severity = isExpired ? 0.8 : 0.5;

                if (isExpired) {
                    result.errorType = 'CERT_EXPIRED';
                    result.errorMessage = 'SSL Certificate has expired';
                    result.meta.sslWarning = 'SSL certificate expired';
                } else if (isExpiringSoon) {
                    result.errorType = 'CERT_EXPIRING_SOON';
                    result.errorMessage = `SSL Certificate expiring in ${daysUntilExpiry} days`;
                    result.meta.sslWarning = `SSL certificate expiring in ${daysUntilExpiry} days`;
                } else {
                    result.meta.sslWarning = 'SSL quality issues detected';
                }
                console.log(`🔐 HTTPS [${monitor.url}] ⚠️ SSL DEGRADED | HTTP: ${httpStatusCode} UP`);
            } else {
                console.log(`🔐 HTTPS [${monitor.url}] ${httpStatusCode} | Status: UP | SSL Valid (${daysUntilExpiry} days)`);
            }
        }
    } catch (error) {
        // SSL extraction failed but HTTP check succeeded
        if (httpIsUp) {
            // Check for specific SSL errors that should impact status
            const sslErrorType = error.code || error.message;
            if (sslErrorType?.includes('CERT_EXPIRED') ||
                sslErrorType?.includes('CERT_HAS_EXPIRED') ||
                sslErrorType?.includes('certificate has expired') ||
                sslErrorType === 'CERT_HOSTNAME_MISMATCH') {
                // Return descriptive DEGRADED state
                result.healthState = 'DEGRADED';
                result.isUp = true;
                result.errorType = 'CERT_EXPIRED';
                result.errorMessage = `SSL Error: ${error.message}`;
                result.severity = 0.8;
                console.log(`🔐 HTTPS [${monitor.url}] ⚠️ CRITICAL SSL ISSUE (DEGRADED) | HTTP UP`);
            } else {
                // Other SSL failures are just warnings
                result.meta.sslWarning = 'SSL check failed (HTTP available)';
                result.meta.sslError = error.message;
                console.log(`🔐 HTTPS [${monitor.url}] ✅ HTTP UP | SSL WARNING: ${error.message}`);
            }
        }
    }
};
