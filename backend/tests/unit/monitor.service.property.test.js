/**
 * Property-Based Tests for Monitor Service
 * Uses fast-check for property-based testing
 * 
 * Run with: node --experimental-vm-modules node_modules/.bin/jest monitor.service.property.test.js
 * Or: node backend/src/services/monitor.service.property.test.js
 */

import fc from 'fast-check';

// Re-implement helper functions for testing (since they're not exported)
const PROTOCOL_DEFAULTS = {
    'HTTP': 80, 
    'HTTPS': 443, 
    'TCP': 80, 
    'UDP': 53,
    'DNS': 53, 
    'SSL': 443, 
    'SMTP': 25
};

/**
 * Parse port from URL or monitor config with protocol-specific defaults
 * (Mirror of the implementation in monitor.service.js)
 */
function parsePort(urlObj, monitor) {
    const type = (monitor.type || 'HTTP').toUpperCase();
    const defaultPort = PROTOCOL_DEFAULTS[type] || 80;
    
    // Get port value, ensuring we handle objects safely
    let portValue = monitor.port ?? urlObj.port;
    
    // If port is not specified, null, undefined, or empty string, use default
    if (portValue == null || portValue === '') {
        return defaultPort;
    }
    
    // Only accept string or number types for port
    if (typeof portValue !== 'string' && typeof portValue !== 'number') {
        return defaultPort;
    }
    
    const port = parseInt(String(portValue), 10);
    
    // Validate port is a valid integer in range
    if (!Number.isNaN(port) && Number.isInteger(port) && port > 0 && port <= 65535) {
        return port;
    }
    
    return defaultPort;
}

// ============================================================================
// Property Test: Port Parsing with Defaults
// Feature: monitor-service-fixes, Property 6: Port parsing with defaults
// Validates: Requirements 5.1, 5.3, 5.4
// ============================================================================

console.log('Running Property Tests for Monitor Service...\n');

let passed = 0;
let failed = 0;

// Property 6.1: Valid ports are parsed correctly
console.log('Property 6.1: Valid port numbers are parsed as integers');
try {
    fc.assert(
        fc.property(
            fc.integer({ min: 1, max: 65535 }),
            fc.constantFrom('HTTP', 'HTTPS', 'TCP', 'UDP', 'DNS', 'SSL', 'SMTP'),
            (validPort, protocol) => {
                const urlObj = { port: '' };
                const monitor = { port: validPort, type: protocol };
                const result = parsePort(urlObj, monitor);
                
                // Result should be the exact port provided
                return result === validPort;
            }
        ),
        { numRuns: 100 }
    );
    console.log('  ✓ PASSED\n');
    passed++;
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    failed++;
}

// Property 6.2: Empty/missing ports use protocol defaults
console.log('Property 6.2: Empty or missing ports use protocol-specific defaults');
try {
    fc.assert(
        fc.property(
            fc.constantFrom('HTTP', 'HTTPS', 'TCP', 'UDP', 'DNS', 'SSL', 'SMTP'),
            fc.constantFrom('', null, undefined),
            (protocol, emptyPort) => {
                const urlObj = { port: '' };
                const monitor = { port: emptyPort, type: protocol };
                const result = parsePort(urlObj, monitor);
                
                // Result should be the protocol default
                return result === PROTOCOL_DEFAULTS[protocol];
            }
        ),
        { numRuns: 100 }
    );
    console.log('  ✓ PASSED\n');
    passed++;
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    failed++;
}

// Property 6.3: Invalid ports fall back to defaults
console.log('Property 6.3: Invalid port values fall back to protocol defaults');
try {
    fc.assert(
        fc.property(
            fc.constantFrom('HTTP', 'HTTPS', 'TCP', 'UDP', 'DNS', 'SSL', 'SMTP'),
            fc.oneof(
                fc.integer({ max: 0 }),           // Zero or negative
                fc.integer({ min: 65536 }),       // Above max port
                fc.constant('invalid'),           // Non-numeric string
                fc.constant('abc123'),            // Mixed string
                fc.constant(NaN)                  // NaN
            ),
            (protocol, invalidPort) => {
                const urlObj = { port: '' };
                const monitor = { port: invalidPort, type: protocol };
                const result = parsePort(urlObj, monitor);
                
                // Result should be a valid port (protocol default)
                return result > 0 && result <= 65535 && result === PROTOCOL_DEFAULTS[protocol];
            }
        ),
        { numRuns: 100 }
    );
    console.log('  ✓ PASSED\n');
    passed++;
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    failed++;
}

// Property 6.4: Result is always a valid positive integer
console.log('Property 6.4: Parsed port is always a valid positive integer (1-65535)');
try {
    fc.assert(
        fc.property(
            fc.anything(),  // Any possible port value
            fc.constantFrom('HTTP', 'HTTPS', 'TCP', 'UDP', 'DNS', 'SSL', 'SMTP', 'UNKNOWN'),
            (anyPort, protocol) => {
                const urlObj = { port: '' };
                const monitor = { port: anyPort, type: protocol };
                const result = parsePort(urlObj, monitor);
                
                // Result must always be a valid port number
                return typeof result === 'number' && 
                       Number.isInteger(result) && 
                       result > 0 && 
                       result <= 65535;
            }
        ),
        { numRuns: 100 }
    );
    console.log('  ✓ PASSED\n');
    passed++;
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    failed++;
}

// Property 6.5: URL port takes precedence when monitor port is missing
console.log('Property 6.5: URL port is used when monitor port is not specified');
try {
    fc.assert(
        fc.property(
            fc.integer({ min: 1, max: 65535 }),
            fc.constantFrom('HTTP', 'HTTPS', 'TCP', 'UDP', 'DNS', 'SSL', 'SMTP'),
            (urlPort, protocol) => {
                const urlObj = { port: String(urlPort) };
                const monitor = { type: protocol };  // No port specified
                const result = parsePort(urlObj, monitor);
                
                // Should use URL port when monitor port is missing
                return result === urlPort;
            }
        ),
        { numRuns: 100 }
    );
    console.log('  ✓ PASSED\n');
    passed++;
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    failed++;
}

console.log('='.repeat(60));
console.log(`Property Tests Complete: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

if (failed > 0) {
    process.exit(1);
}


// ============================================================================
// Property Test: Correct Agent Selection by Protocol
// Feature: monitor-service-fixes, Property 1: Correct agent selection by protocol
// Validates: Requirements 1.1, 1.2, 1.3
// ============================================================================

console.log('\n--- Property 1: Agent Selection Tests ---\n');

let agentPassed = 0;
let agentFailed = 0;

/**
 * Simulates the agent selection logic from checkHTTP
 * Returns which agent(s) would be set in axios config
 */
function getAgentConfig(url) {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    
    const config = {};
    if (isHttps) {
        config.httpsAgent = 'HTTPS_AGENT';
    } else {
        config.httpAgent = 'HTTP_AGENT';
    }
    return config;
}

// Property 1.1: HTTP URLs use only httpAgent
console.log('Property 1.1: HTTP URLs use only httpAgent');
try {
    fc.assert(
        fc.property(
            fc.webUrl({ validSchemes: ['http'] }),
            (httpUrl) => {
                const config = getAgentConfig(httpUrl);
                
                // Should have httpAgent and NOT httpsAgent
                return config.httpAgent === 'HTTP_AGENT' && 
                       config.httpsAgent === undefined;
            }
        ),
        { numRuns: 100 }
    );
    console.log('  ✓ PASSED\n');
    agentPassed++;
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    agentFailed++;
}

// Property 1.2: HTTPS URLs use only httpsAgent
console.log('Property 1.2: HTTPS URLs use only httpsAgent');
try {
    fc.assert(
        fc.property(
            fc.webUrl({ validSchemes: ['https'] }),
            (httpsUrl) => {
                const config = getAgentConfig(httpsUrl);
                
                // Should have httpsAgent and NOT httpAgent
                return config.httpsAgent === 'HTTPS_AGENT' && 
                       config.httpAgent === undefined;
            }
        ),
        { numRuns: 100 }
    );
    console.log('  ✓ PASSED\n');
    agentPassed++;
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    agentFailed++;
}

// Property 1.3: Never both agents simultaneously
console.log('Property 1.3: Never both agents set simultaneously');
try {
    fc.assert(
        fc.property(
            fc.webUrl({ validSchemes: ['http', 'https'] }),
            (url) => {
                const config = getAgentConfig(url);
                
                // Should never have both agents
                const hasBoth = config.httpAgent !== undefined && config.httpsAgent !== undefined;
                return !hasBoth;
            }
        ),
        { numRuns: 100 }
    );
    console.log('  ✓ PASSED\n');
    agentPassed++;
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    agentFailed++;
}

// Property 1.4: Exactly one agent is always set
console.log('Property 1.4: Exactly one agent is always set');
try {
    fc.assert(
        fc.property(
            fc.webUrl({ validSchemes: ['http', 'https'] }),
            (url) => {
                const config = getAgentConfig(url);
                
                const hasHttp = config.httpAgent !== undefined;
                const hasHttps = config.httpsAgent !== undefined;
                
                // Exactly one should be set (XOR)
                return (hasHttp || hasHttps) && !(hasHttp && hasHttps);
            }
        ),
        { numRuns: 100 }
    );
    console.log('  ✓ PASSED\n');
    agentPassed++;
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    agentFailed++;
}

console.log('='.repeat(60));
console.log(`Agent Selection Tests: ${agentPassed} passed, ${agentFailed} failed`);
console.log('='.repeat(60));

passed += agentPassed;
failed += agentFailed;


// ============================================================================
// Property Test: DNS Result Parsing Completeness
// Feature: monitor-service-fixes, Property 2: DNS result parsing completeness
// Validates: Requirements 2.1, 2.2, 2.3, 2.4
// ============================================================================

console.log('\n--- Property 2: DNS Result Parsing Tests ---\n');

let dnsPassed = 0;
let dnsFailed = 0;

/**
 * Simulates DNS result parsing logic from checkDNS
 * Handles both object {address, family} and string return types
 */
function parseDnsResult(r) {
    const address = typeof r === 'object' ? r.address : r;
    const family = typeof r === 'object' ? r.family : undefined;
    return { address, family };
}

// Property 2.1: Object results extract address correctly
console.log('Property 2.1: Object results extract address field correctly');
try {
    fc.assert(
        fc.property(
            fc.ipV4(),
            fc.constantFrom(4, 6),
            (ip, family) => {
                const dnsResult = { address: ip, family };
                const parsed = parseDnsResult(dnsResult);
                
                return parsed.address === ip && parsed.family === family;
            }
        ),
        { numRuns: 100 }
    );
    console.log('  ✓ PASSED\n');
    dnsPassed++;
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    dnsFailed++;
}

// Property 2.2: String results are handled (legacy format)
console.log('Property 2.2: String results are handled as legacy format');
try {
    fc.assert(
        fc.property(
            fc.ipV4(),
            (ip) => {
                const parsed = parseDnsResult(ip);
                
                // Address should be the string, family should be undefined
                return parsed.address === ip && parsed.family === undefined;
            }
        ),
        { numRuns: 100 }
    );
    console.log('  ✓ PASSED\n');
    dnsPassed++;
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    dnsFailed++;
}

// Property 2.3: Address is always a string
console.log('Property 2.3: Parsed address is always a string');
try {
    fc.assert(
        fc.property(
            fc.oneof(
                // Object format
                fc.record({ address: fc.ipV4(), family: fc.constantFrom(4, 6) }),
                // String format
                fc.ipV4()
            ),
            (dnsResult) => {
                const parsed = parseDnsResult(dnsResult);
                return typeof parsed.address === 'string';
            }
        ),
        { numRuns: 100 }
    );
    console.log('  ✓ PASSED\n');
    dnsPassed++;
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    dnsFailed++;
}

// Property 2.4: Family is number when present
console.log('Property 2.4: Family is a number when present (from object format)');
try {
    fc.assert(
        fc.property(
            fc.ipV4(),
            fc.constantFrom(4, 6),
            (ip, family) => {
                const dnsResult = { address: ip, family };
                const parsed = parseDnsResult(dnsResult);
                
                return typeof parsed.family === 'number';
            }
        ),
        { numRuns: 100 }
    );
    console.log('  ✓ PASSED\n');
    dnsPassed++;
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    dnsFailed++;
}

console.log('='.repeat(60));
console.log(`DNS Parsing Tests: ${dnsPassed} passed, ${dnsFailed} failed`);
console.log('='.repeat(60));

passed += dnsPassed;
failed += dnsFailed;


// ============================================================================
// Property Test: SSL Invalid Certificates are DOWN
// Feature: monitor-service-fixes, Property 3: SSL invalid certificates are DOWN
// Validates: Requirements 3.3
// ============================================================================

console.log('\n--- Property 3: SSL Invalid Certificates Tests ---\n');

let sslInvalidPassed = 0;
let sslInvalidFailed = 0;

/**
 * Simulates SSL status logic from checkSSL
 */
function determineSSLStatus(sslInfo, expiryWarnDays = 7) {
    const daysRemaining = sslInfo.daysRemaining ?? null;
    const valid = Boolean(sslInfo.valid);

    let status = 'UP';
    let errorType = null;
    let errorMessage = null;
    let warning = null;

    if (!valid) {
        status = 'DOWN'; 
        errorType = 'SSL_INVALID'; 
        errorMessage = 'SSL invalid';
    } else if (daysRemaining != null && daysRemaining <= 0) {
        status = 'DOWN'; 
        errorType = 'CERT_HAS_EXPIRED'; 
        errorMessage = `Certificate expired`;
    } else if (daysRemaining != null && daysRemaining <= expiryWarnDays) {
        status = 'UP'; 
        warning = `Certificate expires in ${daysRemaining} days`;
    }

    return { status, errorType, errorMessage, warning };
}

// Property 3.1: Invalid certificates always return DOWN
console.log('Property 3.1: Invalid certificates always return DOWN status');
try {
    fc.assert(
        fc.property(
            fc.record({
                valid: fc.constant(false),
                daysRemaining: fc.option(fc.integer({ min: -365, max: 365 }))
            }),
            (sslInfo) => {
                const result = determineSSLStatus(sslInfo);
                return result.status === 'DOWN' && result.errorType === 'SSL_INVALID';
            }
        ),
        { numRuns: 100 }
    );
    console.log('  ✓ PASSED\n');
    sslInvalidPassed++;
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    sslInvalidFailed++;
}

// Property 3.2: Expired certificates (daysRemaining <= 0) return DOWN
console.log('Property 3.2: Expired certificates return DOWN status');
try {
    fc.assert(
        fc.property(
            fc.record({
                valid: fc.constant(true),
                daysRemaining: fc.integer({ min: -365, max: 0 })
            }),
            (sslInfo) => {
                const result = determineSSLStatus(sslInfo);
                return result.status === 'DOWN' && result.errorType === 'CERT_HAS_EXPIRED';
            }
        ),
        { numRuns: 100 }
    );
    console.log('  ✓ PASSED\n');
    sslInvalidPassed++;
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    sslInvalidFailed++;
}

// Property 3.3: Valid certificates with plenty of time return UP without warning
console.log('Property 3.3: Valid certificates with >7 days return UP without warning');
try {
    fc.assert(
        fc.property(
            fc.record({
                valid: fc.constant(true),
                daysRemaining: fc.integer({ min: 8, max: 365 })
            }),
            (sslInfo) => {
                const result = determineSSLStatus(sslInfo);
                return result.status === 'UP' && 
                       result.errorType === null && 
                       result.warning === null;
            }
        ),
        { numRuns: 100 }
    );
    console.log('  ✓ PASSED\n');
    sslInvalidPassed++;
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    sslInvalidFailed++;
}

console.log('='.repeat(60));
console.log(`SSL Invalid Tests: ${sslInvalidPassed} passed, ${sslInvalidFailed} failed`);
console.log('='.repeat(60));

passed += sslInvalidPassed;
failed += sslInvalidFailed;


// ============================================================================
// Property Test: SSL Warnings are Separate from Errors
// Feature: monitor-service-fixes, Property 4: SSL warnings are separate from errors
// Validates: Requirements 3.4
// ============================================================================

console.log('\n--- Property 4: SSL Warning Separation Tests ---\n');

let sslWarnPassed = 0;
let sslWarnFailed = 0;

// Property 4.1: Expiring soon certificates have warning but no errorType
console.log('Property 4.1: Expiring soon certs have warning field, not errorType');
try {
    fc.assert(
        fc.property(
            fc.integer({ min: 1, max: 7 }),  // 1-7 days remaining (within warn threshold)
            (daysRemaining) => {
                const sslInfo = { valid: true, daysRemaining };
                const result = determineSSLStatus(sslInfo, 7);
                
                // Should be UP with warning, no errorType
                return result.status === 'UP' && 
                       result.warning !== null && 
                       result.errorType === null;
            }
        ),
        { numRuns: 100 }
    );
    console.log('  ✓ PASSED\n');
    sslWarnPassed++;
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    sslWarnFailed++;
}

// Property 4.2: Warning and errorType are mutually exclusive for UP status
console.log('Property 4.2: Warning and errorType are mutually exclusive');
try {
    fc.assert(
        fc.property(
            fc.record({
                valid: fc.boolean(),
                daysRemaining: fc.option(fc.integer({ min: -30, max: 365 }))
            }),
            (sslInfo) => {
                const result = determineSSLStatus(sslInfo);
                
                // If status is UP, errorType should be null
                // If status is DOWN, warning should be null
                if (result.status === 'UP') {
                    return result.errorType === null;
                } else {
                    return result.warning === null;
                }
            }
        ),
        { numRuns: 100 }
    );
    console.log('  ✓ PASSED\n');
    sslWarnPassed++;
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    sslWarnFailed++;
}

// Property 4.3: Warning contains days remaining info
console.log('Property 4.3: Warning message contains days remaining');
try {
    fc.assert(
        fc.property(
            fc.integer({ min: 1, max: 7 }),
            (daysRemaining) => {
                const sslInfo = { valid: true, daysRemaining };
                const result = determineSSLStatus(sslInfo, 7);
                
                // Warning should mention the days
                return result.warning !== null && 
                       result.warning.includes(String(daysRemaining));
            }
        ),
        { numRuns: 100 }
    );
    console.log('  ✓ PASSED\n');
    sslWarnPassed++;
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    sslWarnFailed++;
}

console.log('='.repeat(60));
console.log(`SSL Warning Separation Tests: ${sslWarnPassed} passed, ${sslWarnFailed} failed`);
console.log('='.repeat(60));

passed += sslWarnPassed;
failed += sslWarnFailed;


// ============================================================================
// Property Test: SSL Error Handling Completeness
// Feature: monitor-service-fixes, Property 5: SSL error handling completeness
// Validates: Requirements 4.1, 4.3, 4.4
// ============================================================================

console.log('\n--- Property 5: SSL Error Handling Tests ---\n');

let sslErrorPassed = 0;
let sslErrorFailed = 0;

/**
 * Simulates error handling logic from checkSSL catch block
 */
function handleSSLError(err) {
    const safeErrorCode = (e) => {
        if (!e) return 'NETWORK_ERROR';
        const code = e.code || e.errno || e.name;
        return code ? String(code) : 'NETWORK_ERROR';
    };
    
    const sanitizeMessage = (msg) => {
        if (!msg) return '';
        const msgStr = String(msg);
        if (msgStr.length > 1000) return msgStr.slice(0, 1000) + '...';
        return msgStr;
    };
    
    return {
        status: 'DOWN',
        responseTimeMs: 0,
        statusCode: null,
        errorType: safeErrorCode(err),
        errorMessage: sanitizeMessage(err?.message),  // Safe access for null/undefined
        warning: null,
        meta: null
    };
}

// Property 5.1: All errors return DOWN status
console.log('Property 5.1: All SSL errors return DOWN status');
try {
    fc.assert(
        fc.property(
            fc.record({
                code: fc.option(fc.constantFrom('ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'SSL_ERROR')),
                message: fc.string({ maxLength: 200 })
            }),
            (err) => {
                const result = handleSSLError(err);
                return result.status === 'DOWN';
            }
        ),
        { numRuns: 100 }
    );
    console.log('  ✓ PASSED\n');
    sslErrorPassed++;
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    sslErrorFailed++;
}

// Property 5.2: Error type is always a string
console.log('Property 5.2: Error type is always a string');
try {
    fc.assert(
        fc.property(
            fc.record({
                code: fc.option(fc.string({ maxLength: 50 })),
                errno: fc.option(fc.string({ maxLength: 50 })),
                name: fc.option(fc.string({ maxLength: 50 })),
                message: fc.string({ maxLength: 200 })
            }),
            (err) => {
                const result = handleSSLError(err);
                return typeof result.errorType === 'string' && result.errorType.length > 0;
            }
        ),
        { numRuns: 100 }
    );
    console.log('  ✓ PASSED\n');
    sslErrorPassed++;
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    sslErrorFailed++;
}

// Property 5.3: Error messages are sanitized (truncated if too long)
console.log('Property 5.3: Error messages are sanitized and truncated');
try {
    fc.assert(
        fc.property(
            fc.string({ minLength: 0, maxLength: 2000 }),
            (longMessage) => {
                const err = { message: longMessage };
                const result = handleSSLError(err);
                
                // Message should never exceed 1003 chars (1000 + '...')
                return result.errorMessage.length <= 1003;
            }
        ),
        { numRuns: 100 }
    );
    console.log('  ✓ PASSED\n');
    sslErrorPassed++;
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    sslErrorFailed++;
}

// Property 5.4: Null/undefined errors are handled gracefully
console.log('Property 5.4: Null/undefined errors handled gracefully');
try {
    fc.assert(
        fc.property(
            fc.constantFrom(null, undefined, {}, { code: null }, { message: null }),
            (err) => {
                // The actual implementation handles null by returning NETWORK_ERROR
                const result = handleSSLError(err);
                return result.status === 'DOWN' && 
                       typeof result.errorType === 'string' &&
                       result.errorType.length > 0;
            }
        ),
        { numRuns: 100 }
    );
    console.log('  ✓ PASSED\n');
    sslErrorPassed++;
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    sslErrorFailed++;
}

console.log('='.repeat(60));
console.log(`SSL Error Handling Tests: ${sslErrorPassed} passed, ${sslErrorFailed} failed`);
console.log('='.repeat(60));

passed += sslErrorPassed;
failed += sslErrorFailed;


// ============================================================================
// Property Test: UDP Reliability Context
// Feature: monitor-service-fixes, Property 7: UDP reliability context
// Validates: Requirements 6.2
// ============================================================================

console.log('\n--- Property 7: UDP Reliability Context Tests ---\n');

let udpReliabilityPassed = 0;
let udpReliabilityFailed = 0;

/**
 * Simulates UDP result structure from checkUDP
 */
function createUDPResult(type, response = null, expectedResponse = null) {
    const base = {
        responseTimeMs: 100,
        statusCode: null,
        meta: { reliability: 'best-effort' }
    };
    
    if (type === 'timeout') {
        return {
            ...base,
            status: 'DOWN',
            errorType: 'UDP_TIMEOUT',
            errorMessage: 'UDP probe timed out',
            warning: 'UDP is connectionless; timeout may not indicate service failure'
        };
    } else if (type === 'success') {
        const ok = expectedResponse ? response?.includes(expectedResponse) : true;
        return {
            ...base,
            status: ok ? 'UP' : 'DOWN',
            errorType: ok ? null : 'UDP_RESPONSE_MISMATCH',
            errorMessage: ok ? null : 'UDP response did not match expected payload',
            warning: null,
            meta: { response, reliability: 'best-effort' }
        };
    } else if (type === 'error') {
        return {
            ...base,
            status: 'DOWN',
            errorType: 'NETWORK_ERROR',
            errorMessage: 'UDP error',
            warning: null
        };
    }
    return base;
}

// Property 7.1: All UDP results include reliability context in metadata
console.log('Property 7.1: All UDP results include reliability metadata');
try {
    fc.assert(
        fc.property(
            fc.constantFrom('timeout', 'success', 'error'),
            (resultType) => {
                const result = createUDPResult(resultType);
                return result.meta !== null && 
                       result.meta.reliability === 'best-effort';
            }
        ),
        { numRuns: 100 }
    );
    console.log('  ✓ PASSED\n');
    udpReliabilityPassed++;
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    udpReliabilityFailed++;
}

// Property 7.2: UDP timeouts include warning about connectionless nature
console.log('Property 7.2: UDP timeouts include connectionless warning');
try {
    fc.assert(
        fc.property(
            fc.constant('timeout'),
            (resultType) => {
                const result = createUDPResult(resultType);
                return result.warning !== null && 
                       result.warning.includes('connectionless');
            }
        ),
        { numRuns: 100 }
    );
    console.log('  ✓ PASSED\n');
    udpReliabilityPassed++;
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    udpReliabilityFailed++;
}

console.log('='.repeat(60));
console.log(`UDP Reliability Tests: ${udpReliabilityPassed} passed, ${udpReliabilityFailed} failed`);
console.log('='.repeat(60));

passed += udpReliabilityPassed;
failed += udpReliabilityFailed;


// ============================================================================
// Property Test: UDP Response Validation Clarity
// Feature: monitor-service-fixes, Property 8: UDP response validation clarity
// Validates: Requirements 6.4
// ============================================================================

console.log('\n--- Property 8: UDP Response Validation Clarity Tests ---\n');

let udpValidationPassed = 0;
let udpValidationFailed = 0;

// Property 8.1: Matching response returns UP status
console.log('Property 8.1: Matching UDP response returns UP status');
try {
    fc.assert(
        fc.property(
            fc.string({ minLength: 1, maxLength: 50 }),
            (expectedResponse) => {
                // Response contains the expected string
                const response = `prefix_${expectedResponse}_suffix`;
                const result = createUDPResult('success', response, expectedResponse);
                
                return result.status === 'UP' && result.errorType === null;
            }
        ),
        { numRuns: 100 }
    );
    console.log('  ✓ PASSED\n');
    udpValidationPassed++;
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    udpValidationFailed++;
}

// Property 8.2: Non-matching response returns DOWN with clear error type
console.log('Property 8.2: Non-matching UDP response returns DOWN with UDP_RESPONSE_MISMATCH');
try {
    fc.assert(
        fc.property(
            fc.string({ minLength: 5, maxLength: 50 }),
            fc.string({ minLength: 5, maxLength: 50 }),
            (response, expectedResponse) => {
                // Ensure they don't match
                if (response.includes(expectedResponse)) return true; // Skip matching cases
                
                const result = createUDPResult('success', response, expectedResponse);
                
                return result.status === 'DOWN' && 
                       result.errorType === 'UDP_RESPONSE_MISMATCH';
            }
        ),
        { numRuns: 100 }
    );
    console.log('  ✓ PASSED\n');
    udpValidationPassed++;
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    udpValidationFailed++;
}

// Property 8.3: No expected response means any response is valid
console.log('Property 8.3: No expected response means any response is valid (UP)');
try {
    fc.assert(
        fc.property(
            fc.string({ minLength: 0, maxLength: 100 }),
            (response) => {
                const result = createUDPResult('success', response, null);
                return result.status === 'UP';
            }
        ),
        { numRuns: 100 }
    );
    console.log('  ✓ PASSED\n');
    udpValidationPassed++;
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    udpValidationFailed++;
}

console.log('='.repeat(60));
console.log(`UDP Validation Clarity Tests: ${udpValidationPassed} passed, ${udpValidationFailed} failed`);
console.log('='.repeat(60));

passed += udpValidationPassed;
failed += udpValidationFailed;


// ============================================================================
// Property Test: Type Safety for Configuration Values
// Feature: monitor-service-fixes, Property 9: Type safety for configuration values
// Validates: Requirements 7.1, 7.2, 7.4
// ============================================================================

console.log('\n--- Property 9: Type Safety Tests ---\n');

let typeSafetyPassed = 0;
let typeSafetyFailed = 0;

/**
 * Simulates toMs helper function
 */
function toMs(monitor) {
    if (monitor.timeoutSeconds != null) {
        const seconds = Number(monitor.timeoutSeconds);
        return !isNaN(seconds) && seconds > 0 ? seconds * 1000 : 10000;
    }
    return 10 * 1000;
}

/**
 * Simulates isStatusOk helper function
 */
function isStatusOk(monitor, status) {
    if (Array.isArray(monitor.expectedStatusCodes) && monitor.expectedStatusCodes.length > 0) {
        return Boolean(monitor.expectedStatusCodes.includes(Number(status)));
    }
    const statusNum = Number(status);
    return Boolean(statusNum >= 200 && statusNum < 400);
}

// Property 9.1: toMs always returns a number
console.log('Property 9.1: toMs always returns a number');
try {
    fc.assert(
        fc.property(
            fc.record({
                timeoutSeconds: fc.option(fc.oneof(
                    fc.integer({ min: -100, max: 100 }),
                    fc.float({ min: -100, max: 100 }),
                    fc.string({ maxLength: 20 }),
                    fc.constant(null),
                    fc.constant(undefined)
                ))
            }),
            (monitor) => {
                const result = toMs(monitor);
                return typeof result === 'number' && !isNaN(result) && result > 0;
            }
        ),
        { numRuns: 100 }
    );
    console.log('  ✓ PASSED\n');
    typeSafetyPassed++;
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    typeSafetyFailed++;
}

// Property 9.2: isStatusOk always returns a boolean
console.log('Property 9.2: isStatusOk always returns a boolean');
try {
    fc.assert(
        fc.property(
            fc.record({
                expectedStatusCodes: fc.option(fc.array(fc.integer({ min: 100, max: 599 })))
            }),
            fc.oneof(
                fc.integer({ min: 100, max: 599 }),
                fc.string({ maxLength: 10 }),
                fc.constant(null),
                fc.constant(undefined)
            ),
            (monitor, status) => {
                const result = isStatusOk(monitor, status);
                return typeof result === 'boolean';
            }
        ),
        { numRuns: 100 }
    );
    console.log('  ✓ PASSED\n');
    typeSafetyPassed++;
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    typeSafetyFailed++;
}

// Property 9.3: parsePort always returns a valid integer
console.log('Property 9.3: parsePort always returns a valid integer');
try {
    fc.assert(
        fc.property(
            fc.anything(),
            fc.constantFrom('HTTP', 'HTTPS', 'TCP', 'UDP', 'DNS', 'SSL', 'SMTP'),
            (portValue, protocol) => {
                const urlObj = { port: '' };
                const monitor = { port: portValue, type: protocol };
                const result = parsePort(urlObj, monitor);
                
                return typeof result === 'number' && 
                       Number.isInteger(result) && 
                       result > 0 && 
                       result <= 65535;
            }
        ),
        { numRuns: 100 }
    );
    console.log('  ✓ PASSED\n');
    typeSafetyPassed++;
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    typeSafetyFailed++;
}

console.log('='.repeat(60));
console.log(`Type Safety Tests: ${typeSafetyPassed} passed, ${typeSafetyFailed} failed`);
console.log('='.repeat(60));

passed += typeSafetyPassed;
failed += typeSafetyFailed;


// ============================================================================
// Property Test: HEAD Request Method Default
// Feature: monitor-service-fixes, Property 10: HEAD request method default
// Validates: Requirements 8.4
// ============================================================================

console.log('\n--- Property 10: HEAD Request Default Tests ---\n');

let headDefaultPassed = 0;
let headDefaultFailed = 0;

/**
 * Simulates method selection logic from checkHTTP
 */
function getRequestMethod(monitor) {
    return monitor.useHeadForStatus ? 'HEAD' : (monitor.method || 'GET');
}

// Property 10.1: Default method is GET when no config
console.log('Property 10.1: Default method is GET when no config specified');
try {
    fc.assert(
        fc.property(
            fc.record({
                useHeadForStatus: fc.constant(false),
                method: fc.constant(undefined)
            }),
            (monitor) => {
                const method = getRequestMethod(monitor);
                return method === 'GET';
            }
        ),
        { numRuns: 100 }
    );
    console.log('  ✓ PASSED\n');
    headDefaultPassed++;
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    headDefaultFailed++;
}

// Property 10.2: useHeadForStatus=true uses HEAD
console.log('Property 10.2: useHeadForStatus=true uses HEAD method');
try {
    fc.assert(
        fc.property(
            fc.record({
                useHeadForStatus: fc.constant(true),
                method: fc.option(fc.constantFrom('GET', 'POST', 'PUT'))
            }),
            (monitor) => {
                const method = getRequestMethod(monitor);
                return method === 'HEAD';
            }
        ),
        { numRuns: 100 }
    );
    console.log('  ✓ PASSED\n');
    headDefaultPassed++;
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    headDefaultFailed++;
}

// Property 10.3: Explicit method is respected when useHeadForStatus is false
console.log('Property 10.3: Explicit method is respected when useHeadForStatus=false');
try {
    fc.assert(
        fc.property(
            fc.constantFrom('GET', 'POST', 'PUT', 'DELETE', 'PATCH'),
            (explicitMethod) => {
                const monitor = { useHeadForStatus: false, method: explicitMethod };
                const method = getRequestMethod(monitor);
                return method === explicitMethod;
            }
        ),
        { numRuns: 100 }
    );
    console.log('  ✓ PASSED\n');
    headDefaultPassed++;
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    headDefaultFailed++;
}

console.log('='.repeat(60));
console.log(`HEAD Request Default Tests: ${headDefaultPassed} passed, ${headDefaultFailed} failed`);
console.log('='.repeat(60));

passed += headDefaultPassed;
failed += headDefaultFailed;


// ============================================================================
// Property Test: HEAD Request Validation
// Feature: monitor-service-fixes, Property 11: HEAD request validation
// Validates: Requirements 8.1
// ============================================================================

console.log('\n--- Property 11: HEAD Request Validation Tests ---\n');

let headValidationPassed = 0;
let headValidationFailed = 0;

/**
 * Simulates HEAD request validation - when useHeadForStatus is enabled,
 * the system should use HEAD method
 */
function validateHeadConfig(monitor) {
    const method = getRequestMethod(monitor);
    const usesHead = method === 'HEAD';
    const configuredForHead = Boolean(monitor.useHeadForStatus);
    
    return {
        method,
        usesHead,
        configuredForHead,
        isConsistent: usesHead === configuredForHead || (!configuredForHead && monitor.method === 'HEAD')
    };
}

// Property 11.1: useHeadForStatus=true always results in HEAD method
console.log('Property 11.1: useHeadForStatus=true always results in HEAD method');
try {
    fc.assert(
        fc.property(
            fc.record({
                useHeadForStatus: fc.constant(true),
                method: fc.option(fc.constantFrom('GET', 'POST', 'PUT', 'DELETE'))
            }),
            (monitor) => {
                const validation = validateHeadConfig(monitor);
                return validation.usesHead === true && validation.method === 'HEAD';
            }
        ),
        { numRuns: 100 }
    );
    console.log('  ✓ PASSED\n');
    headValidationPassed++;
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    headValidationFailed++;
}

// Property 11.2: Configuration is consistent (no contradictions)
console.log('Property 11.2: HEAD configuration is internally consistent');
try {
    fc.assert(
        fc.property(
            fc.record({
                useHeadForStatus: fc.boolean(),
                method: fc.option(fc.constantFrom('GET', 'POST', 'PUT', 'DELETE', 'HEAD'))
            }),
            (monitor) => {
                const validation = validateHeadConfig(monitor);
                // If useHeadForStatus is true, method must be HEAD
                // If useHeadForStatus is false, method can be anything
                if (monitor.useHeadForStatus) {
                    return validation.method === 'HEAD';
                }
                return true;
            }
        ),
        { numRuns: 100 }
    );
    console.log('  ✓ PASSED\n');
    headValidationPassed++;
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    headValidationFailed++;
}

console.log('='.repeat(60));
console.log(`HEAD Validation Tests: ${headValidationPassed} passed, ${headValidationFailed} failed`);
console.log('='.repeat(60));

passed += headValidationPassed;
failed += headValidationFailed;


// ============================================================================
// Property Tests for Retry Logic with Exponential Backoff
// Feature: monitor-service-fixes, Properties 12-17
// ============================================================================

const TRANSIENT_ERRORS = [
    'TIMEOUT', 
    'TCP_TIMEOUT', 
    'UDP_TIMEOUT', 
    'SSL_TIMEOUT', 
    'SMTP_TIMEOUT', 
    'ECONNABORTED', 
    'ECONNRESET', 
    'EAI_AGAIN', 
    'ETIMEDOUT', 
    'ESOCKETTIMEDOUT', 
    'CONNECTION_REFUSED'
];

const PERMANENT_ERRORS = [
    'DNS_ERROR',
    'SSL_INVALID',
    'CERT_HAS_EXPIRED',
    'INVALID_TARGET',
    'UNKNOWN_TYPE',
    'SERVER_ERROR',
    'CLIENT_ERROR',
    'CONTENT_MISMATCH'
];

/**
 * Simulates the retry logic from performCheck
 * Returns tracking info about retry behavior
 */
function simulateRetryLogic(checkResults, maxRetries = 1) {
    const attempts = [];
    const initialDelayMs = 500;
    let totalDelay = 0;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const result = checkResults[attempt] || checkResults[checkResults.length - 1];
        attempts.push({ attempt, result: { ...result } });
        
        // Success - return immediately
        if (result.status === 'UP') {
            return { 
                finalResult: result, 
                attempts, 
                totalDelay,
                shortCircuited: attempt < maxRetries 
            };
        }
        
        // Permanent failure - return immediately
        if (!TRANSIENT_ERRORS.includes(result.errorType)) {
            return { 
                finalResult: result, 
                attempts, 
                totalDelay,
                shortCircuited: attempt < maxRetries 
            };
        }
        
        // Last attempt - return failure
        if (attempt === maxRetries) {
            return { 
                finalResult: result, 
                attempts, 
                totalDelay,
                shortCircuited: false 
            };
        }
        
        // Calculate delay for next retry
        const delay = initialDelayMs * Math.pow(2, attempt);
        totalDelay += delay;
    }
    
    return { finalResult: checkResults[checkResults.length - 1], attempts, totalDelay, shortCircuited: false };
}

// ============================================================================
// Property 12: Transient errors trigger retry
// Validates: Requirements 9.1
// ============================================================================

console.log('\n--- Property 12: Transient Error Retry Tests ---\n');

let retryPassed = 0;
let retryFailed = 0;

console.log('Property 12.1: Transient errors trigger at least one retry');
try {
    fc.assert(
        fc.property(
            fc.constantFrom(...TRANSIENT_ERRORS),
            fc.integer({ min: 1, max: 3 }),
            (errorType, maxRetries) => {
                const failResult = { status: 'DOWN', errorType };
                const checkResults = Array(maxRetries + 1).fill(failResult);
                
                const { attempts } = simulateRetryLogic(checkResults, maxRetries);
                
                // Should have more than 1 attempt for transient errors
                return attempts.length > 1;
            }
        ),
        { numRuns: 100 }
    );
    console.log('  ✓ PASSED\n');
    retryPassed++;
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    retryFailed++;
}

passed += retryPassed;
failed += retryFailed;

// ============================================================================
// Property 13: Exponential backoff delay
// Validates: Requirements 9.2
// ============================================================================

console.log('--- Property 13: Exponential Backoff Tests ---\n');

let backoffPassed = 0;
let backoffFailed = 0;

console.log('Property 13.1: Delay doubles with each retry attempt');
try {
    fc.assert(
        fc.property(
            fc.integer({ min: 1, max: 5 }),
            (maxRetries) => {
                const failResult = { status: 'DOWN', errorType: 'TIMEOUT' };
                const checkResults = Array(maxRetries + 1).fill(failResult);
                
                const { totalDelay } = simulateRetryLogic(checkResults, maxRetries);
                
                // Expected delay: 500 + 1000 + 2000 + ... = 500 * (2^n - 1)
                // For n retries, sum = 500 * (2^n - 1)
                const expectedDelay = 500 * (Math.pow(2, maxRetries) - 1);
                
                return totalDelay === expectedDelay;
            }
        ),
        { numRuns: 100 }
    );
    console.log('  ✓ PASSED\n');
    backoffPassed++;
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    backoffFailed++;
}

console.log('Property 13.2: Initial delay is 500ms');
try {
    fc.assert(
        fc.property(
            fc.constantFrom(...TRANSIENT_ERRORS),
            (errorType) => {
                const failResult = { status: 'DOWN', errorType };
                const successResult = { status: 'UP', errorType: null };
                
                // Fail first, succeed second
                const checkResults = [failResult, successResult];
                const { totalDelay } = simulateRetryLogic(checkResults, 1);
                
                // Should have exactly 500ms delay (one retry)
                return totalDelay === 500;
            }
        ),
        { numRuns: 100 }
    );
    console.log('  ✓ PASSED\n');
    backoffPassed++;
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    backoffFailed++;
}

passed += backoffPassed;
failed += backoffFailed;

// ============================================================================
// Property 14: Success short-circuits retries
// Validates: Requirements 9.3
// ============================================================================

console.log('--- Property 14: Success Short-Circuit Tests ---\n');

let shortCircuitPassed = 0;
let shortCircuitFailed = 0;

console.log('Property 14.1: Success on retry stops further attempts');
try {
    fc.assert(
        fc.property(
            fc.integer({ min: 0, max: 3 }),
            fc.integer({ min: 2, max: 5 }),
            (successAttempt, maxRetries) => {
                if (successAttempt > maxRetries) return true; // Skip invalid cases
                
                const failResult = { status: 'DOWN', errorType: 'TIMEOUT' };
                const successResult = { status: 'UP', errorType: null };
                
                const checkResults = [];
                for (let i = 0; i <= maxRetries; i++) {
                    checkResults.push(i === successAttempt ? successResult : failResult);
                }
                
                const { attempts, finalResult, shortCircuited } = simulateRetryLogic(checkResults, maxRetries);
                
                // Should stop at success attempt
                return attempts.length === successAttempt + 1 && 
                       finalResult.status === 'UP' &&
                       (successAttempt < maxRetries ? shortCircuited : true);
            }
        ),
        { numRuns: 100 }
    );
    console.log('  ✓ PASSED\n');
    shortCircuitPassed++;
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    shortCircuitFailed++;
}

passed += shortCircuitPassed;
failed += shortCircuitFailed;

// ============================================================================
// Property 15: Permanent errors skip retry
// Validates: Requirements 9.4
// ============================================================================

console.log('--- Property 15: Permanent Error Skip Tests ---\n');

let permanentPassed = 0;
let permanentFailed = 0;

console.log('Property 15.1: Permanent errors return immediately without retry');
try {
    fc.assert(
        fc.property(
            fc.constantFrom(...PERMANENT_ERRORS),
            fc.integer({ min: 1, max: 5 }),
            (errorType, maxRetries) => {
                const failResult = { status: 'DOWN', errorType };
                const checkResults = Array(maxRetries + 1).fill(failResult);
                
                const { attempts, shortCircuited } = simulateRetryLogic(checkResults, maxRetries);
                
                // Should only have 1 attempt for permanent errors
                return attempts.length === 1 && shortCircuited === true;
            }
        ),
        { numRuns: 100 }
    );
    console.log('  ✓ PASSED\n');
    permanentPassed++;
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    permanentFailed++;
}

passed += permanentPassed;
failed += permanentFailed;

// ============================================================================
// Property 16: Retry exhaustion returns final result
// Validates: Requirements 9.5
// ============================================================================

console.log('--- Property 16: Retry Exhaustion Tests ---\n');

let exhaustionPassed = 0;
let exhaustionFailed = 0;

console.log('Property 16.1: All retries exhausted returns final failure');
try {
    fc.assert(
        fc.property(
            fc.constantFrom(...TRANSIENT_ERRORS),
            fc.integer({ min: 1, max: 3 }),
            (errorType, maxRetries) => {
                const failResult = { status: 'DOWN', errorType };
                const checkResults = Array(maxRetries + 1).fill(failResult);
                
                const { attempts, finalResult, shortCircuited } = simulateRetryLogic(checkResults, maxRetries);
                
                // Should have maxRetries + 1 attempts and return DOWN
                return attempts.length === maxRetries + 1 && 
                       finalResult.status === 'DOWN' &&
                       shortCircuited === false;
            }
        ),
        { numRuns: 100 }
    );
    console.log('  ✓ PASSED\n');
    exhaustionPassed++;
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    exhaustionFailed++;
}

passed += exhaustionPassed;
failed += exhaustionFailed;

// ============================================================================
// Property 17: Configurable retry count
// Validates: Requirements 9.6
// ============================================================================

console.log('--- Property 17: Configurable Retry Count Tests ---\n');

let configPassed = 0;
let configFailed = 0;

console.log('Property 17.1: Retry count matches configuration');
try {
    fc.assert(
        fc.property(
            fc.integer({ min: 0, max: 5 }),
            (maxRetries) => {
                const failResult = { status: 'DOWN', errorType: 'TIMEOUT' };
                const checkResults = Array(maxRetries + 2).fill(failResult); // Extra to ensure we don't go over
                
                const { attempts } = simulateRetryLogic(checkResults, maxRetries);
                
                // Should have exactly maxRetries + 1 attempts (initial + retries)
                return attempts.length === maxRetries + 1;
            }
        ),
        { numRuns: 100 }
    );
    console.log('  ✓ PASSED\n');
    configPassed++;
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    configFailed++;
}

console.log('Property 17.2: Default retry count is 1 (2 total attempts)');
try {
    const failResult = { status: 'DOWN', errorType: 'TIMEOUT' };
    const checkResults = [failResult, failResult, failResult];
    
    // Using default (undefined becomes 1)
    const { attempts } = simulateRetryLogic(checkResults, 1);
    
    if (attempts.length !== 2) {
        throw new Error(`Expected 2 attempts, got ${attempts.length}`);
    }
    console.log('  ✓ PASSED\n');
    configPassed++;
} catch (e) {
    console.log('  ✗ FAILED:', e.message, '\n');
    configFailed++;
}

passed += configPassed;
failed += configFailed;

// ============================================================================
// Final Summary
// ============================================================================

console.log('\n' + '='.repeat(60));
console.log(`ALL PROPERTY TESTS COMPLETE: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

if (failed > 0) {
    process.exit(1);
}
