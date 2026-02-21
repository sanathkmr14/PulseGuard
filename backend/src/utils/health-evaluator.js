/**
 * Maps raw protocol data/errors to human-readable states.
 */
function evaluateHealth(result, threshold = 2000, timeout = 30000) {
    const { protocol, statusCode, errorCode, latency, sslInfo, responseTime, message } = result;

    // Use responseTime if latency is not provided
    const effectiveLatency = latency || responseTime || 0;

    // 1. SSL/TLS Logic (Highest Priority - Security First)
    if (sslInfo && sslInfo.error) {
        return {
            state: "🔴 DOWN",
            errorType: "SSL_FAILURE",
            message: `Security Risk: ${formatSSLError(sslInfo.error)}`,
            severity: "CRITICAL"
        };
    }

    // 2. HIGH_LATENCY with successful response = DEGRADED (performance issue, not failure)
    // CRITICAL FIX: HIGH_LATENCY should NOT be treated as DOWN if we got a valid response
    if (errorCode === 'HIGH_LATENCY' && statusCode && statusCode >= 200 && statusCode < 400) {
        return {
            state: "🟡 DEGRADED",
            type: "HIGH_LATENCY",
            msg: effectiveLatency > threshold
                ? `Slow response: ${effectiveLatency}ms (exceeded threshold)`
                : `Slow response: ${effectiveLatency}ms`,
            errorType: "HIGH_LATENCY",
            message: `Slow response: ${effectiveLatency}ms`,
            severity: "WARNING"
        };
    }

    // 3. System/Network Errors (ECONNRESET, ETIMEDOUT, etc.)
    // Only process actual network/connection errors here, not performance issues or HTTP status errors
    // CRITICAL FIX: Ignore SUCCESS and HTTP_ types to allow status code logic to handle them
    if (errorCode && !errorCode.startsWith('HTTP_') && errorCode !== 'HIGH_LATENCY' && errorCode !== 'SUCCESS') {
        return mapNetworkError(errorCode, effectiveLatency, threshold);
    }

    // 4. HTTP Status Code Logic (Application Layer)
    if (protocol === 'https' || protocol === 'http') {
        return mapHTTPStatus(statusCode, effectiveLatency, threshold);
    }

    // 5. TCP/UDP/DNS/PING Logic
    if (protocol === 'tcp' || protocol === 'udp' || protocol === 'dns' || protocol === 'ping') {
        return mapProtocolStatus(protocol, errorCode, effectiveLatency, threshold, timeout);
    }

    // 6. SMTP Logic
    if (protocol === 'smtp') {
        return mapSMTPStatus(statusCode, effectiveLatency, threshold, message);
    }

    // 7. Generic Latency Check (Fallback for any other protocol)
    if (effectiveLatency > threshold) {
        return {
            state: "🟡 DEGRADED",
            type: "SLOW_RESPONSE",
            msg: `Slow response: ${effectiveLatency}ms`,
            errorType: "SLOW_RESPONSE",
            severity: "WARNING"
        };
    }

    // Default Success
    return { state: "🟢 UP", message: "Service is healthy.", errorType: "SUCCESS", severity: "INFO" };
}

/**
 * Maps System Error Codes (ECONNRESET, ENOTFOUND, etc.)
 */
function mapNetworkError(code, latency, threshold) {
    const errorMap = {
        'ECONNRESET': { state: "🔴 DOWN", type: "SOCKET_HANGUP", msg: "Server abruptly closed the connection (ECONNRESET).", severity: "CRITICAL" },
        'ETIMEDOUT': { state: "🔴 DOWN", type: "TIMEOUT", msg: "Connection timed out (ETIMEDOUT).", severity: "CRITICAL" },
        'ENOTFOUND': { state: "🔴 DOWN", type: "DNS_FAILURE", msg: "Domain name not found / DNS resolution failed (ENOTFOUND).", severity: "CRITICAL" },
        'ECONNREFUSED': { state: "🔴 DOWN", type: "PORT_CLOSED", msg: "Connection refused (ECONNREFUSED).", severity: "CRITICAL" },
        'EHOSTUNREACH': { state: "🔴 DOWN", type: "NETWORK_UNREACHABLE", msg: "No network route to the server (EHOSTUNREACH).", severity: "CRITICAL" },
        'ENETUNREACH': { state: "🔴 DOWN", type: "NETWORK_UNREACHABLE", msg: "Network is unreachable (ENETUNREACH).", severity: "CRITICAL" },
        'CERT_EXPIRING_SOON': { state: "🟡 DEGRADED", type: "SSL_EXPIRING", msg: "SSL certificate is expiring soon.", severity: "WARNING" },
        'CERT_HAS_EXPIRED': { state: "🔴 DOWN", type: "SSL_EXPIRED", msg: "SSL certificate has expired (CERT_HAS_EXPIRED).", severity: "CRITICAL" },
        'CERT_EXPIRED': { state: "🔴 DOWN", type: "SSL_EXPIRED", msg: "SSL certificate has expired (CERT_EXPIRED).", severity: "CRITICAL" },
        'ERR_TLS_CERT_ALTNAME_INVALID': { state: "🔴 DOWN", type: "SSL_HOSTNAME_MISMATCH", msg: "SSL certificate hostname does not match (ERR_TLS_CERT_ALTNAME_INVALID).", severity: "CRITICAL" },
        'CERT_HOSTNAME_MISMATCH': { state: "🔴 DOWN", type: "SSL_HOSTNAME_MISMATCH", msg: "SSL certificate hostname does not match.", severity: "CRITICAL" },
        'DEPTH_ZERO_SELF_SIGNED_CERT': { state: "🔴 DOWN", type: "SSL_SELF_SIGNED", msg: "Certificate is self-signed (untrusted).", severity: "CRITICAL" },
        'SELF_SIGNED_CERT': { state: "🔴 DOWN", type: "SSL_SELF_SIGNED", msg: "Certificate is self-signed (untrusted).", severity: "CRITICAL" },
        'UNABLE_TO_VERIFY_LEAF_SIGNATURE': { state: "🟡 DEGRADED", type: "SSL_UNTRUSTED_CA", msg: "Untrusted Certificate Authority (UNABLE_TO_VERIFY_LEAF_SIGNATURE).", severity: "WARNING" },
        // DNS errors
        'DNS_ERROR': { state: "🔴 DOWN", type: "DNS_FAILURE", msg: "DNS resolution failed (DNS_ERROR).", severity: "CRITICAL" },
        'DNS_NOT_FOUND': { state: "🔴 DOWN", type: "DNS_FAILURE", msg: "Domain name not found (DNS_NOT_FOUND).", severity: "CRITICAL" },
        'DNS_TIMEOUT': { state: "🔴 DOWN", type: "DNS_TIMEOUT", msg: "DNS resolution timed out (DNS_TIMEOUT).", severity: "CRITICAL" },
        'CONNECTION_RESET': { state: "🔴 DOWN", type: "SOCKET_HANGUP", msg: "Server abruptly closed the connection (CONNECTION_RESET).", severity: "CRITICAL" },
        'CERT_CHAIN_ERROR': { state: "🔴 DOWN", type: "SSL_CHAIN_ERROR", msg: "SSL certificate chain verification failed. Missing intermediate or CA certificate.", severity: "CRITICAL" },
        // Custom Worker Mappings
        'PING_TIMEOUT': { state: "🔴 DOWN", type: "PING_TIMEOUT", msg: "Ping request timed out (PING_TIMEOUT).", severity: "CRITICAL" },
        'HOST_UNREACHABLE_PING': { state: "🔴 DOWN", type: "HOST_UNREACHABLE", msg: "Host is unreachable (HOST_UNREACHABLE_PING).", severity: "CRITICAL" },
        'CONNECTION_REFUSED': { state: "🔴 DOWN", type: "PORT_CLOSED", msg: "Connection refused (CONNECTION_REFUSED).", severity: "CRITICAL" },
        'TIMEOUT': { state: "🔴 DOWN", type: "TIMEOUT", msg: "Operation timed out (TIMEOUT).", severity: "CRITICAL" }
    };

    const error = errorMap[code] || { state: "🔴 DOWN", type: "UNKNOWN_ERROR", msg: `Unexpected network error: ${code}`, severity: "HIGH" };

    // Add error type and message properties for consistency
    error.errorType = error.type;
    error.message = error.msg;

    // Check for "Degraded" based on high latency even in failures
    // Note: Timeout errors are DOWN, but if latency is high without timeout (e.g. partial response), handle accordingly
    // But mapNetworkError handles explicit error codes.
    // If latency > threshold and we have a DOWN error, it's typically still DOWN.
    // However, user logic previously set DOWN(TIMEOUT) if latency > 5000.
    // We'll keep logic consistent with generic threshold usage where appropriate, but network errors are usually fatal.

    return error;
}

// Import shared status codes
import { HTTP_STATUS_CODES } from './http-status-codes.js';

/**
 * Maps HTTP Status Codes (MDN Standards)
 */
function mapHTTPStatus(code, latency, threshold) {
    const codeStr = code.toString();
    const statusInfo = HTTP_STATUS_CODES[codeStr];

    // Default fallback if code not found in dictionary
    const name = statusInfo ? statusInfo.name : 'Unknown Status';
    const description = statusInfo ? statusInfo.description : 'No description available';

    // 2xx Success
    if (code >= 200 && code < 300) {
        if (latency > threshold) {
            return {
                state: "🟡 DEGRADED",
                type: "SLOW_RESPONSE",
                msg: `Slow success: ${latency}ms`,
                errorType: "SLOW_RESPONSE",
                severity: "WARNING"
            };
        }
        return {
            state: "🟢 UP",
            msg: `${name} (${code})`,
            errorType: "HTTP_SUCCESS",
            severity: "INFO"
        };
    }

    // 3xx Redirection
    if (code >= 300 && code < 400) {
        return {
            state: "🟢 UP",
            msg: `Redirect: ${name} (${code})`,
            errorType: "HTTP_REDIRECT",
            severity: "INFO"
        };
    }

    // 429 Too Many Requests -> DEGRADED (Special handling)
    if (code === 429) {
        return {
            state: "🟡 DEGRADED",
            type: "RATE_LIMITED",
            msg: `Rate Limited: ${name} (${code}) - ${description}`,
            errorType: "HTTP_RATE_LIMIT",
            severity: "WARNING"
        };
    }

    // 4xx Client Errors
    if (code >= 400 && code < 500) {
        return {
            state: "🔴 DOWN",
            type: "CLIENT_ERROR",
            msg: `Client Error: ${name} (${code}) - ${description}`,
            errorType: statusInfo ? `HTTP_${statusInfo.name.toUpperCase().replace(/\s+/g, '_')}` : "HTTP_CLIENT_ERROR",
            severity: "ERROR"
        };
    }

    // 5xx Server Errors
    if (code >= 500) {
        const customMsg = code === 503
            ? `Service Temporarily Unavailable: ${name} (${code})`
            : `Server Error: ${name} (${code}) - ${description}`;

        return {
            state: "🔴 DOWN",
            type: "SERVER_ERROR",
            msg: customMsg,
            errorType: statusInfo ? `HTTP_${statusInfo.name.toUpperCase().replace(/\s+/g, '_')}` : "HTTP_SERVER_ERROR",
            severity: "ERROR"
        };
    }

    // 1xx Informational -> DEGRADED
    if (code >= 100 && code < 200) {
        return {
            state: "🟡 DEGRADED",
            type: "INFORMATIONAL",
            msg: `Interim Response: ${name} (${code}) - ${description}`,
            errorType: "HTTP_INFORMATIONAL",
            severity: "WARNING"
        };
    }

    return {
        state: "🔴 DOWN",
        type: "HTTP_ERROR",
        msg: `HTTP Error: ${code}`,
        errorType: "HTTP_ERROR",
        severity: "ERROR"
    };
}

/**
 * Maps Protocol Status (TCP, UDP, DNS)
 */
function mapProtocolStatus(protocol, errorCode, latency, threshold, timeout = 30000) {
    if (errorCode) {
        // Protocol-specific error handling
        if (protocol === 'tcp') {
            if (errorCode === 'CONNECTION_REFUSED') {
                return {
                    state: "🔴 DOWN",
                    type: "CONNECTION_REFUSED",
                    msg: "TCP connection refused - port closed.",
                    errorType: "TCP_CONNECTION_REFUSED",
                    severity: "ERROR"
                };
            }
        } else if (protocol === 'dns') {
            if (errorCode === 'ENOTFOUND' || errorCode === 'NXDOMAIN') {
                return {
                    state: "🔴 DOWN",
                    type: "DNS_NOT_FOUND",
                    msg: "DNS resolution failed - domain not found.",
                    errorType: "DNS_NOT_FOUND",
                    severity: "ERROR"
                };
            }
        } else if (protocol === 'udp') {
            if (errorCode === 'UDP_NO_RESPONSE') {
                return {
                    state: "🔴 DOWN",
                    type: "UDP_UNREACHABLE",
                    msg: "UDP service not responding.",
                    errorType: "UDP_NO_RESPONSE",
                    severity: "ERROR"
                };
            }
        }

        // Default error handling
        return {
            state: "🔴 DOWN",
            type: "PROTOCOL_ERROR",
            msg: `${protocol.toUpperCase()} protocol error: ${errorCode}`,
            errorType: `${protocol.toUpperCase()}_ERROR`,
            severity: "ERROR"
        };
    }

    // Success case
    // Check for "Stalled" (latency >= timeout) - strictly for UDP/TCP lenient modes
    if (latency >= timeout - 100) {
        return {
            state: "🟡 DEGRADED",
            type: "STALLED",
            msg: `${protocol.toUpperCase()} response timed out (${latency}ms) but host reachable.`,
            errorType: "TIMEOUT_LENIENT_UP",
            severity: "WARNING"
        };
    }

    if (latency > threshold) {
        return {
            state: "🟡 DEGRADED",
            type: "SLOW_RESPONSE",
            msg: `Slow ${protocol.toUpperCase()} response: ${latency}ms`,
            errorType: "SLOW_RESPONSE",
            severity: "WARNING"
        };
    }

    return {
        state: "🟢 UP",
        msg: `${protocol.toUpperCase()} service is healthy.`,
        errorType: "PROTOCOL_SUCCESS",
        severity: "INFO"
    };
}

/**
 * Maps SMTP Status
 */
function mapSMTPStatus(statusCode, latency, threshold, existingMessage) {
    // Convert to string for comparison
    const code = statusCode ? statusCode.toString() : '';

    // 220 = Ready banner, 250 = EHLO/HELO success (both mean SMTP is working)
    if (code.startsWith('220') || code.startsWith('250')) {
        if (latency > threshold) {
            return {
                state: "🟡 DEGRADED",
                type: "SLOW_RESPONSE",
                msg: `Slow SMTP response: ${latency}ms`,
                errorType: "SLOW_RESPONSE",
                severity: "WARNING"
            };
        }
        return {
            state: "🟢 UP",
            msg: "SMTP server is ready.",
            errorType: "SMTP_SUCCESS",
            severity: "INFO"
        };
    }

    if (code.startsWith('421')) {
        return {
            state: "🔴 DOWN",
            type: "SMTP_UNAVAILABLE",
            msg: `SMTP service unavailable (${code}).`,
            errorType: "SMTP_SERVICE_UNAVAILABLE",
            severity: "ERROR"
        };
    }

    if (code.startsWith('5')) {
        return {
            state: "🔴 DOWN",
            type: "SMTP_ERROR",
            msg: `SMTP server error (${code}).`,
            errorType: "SMTP_SERVER_ERROR",
            severity: "ERROR"
        };
    }

    return {
        state: "🔴 DOWN",
        type: "SMTP_NO_BANNER",
        msg: existingMessage || "SMTP server did not send 220 banner.",
        errorType: "SMTP_NO_BANNER",
        severity: "ERROR"
    };
}


/**
 * Format SSL Error messages
 */
function formatSSLError(error) {
    if (typeof error === 'string') {
        return error;
    }

    if (error.code) {
        switch (error.code) {
            case 'CERT_HAS_EXPIRED':
                return 'SSL certificate has expired (CERT_HAS_EXPIRED)';
            case 'CERT_NOT_YET_VALID':
                return 'Certificate not yet valid (CERT_NOT_YET_VALID)';
            case 'ERR_TLS_CERT_ALTNAME_INVALID':
                return 'Hostname mismatch (ERR_TLS_CERT_ALTNAME_INVALID)';
            case 'DEPTH_ZERO_SELF_SIGNED_CERT':
                return 'Certificate is self-signed (DEPTH_ZERO_SELF_SIGNED_CERT)';
            case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
                return 'Untrusted Certificate Authority (UNABLE_TO_VERIFY_LEAF_SIGNATURE)';
            default:
                return `SSL Error: ${error.code}`;
        }
    }

    if (error.message) {
        return error.message;
    }

    return 'SSL certificate error';
}

/**
 * Enhanced Health Evaluator Class
 * Integrates with our existing system
 */
class EnhancedHealthEvaluator {
    constructor() {
        this.errorMap = {
            // ... (keeping existing map, not repeated here for brevity but assuming class structure is preserved)
            // HTTP errors
            'HTTP_TIMEOUT': 'HTTP_TIMEOUT',
            'HTTP_SERVER_ERROR': 'HTTP_SERVER_ERROR',
            'HTTP_CLIENT_ERROR': 'HTTP_CLIENT_ERROR',
            'HTTP_RATE_LIMIT': 'HTTP_RATE_LIMIT',
            'HTTP_NOT_FOUND': 'HTTP_NOT_FOUND',
            'HTTP_FORBIDDEN': 'HTTP_FORBIDDEN',

            // SSL errors
            'SSL_EXPIRED': 'SSL_EXPIRED',
            'SSL_HOSTNAME_MISMATCH': 'SSL_HOSTNAME_MISMATCH',
            'SSL_SELF_SIGNED': 'SSL_SELF_SIGNED',
            'SSL_SIGNATURE_INVALID': 'SSL_SIGNATURE_INVALID',

            // Network errors
            'CONNECTION_REFUSED': 'CONNECTION_REFUSED',
            'CONNECTION_TIMEOUT': 'CONNECTION_TIMEOUT',
            'HOST_UNREACHABLE': 'HOST_UNREACHABLE',
            'NETWORK_UNREACHABLE': 'NETWORK_UNREACHABLE',

            // Protocol errors
            'DNS_NOT_FOUND': 'DNS_NOT_FOUND',
            'UDP_NO_RESPONSE': 'UDP_NO_RESPONSE',
            'SMTP_NO_BANNER': 'SMTP_NO_BANNER',
            'SMTP_SERVICE_UNAVAILABLE': 'SMTP_SERVICE_UNAVAILABLE',

            // Performance errors
            'SLOW_RESPONSE': 'SLOW_RESPONSE',
            'HIGH_LATENCY': 'HIGH_LATENCY'
        };
    }

    /**
     * Evaluate health state based on raw monitoring result
     */
    evaluate(result, monitor) {
        // Prepare the input for the evaluateHealth function
        const evaluationInput = {
            protocol: monitor.type?.toLowerCase(),
            statusCode: result.statusCode,
            errorCode: result.errorType,
            latency: result.responseTime || result.responseTimeMs || 0,
            sslInfo: result.meta?.sslInfo || null,
            message: result.errorMessage
        };

        // Get threshold: explicit monitor threshold OR default 2000ms
        // Note: Protocol specific defaults are handled by caller if needed, 
        // but here we want a safe fallback.
        // We can fetch protocol defaults if we want, but 2000ms is a safe "slow" baseline.
        const threshold = (monitor.degradedThresholdMs && monitor.degradedThresholdMs > 0)
            ? monitor.degradedThresholdMs
            : 2000;

        // Use the main evaluation function with dynamic threshold and timeout
        const evaluation = evaluateHealth(evaluationInput, threshold, monitor.timeout || 30000);

        // Return enhanced result with additional metadata
        // Only include reasons for non-success states (warnings, errors, degraded)
        const isSuccess = evaluation.state.includes('UP') && evaluation.severity === 'INFO';

        return {
            status: this.mapStateToStandard(evaluation.state),
            errorType: evaluation.errorType,
            message: evaluation.msg || evaluation.message,
            severity: evaluation.severity,
            reasons: isSuccess ? [] : [evaluation.msg || evaluation.message],
            confidence: this.calculateConfidence(evaluation, result),
            analysis: {
                originalResult: result,
                evaluationInput,
                protocol: monitor.type,
                responseTime: result.responseTime || result.responseTimeMs || 0
            }
        };
    }

    /**
     * Map state emoji to standard status
     */
    mapStateToStandard(state) {
        if (state.includes('UP')) return 'up';
        if (state.includes('DEGRADED')) return 'degraded';
        if (state.includes('DOWN')) return 'down';
        return 'unknown';
    }

    /**
     * Calculate confidence based on evaluation
     */
    calculateConfidence(evaluation, result) {
        if (evaluation.severity === 'CRITICAL') return 0.95;
        if (evaluation.severity === 'ERROR') return 0.95; // High confidence for standard errors
        if (evaluation.severity === 'WARNING') return 0.8;
        if (evaluation.severity === 'INFO') return 0.95;
        return 0.5; // Unknown severity
    }

    /**
     * Get user-friendly alert message based on evaluation
     */
    getUserAlertMessage(evaluation, monitor) {
        const baseMessage = evaluation.msg || evaluation.message || 'Service status changed';

        // Create specific messages based on error type
        switch (evaluation.errorType) {
            case 'HTTP_SERVER_ERROR':
                return `Backend Unreachable: ${baseMessage}`;
            case 'HTTP_NOT_FOUND':
                return `Resource Not Found: ${baseMessage}`;
            case 'SLOW_RESPONSE':
                return `Performance Degradation: ${baseMessage}`;
            case 'SSL_EXPIRED':
                return `Security Risk: ${baseMessage}`;
            case 'DNS_NOT_FOUND':
                return `DNS Resolution Failure: ${baseMessage}`;
            default:
                return `${baseMessage}`;
        }
    }
}

export default new EnhancedHealthEvaluator();
export { evaluateHealth, EnhancedHealthEvaluator };