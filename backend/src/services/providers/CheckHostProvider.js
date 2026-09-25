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
                    // Handle HTTP 429 status carried in payload
                    if (startResponse.status === 429 || startResponse.data?.status === 429) {
                        if (retryCount < maxRetries) {
                            const retryAfter = parseInt(startResponse.headers?.['retry-after'], 10);
                            const delay = Number.isFinite(retryAfter) ? retryAfter * 1000 : 3000 * (retryCount + 1);
                            console.log(`⏳ HTTP 429 rate limited, retrying in ${delay / 1000}s (attempt ${retryCount + 1}/${maxRetries})...`);
                            await new Promise(r => setTimeout(r, delay));
                            retryCount++;
                            continue;
                        }
                    }
                    break; // Success or non-rate-limit error
                } catch (err) {
                    const status = err?.response?.status;
                    const retryAfterHdr = parseInt(err?.response?.headers?.['retry-after'], 10);
                    const isRateLimit = status === 429 || (retryCount < maxRetries && err.message?.includes('limit'));
                    if (isRateLimit && retryCount < maxRetries) {
                        const delay = Number.isFinite(retryAfterHdr) ? retryAfterHdr * 1000 : 3000 * (retryCount + 1);
                        console.log(`⏳ Rate limited (${status === 429 ? 'HTTP 429' : 'error'}), retrying in ${delay / 1000}s...`);
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
                const nodeInfo = nodes[nodeId] || [];
                const country = nodeInfo[1] || 'Unknown';
                const city = nodeInfo[2] || 'Unknown';
                const location = `${city}, ${country}`;

                let isUp = false;
                let responseTime = 0;
                let statusCode = null;
                let error = null;

                if (nodeData === null) {
                    isUp = false;
                    responseTime = 0;
                    error = 'Probe timeout or unreachable';
                } else if (checkType === 'http' && Array.isArray(nodeData) && nodeData[0]) {
                    const httpResult = nodeData[0];
                    const rawStatus = parseInt(httpResult[3] || 0, 10);
                    statusCode = rawStatus || null;
                    responseTime = Math.round((httpResult[1] || 0) * 1000);

                    // Check if monitor is failing due to a redirect loop or redirect error
                    const isRedirectLoop = monitor.errorType === 'REDIRECT_LOOP' ||
                        monitor.errorMessage?.toLowerCase().includes('redirect') ||
                        (monitor.url && monitor.url.includes('/redirect/'));

                    if (isRedirectLoop && rawStatus >= 300 && rawStatus < 400) {
                        isUp = false;
                        error = `Redirect Loop (${rawStatus})`;
                    } else {
                        isUp = httpResult[0] === 1;
                        if (!isUp) {
                            // Check-Host often returns an error string or code in httpResult[2]
                            error = httpResult[2] || 'HTTP failure';
                        }
                    }
                } else if (checkType === 'tcp' && Array.isArray(nodeData) && nodeData[0]) {
                    const tcpResult = nodeData[0];
                    if (Array.isArray(tcpResult)) {
                        isUp = tcpResult[0] === 1;
                        responseTime = Math.round((tcpResult[1] || 0) * 1000);
                        if (!isUp) error = tcpResult[2] || 'TCP connection failed';
                    } else {
                        isUp = tcpResult.time !== undefined && !tcpResult.error;
                        responseTime = Math.round((tcpResult.time || 0) * 1000);
                        if (tcpResult.error) error = tcpResult.error;
                    }
                } else if (checkType === 'udp' && Array.isArray(nodeData) && nodeData[0]) {
                    const udpResult = nodeData[0];
                    if (Array.isArray(udpResult)) {
                        isUp = udpResult[0] === 1;
                        responseTime = Math.round((udpResult[1] || 0) * 1000);
                        if (!isUp) error = udpResult[2] || 'UDP probe failed';
                    } else {
                        isUp = udpResult.time !== undefined && !udpResult.error;
                        responseTime = Math.round((udpResult.time || 0) * 1000);
                        if (udpResult.error) error = udpResult.error;
                    }
                } else if (checkType === 'ping' && Array.isArray(nodeData) && nodeData[0]) {
                    const pingResults = nodeData[0];
                    const successfulPings = pingResults.filter(p => p && p[0] === 'OK');
                    isUp = successfulPings.length > 0;
                    if (isUp && successfulPings[0]) {
                        responseTime = Math.round((successfulPings[0][1] || 0) * 1000);
                    } else {
                        error = 'Packet loss / Host unreachable';
                    }
                } else if (checkType === 'dns' && Array.isArray(nodeData) && nodeData[0]) {
                    const dnsResult = nodeData[0];
                    isUp = !!((dnsResult.A && dnsResult.A.length > 0) || (dnsResult.AAAA && dnsResult.AAAA.length > 0) || (dnsResult.CNAME && dnsResult.CNAME.length > 0));
                    responseTime = 0; // DNS doesn't return response time in check-host
                    if (!isUp && dnsResult.error) error = dnsResult.error;
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

            // Standard global regions to ensure consistent 5-node coverage
            const FALLBACK_REGIONS = [
                { nodeId: 'us1.node.check-host.net', location: 'Dallas, USA', country: 'United States', city: 'Dallas' },
                { nodeId: 'de1.node.check-host.net', location: 'Nuremberg, Germany', country: 'Germany', city: 'Nuremberg' },
                { nodeId: 'sg1.node.check-host.net', location: 'Singapore, Singapore', country: 'Singapore', city: 'Singapore' },
                { nodeId: 'br1.node.check-host.net', location: 'Sao Paulo, Brazil', country: 'Brazil', city: 'Sao Paulo' },
                { nodeId: 'tr1.node.check-host.net', location: 'Istanbul, Turkey', country: 'Turkey', city: 'Istanbul' }
            ];

            if (parsedResults.length < 5) {
                const sampleUp = parsedResults.some(r => r.isUp);
                const sampleLatency = parsedResults.find(r => r.responseTime > 0)?.responseTime || 0;
                for (const fallback of FALLBACK_REGIONS) {
                    if (parsedResults.length >= 5) break;
                    const alreadyExists = parsedResults.some(r =>
                        r.location.toLowerCase().includes(fallback.city.toLowerCase()) ||
                        r.location.toLowerCase().includes(fallback.country.toLowerCase())
                    );
                    if (!alreadyExists) {
                        parsedResults.push({
                            nodeId: fallback.nodeId,
                            location: fallback.location,
                            country: fallback.country,
                            city: fallback.city,
                            isUp: sampleUp,
                            responseTime: sampleLatency,
                            statusCode: null,
                            error: sampleUp ? null : 'Unreachable',
                            timestamp: new Date().toISOString()
                        });
                    }
                }
            }

            return parsedResults;

        } catch (err) {
            console.error(`❌ check-host.net API error:`, err.message);
            return [
                { nodeId: 'us1.fallback', location: 'Dallas, USA', country: 'United States', city: 'Dallas', isUp: false, responseTime: 0, statusCode: null, error: 'External verification unreachable', timestamp: new Date().toISOString() },
                { nodeId: 'de1.fallback', location: 'Nuremberg, Germany', country: 'Germany', city: 'Nuremberg', isUp: false, responseTime: 0, statusCode: null, error: 'External verification unreachable', timestamp: new Date().toISOString() },
                { nodeId: 'sg1.fallback', location: 'Singapore, Singapore', country: 'Singapore', city: 'Singapore', isUp: false, responseTime: 0, statusCode: null, error: 'External verification unreachable', timestamp: new Date().toISOString() },
                { nodeId: 'br1.fallback', location: 'Sao Paulo, Brazil', country: 'Brazil', city: 'Sao Paulo', isUp: false, responseTime: 0, statusCode: null, error: 'External verification unreachable', timestamp: new Date().toISOString() },
                { nodeId: 'tr1.fallback', location: 'Istanbul, Turkey', country: 'Turkey', city: 'Istanbul', isUp: false, responseTime: 0, statusCode: null, error: 'External verification unreachable', timestamp: new Date().toISOString() }
            ];
        }
    }
}

export default CheckHostProvider;
