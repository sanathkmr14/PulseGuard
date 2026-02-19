import axios from 'axios';
import VerificationProvider from './VerificationProvider.js';

class SSLProvider extends VerificationProvider {
    constructor() {
        super();
        this.API_URL = 'https://ssl-checker.io/api/v1/check';
    }

    /**
     * Perform SSL certificate verification using ssl-checker.io API
     * @param {Object} monitor - The SSL monitor to verify
     * @returns {Array} Array of SSL verification results
     */
    async verify(monitor) {
        try {
            // Extract hostname from URL
            const hostname = monitor.url
                .replace(/^https?:\/\//, '')
                .split('/')[0]
                .split(':')[0];

            console.log(`   🔐 ssl-checker.io: Checking certificate for ${hostname}`);

            const response = await axios.get(`${this.API_URL}/${hostname}`, {
                timeout: 15000,
                headers: { 'Accept': 'application/json' }
            });

            if (response.data?.status !== 'ok') {
                throw new Error('SSL checker returned error status');
            }

            const result = response.data.result;
            const responseTime = Math.round(parseFloat(response.data.response_time_sec || 0) * 1000);

            // Determine if certificate is valid
            const isUp = result.cert_valid === true && result.cert_exp === false;
            const daysLeft = result.days_left || 0;

            console.log(`   🔐 [ssl-checker.io] ${hostname} → ${isUp ? '✅ VALID' : '❌ INVALID'} (${daysLeft} days left)`);

            // Return as array format consistent with check-host.net results
            return [{
                nodeId: 'ssl-checker.io',
                location: 'ssl-checker.io (Global)',
                country: 'Global',
                city: 'SSL Checker',
                isUp: isUp,
                responseTime: responseTime,
                statusCode: null,
                error: isUp ? null : (result.cert_exp ? 'CERT_EXPIRED' : 'CERT_INVALID'),
                timestamp: new Date().toISOString(),
                // Additional SSL-specific data
                sslDetails: {
                    issuedTo: result.issued_to,
                    issuerCN: result.issuer_cn,
                    issuerOrg: result.issuer_o,
                    validFrom: result.valid_from,
                    validTill: result.valid_till,
                    daysLeft: daysLeft,
                    certExpired: result.cert_exp,
                    certValid: result.cert_valid,
                    hstsEnabled: result.hsts_header_enabled,
                    certAlgorithm: result.cert_alg,
                    resolvedIP: result.resolved_ip
                }
            }];

        } catch (err) {
            console.error(`❌ ssl-checker.io API error:`, err.message);

            // Return error result
            return [{
                nodeId: 'ssl-checker.io',
                location: 'ssl-checker.io (Global)',
                country: 'Global',
                city: 'SSL Checker',
                isUp: false,
                responseTime: 0,
                statusCode: null,
                error: `SSL Check Failed: ${err.message}`,
                timestamp: new Date().toISOString()
            }];
        }
    }
}

export default SSLProvider;
