import net from 'net';
import { resolveSecurely } from '../utils/resolver.js';

export const checkTcp = async (monitor, result, options = {}) => {
    const {
        detectErrorType,
        formatErrorMessage,
        determineHealthStateFromError
    } = options;

    const parseUrl = options.parseUrl || ((urlStr, defaultPort) => {
        let u = (urlStr || '').trim();
        if (!/^[a-zA-Z]+:\/\//.test(u)) u = 'tcp://' + u;
        try {
            const parsed = new URL(u);
            return { hostname: parsed.hostname.replace(/^\[|\]$/g, ''), port: parsed.port || defaultPort };
        } catch {
            let clean = (urlStr || '').trim().replace(/^[a-zA-Z]+:\/\//, '').split('/')[0];
            if (clean.startsWith('[') && clean.includes(']')) {
                const closeIdx = clean.indexOf(']');
                const ipPart = clean.slice(1, closeIdx);
                const rest = clean.slice(closeIdx + 1);
                const portPart = rest.startsWith(':') ? rest.slice(1) : defaultPort;
                return { hostname: ipPart, port: portPart };
            }
            if (clean.includes(':') && (clean.match(/:/g) || []).length === 1) {
                const parts = clean.split(':');
                return { hostname: parts[0], port: parts[1] || defaultPort };
            }
            return { hostname: clean, port: defaultPort };
        }
    });

    const { hostname, port } = parseUrl(monitor.url, monitor.port);

    // Validate port (1–65535) before connecting — strict: reject "80abc", floats, etc.
    const portStr = String(port ?? '').trim();
    const safePort = /^\d+$/.test(portStr) ? parseInt(portStr, 10) : NaN;
    if (!Number.isInteger(safePort) || safePort < 1 || safePort > 65535) {
        result.healthState = 'DOWN';
        result.isUp = false;
        result.errorType = 'INVALID_PORT';
        result.errorMessage = `Invalid port number: ${port}. Port must be between 1 and 65535.`;
        result.responseTime = 0;
        result.statusCode = null;
        console.log(`🔌 TCP [${hostname}:${port}] ❌ DOWN - INVALID_PORT | Port must be between 1 and 65535`);
        return result;
    }

    // 🛡️ SSRF Protection: Resolve hostname securely BEFORE connecting
    let address;
    try {
        ({ address } = await resolveSecurely(hostname));
    } catch (ssrfErr) {
        result.healthState = 'DOWN';
        result.isUp = false;
        result.errorType = (ssrfErr.code === 'SSRF_BLOCKED' || ssrfErr.message?.includes('SSRF')) ? 'SSRF_BLOCKED' : 'DNS_ERROR';
        result.errorMessage = ssrfErr.message;
        result.responseTime = 0;
        result.statusCode = null;
        console.log(`🔌 TCP [${hostname}:${safePort}] ❌ DOWN - ${result.errorType} | ${ssrfErr.message}`);
        return result;
    }

    return new Promise((resolve) => {
        const socket = new net.Socket();
        const timeout = monitor.timeout || 30000;
        const startTime = Date.now();
        let isDone = false;

        socket.setTimeout(timeout);

        socket.on('connect', () => {
            if (isDone) return;
            isDone = true;
            const responseTime = Date.now() - startTime;
            result.responseTime = responseTime;

            const degradedThreshold = monitor.degradedThresholdMs || 2000;

            if (responseTime > degradedThreshold) {
                result.healthState = 'DEGRADED';
                result.isUp = true;
                result.errorType = 'SLOW_RESPONSE';
                result.errorMessage = `Slow TCP connection: ${responseTime}ms`;
                result.statusCode = null;
                console.log(`🔌 TCP [${hostname}:${safePort}] ⚠️ DEGRADED - Slow connection | ResponseTime: ${responseTime}ms (threshold: ${degradedThreshold}ms)`);
            } else {
                result.healthState = 'UP';
                result.isUp = true;
                result.errorType = null;
                result.errorMessage = null;
                result.statusCode = null;
                console.log(`🔌 TCP [${hostname}:${safePort}] ✅ UP - Connected | ResponseTime: ${responseTime}ms`);
            }

            try {
                socket.on('error', () => {});
                socket.destroy();
            } catch {}
            resolve(result);
        });

        socket.on('timeout', () => {
            if (isDone) return;
            isDone = true;
            try {
                socket.on('error', () => {});
                socket.destroy();
            } catch {}
            const responseTime = Date.now() - startTime;
            result.responseTime = responseTime;
            const err = new Error(`TCP connection timed out after ${timeout}ms`);
            result.errorType = detectErrorType ? detectErrorType(err, 'TCP', null) : 'TIMEOUT';
            result.errorMessage = formatErrorMessage ? formatErrorMessage(err, 'TCP') : err.message;
            result.statusCode = null;
            if (determineHealthStateFromError) {
                const hsr = determineHealthStateFromError(result.errorType, null, 'TCP', responseTime, monitor);
                result.healthState = hsr.healthState;
            } else {
                result.healthState = 'DOWN';
            }
            result.isUp = result.healthState === 'UP' || result.healthState === 'DEGRADED';
            console.log(`🔌 TCP [${hostname}:${safePort}] ❌ ${result.healthState} - TIMEOUT | ResponseTime: ${responseTime}ms | ErrorType: ${result.errorType}`);
            resolve(result);
        });

        socket.on('error', (err) => {
            if (isDone) return;
            isDone = true;
            try {
                socket.on('error', () => {});
                socket.destroy();
            } catch {}
            const responseTime = Date.now() - startTime;
            result.responseTime = responseTime;

            if (err.code === 'ECONNREFUSED') {
                result.errorType = 'CONNECTION_REFUSED';
                result.errorMessage = `TCP Connection Refused (Port ${safePort} closed)`;
            } else if (err.code === 'ETIMEDOUT') {
                result.errorType = 'TIMEOUT';
                result.errorMessage = `TCP Connection Timed Out (${timeout}ms)`;
            } else {
                result.errorType = detectErrorType ? detectErrorType(err, 'TCP', null) : 'CONNECTION_FAILED';
                result.errorMessage = formatErrorMessage ? formatErrorMessage(err, 'TCP') : err.message;
            }

            result.statusCode = null;
            if (determineHealthStateFromError) {
                const hsr = determineHealthStateFromError(result.errorType, null, 'TCP', responseTime, monitor);
                result.healthState = hsr.healthState;
            } else {
                result.healthState = 'DOWN';
            }
            result.isUp = result.healthState === 'UP' || result.healthState === 'DEGRADED';
            console.log(`🔌 TCP [${hostname}:${safePort}] ❌ ${result.healthState} - CONNECTION FAILED | ResponseTime: ${responseTime}ms | ErrorType: ${result.errorType}`);
            resolve(result);
        });

        try {
            socket.connect(safePort, address);
        } catch (connectErr) {
            if (isDone) return;
            isDone = true;
            try { socket.destroy(); } catch {}
            result.responseTime = Date.now() - startTime;
            result.errorType = detectErrorType ? detectErrorType(connectErr, 'TCP', null) : 'CONNECTION_FAILED';
            result.errorMessage = formatErrorMessage ? formatErrorMessage(connectErr, 'TCP') : connectErr.message;
            result.statusCode = null;
            result.healthState = 'DOWN';
            result.isUp = false;
            resolve(result);
        }
    });
};

export default {
    checkTcp
};
