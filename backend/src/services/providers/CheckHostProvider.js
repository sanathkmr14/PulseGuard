import axios from 'axios';
import VerificationProvider from './VerificationProvider.js';

class CheckHostProvider extends VerificationProvider {
    constructor() {
        super();
        this.API_URL = 'https://check-host.net';
        this.MAX_NODES = 5;
    }

    /**
     * Sanitize host for Check-Host API
     * @param {string} url - URL to sanitize
     * @param {boolean} hostnameOnly - Whether to return only hostname
     */
    sanitizeHostForCheckHost(url, hostnameOnly = false) {
        try {
            // Remove protocol
            let host = url.replace(/^[a-zA-Z]+:\/\//, '');

            // Remove path/query if requesting hostname only
            if (hostnameOnly) {
                host = host.split('/')[0].split('?')[0];
                // Remove port if present
                host = host.split(':')[0];
            }

            return host;
        } catch (error) {
            return url;
        }
    }

    /**
     * Perform global verification using check-host.net API
     * @param {Object} monitor - The monitor to verify
     * @returns {Array} Array of verification results from global locations
     */
    async verify(monitor) {
        try {
            // Determine check type based on monitor type
            const monitorType = (monitor.type || 'HTTPS').toUpperCase();
            let checkType = 'http';
            let host = monitor.url;

            if (monitorType === 'TCP') {
                checkType = 'tcp';
                const hostname = this.sanitizeHostForCheckHost(monitor.url, true);

                // Extract port from URL if monitor.port is missing
                let port = monitor.port;
                if (!port) {
                    // Try to extract from URL string (e.g. google.com:81)
                    const urlParts = monitor.url.replace(/^[a-zA-Z]+:\/\//, '').split('/')[0].split(':');
                    if (urlParts.length > 1) {
                        const portStr = urlParts[urlParts.length - 1];
                        if (!isNaN(parseInt(portStr, 10))) {
                            port = parseInt(portStr, 10);
                        }
                    }
                }

                host = `${hostname}:${port || 80}`;
            } else if (monitorType === 'PING') {
                checkType = 'ping';
                host = this.sanitizeHostForCheckHost(monitor.url, true);
            } else if (monitorType === 'DNS') {
                checkType = 'dns';
                host = this.sanitizeHostForCheckHost(monitor.url, true);
            } else if (monitorType === 'UDP') {
                checkType = 'udp';
                const hostname = this.sanitizeHostForCheckHost(monitor.url, true);

                let port = monitor.port;
                if (!port) {
                    const urlParts = monitor.url.replace(/^[a-zA-Z]+:\/\//, '').split('/')[0].split(':');
                    if (urlParts.length > 1) {
                        const portStr = urlParts[urlParts.length - 1];
                        if (!isNaN(parseInt(portStr, 10))) {
                            port = parseInt(portStr, 10);
                        }
                    }
                }

                host = `${hostname}:${port || 53}`;
            } else if (monitorType === 'SSL') {
                // For SSL, use TCP check on port 443 to verify server reachability
                checkType = 'tcp';
                const hostname = monitor.url.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
                host = `${hostname}:443`;
            } else if (monitorType === 'SMTP') {
                // For SMTP, use TCP check on port 25/587
                checkType = 'tcp';
                const hostname = monitor.url.replace(/^https?:\/\//, '').replace(/^smtp:\/\//, '').split('/')[0].split(':')[0];
                host = `${hostname}:${monitor.port || 25}`;
            }

            // Step 1: Start the check (with retry for rate limits)
            let startResponse;
            let retryCount = 0;
            const maxRetries = 2;

            while (retryCount <= maxRetries) {
                try {
                    startResponse = await axios.get(`${this.API_URL}/check-${checkType}`, {
                        params: { host, max_nodes: this.MAX_NODES },
                        headers: { 'Accept': 'application/json' },
                        timeout: 15000
                    });

                    // Check for rate limit error in response
                    if (startResponse.data?.error === 'limit_exceeded') {
                        if (retryCount < maxRetries) {
                            const delay = 3000 * (retryCount + 1); // 3s, 6s
                            console.log(`⏳ Rate limited, retrying in ${delay / 1000}s (attempt ${retryCount + 1}/${maxRetries})...`);
                            await new Promise(r => setTimeout(r, delay));
                            retryCount++;
                            continue;
                        }
                    }
                    break; // Success or non-rate-limit error
                } catch (err) {
                    if (retryCount < maxRetries && err.message?.includes('limit')) {
                        const delay = 3000 * (retryCount + 1);
                        console.log(`⏳ Rate limited (error), retrying in ${delay / 1000}s...`);
                        await new Promise(r => setTimeout(r, delay));
                        retryCount++;
                        continue;
                    }
                    throw err;
                }
            }

            if (!startResponse.data?.ok || !startResponse.data?.request_id) {
                console.error('❌ check-host.net startup error:', JSON.stringify(startResponse.data));
                throw new Error(`Failed to start check-host.net verification: ${startResponse.data?.error || 'Unknown error'}`);
            }

            const requestId = startResponse.data.request_id;
            const nodes = startResponse.data.nodes || {};

            console.log(`   📡 check-host.net request started: ${requestId}`);

            // Step 2: Wait and poll for results (check-host.net takes a few seconds)
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Step 3: Get results with retry
            let results = null;
            for (let attempt = 0; attempt < 5; attempt++) {
                const resultResponse = await axios.get(`${this.API_URL}/check-result/${requestId}`, {
                    headers: { 'Accept': 'application/json' },
                    timeout: 10000
                });

                results = resultResponse.data;

                // Check if all nodes have completed (no null values)
                const allComplete = Object.values(results).every(v => v !== null);
                if (allComplete) break;

                await new Promise(resolve => setTimeout(resolve, 2000));
            }

            if (!results) {
                throw new Error('No results from check-host.net');
            }

            // Step 4: Parse results into our format
            const parsedResults = [];
            for (const [nodeId, nodeData] of Object.entries(results)) {
                if (nodeData === null) continue;

                const nodeInfo = nodes[nodeId] || [];
                const country = nodeInfo[1] || 'Unknown';
                const city = nodeInfo[2] || 'Unknown';
                const location = `${city}, ${country}`;

                let isUp = false;
                let responseTime = 0;
                let statusCode = null;
                let error = null;

                // Parse based on check type
                if (checkType === 'http' && Array.isArray(nodeData) && nodeData[0]) {
                    const httpResult = nodeData[0];
                    isUp = httpResult[0] === 1;
                    responseTime = Math.round((httpResult[1] || 0) * 1000);
                    statusCode = httpResult[3] || null;

                    if (!isUp) {
                        error = null;
                    }
                } else if (checkType === 'tcp' && Array.isArray(nodeData) && nodeData[0]) {
                    const tcpResult = nodeData[0];
                    // check-host TCP result: [1, 0.123, ...] where 1 is success
                    // Wait, looking at original code: isUp = tcpResult.time !== undefined && !tcpResult.error;
                    // Let's stick to original logic interpretation if possible, but standard check-host response for TCP is usually object with time/error
                    isUp = tcpResult.time !== undefined && !tcpResult.error;
                    responseTime = Math.round((tcpResult.time || 0) * 1000);

                    if (tcpResult.error) error = null;
                } else if (checkType === 'ping' && Array.isArray(nodeData) && nodeData[0]) {
                    const pingResults = nodeData[0];
                    const successfulPings = pingResults.filter(p => p && p[0] === 'OK');
                    isUp = successfulPings.length > 0;
                    if (isUp && successfulPings[0]) {
                        responseTime = Math.round((successfulPings[0][1] || 0) * 1000);
                    }
                } else if (checkType === 'dns' && Array.isArray(nodeData) && nodeData[0]) {
                    const dnsResult = nodeData[0];
                    isUp = dnsResult.A && dnsResult.A.length > 0;
                    responseTime = 0; // DNS doesn't return response time in check-host
                }

                parsedResults.push({
                    nodeId,
                    location,
                    country,
                    city,
                    isUp,
                    responseTime,
                    statusCode,
                    error,
                    timestamp: new Date().toISOString()
                });
            }

            return parsedResults;

        } catch (err) {
            console.error(`❌ check-host.net API error:`, err.message);
            return [];
        }
    }
}

export default CheckHostProvider;
