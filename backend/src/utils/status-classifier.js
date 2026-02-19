/**
 * Protocol Status Classifier
 * 
 * Maps protocol-specific check results to:
 * 🟢 UP - Service is reachable, functional, and fast
 * 🟡 DEGRADED - Service working but struggling (slow, retrying, packet loss, expiring SSL)
 * 🔴 DOWN - Service unreachable, broken, or returning fatal errors
 * ⚪ UNKNOWN - Monitor lost internet access
 * 
 * Used by all protocol workers (HTTP, TCP, DNS, SMTP, ICMP, UDP, SSL)
 */

import { getStatusCodeName, getStatusCodeDescription } from './http-status-codes.js';

// ========================================
// STATUS CONSTANTS
// ========================================

export const STATUS = {
    UP: 'UP',
    DEGRADED: 'DEGRADED',
    DOWN: 'DOWN',
    UNKNOWN: 'UNKNOWN'
};

export const CONFIDENCE = {
    HIGH: 0.95,      // High confidence in status determination
    MEDIUM: 0.80,    // Medium confidence (some ambiguity)
    LOW: 0.60,       // Low confidence (could be network issue)
    UNCERTAIN: 0.40  // Very uncertain
};

// ========================================
// ERROR CLASSIFICATION BY PROTOCOL
// ========================================

export const ERROR_TYPES = {
    // HTTP/HTTPS Errors
    HTTP_INFORMATIONAL: 'HTTP_INFORMATIONAL',      // 1xx
    HTTP_SUCCESS: 'HTTP_SUCCESS',                   // 2xx
    HTTP_REDIRECT: 'HTTP_REDIRECT',                 // 3xx
    HTTP_CLIENT_ERROR: 'HTTP_CLIENT_ERROR',         // 4xx
    HTTP_SERVER_ERROR: 'HTTP_SERVER_ERROR',         // 5xx
    HTTP_RATE_LIMIT: 'HTTP_RATE_LIMIT',            // 429
    HTTP_TIMEOUT: 'HTTP_TIMEOUT',                   // Request timeout
    HIGH_LATENCY: 'HIGH_LATENCY',                   // Response too slow
    KEYWORD_MISMATCH: 'KEYWORD_MISMATCH',          // Content check failed
    REDIRECT_LOOP: 'REDIRECT_LOOP',                // Infinite redirect

    // SSL/TLS Errors
    CERT_EXPIRED: 'CERT_EXPIRED',                   // Certificate expired
    CERT_EXPIRING_SOON: 'CERT_EXPIRING_SOON',      // < 14 days
    SELF_SIGNED_CERT: 'SELF_SIGNED_CERT',          // Untrusted CA
    CERT_HOSTNAME_MISMATCH: 'CERT_HOSTNAME_MISMATCH', // Domain mismatch
    TLS_HANDSHAKE_FAILED: 'TLS_HANDSHAKE_FAILED',  // SSL protocol error
    WEAK_SIGNATURE: 'WEAK_SIGNATURE',              // SHA-1 or other weak algorithm

    // TCP Errors
    CONNECTION_REFUSED: 'CONNECTION_REFUSED',       // ECONNREFUSED
    CONNECTION_TIMEOUT: 'CONNECTION_TIMEOUT',       // ETIMEDOUT
    HOST_UNREACHABLE: 'HOST_UNREACHABLE',          // EHOSTUNREACH
    NETWORK_UNREACHABLE: 'NETWORK_UNREACHABLE',    // ENETUNREACH

    // SMTP Errors
    SMTP_CONNECT_FAILED: 'SMTP_CONNECT_FAILED',    // Can't connect to port
    SMTP_NO_BANNER: 'SMTP_NO_BANNER',              // No greeting received
    SMTP_SERVICE_UNAVAILABLE: 'SMTP_SERVICE_UNAVAILABLE', // 421
    SMTP_TRANSACTION_FAILED: 'SMTP_TRANSACTION_FAILED',   // 554
    SMTP_AUTH_FAILED: 'SMTP_AUTH_FAILED',          // Authentication error

    // DNS Errors
    DNS_NOT_FOUND: 'DNS_NOT_FOUND',                // ENOTFOUND / NXDOMAIN
    DNS_SERVER_FAILURE: 'DNS_SERVER_FAILURE',      // SERVFAIL
    DNS_TIMEOUT: 'DNS_TIMEOUT',                    // Resolution timeout
    DNS_SLOW: 'DNS_SLOW',                          // > 1000ms resolution

    // ICMP/Ping Errors
    PACKET_LOSS: 'PACKET_LOSS',                    // 1-99% loss
    HIGH_PING_LATENCY: 'HIGH_PING_LATENCY',        // RTT > 1s
    HOST_UNREACHABLE_PING: 'HOST_UNREACHABLE_PING', // 100% loss

    // UDP Errors
    UDP_PORT_UNREACHABLE: 'UDP_PORT_UNREACHABLE',  // ICMP port unreachable
    UDP_NO_RESPONSE: 'UDP_NO_RESPONSE',            // Timeout (unknown if up/down)

    // Generic Errors
    NETWORK_ERROR: 'NETWORK_ERROR',                // General connectivity issue
    UNKNOWN_ERROR: 'UNKNOWN_ERROR'                 // Uncategorized
};

// ========================================
// HTTP/HTTPS STATUS CLASSIFIER
// ========================================

export function classifyHttpResponse(statusCode, latency, options = {}) {
    const {
        latencyThreshold = 2000,
        keywordMatch = null,
        redirectCount = 0,
        maxRedirects = 5,
        expectedStatusCode = null,
        timeout = 30000 // Default 30s if not provided
    } = options;

    // Check for timeout first
    if (!statusCode || latency > timeout) {
        return {
            status: STATUS.DOWN,
            confidence: CONFIDENCE.HIGH,
            errorType: ERROR_TYPES.HTTP_TIMEOUT,
            reason: `Request timeout after ${latency}ms`,
            severity: 1.0
        };
    }

    // ========================================
    // 0. Handle Explicit Expected Status Code (Highest Priority)
    // ========================================
    if (expectedStatusCode !== null && expectedStatusCode !== undefined) {
        if (statusCode === expectedStatusCode) {
            // Check content matching even if status code matches
            if (statusCode >= 200 && statusCode < 300 && keywordMatch !== null && !keywordMatch.found) {
                return {
                    status: STATUS.DOWN,
                    confidence: CONFIDENCE.HIGH,
                    errorType: ERROR_TYPES.KEYWORD_MISMATCH,
                    reason: `Expected keyword "${keywordMatch.keyword}" not found in response body`,
                    severity: 0.9
                };
            }

            return {
                status: STATUS.UP,
                confidence: CONFIDENCE.HIGH,
                errorType: ERROR_TYPES.HTTP_SUCCESS,
                reason: `Service operational (HTTP ${statusCode} matches expected)`,
                severity: 0.0
            };
        } else {
            // Explicit mismatch
            return {
                status: STATUS.DOWN,
                confidence: CONFIDENCE.HIGH,
                errorType: ERROR_TYPES.HTTP_CLIENT_ERROR, // Or a more specific status code mismatch error
                reason: `Status Code Mismatch: Expected ${expectedStatusCode}, received ${statusCode}`,
                severity: 0.9
            };
        }
    }

    // ========================================
    // 1. Handle Server Crashes (5xx) → DOWN
    // ========================================
    if (statusCode >= 500 && statusCode < 600) {
        return {
            status: STATUS.DOWN,
            confidence: CONFIDENCE.HIGH,
            errorType: ERROR_TYPES.HTTP_SERVER_ERROR,
            reason: `${getStatusCodeName(statusCode)} (${statusCode}) - ${getStatusCodeDescription(statusCode)}`,
            severity: 1.0
        };
    }

    // ========================================
    // 2. Handle Client Errors (4xx) → DOWN
    // ========================================
    if (statusCode >= 400 && statusCode < 500) {
        // Special Case: Rate Limit
        if (statusCode === 429) {
            return {
                status: STATUS.DEGRADED,
                confidence: CONFIDENCE.MEDIUM,
                errorType: ERROR_TYPES.HTTP_RATE_LIMIT,
                reason: `${getStatusCodeName(statusCode)} (${statusCode}) - ${getStatusCodeDescription(statusCode)}`,
                severity: 0.8
            };
        }

        return {
            status: STATUS.DOWN,
            confidence: CONFIDENCE.HIGH,
            errorType: ERROR_TYPES.HTTP_CLIENT_ERROR,
            reason: `${getStatusCodeName(statusCode)} (${statusCode}) - ${getStatusCodeDescription(statusCode)}`,
            severity: statusCode === 404 ? 1.0 : 0.9 // 404 is definitive down
        };
    }

    // ========================================
    // 4. Handle Performance Issues (Slow Response)
    // Check latency for successful responses (2xx, 3xx)
    // ========================================
    if (statusCode >= 200 && statusCode < 400) {
        // Check content matching for 2xx
        if (statusCode >= 200 && statusCode < 300 && keywordMatch !== null && !keywordMatch.found) {
            return {
                status: STATUS.DOWN,
                confidence: CONFIDENCE.HIGH,
                errorType: ERROR_TYPES.KEYWORD_MISMATCH,
                reason: `Expected keyword "${keywordMatch.keyword}" not found in response body`,
                severity: 0.9
            };
        }

        // Check latency
        if (latency > latencyThreshold) {
            return {
                status: STATUS.DEGRADED,
                confidence: CONFIDENCE.MEDIUM,
                errorType: ERROR_TYPES.HIGH_LATENCY,
                reason: `Slow response: ${latency}ms (threshold: ${latencyThreshold}ms)`,
                severity: (latency - latencyThreshold) / latencyThreshold * 0.6
            };
        }
    }

    // ========================================
    // 5. Handle Redirects (3xx)
    // ========================================
    // ========================================
    // 5. Handle Redirects (3xx)
    // ========================================
    if (statusCode >= 300 && statusCode < 400) {
        if (redirectCount > maxRedirects) {
            return {
                status: STATUS.DOWN,
                confidence: CONFIDENCE.HIGH,
                errorType: ERROR_TYPES.REDIRECT_LOOP,
                reason: `Too many redirects (${redirectCount})`,
                severity: 0.9
            };
        }

        return {
            status: STATUS.UP,
            confidence: CONFIDENCE.MEDIUM,
            errorType: ERROR_TYPES.HTTP_REDIRECT,
            reason: `${getStatusCodeName(statusCode)} (${statusCode}) - ${getStatusCodeDescription(statusCode)}`,
            severity: 0.2
        };
    }

    // ========================================
    // 6. Handle Informational (1xx) → DEGRADED
    // ========================================
    if (statusCode >= 100 && statusCode < 200) {
        return {
            status: STATUS.DEGRADED,
            confidence: CONFIDENCE.MEDIUM,
            errorType: ERROR_TYPES.HTTP_INFORMATIONAL,
            reason: `${getStatusCodeName(statusCode)} (${statusCode}) - ${getStatusCodeDescription(statusCode)}`,
            severity: 0.6
        };
    }

    // ========================================
    // 7. Success (2xx) → UP
    // ========================================
    if (statusCode >= 200 && statusCode < 300) {
        return {
            status: STATUS.UP,
            confidence: CONFIDENCE.HIGH,
            errorType: ERROR_TYPES.HTTP_SUCCESS,
            reason: `${getStatusCodeName(statusCode)} (${statusCode}) - ${getStatusCodeDescription(statusCode)}`,
            severity: 0.0
        };
    }

    // Unknown status code - for malformed URLs/inputs, classify as DOWN
    return {
        status: STATUS.DOWN,
        confidence: CONFIDENCE.HIGH,
        errorType: ERROR_TYPES.UNKNOWN_ERROR,
        reason: `Unknown or invalid HTTP status: ${statusCode}`,
        severity: 0.9
    };
}

// ========================================
// DETAILED ERROR DESCRIPTIONS
// ========================================
const DETAILED_ERRORS = {
    // TCP / Network
    'ECONNREFUSED': "Connection Refused: The target machine actively rejected the connection. This usually means the service is not running on the specified port.",
    'ETIMEDOUT': "Connection Timed Out: The request was sent to the server, but no response was received. The server might be down or a firewall is blocking packets.",
    'EHOSTUNREACH': "Host Unreachable: No route to the specified host. The server might be down or there is a network configuration issue.",
    'ENETUNREACH': "Network Unreachable: The local network cannot reach the destination network.",
    'ECONNRESET': "Connection Reset: The connection was forcibly closed by the remote server. The service might have crashed or restarted.",

    // DNS
    'ENOTFOUND': "DNS Lookup Failed: The domain name could not be resolved to an IP address. Check the hostname for typos.",
    'NXDOMAIN': "Non-Existent Domain: The domain name does not exist.",
    'SERVFAIL': "Server Failure: The DNS server encountered an internal error/timeout while processing the query.",
    'DNS_TIMEOUT': "DNS Timeout: The DNS server did not respond to the query within the allowed time.",

    // SSL
    'CERT_HAS_EXPIRED': "SSL Certificate Expired: The certificate is no longer valid. Clients will see security warnings.",
    'CERT_NOT_YET_VALID': "SSL Certificate Not Yet Valid: The certificate start date is in the future. Check system clock.",
    'DEPTH_ZERO_SELF_SIGNED_CERT': "Self-Signed Certificate: The certificate is not signed by a trusted authority. Browsers will block this.",
    'ERR_TLS_CERT_ALTNAME_INVALID': "Hostname Mismatch: The certificate is valid, but not for this specific domain name.",
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE': "Invalid Signature: The certificate chain could not be verified. It may be corrupt or incomplete.",
    'ERR_SSL_EXCESSIVE_MESSAGE_SIZE': "Certificate Too Large: The server's handshake message exceeds the maximum allowed size (usually 16KB). This often happens with certificates containing too many SANs (Subject Alternative Names).",

    // UDP
    'UDP_NO_RESPONSE': "No Response: UDP packets were sent, but no reply was received. This is common if a firewall drops unsolicited UDP packets.",

    // SMTP
    'SMTP_NO_BANNER': "No Greeting: Connected to the port, but the server did not send the standard SMTP banner.",
    'SMTP_TRANSACTION_FAILED': "Transaction Failed: The server rejected the mail transaction constraints.",

    // Ping
    'PING_TIMEOUT': "Request Timed Out: ICMP Echo Requests were sent, but no Echo Reply was received.",
    'HOST_UNREACHABLE_PING': "Destination Unreachable: The ping packet could not verify the path to the host."
};

/**
 * Helper to get description or fallback with code appended
 */
function getErrorDescription(code, fallback) {
    if (DETAILED_ERRORS[code]) {
        return `${DETAILED_ERRORS[code]} (${code})`;
    }
    return fallback;
}

// ========================================
// SSL/TLS CERTIFICATE CLASSIFIER
// ========================================

export function classifySslCertificate(certData = {}) {
    const {
        valid = false,
        selfSigned = false,
        daysUntilExpiry = null,
        hostnameMatch = true,
        issuedBy = null,
        expiryThreshold = 14, // Default to 14 if not provided
        signatureAlgorithm = null // e.g., 'sha256WithRSAEncryption', 'sha1WithRSAEncryption'
    } = certData;

    // Certificate expired
    if (daysUntilExpiry !== null && daysUntilExpiry < 0) {
        return {
            status: STATUS.DOWN,
            confidence: CONFIDENCE.HIGH,
            errorType: ERROR_TYPES.CERT_EXPIRED,
            reason: `Critical: Certificate expired ${Math.abs(daysUntilExpiry)} days ago. Renewal required immediately.`,
            severity: 1.0
        };
    }

    // Certificate expiring soon
    if (daysUntilExpiry !== null && daysUntilExpiry < expiryThreshold) {
        return {
            status: STATUS.DEGRADED,
            confidence: CONFIDENCE.HIGH,
            errorType: ERROR_TYPES.CERT_EXPIRING_SOON,
            reason: `Warning: Certificate expires in only ${daysUntilExpiry} days. Plan renewal now.`,
            severity: 0.6
        };
    }

    // Self-signed certificate
    if (selfSigned) {
        return {
            status: STATUS.DEGRADED,
            confidence: CONFIDENCE.HIGH,
            errorType: ERROR_TYPES.SELF_SIGNED_CERT,
            reason: getErrorDescription('DEPTH_ZERO_SELF_SIGNED_CERT', 'Self-signed Certificate'),
            severity: 0.5
        };
    }

    // Hostname mismatch
    if (!hostnameMatch) {
        return {
            status: STATUS.DOWN,
            confidence: CONFIDENCE.HIGH,
            errorType: ERROR_TYPES.CERT_HOSTNAME_MISMATCH,
            reason: getErrorDescription('ERR_TLS_CERT_ALTNAME_INVALID', 'Hostname Mismatch'),
            severity: 0.9
        };
    }

    // Weak signature algorithm (SHA-1 deprecated since 2017)
    if (signatureAlgorithm && (signatureAlgorithm.toLowerCase().includes('sha1') || signatureAlgorithm.toLowerCase().includes('sha-1') || signatureAlgorithm.toLowerCase().includes('md5'))) {
        return {
            status: STATUS.DEGRADED,
            confidence: CONFIDENCE.HIGH,
            errorType: ERROR_TYPES.WEAK_SIGNATURE,
            reason: `Weak Security: Using deprecated ${signatureAlgorithm} algorithm. Upgrade to SHA-256.`,
            severity: 0.6
        };
    }

    // Certificate is valid
    return {
        status: STATUS.UP,
        confidence: CONFIDENCE.HIGH,
        errorType: null,
        reason: `Valid: Issued by ${issuedBy || 'trusted CA'}. Expires in ${daysUntilExpiry} days.`,
        severity: 0.0
    };
}

// ========================================
// TCP PORT CLASSIFIER
// ========================================

export function classifyTcpConnection(error = null, latency = null, options = {}) {
    const { latencyThreshold = 2000 } = options;

    // Success - port is open
    if (!error) {
        if (latency && latency > latencyThreshold) {
            return {
                status: STATUS.DEGRADED,
                confidence: CONFIDENCE.MEDIUM,
                errorType: ERROR_TYPES.HIGH_LATENCY,
                reason: `Slow Connection: Port ${options.port} responded in ${latency}ms (Threshold: ${latencyThreshold}ms).`,
                severity: 0.5
            };
        }

        return {
            status: STATUS.UP,
            confidence: CONFIDENCE.HIGH,
            errorType: null,
            reason: `Port ${options.port} is open and responding.`,
            severity: 0.0
        };
    }

    // Connection refused
    if (error.code === 'ECONNREFUSED' || error.message?.includes('refused')) {
        return {
            status: STATUS.DOWN,
            confidence: CONFIDENCE.HIGH,
            errorType: ERROR_TYPES.CONNECTION_REFUSED,
            reason: getErrorDescription('ECONNREFUSED', `TCP Connection Refused on port ${options.port}.`),
            severity: 1.0
        };
    }

    // Connection timeout
    if (error.code === 'ETIMEDOUT' || error.code === 'EHOSTUNREACH' || error.message?.includes('timeout')) {
        return {
            status: STATUS.DOWN,
            confidence: CONFIDENCE.MEDIUM,
            errorType: ERROR_TYPES.CONNECTION_TIMEOUT,
            reason: getErrorDescription(error.code, `TCP Connection Timed Out on port ${options.port}.`),
            severity: 0.95
        };
    }

    // Host unreachable
    if (error.code === 'EHOSTUNREACH') {
        return {
            status: STATUS.DOWN,
            confidence: CONFIDENCE.HIGH,
            errorType: ERROR_TYPES.HOST_UNREACHABLE,
            reason: getErrorDescription('EHOSTUNREACH', 'Host Unreachable.'),
            severity: 1.0
        };
    }

    // Network unreachable
    if (error.code === 'ENETUNREACH') {
        return {
            status: STATUS.DOWN,
            confidence: CONFIDENCE.HIGH,
            errorType: ERROR_TYPES.NETWORK_UNREACHABLE,
            reason: getErrorDescription('ENETUNREACH', 'Network Unreachable.'),
            severity: 1.0
        };
    }

    // Connection Reset (Crash/Restart)
    if (error.code === 'ECONNRESET') {
        return {
            status: STATUS.DOWN,
            confidence: CONFIDENCE.HIGH,
            errorType: 'CONNECTION_RESET',
            reason: getErrorDescription('ECONNRESET', 'Connection Reset by Peer.'),
            severity: 1.0
        };
    }

    // Generic network error
    return {
        status: STATUS.DOWN,
        confidence: CONFIDENCE.MEDIUM,
        errorType: ERROR_TYPES.NETWORK_ERROR,
        reason: `Network Error: ${error.message}`,
        severity: 0.85
    };
}

// ========================================
// SMTP CLASSIFIER
// ========================================

export function classifySmtpBanner(bannerCode = null, bannerText = '', latency = null, options = {}) {
    const { port = 25, latencyThreshold = 2000 } = options;

    // No banner received
    if (!bannerCode) {
        return {
            status: STATUS.DOWN,
            confidence: CONFIDENCE.HIGH,
            errorType: ERROR_TYPES.SMTP_NO_BANNER,
            reason: getErrorDescription('SMTP_NO_BANNER', 'No Greeting Banner received.'),
            severity: 1.0
        };
    }

    // 220 - Service ready (Standard greeting)
    if (bannerCode === 220) {
        if (latency && latency > latencyThreshold) {
            return {
                status: STATUS.DEGRADED,
                confidence: CONFIDENCE.MEDIUM,
                errorType: ERROR_TYPES.HIGH_LATENCY,
                reason: `SMTP Ready but Slow (${latency}ms): ${bannerText}`,
                severity: 0.5
            };
        }

        return {
            status: STATUS.UP,
            confidence: CONFIDENCE.HIGH,
            errorType: null,
            reason: `SMTP Service Ready (220): ${bannerText}`,
            severity: 0.0
        };
    }

    // 421 - Service not available
    if (bannerCode === 421) {
        return {
            status: STATUS.DOWN,
            confidence: CONFIDENCE.HIGH,
            errorType: ERROR_TYPES.SMTP_SERVICE_UNAVAILABLE,
            reason: `Service Unavailable (421): The service is not available, closing transmission channel.`,
            severity: 1.0
        };
    }

    // 554 - Transaction failed
    if (bannerCode === 554) {
        return {
            status: STATUS.DOWN,
            confidence: CONFIDENCE.HIGH,
            errorType: ERROR_TYPES.SMTP_TRANSACTION_FAILED,
            reason: `Transaction Failed (554): The server failed to process the request.`,
            severity: 1.0
        };
    }

    // Other error codes
    if (bannerCode >= 400) {
        return {
            status: STATUS.DOWN,
            confidence: CONFIDENCE.MEDIUM,
            errorType: ERROR_TYPES.SMTP_CONNECT_FAILED,
            reason: `SMTP Error (${bannerCode}): ${bannerText}`,
            severity: 0.9
        };
    }

    return {
        status: STATUS.UNKNOWN,
        confidence: CONFIDENCE.LOW,
        errorType: ERROR_TYPES.UNKNOWN_ERROR,
        reason: `Unknown SMTP Response (${bannerCode}): ${bannerText}`,
        severity: 0.5
    };
}

// ========================================
// DNS CLASSIFIER
// ========================================

export function classifyDnsResolution(result = {}) {
    const {
        resolved = false,
        ip = null,
        latency = null,
        error = null,
        errorCode = null
    } = result;

    // Successfully resolved
    if (resolved && ip) {
        if (latency && latency > 1000) {
            return {
                status: STATUS.DEGRADED,
                confidence: CONFIDENCE.MEDIUM,
                errorType: ERROR_TYPES.DNS_SLOW,
                reason: `Slow Resolution: ${latency}ms to resolve ${ip}`,
                severity: 0.5
            };
        }

        return {
            status: STATUS.UP,
            confidence: CONFIDENCE.HIGH,
            errorType: null,
            reason: `Resolved successfully to ${ip}`,
            severity: 0.0
        };
    }

    // Domain not found
    if (errorCode === 'ENOTFOUND' || errorCode === 'NXDOMAIN') {
        return {
            status: STATUS.DOWN,
            confidence: CONFIDENCE.HIGH,
            errorType: ERROR_TYPES.DNS_NOT_FOUND,
            reason: getErrorDescription('ENOTFOUND', 'Domain not found.'),
            severity: 1.0
        };
    }

    // DNS server failure
    if (errorCode === 'SERVFAIL') {
        return {
            status: STATUS.DOWN,
            confidence: CONFIDENCE.HIGH,
            errorType: ERROR_TYPES.DNS_SERVER_FAILURE,
            reason: getErrorDescription('SERVFAIL', 'DNS Server Failure.'),
            severity: 0.9
        };
    }

    // DNS timeout
    if (errorCode === 'ETIMEOUT' || error?.message?.includes('timeout')) {
        return {
            status: STATUS.DOWN,
            confidence: CONFIDENCE.MEDIUM,
            errorType: ERROR_TYPES.DNS_TIMEOUT,
            reason: getErrorDescription('DNS_TIMEOUT', 'DNS Resolution Timeout.'),
            severity: 0.95
        };
    }

    // Generic DNS error
    return {
        status: STATUS.DOWN,
        confidence: CONFIDENCE.MEDIUM,
        errorType: ERROR_TYPES.NETWORK_ERROR,
        reason: `DNS Error: ${error?.message || 'Unknown resolution failure'}`,
        severity: 0.85
    };
}

// ========================================
// ICMP / PING CLASSIFIER
// ========================================

export function classifyPingResult(result = {}, options = {}) {
    const {
        packetLoss = 0,           // 0-100 percentage
        rtt = null,               // Round trip time in ms
        min = null,
        max = null,
        avg = null,
        error = null
    } = result;

    const { latencyThreshold = 1000 } = options;

    // 100% packet loss - definitely down
    if (packetLoss === 100) {
        return {
            status: STATUS.DOWN,
            confidence: CONFIDENCE.HIGH,
            errorType: ERROR_TYPES.HOST_UNREACHABLE_PING,
            reason: getErrorDescription('HOST_UNREACHABLE_PING', 'Host Unreachable (100% Packet Loss)'),
            severity: 1.0
        };
    }

    // 1-99% packet loss - degraded
    if (packetLoss > 0 && packetLoss < 100) {
        return {
            status: STATUS.DEGRADED,
            confidence: CONFIDENCE.MEDIUM,
            errorType: ERROR_TYPES.PACKET_LOSS,
            reason: `Unstable Connection: ${packetLoss}% packet loss detected.`,
            severity: packetLoss / 100 * 0.8
        };
    }

    // Check RTT (Round Trip Time)
    if (rtt && rtt > latencyThreshold) {
        return {
            status: STATUS.DEGRADED,
            confidence: CONFIDENCE.MEDIUM,
            errorType: ERROR_TYPES.HIGH_PING_LATENCY,
            reason: `High Latency: ${avg || rtt}ms (Threshold: ${latencyThreshold}ms)`,
            severity: Math.min(0.7, (rtt - 1000) / 9000)
        };
    }

    // Host is up with good metrics
    if (packetLoss === 0 && rtt) {
        return {
            status: STATUS.UP,
            confidence: CONFIDENCE.HIGH,
            errorType: null,
            reason: `Alive (RTT: ${avg || rtt}ms)`,
            severity: 0.0
        };
    }

    // No error but no response data
    if (!error && !rtt) {
        return {
            status: STATUS.UNKNOWN,
            confidence: CONFIDENCE.LOW,
            errorType: null,
            reason: 'Ping successful but returned no timing data.',
            severity: 0.3
        };
    }

    // Error occurred
    if (error) {
        return {
            status: STATUS.DOWN,
            confidence: CONFIDENCE.MEDIUM,
            errorType: ERROR_TYPES.NETWORK_ERROR,
            reason: `Ping Failure: ${error}`,
            severity: 0.9
        };
    }

    return {
        status: STATUS.UNKNOWN,
        confidence: CONFIDENCE.LOW,
        errorType: ERROR_TYPES.UNKNOWN_ERROR,
        reason: 'Unable to classify ping result',
        severity: 0.5
    };
}

// ========================================
// UDP CLASSIFIER
// ========================================

export function classifyUdpResponse(result = {}, options = {}) {
    const {
        received = false,
        portUnreachable = false,
        timeout = false,
        latency = null,
        strictMode = false  // If true, timeout = DOWN; if false, timeout = UP (assume firewall)
    } = result;

    const { latencyThreshold = 2000 } = options;

    // Received a response - definitely UP
    if (received) {
        if (latency && latency > latencyThreshold) {
            return {
                status: STATUS.DEGRADED,
                confidence: CONFIDENCE.MEDIUM,
                errorType: ERROR_TYPES.HIGH_LATENCY,
                reason: `Slow UDP Response: ${latency}ms`,
                severity: 0.5
            };
        }

        return {
            status: STATUS.UP,
            confidence: CONFIDENCE.HIGH,
            errorType: null,
            reason: `UDP Port Responding (${latency}ms)`,
            severity: 0.0
        };
    }

    // Received ICMP Port Unreachable - definitely DOWN
    if (portUnreachable) {
        return {
            status: STATUS.DOWN,
            confidence: CONFIDENCE.HIGH,
            errorType: ERROR_TYPES.UDP_PORT_UNREACHABLE,
            reason: 'Port Unreachable: Destination actively rejected UDP packet.',
            severity: 1.0
        };
    }

    // Timeout - depends on strictMode
    if (timeout) {
        if (strictMode) {
            // Strict mode: assume DOWN (conservative)
            return {
                status: STATUS.DOWN,
                confidence: CONFIDENCE.LOW,
                errorType: ERROR_TYPES.UDP_NO_RESPONSE,
                reason: getErrorDescription('UDP_NO_RESPONSE', 'No UDP Response.'),
                severity: 0.7
            };
        } else {
            // Lenient mode: assume UP (firewall blocking responses)
            return {
                status: STATUS.UP,
                confidence: CONFIDENCE.LOW,
                errorType: null,
                reason: 'No Response: Likely UP (Firewall blocking/Silent Drop).',
                severity: 0.2
            };
        }
    }

    return {
        status: STATUS.UNKNOWN,
        confidence: CONFIDENCE.LOW,
        errorType: ERROR_TYPES.UNKNOWN_ERROR,
        reason: 'Unable to classify UDP result.',
        severity: 0.5
    };
}

// ========================================
// CONNECTION ERROR CLASSIFIER (GENERIC)
// ========================================

export function classifyConnectionError(error, options = {}) {
    const { protocol = 'HTTP', isNetworkError = false } = options;

    if (!error) {
        return {
            status: STATUS.UP,
            confidence: CONFIDENCE.HIGH,
            errorType: null,
            reason: 'No error',
            severity: 0.0
        };
    }

    // Map common error codes
    const code = error.code || error.errorType;
    if (code && DETAILED_ERRORS[code]) {
        return {
            status: STATUS.DOWN,
            confidence: CONFIDENCE.HIGH,
            errorType: code,
            reason: `${DETAILED_ERRORS[code]} (${code})`,
            severity: 1.0
        };
    }

    // Fallback logic for generic errors
    return {
        status: STATUS.DOWN,
        confidence: CONFIDENCE.MEDIUM,
        errorType: ERROR_TYPES.NETWORK_ERROR,
        reason: `Unexpected Error: ${error.message || error}`,
        severity: 0.85
    };
}

// ========================================
// UTILITY: CREATE HEALTH STATE RESULT
// ========================================

export function createHealthStateResult(classification, additionalData = {}) {
    return {
        status: classification.status,
        confidence: classification.confidence,
        errorType: classification.errorType,
        reasons: [classification.reason],
        severity: classification.severity,
        analysis: {
            currentCheck: {
                severity: classification.severity,
                statusCode: additionalData.statusCode || null,
                performanceIssues: classification.errorType === ERROR_TYPES.HIGH_LATENCY ? ['high_latency'] : [],
                ...additionalData.checkData
            },
            window: {
                shouldBeDown: classification.status === STATUS.DOWN,
                failureRate: classification.status === STATUS.DOWN ? 1.0 : 0
            },
            baseline: {
                reliabilityScore: 0.95,
                ...additionalData.baseline
            }
        }
    };
}

// ========================================
// EXPORT ALL CLASSIFIERS
// ========================================

export const statusClassifier = {
    http: classifyHttpResponse,
    https: classifyHttpResponse,  // Same as HTTP
    ssl: classifySslCertificate,
    tcp: classifyTcpConnection,
    smtp: classifySmtpBanner,
    dns: classifyDnsResolution,
    icmp: classifyPingResult,
    ping: classifyPingResult,     // Alias
    udp: classifyUdpResponse,
    connection: classifyConnectionError
};

export default statusClassifier;
