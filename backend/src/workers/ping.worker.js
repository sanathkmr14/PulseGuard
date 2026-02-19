import { exec } from 'child_process';
import { promisify } from 'util';
import { classifyPingResult } from '../utils/status-classifier.js';

const execAsync = promisify(exec);

// Parse ping statistics from stdout
function parsePingStats(output, isWindows) {
    const stats = {
        transmitted: 0,
        received: 0,
        packetLoss: 100,
        min: null,
        max: null,
        avg: null
    };

    if (isWindows) {
        // Windows format: "Packets: Sent = 4, Received = 4, Lost = 0 (0% loss)"
        const lossMatch = output.match(/Lost\s*=\s*(\d+)\s*\((\d+)%\s*loss\)/i);
        const sentMatch = output.match(/Sent\s*=\s*(\d+)/i);
        const receivedMatch = output.match(/Received\s*=\s*(\d+)/i);

        if (sentMatch) stats.transmitted = parseInt(sentMatch[1], 10);
        if (receivedMatch) stats.received = parseInt(receivedMatch[1], 10);
        if (lossMatch) stats.packetLoss = parseInt(lossMatch[2], 10);

        // Windows RTT: "Minimum = 10ms, Maximum = 15ms, Average = 12ms"
        const rttMatch = output.match(/Minimum\s*=\s*(\d+)ms.*Maximum\s*=\s*(\d+)ms.*Average\s*=\s*(\d+)ms/i);
        if (rttMatch) {
            stats.min = parseFloat(rttMatch[1]);
            stats.max = parseFloat(rttMatch[2]);
            stats.avg = parseFloat(rttMatch[3]);
        }
    } else {
        // Linux/Mac format: "4 packets transmitted, 4 received, 0% packet loss"
        // Handles both "4 packets transmitted, 4 packets received" (Linux)
        // and "4 packets transmitted, 4 received" (macOS)
        const statsMatch = output.match(/(\d+)\s+packets?\s+transmitted.*?(\d+)\s+packets?\s+received.*?(\d+(?:\.\d+)?)%?\s*packet\s*loss/i);
        if (statsMatch) {
            stats.transmitted = parseInt(statsMatch[1], 10);
            stats.received = parseInt(statsMatch[2], 10);
            stats.packetLoss = parseFloat(statsMatch[3]);
        }

        // Linux RTT: "rtt min/avg/max/mdev = 10.123/12.456/15.789/1.234 ms"
        // macOS RTT: "round-trip min/avg/max/stddev = 0.054/0.116/0.175/0.048 ms"
        const rttMatch = output.match(/(?:rtt|round-trip)\s+min[\/]?avg[\/]?max[\/]?(?:mdev|stddev)\s*=\s*([\d.]+)\/([\d.]+)\/([\d.]+)/i);
        if (rttMatch) {
            stats.min = parseFloat(rttMatch[1]);
            stats.avg = parseFloat(rttMatch[2]);
            stats.max = parseFloat(rttMatch[3]);
        }
    }

    // Calculate packet loss if not found in output
    if (stats.transmitted > 0 && stats.received === 0) {
        stats.packetLoss = 100;
    } else if (stats.transmitted > 0) {
        stats.packetLoss = ((stats.transmitted - stats.received) / stats.transmitted) * 100;
    }

    return stats;
}

// ICMP Ping worker implementation
// Uses system ping command for ICMP echo requests
export const checkPing = async (monitor, result, options = {}) => {
    const { parseUrl } = options;
    const { hostname } = parseUrl(monitor.url);

    // Default timeout from monitor config or fallback to 5000ms
    const timeoutMs = monitor.timeout || 5000;

    // Platform-specific ping command
    const isWindows = process.platform === 'win32';
    // Use monitor.count if available, default to 4 for statistics
    const pingCount = monitor.count && monitor.count > 0 ? monitor.count : 4;

    // SECURITY: Sanitize hostname to prevent Command Injection
    const safeHostname = hostname.replace(/[^a-zA-Z0-9.-]/g, '');

    if (!safeHostname || safeHostname !== hostname) {
        throw new Error('Invalid hostname: contains unsafe characters');
    }

    let pingCommand;
    if (isWindows) {
        // Windows ping: -n = count, -w = timeout in ms
        pingCommand = `ping -n ${pingCount} -w ${timeoutMs} ${safeHostname}`;
    } else {
        // Unix/Linux/Mac ping: -c = count, -W = timeout in seconds
        const timeoutSec = Math.ceil(timeoutMs / 1000);
        pingCommand = `ping -c ${pingCount} -W ${timeoutSec} ${safeHostname}`;
    }

    try {
        // Execute ping command with timeout
        const { stdout, stderr } = await execAsync(pingCommand, {
            timeout: timeoutMs + 2000 // Add small buffer
        });

        const output = stdout + stderr;

        // Parse ping statistics for multi-ping scenarios
        const pingStats = parsePingStats(output, isWindows);

        // For single ping or successful response, check success indicators
        const isSuccess =
            output.includes('bytes from') ||
            output.includes('Reply from') ||
            output.includes('64 bytes from') ||
            output.includes('time=');

        if (isSuccess || pingStats.received > 0) {
            // Extract response time (use avg if available from multi-ping)
            let responseTime = pingStats.avg || 0;
            if (!responseTime) {
                const timeMatch = output.match(/time[=<](\d+\.?\d*)\s*ms/i);
                responseTime = timeMatch ? parseFloat(timeMatch[1]) : 0;
            }

            // Use advanced ping classifier with real statistics
            const classification = classifyPingResult({
                packetLoss: pingStats.packetLoss,
                rtt: responseTime,
                min: pingStats.min || responseTime,
                max: pingStats.max || responseTime,
                avg: pingStats.avg || responseTime
            }, {
                latencyThreshold: monitor.degradedThresholdMs || 1000
            });

            result.isUp = classification.status === 'UP' || classification.status === 'DEGRADED';
            result.healthState = classification.status;
            result.errorType = classification.errorType; // null for successful pings
            // Fix: Populate errorMessage if degraded so it shows in details
            result.errorMessage = classification.status === 'UP' ? null : classification.reason;
            result.statusCode = 0;
            // FIX: Set responseTime to parsed RTT, not command execution time
            result.responseTime = responseTime;
            result.confidence = classification.confidence;
            result.severity = classification.severity;
            result.packetLoss = pingStats.packetLoss;
            result.pingStats = pingStats;
            result.meta = {
                message: classification.reason,
                hostname,
                responseTime,
                transmitted: pingStats.transmitted,
                received: pingStats.received,
                rawOutput: output.substring(0, 500)
            };

            const confidenceStr = `${(classification.confidence * 100).toFixed(0)}%`;
            console.log(`📡 PING [${hostname}] ✅ ${result.healthState} - Response: ${responseTime}ms | Loss: ${pingStats.packetLoss.toFixed(1)}% | Confidence: ${confidenceStr} | Status: ${result.healthState}`);
        } else {
            // Ping failed but command succeeded (host not responding)
            // Use classifier for 100% packet loss
            const classification = classifyPingResult({
                packetLoss: 100,
                rtt: null,
                error: 'No reply from host'
            });

            result.isUp = classification.status === 'UP' || classification.status === 'DEGRADED';
            result.healthState = classification.status;
            result.errorType = classification.errorType;
            result.errorMessage = classification.reason;
            result.statusCode = null;
            result.responseTime = 0; // FIX: Set to 0 for failed pings
            result.confidence = classification.confidence;
            result.severity = classification.severity;
            result.packetLoss = 100;
            result.pingStats = pingStats;
            result.meta = {
                message: classification.reason,
                hostname,
                rawOutput: output.substring(0, 500)
            };

            const confidenceStr = `${(classification.confidence * 100).toFixed(0)}%`;
            console.log(`📡 PING [${hostname}] ❌ ${result.healthState} - ${result.errorMessage} | Confidence: ${confidenceStr}`);
        }
    } catch (error) {
        // Ping command failed - categorize the error
        // Initialize isUp based on healthState after classification, or default to false if not yet classified
        result.isUp = false;
        result.errorMessage = error.message || 'Ping failed';

        // Determine error type and use classifier
        const errorCode = error.code || '';
        const errorMsg = (error.message || '').toLowerCase();

        // Use advanced ping classifier for error scenarios
        let pingData = {
            packetLoss: 100,
            rtt: null,
            error: error.message
        };

        if (error.code === 'ETIMEDOUT' || errorMsg.includes('timeout') || errorMsg.includes('timed out')) {
            result.errorType = 'PING_TIMEOUT';
        } else if (errorMsg.includes('host unreachable') || errorCode === 'EHOSTUNREACH' || errorMsg.includes('no route to host')) {
            result.errorType = 'HOST_UNREACHABLE_PING';
        } else if (errorMsg.includes('network unreachable') || errorCode === 'ENETUNREACH') {
            result.errorType = 'PING_NETWORK_UNREACHABLE';
        } else if (errorMsg.includes('destination unreachable') || errorMsg.includes('prohibited')) {
            result.errorType = 'PING_DESTINATION_UNREACHABLE';
        } else if (errorMsg.includes('ttl expired') || errorMsg.includes('time to live exceeded')) {
            result.errorType = 'PING_TTL_EXPIRED';
        } else if (errorMsg.includes('transmit failed') || errorMsg.includes('sendto') || errorMsg.includes('general failure')) {
            result.errorType = 'PING_TRANSMISSION_FAILED';
        } else if (error.code === 'ENOENT' || errorMsg.includes('not found')) {
            result.errorType = 'PING_ERROR';
            result.errorMessage = 'Ping command not available on this system';
        } else if (error.code === 2 || error.code === 68 || errorMsg.includes('command failed')) {
            // ping exit code 2/68 usually means timeout or host unreachable
            result.errorType = 'PING_TIMEOUT';
        } else {
            result.errorType = 'PING_ERROR';
        }

        // Use classifier
        const classification = classifyPingResult(pingData);
        result.healthState = classification.status.toUpperCase();
        result.isUp = result.healthState === 'UP' || result.healthState === 'DEGRADED';
        result.confidence = classification.confidence;
        result.severity = classification.severity;

        result.statusCode = null;
        result.responseTime = 0; // FIX: Set to 0 for error cases
        result.packetLoss = 100;
        result.pingStats = { transmitted: pingCount, received: 0, packetLoss: 100 };
        result.meta = {
            message: classification.reason,
            hostname,
            errorCode: error.code || null,
            stderr: error.stderr || '',
            rawOutput: (error.stdout || '') + '\n' + (error.stderr || '')
        };

        const confidenceStr = `${(classification.confidence * 100).toFixed(0)}%`;
        console.log(`📡 PING [${hostname}] ❌ ${result.healthState} - ${result.errorMessage} | Confidence: ${confidenceStr} | ErrorType: ${result.errorType} | Code: ${error.code || 'N/A'}`);
    }
};

export default {
    checkPing
};

