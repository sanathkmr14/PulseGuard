import dgram from 'dgram';
import dns from 'dns';
import { promisify } from 'util';
import { classifyUdpResponse, ERROR_TYPES, STATUS } from '../utils/status-classifier.js';
const lookup = promisify(dns.lookup);

/**
 * Build a proper DNS query packet for testing DNS servers
 * This creates a valid DNS query for 'google.com' A record
 */
function buildDnsQueryPacket() {
    // DNS Query packet structure:
    // Header: 12 bytes
    // Question: variable length

    const header = Buffer.alloc(12);

    // Transaction ID (random)
    header.writeUInt16BE(Math.floor(Math.random() * 65535), 0);

    // Flags: Standard query (0x0100)
    header.writeUInt16BE(0x0100, 2);

    // Questions: 1
    header.writeUInt16BE(1, 4);

    // Answer RRs: 0
    header.writeUInt16BE(0, 6);

    // Authority RRs: 0
    header.writeUInt16BE(0, 8);

    // Additional RRs: 0
    header.writeUInt16BE(0, 10);

    // Question section: google.com A record
    // Format: [length]label[length]label[0][type][class]
    const question = Buffer.from([
        6, 0x67, 0x6f, 0x6f, 0x67, 0x6c, 0x65,  // 6 + "google"
        3, 0x63, 0x6f, 0x6d,                     // 3 + "com"
        0,                                       // null terminator
        0x00, 0x01,                              // Type: A (1)
        0x00, 0x01                               // Class: IN (1)
    ]);

    return Buffer.concat([header, question]);
}

/**
 * Check UDP port connectivity with DNS fallback
 * 
 * Behavior:
 * 1. First, resolve hostname to IP (needed for UDP probe)
 * 2. Send UDP probe to target port (uses proper DNS query for port 53)
 * 3. On probe failure (timeout/ICMP), retry DNS as fallback
 * 4. If DNS succeeds on retry:
 *    - Timeout: Return UP with warning (lenient mode for filtered ports)
 *    - Errors: Use error classifiers to determine status
 * 5. If DNS also fails:
 *    - Timeout + DNS fail → DOWN (host unreachable)
 *    - Errors + DNS fail → DOWN (use error classifiers)
 */

export const checkUdp = async (monitor, result, options = {}) => {
    const {
        detectErrorType,
        formatErrorMessage,
        determineHealthStateFromError,
        parseUrl
    } = options;

    const { hostname, port } = parseUrl(monitor.url, monitor.port || 53);
    // FIXED: Respect monitor's configured timeout
    const timeout = monitor.timeout || 30000; // Default 30s
    const strictMode = monitor.strictMode || false;
    const startTime = Date.now();

    // Helper function to perform DNS lookup
    const dnsLookup = async () => {
        const { address, family } = await lookup(hostname);
        return { address, family };
    };

    // Initial DNS lookup for IP resolution (required for UDP probe)
    let ipAddress;
    let ipFamily = 4; // Default to IPv4
    try {
        const { address, family } = await dnsLookup();
        ipAddress = address;
        ipFamily = family; // Capture the resolved family (4 or 6)
    } catch (err) {
        const responseTime = Date.now() - startTime;
        result.responseTime = responseTime;
        result.errorType = detectErrorType(err, 'UDP', null);
        result.errorMessage = formatErrorMessage(err, 'UDP');
        const hsr = determineHealthStateFromError(result.errorType, null, 'UDP', responseTime, monitor);
        result.healthState = hsr.healthState.toUpperCase();
        result.isUp = hsr.healthState === 'UP' || hsr.healthState === 'DEGRADED';
        if (!result.meta) result.meta = {};
        result.meta.hostname = hostname;
        result.meta.port = port;
        result.meta.strictMode = strictMode;
        console.log(`📡 UDP [${hostname}:${port}] ❌ ${result.healthState} - DNS Lookup Failed | ErrorType: ${result.errorType}`);
        throw err;
    }

    // Create UDP socket based on resolved IP family
    const socket = dgram.createSocket(ipFamily === 6 ? 'udp6' : 'udp4');

    // Use proper DNS query for port 53, otherwise use custom payload or PING
    const probeMessage = (port === 53)
        ? buildDnsQueryPacket()
        : Buffer.from(monitor.payload || 'PING');

    return new Promise((resolve, reject) => {
        let timeoutId;
        let hasResponded = false;

        const cleanup = () => {
            if (timeoutId) clearTimeout(timeoutId);
            socket.close();
        };

        // Set timeout
        timeoutId = setTimeout(async () => {
            if (hasResponded) return;
            hasResponded = true;

            const latency = Date.now() - startTime;

            // DNS fallback: retry DNS lookup when UDP probe times out
            try {
                const { address } = await dnsLookup();
                console.log(`📡 UDP [${hostname}:${port}] ⚠️ DNS OK but UDP probe timed out - Using DNS fallback`);

                // DNS succeeded - return UP with warning (timeout is likely due to filtering)
                const classification = classifyUdpResponse({
                    received: false,
                    portUnreachable: false,
                    timeout: true,
                    latency,
                    strictMode
                }, {
                    latencyThreshold: monitor.degradedThresholdMs || 2000
                });

                result.healthState = classification.status.toUpperCase();
                result.isUp = classification.status === STATUS.UP || classification.status === STATUS.DEGRADED;
                result.errorType = classification.errorType;
                result.errorMessage = `UDP probe timed out but DNS resolution successful. ${classification.reason}`;
                result.responseTime = latency;
                if (!result.meta) result.meta = {};
                result.meta.hostname = hostname;
                result.meta.port = port;
                result.meta.ip = address;
                result.meta.strictMode = strictMode;
                result.meta.probeMessage = probeMessage.toString();
                result.meta.fallbackUsed = 'dns';
                result.warning = 'UDP probe timed out - host is reachable via DNS';

                cleanup();
                console.log(`📡 UDP [${hostname}:${port}] ✅ ${result.healthState} - DNS Fallback | ResponseTime: ${latency}ms | ErrorType: ${result.errorType}`);
                resolve(result);
                return;
            } catch (dnsErr) {
                // DNS also failed - UDP probe timeout indicates real network issue
                // Force DOWN since both UDP and DNS failed (host is unreachable)
                console.log(`📡 UDP [${hostname}:${port}] ❌ DNS Fallback Failed - Host is unreachable`);

                result.healthState = 'DOWN';
                result.isUp = false;
                result.errorType = ERROR_TYPES.NETWORK_ERROR;
                result.errorMessage = 'UDP probe timed out and DNS fallback failed - host is unreachable';
                result.responseTime = latency;
                if (!result.meta) result.meta = {};
                result.meta.hostname = hostname;
                result.meta.port = port;
                result.meta.strictMode = strictMode;
                result.meta.probeMessage = probeMessage.toString();

                cleanup();
                console.log(`📡 UDP [${hostname}:${port}] ⏱️ DOWN - Timeout + DNS Failed | ResponseTime: ${latency}ms | ErrorType: ${result.errorType}`);

                reject(new Error('UDP probe timeout - host unreachable'));
                return;
            }
        }, timeout);

        // Handle incoming messages (response received)
        socket.on('message', (msg, rinfo) => {
            if (hasResponded) return;
            hasResponded = true;

            const latency = Date.now() - startTime;

            // Classify UDP response
            const classification = classifyUdpResponse({
                received: true,
                portUnreachable: false,
                timeout: false,
                latency,
                strictMode
            }, {
                latencyThreshold: monitor.degradedThresholdMs || 2000
            });

            result.healthState = classification.status.toUpperCase();
            result.isUp = classification.status === STATUS.UP || classification.status === STATUS.DEGRADED;
            result.errorType = classification.errorType;
            result.errorMessage = classification.reason;
            result.responseTime = latency;
            if (!result.meta) result.meta = {};
            result.meta.hostname = hostname;
            result.meta.port = port;
            result.meta.ip = ipAddress;
            result.meta.rinfo = { address: rinfo.address, port: rinfo.port };
            result.meta.response = msg.toString();
            result.meta.probeMessage = probeMessage.toString();
            result.meta.strictMode = strictMode;

            cleanup();
            console.log(`📡 UDP [${hostname}:${port}] ✅ ${result.healthState} - Response received | ResponseTime: ${latency}ms | ErrorType: NONE`);
            resolve(result);
        });

        // Handle errors (ICMP port unreachable)
        socket.on('error', async (err) => {
            if (hasResponded) return;
            hasResponded = true;

            const latency = Date.now() - startTime;

            // Check for ICMP port unreachable
            const isPortUnreachable = err.code === 'ECONNREFUSED' ||
                err.message?.includes('port unreachable');

            // ICMP port unreachable is always DOWN - port is truly closed
            if (isPortUnreachable) {
                console.log(`📡 UDP [${hostname}:${port}] ❌ ICMP Port Unreachable - Port is closed`);

                const classification = classifyUdpResponse({
                    received: false,
                    portUnreachable: true,
                    timeout: false,
                    latency,
                    strictMode
                });

                result.healthState = classification.status.toUpperCase();
                result.isUp = classification.status === STATUS.UP || classification.status === STATUS.DEGRADED;
                result.errorType = classification.errorType;
                result.errorMessage = classification.reason;
                result.responseTime = latency;
                if (!result.meta) result.meta = {};
                result.meta.hostname = hostname;
                result.meta.port = port;
                result.meta.ip = ipAddress;
                result.meta.probeMessage = probeMessage.toString();
                result.meta.strictMode = strictMode;
                result.errorDetails = err.message;

                cleanup();
                console.log(`📡 UDP [${hostname}:${port}] ❌ ${result.healthState} - Port Unreachable | ResponseTime: ${latency}ms | ErrorType: ${result.errorType}`);
                reject(err);
                return;
            }

            // Other errors (not port unreachable) - use error classifiers, not timeout classification
            console.log(`📡 UDP [${hostname}:${port}] ⚠️ UDP Error: ${err.message} - Using error classification`);

            // Classify using error type, not as timeout
            const errorType = detectErrorType(err, 'UDP', null);
            const hsr = determineHealthStateFromError(errorType, null, 'UDP', latency, monitor);

            // Try DNS fallback to see if host is reachable
            try {
                const { address } = await dnsLookup();

                // DNS succeeded - use error classifier result (may be UP or DOWN based on error type)
                result.healthState = hsr.healthState.toUpperCase();
                result.isUp = hsr.healthState === 'UP' || hsr.healthState === 'DEGRADED';
                result.errorType = errorType;
                result.errorMessage = `UDP error (${err.message}) but DNS resolved. ${hsr.reason}`;
                result.responseTime = latency;
                if (!result.meta) result.meta = {};
                result.meta.hostname = hostname;
                result.meta.port = port;
                result.meta.ip = address;
                result.meta.strictMode = strictMode;
                result.meta.probeMessage = probeMessage.toString();
                result.meta.fallbackUsed = 'dns';
                result.warning = `UDP ${errorType} - host is reachable via DNS`;

                cleanup();
                console.log(`📡 UDP [${hostname}:${port}] ${result.isUp ? '✅' : '❌'} ${result.healthState} - DNS Fallback | ResponseTime: ${latency}ms | ErrorType: ${result.errorType}`);
                resolve(result);
            } catch (dnsErr) {
                // DNS also failed - use error classifier result
                result.healthState = hsr.healthState.toUpperCase();
                result.isUp = hsr.healthState === 'UP' || hsr.healthState === 'DEGRADED';
                result.errorType = errorType;
                result.errorMessage = hsr.reason;
                result.responseTime = latency;
                if (!result.meta) result.meta = {};
                result.meta.hostname = hostname;
                result.meta.port = port;
                result.meta.strictMode = strictMode;
                result.meta.probeMessage = probeMessage.toString();
                result.errorDetails = err.message;

                cleanup();
                console.log(`📡 UDP [${hostname}:${port}] ${result.isUp ? '✅' : '❌'} ${result.healthState} - DNS Fallback Failed | ResponseTime: ${latency}ms | ErrorType: ${result.errorType}`);

                if (result.isUp) {
                    resolve(result);
                } else {
                    reject(new Error(`UDP ${errorType}`));
                }
            }
        });

        // Send UDP packet
        socket.send(probeMessage, 0, probeMessage.length, port, ipAddress, (err) => {
            if (err && !hasResponded) {
                hasResponded = true;

                const latency = Date.now() - startTime;
                result.responseTime = latency;
                result.errorType = detectErrorType(err, 'UDP', null);
                result.errorMessage = formatErrorMessage(err, 'UDP');
                const hsr = determineHealthStateFromError(result.errorType, null, 'UDP', latency, monitor);
                result.healthState = hsr.healthState.toUpperCase();
                result.isUp = hsr.healthState === 'UP' || hsr.healthState === 'DEGRADED';
                if (!result.meta) result.meta = {};
                result.meta.hostname = hostname;
                result.meta.port = port;
                result.meta.ip = ipAddress;
                result.meta.probeMessage = probeMessage.toString();
                result.meta.strictMode = strictMode;

                cleanup();
                console.log(`📡 UDP [${hostname}:${port}] ${result.isUp ? '✅' : '❌'} ${result.healthState} - Send Failed | ResponseTime: ${latency}ms | ErrorType: ${result.errorType}`);

                if (result.isUp) {
                    resolve(result);
                } else {
                    reject(err);
                }
            }
        });
    });
};

export default checkUdp;

