import { checkHttp } from './http.worker.js';
import { checkSsl } from './ssl.worker.js';

// SSL error codes that mean the cert chain is incomplete — site IS up, just misconfigured
const CERT_CHAIN_ERROR_CODES = new Set([
    'UNABLE_TO_GET_ISSUER_CERT',
    'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
    'SELF_SIGNED_CERT_IN_CHAIN',
    'CERT_CHAIN_ERROR',
    'SSL_CHAIN_ERROR',
]);

function isCertChainErr(err) {
    if (!err) return false;
    return (
        CERT_CHAIN_ERROR_CODES.has(err.code) ||
        err.message?.includes('unable to get local issuer certificate') ||
        err.message?.includes('UNABLE_TO_GET_ISSUER_CERT') ||
        err.message?.includes('certificate chain') ||
        err.message?.includes('self signed certificate in chain')
    );
}

/**
 * HTTPS worker - Performs standard HTTP check AND extracts SSL certificate details.
 *
 * ARCHITECTURAL RULES:
 * 1. HTTP availability takes precedence over SSL quality.
 * 2. Cert chain errors (missing intermediate CA) → site is UP with an SSL warning.
 *    The site IS reachable; only the chain is incomplete. This matches how Freshping,
 *    Site24x7, UptimeRobot etc. treat it.
 * 3. Hard SSL failures (expired cert, hostname mismatch) → DEGRADED.
 * 4. SSL chain warnings are stored in result.meta.sslWarning for UI display.
 */
export const checkHttps = async (monitor, result, options = {}) => {
    // 1. Try a strict HTTP check first
    let httpCheckError = null;
    try {
        await checkHttp(monitor, result, options);
    } catch (err) {
        httpCheckError = err;
    }

    // ── Cert chain fallback ──────────────────────────────────────────────────
    // "unable to get local issuer certificate" means the server is missing an
    // intermediate CA cert. The site itself IS up — retry without SSL verification
    // to get the real HTTP status code and response time, then surface it as UP
    // with an SSL warning (not DEGRADED).
    if (isCertChainErr(httpCheckError)) {
        console.log(`[HTTPS] ⚠️ Cert chain error for ${monitor.url} (${httpCheckError.code || httpCheckError.message}). Retrying without SSL verification...`);

        const monitorObj = typeof monitor.toObject === 'function' ? monitor.toObject() : monitor;
        const fallbackMonitor = { ...monitorObj, allowUnauthorized: true };
        const fallbackResult = { isUp: false, responseTime: 0, meta: {} };

        try {
            await checkHttp(fallbackMonitor, fallbackResult, options);
        } catch (fallbackErr) {
            // Even without SSL validation it failed — genuinely unreachable
            console.log(`[HTTPS] ❌ Fallback also failed for ${monitor.url}: ${fallbackErr.message}`);
        }

        // Carry over HTTP-layer data from the fallback
        if (fallbackResult.statusCode) result.statusCode = fallbackResult.statusCode;
        if (fallbackResult.responseTime) result.responseTime = fallbackResult.responseTime;

        // Site is reachable but has an SSL chain config issue → DEGRADED
        result.isUp = true;
        result.healthState = 'DEGRADED';
        result.errorType = 'CERT_CHAIN_ERROR';
        result.errorMessage = 'SSL certificate chain is incomplete — server is missing an intermediate CA certificate.';
        result.severity = 0.4;

        if (!result.meta) result.meta = {};
        result.meta.sslChainWarning = 'SSL certificate chain is incomplete — server is missing an intermediate CA certificate. The site is accessible but some strict clients may warn users.';
        result.meta.certChainError = httpCheckError.code || httpCheckError.message;

        console.log(`[HTTPS] 🟡 ${monitor.url} → DEGRADED (cert chain error) | HTTP ${result.statusCode || 'N/A'} | ${result.responseTime}ms`);

        // Still run SSL check to gather metadata (expiry days, subject, etc.)
        await _runSslCheck(monitor, result, options, true /* httpIsUp */);
        return;
    }

    // ── Non-chain error: re-throw so scheduler records it correctly ──────────
    if (httpCheckError) {
        throw httpCheckError;
    }

    // ── Normal flow ──────────────────────────────────────────────────────────
    const httpIsUp = result.isUp;
    const httpStatusCode = result.statusCode;

    await _runSslCheck(monitor, result, options, httpIsUp, httpStatusCode);
};

/**
 * Run the SSL quality check and merge results into the main result object.
 */
async function _runSslCheck(monitor, result, options, httpIsUp, httpStatusCode = null) {
    const { parseUrl: providedParseUrl } = options;
    const parseUrl = providedParseUrl || ((url) => {
        try {
            const u = new URL(url.includes('://') ? url : `https://${url}`);
            return { hostname: u.hostname };
        } catch (e) {
            return { hostname: url.split('://').pop().split('/')[0].split(':')[0] };
        }
    });

    let sslHostname;
    try {
        const parsed = parseUrl(monitor.url);
        sslHostname = parsed.hostname;
    } catch (e) {
        sslHostname = monitor.url.split('://').pop().split('/')[0].split(':')[0] || monitor.url;
    }

    try {
        const monitorObj = typeof monitor.toObject === 'function' ? monitor.toObject() : monitor;
        const sslMonitor = { ...monitorObj, url: `https://${sslHostname}` };
        const sslResult = { isUp: true, meta: {} };

        await new Promise((resolve) => {
            const timer = setTimeout(() => { clearTimeout(timer); resolve(); }, monitor.timeout || 30000);
            checkSsl(sslMonitor, sslResult, options)
                .then(() => { clearTimeout(timer); resolve(); })
                .catch((err) => {
                    clearTimeout(timer);
                    console.log(`[HTTPS] SSL check error for ${sslHostname}: ${err.message}`);
                    resolve();
                });
        });

        // Merge cert metadata (daysUntilExpiry, subject, issuer, fingerprint…)
        if (sslResult?.meta) {
            if (!result.meta) result.meta = {};
            result.meta = { ...result.meta, ...sslResult.meta };
        }

        if (httpIsUp) {
            const daysUntilExpiry = sslResult?.meta?.daysUntilExpiry;
            const isExpired = daysUntilExpiry !== null && daysUntilExpiry < 0;
            const expiryThreshold = monitor.sslExpiryThresholdDays || 14;
            const isExpiringSoon = daysUntilExpiry !== null && daysUntilExpiry >= 0 && daysUntilExpiry <= expiryThreshold;

            if (!sslResult?.isUp || isExpired || isExpiringSoon) {
                // Hard SSL failures → DEGRADED
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
                } else if (!result.meta.sslChainWarning) {
                    // Only set generic warning if chain warning isn't already set
                    result.meta.sslWarning = 'SSL quality issues detected';
                }
                console.log(`🔐 HTTPS [${monitor.url}] ⚠️ SSL DEGRADED | HTTP: ${httpStatusCode} UP`);
            } else {
                console.log(`🔐 HTTPS [${monitor.url}] ${httpStatusCode} | Status: UP | SSL Valid (${daysUntilExpiry} days)`);
            }
        }
    } catch (error) {
        if (httpIsUp) {
            const sslErrorType = error.code || error.message;
            if (
                sslErrorType?.includes('CERT_EXPIRED') ||
                sslErrorType?.includes('CERT_HAS_EXPIRED') ||
                sslErrorType?.includes('certificate has expired') ||
                sslErrorType === 'CERT_HOSTNAME_MISMATCH'
            ) {
                result.healthState = 'DEGRADED';
                result.isUp = true;
                result.errorType = 'CERT_EXPIRED';
                result.errorMessage = `SSL Error: ${error.message}`;
                result.severity = 0.8;
                console.log(`🔐 HTTPS [${monitor.url}] ⚠️ CRITICAL SSL ISSUE (DEGRADED) | HTTP UP`);
            } else {
                if (!result.meta) result.meta = {};
                // Don't overwrite an existing chain warning
                if (!result.meta.sslChainWarning) {
                    result.meta.sslWarning = 'SSL check failed (HTTP available)';
                    result.meta.sslError = error.message;
                }
                console.log(`🔐 HTTPS [${monitor.url}] ✅ HTTP UP | SSL WARNING: ${error.message}`);
            }
        }
    }
}
