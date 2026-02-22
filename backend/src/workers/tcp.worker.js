import net from 'net';
import { resolveSecurely } from '../utils/resolver.js';

export const checkTcp = async (monitor, result, options = {}) => {
    const {
        detectErrorType,
        formatErrorMessage,
        determineHealthStateFromError,
        parseUrl
    } = options;

    const { hostname, port } = parseUrl(monitor.url, monitor.port);

    // 🛡️ SSRF Protection: Resolve hostname securely BEFORE connecting
    const { address } = await resolveSecurely(hostname);

    return new Promise((resolve, reject) => {
        const socket = new net.Socket();
        // FIXED: Respect monitor's configured timeout
        const timeout = monitor.timeout || 30000; // Default 30s
        const startTime = Date.now();
        let isDone = false;

        socket.setTimeout(timeout);

        socket.on('connect', () => {
            if (isDone) return;
            isDone = true;
            const responseTime = Date.now() - startTime;
            result.responseTime = responseTime;

            // Check for slow connection (DEGRADED state)
            const degradedThreshold = monitor.degradedThresholdMs || 2000;

            if (responseTime > degradedThreshold) {
                result.healthState = 'DEGRADED';
                result.isUp = true;
                result.errorType = 'SLOW_RESPONSE';
                result.errorMessage = `Slow TCP connection: ${responseTime}ms`;
                result.statusCode = null;
                console.log(`🔌 TCP [${hostname}:${port}] ⚠️ DEGRADED - Slow connection | ResponseTime: ${responseTime}ms (threshold: ${degradedThreshold}ms)`);
            } else {
                result.healthState = 'UP';
                result.isUp = true;
                result.errorType = null;
                result.errorMessage = null;
                result.statusCode = null;
                console.log(`🔌 TCP [${hostname}:${port}] ✅ UP - Connected | ResponseTime: ${responseTime}ms`);
            }

            socket.destroy();
            resolve();
        });

        socket.on('timeout', () => {
            if (isDone) return;
            isDone = true;
            socket.destroy();
            const responseTime = Date.now() - startTime;
            result.responseTime = responseTime;
            const err = new Error(`TCP connection timed out after ${timeout}ms`);
            result.errorType = detectErrorType(err, 'TCP', null);
            result.errorMessage = formatErrorMessage(err, 'TCP');
            result.statusCode = null;
            const hsr = determineHealthStateFromError(result.errorType, null, 'TCP', responseTime, monitor);
            result.healthState = hsr.healthState;
            result.isUp = result.healthState === 'UP' || result.healthState === 'DEGRADED';
            console.log(`🔌 TCP [${hostname}:${port}] ❌ ${result.healthState} - TIMEOUT | ResponseTime: ${responseTime}ms | ErrorType: ${result.errorType}`);
            reject(err);
        });

        socket.on('error', (err) => {
            if (isDone) return;
            isDone = true;
            socket.destroy();
            const responseTime = Date.now() - startTime;
            result.responseTime = responseTime;

            // Explicitly classify common TCP errors for better UI reporting
            if (err.code === 'ECONNREFUSED') {
                result.errorType = 'CONNECTION_REFUSED';
                result.errorMessage = `TCP Connection Refused (Port ${port} closed)`;
            } else if (err.code === 'ETIMEDOUT') {
                result.errorType = 'TIMEOUT';
                result.errorMessage = `TCP Connection Timed Out (${timeout}ms)`;
            } else {
                result.errorType = detectErrorType(err, 'TCP', null);
                result.errorMessage = formatErrorMessage(err, 'TCP');
            }

            result.statusCode = null;
            const hsr = determineHealthStateFromError(result.errorType, null, 'TCP', responseTime, monitor);
            result.healthState = hsr.healthState;
            result.isUp = result.healthState === 'UP' || result.healthState === 'DEGRADED';
            console.log(`🔌 TCP [${hostname}:${port}] ❌ ${result.healthState} - CONNECTION FAILED | ResponseTime: ${responseTime}ms | ErrorType: ${result.errorType}`);
            reject(err);
        });

        socket.connect(port, address);
    });
};
