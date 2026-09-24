import childProcess from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import net from 'net';
import { resolveSecurely } from '../utils/resolver.js';
import { classifyPingResult } from '../utils/status-classifier.js';

function execFileAsync(file, args, options) {
    const fn = promisify(childProcess.execFile);
    return fn(file, args, options);
}

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
    const parseUrl = options.parseUrl || ((urlStr) => {
        let u = (urlStr || '').trim();
        if (!/^[a-zA-Z]+:\/\//.test(u)) u = 'http://' + u;
        try {
            const parsed = new URL(u);
            return { hostname: parsed.hostname, port: parsed.port };
        } catch {
            return { hostname: (urlStr || '').replace(/^[a-zA-Z]+:\/\//, '').split('/')[0].split(':')[0], port: null };
        }
    });

    const { hostname } = parseUrl(monitor.url);
    const timeoutMs = monitor.timeout || 5000;
    const isWindows = process.platform === 'win32';
    const pingCount = Math.max(1, Math.min(10, parseInt(monitor.count, 10) || 4));

    try {
        // 🛡️ SSRF Protection: Resolve hostname securely BEFORE connecting
        // Prefer IPv4 for ping cross-platform compatibility
        const { address } = await resolveSecurely(hostname, { preferIpv4: true });

        // SECURITY: Use the resolved IP address directly to prevent SSRF and Command Injection
        const safeTarget = address;
        const isIpv6 = net.isIPv6(safeTarget);

        let pingArgs;
        let pingBinary = 'ping';

        if (isWindows) {
            // Windows ping: -n = count, -w = timeout in ms
            const timeoutMs_safe = Math.max(1000, Math.min(30000, parseInt(timeoutMs, 10) || 5000));
            pingArgs = isIpv6
                ? ['-6', '-n', String(pingCount), '-w', String(timeoutMs_safe), safeTarget]
                : ['-n', String(pingCount), '-w', String(timeoutMs_safe), safeTarget];
        } else if (process.platform === 'darwin') {
            // macOS BSD ping: -c = count, -W = timeout in milliseconds
            // For IPv6 on macOS, ping6 does not support -W for timeout (draft-03 packet format)
            const timeoutMs_safe = Math.max(1000, Math.min(30000, parseInt(timeoutMs, 10) || 5000));
            if (isIpv6) {
                if (fs.existsSync('/sbin/ping6')) pingBinary = '/sbin/ping6';
                else if (fs.existsSync('/bin/ping6')) pingBinary = '/bin/ping6';
                else pingBinary = 'ping6';
                pingArgs = ['-c', String(pingCount), safeTarget];
            } else {
                if (fs.existsSync('/sbin/ping')) pingBinary = '/sbin/ping';
                else if (fs.existsSync('/bin/ping')) pingBinary = '/bin/ping';
                pingArgs = ['-c', String(pingCount), '-W', String(timeoutMs_safe), safeTarget];
            }
        } else {
            // Linux ping: -c = count, -W = timeout in seconds
            const timeoutSec = Math.max(1, Math.min(30, Math.ceil(timeoutMs / 1000)));
            if (fs.existsSync('/bin/ping')) pingBinary = '/bin/ping';
            else if (fs.existsSync('/usr/bin/ping')) pingBinary = '/usr/bin/ping';

            pingArgs = isIpv6
                ? ['-6', '-c', String(pingCount), '-W', String(timeoutSec), safeTarget]
                : ['-c', String(pingCount), '-W', String(timeoutSec), safeTarget];
        }

        // Execute ping command directly without subshell invocation
        const { stdout, stderr } = await execFileAsync(pingBinary, pingArgs, {
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

            // If response time exceeds configured monitor timeout, mark as DOWN / TIMEOUT
            if (timeoutMs > 0 && responseTime > timeoutMs) {
                result.isUp = false;
                result.healthState = 'DOWN';
                result.errorType = 'TIMEOUT';
                result.errorMessage = `Ping response time (${responseTime}ms) exceeded configured timeout of ${timeoutMs}ms`;
                result.statusCode = 0;
                result.responseTime = responseTime;
                result.packetLoss = 100;
                result.confidence = 0.95;
                result.severity = 1.0;
                result.pingStats = pingStats;
                result.meta = {
                    message: result.errorMessage,
                    hostname,
                    responseTime,
                    transmitted: pingStats.transmitted,
                    received: pingStats.received,
                    rawOutput: output.substring(0, 500)
                };
                return result;
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
            // Populate errorMessage if degraded so it shows in details
            result.errorMessage = classification.status === 'UP' ? null : classification.reason;
            result.statusCode = 0;
            // FIX: Set responseTime to parsed RTT, not command execution time
            result.responseTime = responseTime > 0 ? responseTime : 1;
            result.confidence = classification.confidence;
            result.severity = classification.severity;
            result.packetLoss = pingStats.packetLoss;
            result.pingStats = pingStats;
            result.meta = {
                message: classification.reason,
                hostname,
                responseTime: result.responseTime,
                transmitted: pingStats.transmitted,
                received: pingStats.received,
                rawOutput: output.substring(0, 500)
            };

            const confidenceStr = `${(classification.confidence * 100).toFixed(0)}%`;
            console.log(`📡 PING [${hostname}] ✅ ${result.healthState} - Response: ${result.responseTime}ms | Loss: ${pingStats.packetLoss.toFixed(1)}% | Confidence: ${confidenceStr} | Status: ${result.healthState}`);
        } else {
            // Ping failed but command succeeded (host not responding)
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
        // Ping command or resolution failed - categorize the error
        result.isUp = false;
        result.errorMessage = error.message || 'Ping failed';

        // SSRF protection error
        if (error.code === 'SSRF_BLOCKED' || error.message?.includes('SSRF_PROTECTION') || error.message?.includes('SSRF Blocked')) {
            result.errorType = 'SSRF_BLOCKED';
            result.healthState = 'DOWN';
            result.statusCode = null;
            result.responseTime = 0;
            result.packetLoss = 100;
            result.pingStats = { transmitted: pingCount, received: 0, packetLoss: 100 };
            result.meta = {
                message: error.message,
                hostname,
                errorCode: 'SSRF_BLOCKED'
            };
            console.log(`📡 PING [${hostname}] ❌ DOWN - SSRF_BLOCKED | ${error.message}`);
            return;
        }

        // DNS error
        if (error.code === 'ENOTFOUND' || error.message?.includes('ENOTFOUND') || error.message?.includes('getaddrinfo')) {
            result.errorType = 'DNS_ERROR';
            result.healthState = 'DOWN';
            result.statusCode = null;
            result.responseTime = 0;
            result.packetLoss = 100;
            result.pingStats = { transmitted: pingCount, received: 0, packetLoss: 100 };
            result.meta = {
                message: error.message,
                hostname,
                errorCode: 'ENOTFOUND'
            };
            console.log(`📡 PING [${hostname}] ❌ DOWN - DNS_ERROR | ${error.message}`);
            return;
        }

        // Determine error type and use classifier
        const errorCode = error.code || '';
        const errorMsg = (error.message || '').toLowerCase();

        let pingData = {
            packetLoss: 100,
            rtt: null,
            error: error.message
        };

        if (error.code === 'ETIMEDOUT' || errorMsg.includes('timeout') || errorMsg.includes('timed out')) {
            result.errorType = 'PING_TIMEOUT';
        } else if (errorMsg.includes('host unreachable') || errorCode === 'EHOSTUNREACH' || errorMsg.includes('no route to host') || errorMsg.includes('host not found') || errorMsg.includes('unknown host')) {
            result.errorType = 'HOST_UNREACHABLE_PING';
        } else if (errorMsg.includes('network unreachable') || errorCode === 'ENETUNREACH') {
            result.errorType = 'PING_NETWORK_UNREACHABLE';
        } else if (errorMsg.includes('destination unreachable') || errorMsg.includes('prohibited')) {
            result.errorType = 'PING_DESTINATION_UNREACHABLE';
        } else if (errorMsg.includes('ttl expired') || errorMsg.includes('time to live exceeded')) {
            result.errorType = 'PING_TTL_EXPIRED';
        } else if (errorMsg.includes('transmit failed') || errorMsg.includes('sendto') || errorMsg.includes('general failure')) {
            result.errorType = 'PING_TRANSMISSION_FAILED';
        } else if (error.code === 'ENOENT' || errorMsg.includes('command not found') || errorMsg.includes('ping: not found')) {
            result.errorType = 'PING_ERROR';
            result.errorMessage = 'Ping command not available on this system';
        } else if (error.code === 2) {
            // Linux/macOS: exit code 2 = destination/network unreachable
            result.errorType = 'PING_NETWORK_UNREACHABLE';
        } else if (error.code === 68) {
            // macOS: exit code 68 = host not found / timeout
            result.errorType = 'HOST_UNREACHABLE_PING';
        } else if (errorMsg.includes('command failed')) {
            result.errorType = 'HOST_UNREACHABLE_PING';
        } else {
            result.errorType = 'PING_ERROR';
        }

        // Use classifier
        const classification = classifyPingResult(pingData);
        result.healthState = classification.status.toUpperCase();
        result.isUp = result.healthState === 'UP' || result.healthState === 'DEGRADED';
        result.confidence = classification.confidence;
        result.severity = classification.severity;
        result.errorMessage = classification.reason || result.errorMessage || 'Ping failed';

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
