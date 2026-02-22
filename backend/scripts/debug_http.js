import http from 'http';
import https from 'https';
import dns from 'dns';
import { promisify } from 'util';
import { URL } from 'url';
import net from 'net';

// Copy paste isPrivateIP from backend/src/utils/url-validator.js to avoid path issues with imports
const isPrivateIP = (ip) => {
    if (!net.isIP(ip)) return { isPrivate: false, error: null };

    // IPv4 Checks
    if (net.isIPv4(ip)) {
        // 127.0.0.1
        if (ip === '127.0.0.1') return { isPrivate: true, error: 'Loopback address not allowed' };
        // 10.0.0.0/8
        if (ip.startsWith('10.')) return { isPrivate: true, error: 'Private network (10.0.0.0/8) not allowed' };
        // 192.168.0.0/16
        if (ip.startsWith('192.168.')) return { isPrivate: true, error: 'Private network (192.168.0.0/16) not allowed' };
        // 172.16.0.0/12 (172.16.x.x - 172.31.x.x)
        if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) return { isPrivate: true, error: 'Private network (172.16.0.0/12) not allowed' };
        // 169.254.0.0/16 (Link Local / Metadata)
        if (ip.startsWith('169.254.')) return { isPrivate: true, error: 'Link-local address (169.254.0.0/16) not allowed' };
    }

    // IPv6 Checks
    if (net.isIPv6(ip)) {
        const lowerIp = ip.toLowerCase();
        // ::1
        if (lowerIp === '::1' || lowerIp === '[::1]') return { isPrivate: true, error: 'IPv6 loopback not allowed' };
        // fc00::/7 (Unique Local)
        if (lowerIp.startsWith('fc') || lowerIp.startsWith('fd')) return { isPrivate: true, error: 'Private IPv6 network not allowed' };
        // fe80::/10 (Link Local)
        if (lowerIp.startsWith('fe80')) return { isPrivate: true, error: 'Link-local IPv6 address not allowed' };
    }

    return { isPrivate: false, error: null };
};

const lookup = promisify(dns.lookup);

const performRequest = (url, timeout = 5000) => {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const protocol = parsedUrl.protocol === 'https:' ? https : http;

        const options = {
            method: 'GET',
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            timeout: timeout,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Connection': 'close'
            },
            rejectUnauthorized: true
        };

        console.log(`Making request to ${url}...`);

        const req = protocol.request(options);
        
        let isDone = false;

        const cleanup = () => {
            if (isDone) return;
            isDone = true;
            req.destroy();
        };

        (async () => {
            try {
                console.log('Resolving DNS...');
                const { address } = await lookup(options.hostname);
                console.log(`Resolved to ${address}`);
                
                const ipCheck = isPrivateIP(address);
                if (ipCheck.isPrivate) {
                    cleanup();
                    return reject(new Error(`Security: DNS resolved to restricted IP ${address} (${ipCheck.error})`));
                }

                console.log('Calling req.end()');
                req.end();
            } catch (dnsErr) {
                console.error('DNS Error:', dnsErr);
                cleanup();
                reject(dnsErr);
            }
        })();

        req.on('response', (res) => {
            if (isDone) return;
            console.log(`Got response: ${res.statusCode}`);
            
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (isDone) return;
                isDone = true;
                resolve({ status: res.statusCode });
            });
        });

        req.on('error', (err) => {
            console.error('Request Error:', err);
            if (isDone) return;
            isDone = true;
            req.destroy();
            reject(err);
        });
    });
};

// Test
performRequest('https://example.com')
    .then(res => console.log('Success:', res))
    .catch(err => console.error('Failed:', err));
