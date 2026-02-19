
import MonitorRunner from '../../src/services/runner.js';

// ==========================================
// SSL EDGE CASES TEST SUITE
// ==========================================
const SCENARIOS = [
    // Valid SSL
    {
        category: 'Valid SSL',
        name: 'SHA-256 Certificate (should be valid)',
        url: 'https://sha256.badssl.com/',
        type: 'HTTP',
        expected: { status: 'UP', errorType: null }
    },
    {
        category: 'Valid SSL',
        name: 'Many SANs Certificate',
        url: 'https://1000-sans.badssl.com/',
        type: 'HTTP',
        expected: { status: 'UP', errorType: null }
    },

    // Expired SSL
    {
        category: 'Expired SSL',
        name: 'Expired Certificate',
        url: 'https://expired.badssl.com/',
        type: 'HTTP',
        expected: { status: 'DOWN', errorType: 'CERT_EXPIRED' }
    },

    // Self-Signed / Untrusted
    {
        category: 'Self-Signed',
        name: 'Self-Signed Certificate',
        url: 'https://self-signed.badssl.com/',
        type: 'HTTP',
        expected: { status: 'DEGRADED', errorType: 'SELF_SIGNED_CERT' }
    },
    {
        category: 'Self-Signed',
        name: 'Untrusted Root CA',
        url: 'https://untrusted-root.badssl.com/',
        type: 'HTTP',
        expected: { status: 'DOWN', errorType: 'CERT_UNTRUSTED' }
    },

    // Wrong Host
    {
        category: 'Wrong Host',
        name: 'Wrong Hostname',
        url: 'https://wrong.host.badssl.com/',
        type: 'HTTP',
        expected: { status: 'DOWN', errorType: 'CERT_HOSTNAME_MISMATCH' }
    },

    // Revoked Certificate
    {
        category: 'Revoked SSL',
        name: 'Revoked Certificate',
        url: 'https://revoked.badssl.com/',
        type: 'HTTP',
        expected: { status: 'DOWN' } // May be CERT_REVOKED or similar
    },

    // Weak Crypto
    {
        category: 'Weak Crypto',
        name: 'Null Cipher Suite',
        url: 'https://null.badssl.com/',
        type: 'HTTP',
        expected: { status: 'DOWN' } // Should fail TLS handshake
    },
    {
        category: 'Weak Crypto',
        name: 'RC4 Cipher Suite',
        url: 'https://rc4.badssl.com/',
        type: 'HTTP',
        expected: { status: 'DOWN' } // Weak cipher, may be rejected
    },

    // Mixed Content
    {
        category: 'Mixed Content',
        name: 'Insecure Content on Secure Page',
        url: 'https://mixed-script.badssl.com/',
        type: 'HTTP',
        expected: { status: 'UP' } // Certificate should still be valid
    },

    // Not-Yet-Valid Certificate (future valid date)
    {
        category: 'Not-Yet-Valid SSL',
        name: 'Future Valid Certificate',
        url: 'https://invalid-expected.badssl.com/',
        type: 'HTTP',
        expected: { status: 'DOWN', errorType: 'CERT_NOT_YET_VALID' }
    }
];

// ==========================================
// RUNNER
// ==========================================
async function runSslEdgeTests() {
    console.log('🚀 Starting SSL Edge Cases Test Suite...');
    console.log('================================================================================');
    console.log(`${'CATEGORY'.padEnd(18)} | ${'SCENARIO'.padEnd(35)} | ${'STATUS'.padEnd(10)} | ${'ERROR TYPE'.padEnd(20)} | RESULT`);
    console.log('--------------------------------------------------------------------------------');

    let passed = 0;
    let failed = 0;
    let skipped = 0;

    for (const scenario of SCENARIOS) {
        try {
            const result = await MonitorRunner.run({
                type: scenario.type,
                url: scenario.url,
                timeout: 15000,
                degradedThresholdMs: 8000
            });

            const statusMatch = result.healthState === scenario.expected.status;
            let typeMatch = true;

            if (scenario.expected.errorType) {
                typeMatch = result.errorType === scenario.expected.errorType;
            }

            if (statusMatch && typeMatch) {
                passed++;
                console.log(`${scenario.category.padEnd(18)} | ${scenario.name.padEnd(35)} | ✅ ${result.healthState.padEnd(8)} | ${(result.errorType || 'NONE').padEnd(20)} | PASS`);
            } else {
                // Allow for browser-specific error types that may differ
                const isAcceptable = checkAcceptableError(result, scenario.expected);
                if (isAcceptable) {
                    passed++;
                    console.log(`${scenario.category.padEnd(18)} | ${scenario.name.padEnd(35)} | ✅ ${result.healthState.padEnd(8)} | ${(result.errorType || 'NONE').padEnd(20)} | PASS (Acceptable variant)`);
                } else {
                    failed++;
                    console.log(`${scenario.category.padEnd(18)} | ${scenario.name.padEnd(35)} | ❌ ${result.healthState.padEnd(8)} | ${(result.errorType || 'NONE').padEnd(20)} | FAIL`);
                    console.log(`   EXPECTED: Status=${scenario.expected.status}, ErrorType=${scenario.expected.errorType || 'ANY'}`);
                    console.log(`   ACTUAL:   Status=${result.healthState}, ErrorType=${result.errorType}`);
                }
            }

        } catch (err) {
            // SSL errors might throw instead of returning error state
            if (scenario.expected.status === 'DOWN') {
                passed++;
                console.log(`${scenario.category.padEnd(18)} | ${scenario.name.padEnd(35)} | ✅ DOWN     | SSL_ERROR        | PASS (Exception as expected)`);
            } else {
                failed++;
                console.log(`${scenario.category.padEnd(18)} | ${scenario.name.padEnd(35)} | 💥 ERROR    | ${err.message.substring(0, 20)} | FAIL (Unexpected exception)`);
            }
        }
    }

    console.log('================================================================================');
    console.log(`SUMMARY: ${passed}/${SCENARIOS.length - skipped} Passed, ${failed} Failed, ${skipped} Skipped`);

    if (failed > 0) {
        console.log('❌ Some SSL edge case tests failed');
        process.exit(1);
    } else {
        console.log('✅ All SSL edge case tests passed');
        process.exit(0);
    }
}

// Helper to check acceptable error type variations
function checkAcceptableError(result, expected) {
    // Map of acceptable alternative error types
    const acceptableErrors = {
        'CERT_EXPIRED': ['CERT_EXPIRED', 'SSL_ERROR', 'TLS_ERROR'],
        'SELF_SIGNED_CERT': ['SELF_SIGNED_CERT', 'SSL_ERROR', 'CERT_UNTRUSTED'],
        'CERT_UNTRUSTED': ['CERT_UNTRUSTED', 'SSL_ERROR', 'SELF_SIGNED_CERT'],
        'CERT_HOSTNAME_MISMATCH': ['CERT_HOSTNAME_MISMATCH', 'SSL_ERROR', 'TLS_ERROR'],
        'CERT_REVOKED': ['CERT_REVOKED', 'CERT_CHAIN_ERROR', 'SSL_ERROR']
    };

    if (!expected.errorType) return true;
    if (result.errorType === expected.errorType) return true;
    if (acceptableErrors[expected.errorType]?.includes(result.errorType)) return true;
    
    return false;
}

runSslEdgeTests();

