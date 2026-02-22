/**
 * Comprehensive Error Classification System
 * Complete error type definitions for all protocols with UP/DOWN/DEGRADED/UNKNOWN mapping
 */

import { getStatusCodeCategory, getStatusCodeName } from './http-status-codes.js';

// HTTP/HTTPS Error Classifications
export const HTTP_ERROR_TYPES = {
    // Network-level errors (highest severity - typically DOWN)
    'DNS_ERROR': {
        severity: 1.0,
        healthState: 'DOWN',
        description: 'Domain Name System resolution failed',
        examples: ['ENOTFOUND', 'DNS_PROBE_FINISHED_NXDOMAIN'],
        protocols: ['HTTP', 'HTTPS', 'TCP', 'UDP', 'SMTP', 'SSL']
    },

    // Configuration/Input Errors (highest severity - DOWN)
    'INVALID_URL': {
        severity: 1.0,
        healthState: 'DOWN',
        description: 'Malformed URL: The address provided is not a valid URI',
        examples: ['Invalid URL format', 'URI parsing failed'],
        protocols: ['HTTP', 'HTTPS', 'TCP', 'UDP', 'DNS']
    },
    'PROTOCOL_MISMATCH': {
        severity: 1.0,
        healthState: 'DOWN',
        description: 'Protocol Mismatch: Expected HTTP/S but received non-HTTP protocol',
        examples: ['ftp://', 'ssh://', 'mailto:'],
        protocols: ['HTTP', 'HTTPS']
    },
    'MALFORMED_STRUCTURE': {
        severity: 1.0,
        healthState: 'DOWN',
        description: 'Invalid URL Structure: Missing hostname (Triple slash error)',
        examples: ['http:///example.com', 'https:///test.com'],
        protocols: ['HTTP', 'HTTPS']
    },
    'MISSING_TARGET': {
        severity: 1.0,
        healthState: 'DOWN',
        description: 'No target provided: Empty domain name or missing hostname',
        examples: ['', 'empty string', 'no hostname'],
        protocols: ['HTTP', 'HTTPS', 'DNS']
    },
    'CONNECTION_REFUSED': {
        severity: 1.0,
        healthState: 'DOWN',
        description: 'Connection was refused by the server',
        examples: ['ECONNREFUSED'],
        protocols: ['HTTP', 'HTTPS', 'TCP', 'UDP', 'SMTP', 'SSL']
    },
    'CONNECTION_RESET': {
        severity: 1.0,
        healthState: 'DOWN',
        description: 'Connection was forcibly closed by the server',
        examples: ['ECONNRESET'],
        protocols: ['HTTP', 'HTTPS', 'TCP', 'UDP', 'SMTP', 'SSL']
    },
    'TIMEOUT': {
        severity: 0.95,
        healthState: 'DOWN',
        description: 'Request timed out before completion',
        examples: ['ECONNABORTED', 'ETIMEDOUT', 'timeout'],
        protocols: ['HTTP', 'HTTPS', 'TCP', 'UDP', 'DNS', 'SMTP', 'SSL']
    },
    'NETWORK_UNREACHABLE': {
        severity: 1.0,
        healthState: 'DOWN',
        description: 'Network is unreachable',
        examples: ['ENETUNREACH'],
        protocols: ['HTTP', 'HTTPS', 'TCP', 'UDP', 'DNS', 'SMTP', 'SSL']
    },
    'HOST_UNREACHABLE': {
        severity: 1.0,
        healthState: 'DOWN',
        description: 'Host is unreachable',
        examples: ['EHOSTUNREACH'],
        protocols: ['HTTP', 'HTTPS', 'TCP', 'UDP', 'DNS', 'SMTP', 'SSL']
    },

    // SSL/TLS errors (typically DOWN, but some might be DEGRADED for self-signed)
    'SSL_ERROR': {
        severity: 0.9,
        healthState: 'DOWN',
        description: 'General SSL/TLS error',
        examples: ['SSL_ERROR', 'TLS_ERROR'],
        protocols: ['HTTPS', 'SSL']
    },
    'CERT_EXPIRED': {
        severity: 0.95,
        healthState: 'DOWN',
        description: 'SSL certificate has expired',
        examples: ['CERT_HAS_EXPIRED', 'certificate has expired'],
        protocols: ['HTTPS', 'SSL']
    },
    'CERT_NOT_YET_VALID': {
        severity: 0.95,
        healthState: 'DOWN',
        description: 'SSL certificate is not yet valid',
        examples: ['CERT_NOT_YET_VALID', 'certificate is not valid yet'],
        protocols: ['HTTPS', 'SSL']
    },
    'CERT_HOSTNAME_MISMATCH': {
        severity: 0.9,
        healthState: 'DOWN',
        description: 'SSL certificate hostname does not match',
        examples: ['HOSTNAME_MISMATCH', 'hostname mismatch'],
        protocols: ['HTTPS', 'SSL']
    },
    'SSL_UNTRUSTED_CERT': {
        severity: 0.1,
        healthState: 'UP',
        description: 'Untrusted Certificate Authority — site is reachable but cert is not from a public CA',
        examples: ['UNABLE_TO_VERIFY_LEAF_SIGNATURE'],
        protocols: ['HTTPS', 'SSL']
    },
    'SELF_SIGNED_CERT': {
        severity: 0.1,
        healthState: 'UP',
        description: 'Self-signed certificate — site is reachable but cert is not browser-trusted',
        examples: ['self signed certificate', 'DEPTH_ZERO_SELF_SIGNED_CERT'],
        protocols: ['HTTPS', 'SSL']
    },
    'CERT_CHAIN_ERROR': {
        severity: 0.4,
        healthState: 'DEGRADED',
        description: 'SSL certificate chain is incomplete — server is missing an intermediate CA certificate',
        examples: ['UNABLE_TO_GET_ISSUER_CERT', 'certificate chain error', 'SSL_CHAIN_ERROR'],
        protocols: ['HTTPS', 'SSL']
    },
    'SSL_CHAIN_ERROR': {
        severity: 0.4,
        healthState: 'DEGRADED',
        description: 'SSL certificate chain is incomplete — server is missing an intermediate CA certificate',
        examples: ['SSL_CHAIN_ERROR'],
        protocols: ['HTTPS', 'SSL']
    },
    'CERT_REVOKED': {
        severity: 1.0,
        healthState: 'DOWN',
        description: 'SSL certificate has been revoked by the issuing authority',
        examples: ['certificate revoked', 'OCSP revoked'],
        protocols: ['HTTPS', 'SSL']
    },
    'ERR_SSL_EXCESSIVE_MESSAGE_SIZE': {
        severity: 1.0,
        healthState: 'DOWN',
        description: 'SSL Handshake Failed: Certificate too large (>16KB)',
        examples: ['excessive message size'],
        protocols: ['HTTPS', 'SSL']
    },

    // HTTP-specific errors
    'HTTP_ERROR': {
        severity: 0.7,
        healthState: 'DOWN',
        description: 'General HTTP error',
        examples: ['HTTP_ERROR'],
        protocols: ['HTTP', 'HTTPS']
    },
    'HTTP_PROTOCOL_ERROR': {
        severity: 0.8,
        healthState: 'DOWN',
        description: 'HTTP protocol error',
        examples: ['PROTOCOL_ERROR', 'Invalid HTTP status line'],
        protocols: ['HTTP', 'HTTPS']
    },
    'BAD_GATEWAY': {
        severity: 0.9,
        healthState: 'DOWN',
        description: 'Bad gateway error (502)',
        examples: ['502', 'Bad Gateway'],
        protocols: ['HTTP', 'HTTPS']
    },
    'SERVICE_UNAVAILABLE': {
        severity: 0.9,
        healthState: 'DOWN',
        description: 'Service unavailable (503)',
        examples: ['503', 'Service Unavailable'],
        protocols: ['HTTP', 'HTTPS']
    },

    // Partial failures (typically DEGRADED)
    'SLOW_RESPONSE': {
        severity: 0.5,
        healthState: 'DEGRADED',
        description: 'Response time exceeds threshold',
        examples: ['Response time too slow'],
        protocols: ['HTTP', 'HTTPS', 'TCP', 'UDP', 'DNS', 'SMTP', 'SSL']
    },
    'HIGH_LATENCY': {
        severity: 0.5,
        healthState: 'DEGRADED',
        description: 'Response time exceeds configured latency threshold',
        examples: ['Slow response', 'latency exceeded'],
        protocols: ['HTTP', 'HTTPS', 'TCP', 'UDP', 'DNS', 'SMTP', 'SSL', 'PING']
    },
    'REDIRECT_LOOP': {
        severity: 0.9,
        healthState: 'DOWN',
        description: 'Too many redirects — server is caught in a redirect loop',
        examples: ['Too many redirects', 'redirect loop'],
        protocols: ['HTTP', 'HTTPS']
    },
    'SMTP_TEMPORARILY_UNAVAILABLE': {
        severity: 0.5,
        healthState: 'DEGRADED',
        description: 'SMTP service temporarily unavailable (421) — server is reachable',
        examples: ['421 Service Temporarily Unavailable'],
        protocols: ['SMTP']
    },
    'PARTIAL_CONTENT': {
        severity: 0.3,
        healthState: 'DEGRADED',
        description: 'Partial content received (206)',
        examples: ['206', 'Partial Content'],
        protocols: ['HTTP', 'HTTPS']
    },

    // Warning-level issues (typically DEGRADED with low severity)
    'SSL_WARNING': {
        severity: 0.3,
        healthState: 'DEGRADED',
        description: 'SSL certificate warning (expiring soon)',
        examples: ['Certificate expiring in X days'],
        protocols: ['HTTPS', 'SSL']
    },
    'HTTP_WARNING': {
        severity: 0.2,
        healthState: 'DEGRADED',
        description: 'HTTP warning (non-critical issue)',
        examples: ['HTTP Warning'],
        protocols: ['HTTP', 'HTTPS']
    },

    // PING/ICMP Error Classifications
    'PING_TIMEOUT': {
        severity: 0.95,
        healthState: 'DOWN',
        description: 'ICMP ping request timed out',
        examples: ['Request timed out', 'timeout', 'Timed out'],
        protocols: ['PING']
    },
    'PING_HOST_UNREACHABLE': {
        severity: 1.0,
        healthState: 'DOWN',
        description: 'Host is unreachable via ICMP ping',
        examples: ['Destination Host Unreachable', 'EHOSTUNREACH', 'host unreachable'],
        protocols: ['PING']
    },
    'PING_NETWORK_UNREACHABLE': {
        severity: 1.0,
        healthState: 'DOWN',
        description: 'Network is unreachable',
        examples: ['Network is Unreachable', 'ENETUNREACH', 'network unreachable'],
        protocols: ['PING']
    },
    'PING_DESTINATION_UNREACHABLE': {
        severity: 1.0,
        healthState: 'DOWN',
        description: 'Destination is unreachable',
        examples: ['Destination Unreachable', 'Destination Host Prohibited'],
        protocols: ['PING']
    },
    'PING_TTL_EXPIRED': {
        severity: 0.7,
        healthState: 'DEGRADED',
        description: 'Time to Live expired during ping',
        examples: ['Time to live exceeded', 'TTL expired'],
        protocols: ['PING']
    },
    'PING_TRANSMISSION_FAILED': {
        severity: 0.9,
        healthState: 'DOWN',
        description: 'Ping transmission failed',
        examples: [' transmit failed', 'sendto failed', 'General failure'],
        protocols: ['PING']
    },
    'PING_ERROR': {
        severity: 0.8,
        healthState: 'DOWN',
        description: 'General ICMP ping error',
        examples: ['ping failed', 'ping error'],
        protocols: ['PING']
    },

    // Informational Response (1xx) - Interim response, not final
    'INTERIM_RESPONSE_TIMEOUT': {
        severity: 0.6,
        healthState: 'DEGRADED',
        description: 'Informational response (1xx) - Server sent interim response but no final response',
        examples: ['100 Continue', '102 Processing', '103 Early Hints'],
        protocols: ['HTTP', 'HTTPS']
    }
};

// Protocol-specific error mappings
export const PROTOCOL_ERROR_MAPPINGS = {
    HTTP: {
        '1xx': 'INFORMATIONAL',
        '2xx': 'UP',
        '3xx': 'UP', // Redirects are generally considered UP
        '4xx': 'CLIENT_ERROR',
        '5xx': 'SERVER_ERROR'
    },
    HTTPS: {
        '1xx': 'INFORMATIONAL',
        '2xx': 'UP',
        '3xx': 'UP',
        '4xx': 'CLIENT_ERROR',
        '5xx': 'SERVER_ERROR'
    },
    TCP: {
        'SUCCESS': 'UP',
        'CONNECTION_REFUSED': 'DOWN',
        'TIMEOUT': 'DOWN',
        'CONNECTION_RESET': 'DOWN',
        'NETWORK_ERROR': 'DOWN'
    },
    UDP: {
        'SUCCESS': 'UP',
        'TIMEOUT': 'DOWN',
        'PORT_UNREACHABLE': 'DOWN',
        'NETWORK_ERROR': 'DOWN'
    },
    DNS: {
        'SUCCESS': 'UP',
        'NXDOMAIN': 'DOWN',
        'SERVFAIL': 'DOWN',
        'REFUSED': 'DOWN',
        'TIMEOUT': 'DOWN'
    },
    SMTP: {
        'SUCCESS': 'UP',
        'CONNECTION_REFUSED': 'DOWN',
        'AUTH_FAILED': 'DOWN',
        'MAILBOX_UNAVAILABLE': 'DOWN',
        'TIMEOUT': 'DOWN'
    },
    SSL: {
        'SUCCESS': 'UP',
        'CERT_ERROR': 'DOWN',
        'PROTOCOL_ERROR': 'DOWN',
        'TIMEOUT': 'DOWN'
    },
    PING: {
        'SUCCESS': 'UP',
        'PING_TIMEOUT': 'DOWN',
        'PING_HOST_UNREACHABLE': 'DOWN',
        'PING_NETWORK_UNREACHABLE': 'DOWN',
        'PING_DESTINATION_UNREACHABLE': 'DOWN',
        'PING_TTL_EXPIRED': 'DEGRADED',
        'PING_TRANSMISSION_FAILED': 'DOWN',
        'PING_ERROR': 'DOWN'
    }
};

// Health state determination logic
export function determineHealthStateFromError(errorType, statusCode, protocol, responseTime, monitor = {}) {
    try {
        // Get protocol-specific threshold for slow response detection
        const degradedThresholdMs = getThresholdForProtocol(protocol, monitor);

        // If we have a specific HTTP status code, use it as primary indicator
        if (statusCode && protocol.match(/HTTP|HTTPS/)) {
            const category = getStatusCodeCategory(statusCode);
            const code = parseInt(statusCode);

            // DEBUG
            // console.log(`[EC-DEBUG] Code: ${code}, Category: ${category}, Protocol: ${protocol}`);


            switch (category) {
                case 'SERVER_ERROR':
                    return {
                        healthState: 'DOWN',
                        severity: 0.9,
                        reason: `Server error: ${code} ${getStatusCodeName(code)}`
                    };
                case 'REDIRECT':
                    // If we have a redirect error (loop/too many), it should be caught here 
                    // or in the errorType check below.
                    if (errorType === 'REDIRECT_LOOP') {
                        return { healthState: 'DOWN', severity: 0.9, reason: 'Too many redirects (Redirect Loop)' };
                    }
                    // Regular redirects are UP if within threshold
                    if (responseTime && responseTime > degradedThresholdMs) {
                        return { healthState: 'DEGRADED', severity: Math.min(responseTime / 10000, 0.6), reason: `Slow response: ${responseTime}ms (threshold: ${degradedThresholdMs}ms)` };
                    }
                    return { healthState: 'UP', severity: 0.0, reason: 'Redirect response' };
                default:
                    console.log(`[EC-DEBUG] Hit Default for category: ${category}`);
                    return { healthState: 'UNKNOWN', severity: 0.5, reason: 'Unknown status code' };
            }
        }

        // Use error type for non-HTTP protocols or when no status code
        if (errorType && HTTP_ERROR_TYPES[errorType]) {
            const errorInfo = HTTP_ERROR_TYPES[errorType];
            return {
                healthState: errorInfo.healthState,
                severity: errorInfo.severity,
                reason: errorInfo.description
            };
        }

        // Handle protocol-specific errors
        if (protocol && PROTOCOL_ERROR_MAPPINGS[protocol]) {
            const protocolMapping = PROTOCOL_ERROR_MAPPINGS[protocol];
            const mappedState = protocolMapping[errorType] || protocolMapping[statusCode];

            if (mappedState) {
                return {
                    healthState: mappedState,
                    severity: mappedState === 'UP' ? 0.0 : mappedState === 'DEGRADED' ? 0.5 : 0.8,
                    reason: `${protocol} ${errorType || statusCode}`
                };
            }
        }

        // Check response time for performance degradation (fallback for any protocol/situation)
        if (responseTime && responseTime > degradedThresholdMs) {
            return {
                healthState: 'DEGRADED',
                severity: Math.min(responseTime / 10000, 0.6),
                reason: `Slow response: ${responseTime}ms (threshold: ${degradedThresholdMs}ms)`
            };
        }

        // Default fallback
        return {
            healthState: 'UNKNOWN',
            severity: 0.5,
            reason: 'Unable to determine health state'
        };
    } catch (e) {
        console.error('[EC-CRASH] determineHealthStateFromError crashed:', e);
        return { healthState: 'UNKNOWN', severity: 1, reason: 'Internal Logic Error' };
    }
}

/**
 * Get protocol-specific threshold for slow response detection
 * "No-Guesswork" defaults based on realistic network conditions
 */
function getThresholdForProtocol(protocol, monitor = {}) {
    // Protocol-specific thresholds
    const PROTOCOL_THRESHOLDS = {
        HTTP: 5000,
        HTTPS: 5000,
        PING: 1500,
        TCP: 3000,
        UDP: 3000,
        DNS: 2000,
        SMTP: 3000,
        SSL: 3000
    };

    // If monitor has explicit threshold, use it
    if (monitor.degradedThresholdMs && monitor.degradedThresholdMs > 0) {
        return monitor.degradedThresholdMs;
    }

    // Otherwise, use protocol-specific default
    const protocolUpper = protocol?.toUpperCase();
    return PROTOCOL_THRESHOLDS[protocolUpper] || 2000;
}

// Error message formatting
export function formatErrorMessage(error, protocol, statusCode) {
    if (error.message) {
        return error.message;
    }

    if (statusCode && protocol.match(/HTTP|HTTPS/)) {
        return `HTTP ${statusCode}: ${getStatusCodeName(statusCode)}`;
    }

    if (error.code) {
        return `${protocol} Error: ${error.code}`;
    }

    return `${protocol} Error: Unknown error occurred`;
}

// Comprehensive error type detection
export function detectErrorType(error, protocol, response) {
    // Handle null/undefined error gracefully
    if (!error) return 'UNKNOWN_ERROR';

    // Network-level errors
    if (error.code === 'ENOTFOUND' || error.message?.includes('getaddrinfo')) {
        return 'DNS_ERROR';
    } else if (error.code === 'ECONNREFUSED') {
        return 'CONNECTION_REFUSED';
    } else if (error.code === 'ECONNRESET') {
        return 'CONNECTION_RESET';
    } else if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT' || error.message?.includes('timeout') || error.message?.includes('timed out')) {
        return 'TIMEOUT';
    } else if (error.code === 'ENETUNREACH') {
        return 'NETWORK_UNREACHABLE';
    } else if (error.code === 'EHOSTUNREACH') {
        return 'HOST_UNREACHABLE';
    }

    // SSL/TLS errors
    if (error.message?.includes('certificate') || error.message?.includes('SSL') || error.message?.includes('TLS')) {
        if (error.message?.includes('revoked')) return 'CERT_REVOKED';
        else if (error.message?.includes('expired')) return 'CERT_EXPIRED';
        else if (error.message?.includes('not yet valid')) return 'CERT_NOT_YET_VALID';
        else if (error.message?.includes('hostname') || error.message?.includes('match') || error.message?.includes('mismatch')) return 'CERT_HOSTNAME_MISMATCH';
        else if (error.message?.includes('self signed') || error.message?.includes('self-signed')) return 'SELF_SIGNED_CERT';
        else if (error.message?.includes('chain') || error.message?.includes('issuer')) return 'CERT_CHAIN_ERROR';
        else if (error.message?.includes('excessive message size')) return 'ERR_SSL_EXCESSIVE_MESSAGE_SIZE';
        return 'SSL_ERROR';
    }

    // HTTP status code based errors
    if (response?.status) {
        const { status } = response;
        if (status >= 500) return 'SERVER_ERROR';
        if (status >= 400) return 'CLIENT_ERROR';
        if (status >= 300) return 'REDIRECT';
        if (status >= 200) return 'SUCCESS';
        if (status >= 100) return 'INTERIM_RESPONSE_TIMEOUT';
    }

    // Protocol-specific errors
    if (error.code === 'REDIRECT_LOOP' || error.message?.includes('redirect loop') || error.message?.includes('Too many redirects')) {
        return 'REDIRECT_LOOP';
    }

    if (protocol === 'SMTP' && error.message?.includes('SMTP')) {
        return 'SMTP_ERROR';
    }

    // PING (ICMP) specific errors
    if (protocol === 'PING') {
        const errorMsg = error.message?.toLowerCase() || '';
        const errorCode = error.code || '';

        if (errorMsg.includes('timeout') || errorMsg.includes('timed out') || errorCode === 'ETIMEDOUT') {
            return 'PING_TIMEOUT';
        }
        if (errorMsg.includes('host unreachable') || errorCode === 'EHOSTUNREACH') {
            return 'PING_HOST_UNREACHABLE';
        }
        if (errorMsg.includes('network unreachable') || errorCode === 'ENETUNREACH') {
            return 'PING_NETWORK_UNREACHABLE';
        }
        if (errorMsg.includes('destination unreachable') || errorMsg.includes('prohibited')) {
            return 'PING_DESTINATION_UNREACHABLE';
        }
        if (errorMsg.includes('ttl expired') || errorMsg.includes('time to live exceeded')) {
            return 'PING_TTL_EXPIRED';
        }
        if (errorMsg.includes('transmit failed') || errorMsg.includes('sendto failed') || errorMsg.includes('general failure')) {
            return 'PING_TRANSMISSION_FAILED';
        }
        return 'PING_ERROR';
    }

    // Default error type
    return 'UNKNOWN_ERROR';
}

export default {
    HTTP_ERROR_TYPES,
    PROTOCOL_ERROR_MAPPINGS,
    determineHealthStateFromError,
    formatErrorMessage,
    detectErrorType
};
