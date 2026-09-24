import dgram from 'dgram';
import { resolveSecurely } from '../utils/resolver.js';
import { classifyUdpResponse, ERROR_TYPES, STATUS } from '../utils/status-classifier.js';

/**
 * Build a proper DNS query packet for testing DNS servers
 * This creates a valid DNS query for 'google.com' A record
 */
function buildDnsQueryPacket() {
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
 */
export const checkUdp = async (monitor, result, options = {}) => {
    const {
        detectErrorType,
        formatErrorMessage,
        determineHealthStateFromError
    } = options;

    const parseUrl = options.parseUrl || ((urlStr, defaultPort) => {
        let u = (urlStr || '').trim();
        if (!/^[a-zA-Z]+:\/\//.test(u)) u = 'udp://' + u;
        try {
            const parsed = new URL(u);
            return { hostname: parsed.hostname, port: parsed.port || defaultPort };
        } catch {
            const parts = (urlStr || '').replace(/^[a-zA-Z]+:\/\//, '').split('/')[0].split(':');
            return { hostname: parts[0], port: parts[1] || defaultPort };
        }
    });

    const { hostname, port } = parseUrl(monitor.url, monitor.port || 53);
    // Validate port (1–65535) before connecting — mirrors TCP worker
    const safePort = typeof port === 'string' && !/^\d+$/.test(String(port).trim()) ? NaN : parseInt(port, 10);
    if (!Number.isInteger(safePort) || safePort < 1 || safePort > 65535) {
        result.healthState = 'DOWN';
        result.isUp = false;
        result.errorType = 'INVALID_PORT';
        result.errorMessage = `Invalid port number: ${port}. Port must be between 1 and 65535.`;
        result.responseTime = 0;
        result.statusCode = null;
        if (!result.meta) result.meta = {};
        result.meta.hostname = hostname;
        result.meta.port = port;
        console.log(`📡 UDP [${hostname}:${port}] ❌ DOWN - INVALID_PORT | Port must be between 1 and 65535`);
        return result;
    }
    const timeout = monitor.timeout || 30000;
    const strictMode = monitor.strictMode || false;
    const startTime = Date.now();

    const dnsLookup = async () => {
        return await resolveSecurely(hostname);
    };

    let ipAddress;
    let ipFamily = 4;
    try {
        const { address, family } = await dnsLookup();
        ipAddress = address;
        ipFamily = family;
    } catch (err) {
        const responseTime = Date.now() - startTime;
        result.responseTime = responseTime;

        if (err.code === 'SSRF_BLOCKED' || err.message?.includes('SSRF_PROTECTION') || err.message?.includes('SSRF Blocked')) {
            result.errorType = 'SSRF_BLOCKED';
            result.healthState = 'DOWN';
            result.isUp = false;
            result.errorMessage = err.message;
        } else {
            result.errorType = detectErrorType ? detectErrorType(err, 'UDP', null) : 'DNS_ERROR';
            result.errorMessage = formatErrorMessage ? formatErrorMessage(err, 'UDP') : err.message;
            if (determineHealthStateFromError) {
                const hsr = determineHealthStateFromError(result.errorType, null, 'UDP', responseTime, monitor);
                result.healthState = hsr.healthState.toUpperCase();
            } else {
                result.healthState = 'DOWN';
            }
            result.isUp = result.healthState === 'UP' || result.healthState === 'DEGRADED';
        }

        if (!result.meta) result.meta = {};
        result.meta.hostname = hostname;
        result.meta.port = port;
        result.meta.strictMode = strictMode;
        console.log(`📡 UDP [${hostname}:${port}] ❌ ${result.healthState} - DNS Lookup Failed | ErrorType: ${result.errorType}`);
        return result;
    }

    // Use proper DNS query for port 53, otherwise use custom payload or PING
    const probeMessage = (safePort === 53)
        ? buildDnsQueryPacket()
        : Buffer.from(monitor.payload || 'PING');

    return new Promise((resolve) => {
        // Move socket creation inside the promise
        let socket;
        try {
            socket = dgram.createSocket(ipFamily === 6 ? 'udp6' : 'udp4');
        } catch (sockErr) {
            result.healthState = 'DOWN';
            result.isUp = false;
            result.errorType = 'SOCKET_ERROR';
            result.errorMessage = sockErr.message;
            result.responseTime = 0;
            return resolve(result);
        }

        let timeoutId;
        let hasResponded = false;

        const cleanup = () => {
            if (timeoutId) clearTimeout(timeoutId);
            try {
                socket.close();
            } catch (err) {
                // Ignore if socket already closed
            }
        };

        // Set timeout
        timeoutId = setTimeout(async () => {
            if (hasResponded) return;
            hasResponded = true;

            const latency = Date.now() - startTime;

            // For UDP port 53 probe, do NOT falsely classify timeout as UP via local DNS lookup;
            // classify timeout on port 53 as DOWN.
            if (safePort === 53) {
                result.healthState = 'DOWN';
                result.isUp = false;
                result.errorType = 'TIMEOUT';
                result.errorMessage = `UDP DNS probe to port 53 timed out after ${timeout}ms`;
                result.responseTime = latency;
                if (!result.meta) result.meta = {};
                result.meta.hostname = hostname;
                result.meta.port = port;
                result.meta.strictMode = strictMode;
                cleanup();
                console.log(`📡 UDP [${hostname}:${port}] ❌ DOWN - DNS Port 53 Timeout | ResponseTime: ${latency}ms`);
                resolve(result);
                return;
            }

            // DNS fallback for non-53 ports: retry DNS lookup when UDP probe times out
            try {
                const { address } = await dnsLookup();
                console.log(`📡 UDP [${hostname}:${port}] ⚠️ DNS OK but UDP probe timed out - Using DNS fallback`);

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

                resolve(result);
                return;
            }
        }, timeout);

        // Handle incoming messages (response received)
        socket.on('message', (msg, rinfo) => {
            if (hasResponded) return;
            hasResponded = true;

            const latency = Date.now() - startTime;

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

            const isPortUnreachable = err.code === 'ECONNREFUSED' ||
                err.message?.includes('port unreachable');

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
                resolve(result);
                return;
            }

            console.log(`📡 UDP [${hostname}:${port}] ⚠️ UDP Error: ${err.message} - Using error classification`);

            const errorType = detectErrorType ? detectErrorType(err, 'UDP', null) : 'UDP_ERROR';
            const hsr = determineHealthStateFromError ? determineHealthStateFromError(errorType, null, 'UDP', latency, monitor) : { healthState: 'DOWN', reason: err.message };

            try {
                const { address } = await dnsLookup();

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
                resolve(result);
            }
        });

        // Send UDP packet
        socket.send(probeMessage, 0, probeMessage.length, safePort, ipAddress, (err) => {
            if (err && !hasResponded) {
                hasResponded = true;

                const latency = Date.now() - startTime;
                result.responseTime = latency;
                result.errorType = detectErrorType ? detectErrorType(err, 'UDP', null) : 'UDP_ERROR';
                result.errorMessage = formatErrorMessage ? formatErrorMessage(err, 'UDP') : err.message;
                const hsr = determineHealthStateFromError ? determineHealthStateFromError(result.errorType, null, 'UDP', latency, monitor) : { healthState: 'DOWN' };
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
                resolve(result);
            }
        });
    });
};

export default checkUdp;
