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

    // 2. Extract SSL certificate info (using hostname only, NOT full URL)
    // FIX: Extract hostname from URL to prevent "httpbin.org/status/201" being passed to SSL check
    let sslHostname;
    try {
        const urlObj = new URL(monitor.url);
        sslHostname = urlObj.hostname;
    } catch (e) {
        // Fallback to parseUrl if URL parsing fails
        sslHostname = monitor.url.split('://')[1]?.split('/')[0]?.split(':')[0] || monitor.url;
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
            // FIXED: Respect monitor's configured timeout (was hardcoded to 10s max)
            const sslTimeout = monitor.timeout || 30000; // Default 30s, respects user config
            const timeout = setTimeout(() => {
                // If SSL check times out, resolve with a safe default
                clearTimeout(timeout);
                resolve(); // Just continue without SSL info
            }, sslTimeout);

            checkSsl(sslMonitor, sslResult, options)
                .then(result => {
                    clearTimeout(timeout);
                    resolve(result);
                })
                .catch(error => {
                    clearTimeout(timeout);
                    // Don't reject, just continue without SSL info
                    console.log(`[HTTPS] SSL check failed for ${sslHostname}: ${error.message}`);
                    resolve(); // Continue with HTTP result only
                });
        });

        await timeoutPromise;
        // Continue execution regardless of SSL check outcome

        // Merge certificate info into main result meta
        if (sslResult.meta) {
            if (!result.meta) result.meta = {};
            result.meta = {
                ...result.meta,
                ...sslResult.meta
            };
        }

        // ARCHITECTURAL FIX: SSL should NOT override HTTP availability
        // HTTP UP + SSL FAIL = UP (with SSL warning)
        // HTTP UP + SSL EXPIRING = DEGRADED
        // HTTP DOWN + SSL OK = DOWN

        if (httpIsUp) {
            // HTTP is available - SSL issues are quality warnings, not availability issues
            if (!sslResult.isUp) {
                // SSL check failed - this is a warning, not a failure
                // Only mark DEGRADED for critical SSL issues (expired, expiring soon)
                const daysUntilExpiry = sslResult.meta?.daysUntilExpiry;
                const isExpired = daysUntilExpiry !== null && daysUntilExpiry < 0;
                const expiryThreshold = monitor.sslExpiryThresholdDays || 14;
                const isExpiringSoon = daysUntilExpiry !== null && daysUntilExpiry > 0 && daysUntilExpiry <= expiryThreshold;

                if (isExpired) {
                    // SSL expired - this IS critical for HTTPS
                    result.healthState = 'DEGRADED';
                    result.isUp = true; // Still up, but degraded
                    result.meta.sslWarning = 'SSL certificate expired';
                    result.errorType = 'CERT_EXPIRED';
                    result.errorMessage = 'SSL Certificate has expired';
                    result.severity = 0.8;
                    console.log(`🔐 HTTPS [${monitor.url}] ⚠️ SSL EXPIRED | HTTP: ${httpStatusCode} UP | SSL: DEGRADED`);
                } else if (isExpiringSoon) {
                    // SSL expiring soon - minor warning
                    result.healthState = 'DEGRADED';
                    result.isUp = true;
                    result.meta.sslWarning = `SSL certificate expiring in ${daysUntilExpiry} days`;
                    result.errorType = 'CERT_EXPIRING_SOON';
                    result.errorMessage = `SSL Certificate expiring in ${daysUntilExpiry} days`;
                    result.severity = 0.5;
                    console.log(`🔐 HTTPS [${monitor.url}] ⚠️ SSL EXPIRING SOON | HTTP: ${httpStatusCode} UP | SSL: ${daysUntilExpiry} days`);
                } else {
                    // SSL connectivity issue but HTTP works - this is likely a monitoring artifact
                    // Keep HTTP result, add warning but don't degrade
                    result.meta.sslWarning = 'SSL handshake failed (HTTP available)';
                    result.meta.sslError = sslResult.errorMessage || 'SSL connection error';
                    // Keep original HTTP health state - DO NOT override
                    console.log(`🔐 HTTPS [${monitor.url}] ✅ HTTP UP | SSL: ${sslResult.healthState || 'FAIL'} (warning only, HTTP available)`);
                }
            } else {
                // SSL is valid
                const certInfo = sslResult.meta || {};
                const expiryDays = certInfo.daysUntilExpiry || 'N/A';
                const issuer = certInfo.issuer || 'Unknown';
                console.log(`🔐 HTTPS [${monitor.url}] ${httpStatusCode} | Status: ${result.healthState} | ResponseTime: ${result.responseTime || 'N/A'}ms | SSL: ${expiryDays} days | Issuer: ${issuer}`);
            }
        } else {
            // HTTP is DOWN - SSL result doesn't matter, keep HTTP state
            console.log(`🔐 HTTPS [${monitor.url}] ❌ HTTP DOWN | SSL: ${sslResult.healthState || 'N/A'} (irrelevant since HTTP down)`);
        }

    } catch (error) {
        // SSL extraction failed but HTTP check succeeded
        // Set appropriate defaults for sslResult in case SSL check rejected
        if (!sslResult) {
            sslResult = { errorType: error.code || 'SSL_ERROR', errorMessage: error.message };
        }

        if (httpIsUp) {
            // Check for specific SSL errors that should impact status
            const sslErrorType = (sslResult && sslResult.errorType) || error.code || error.message;
            if (sslErrorType?.includes('CERT_EXPIRED') ||
                sslErrorType?.includes('CERT_HAS_EXPIRED') ||
                sslErrorType?.includes('certificate has expired') ||
                sslErrorType === 'CERT_HOSTNAME_MISMATCH' ||
                sslErrorType === 'SSL_EXPIRED' ||
                error.code === 'CERT_HAS_EXPIRED' ||
                error.code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
                error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
                // SSL issues that should make service DOWN
                result.healthState = 'DOWN';
                result.isUp = false; // Mark as down for critical SSL issues
                result.meta.sslError = `SSL Error: ${error.message || (sslResult && sslResult.errorMessage)}`;
                result.errorType = (sslResult && sslResult.errorType) || 'SSL_ERROR';
                result.severity = 0.9;
                console.log(`🔐 HTTPS [${monitor.url}] ❌ CRITICAL SSL ISSUE | HTTP: ${httpStatusCode} | Status: DOWN`);
            } else {
                // Other SSL failures are just warnings
                result.meta.sslWarning = 'SSL check failed (HTTP available)';
                result.meta.sslError = error.message;
                // Keep original HTTP health state - DO NOT override
                console.log(`🔐 HTTPS [${monitor.url}] ✅ HTTP UP | SSL WARNING: ${error.message} (HTTP available)`);
            }
        } else {
            // HTTP is down - log but keep HTTP state
            console.log(`🔐 HTTPS [${monitor.url}] ❌ HTTP DOWN | SSL ERROR: ${error.message}`);
        }
    }
};
