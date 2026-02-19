/**
 * Unit Tests for Monitor Service Edge Cases
 * 
 * Run with: node backend/src/services/monitor.service.unit.test.js
 */

// Re-implement helper functions for testing
const PROTOCOL_DEFAULTS = {
    'HTTP': 80, 
    'HTTPS': 443, 
    'TCP': 80, 
    'UDP': 53,
    'DNS': 53, 
    'SSL': 443, 
    'SMTP': 25
};

function parsePort(urlObj, monitor) {
    const type = (monitor.type || 'HTTP').toUpperCase();
    const defaultPort = PROTOCOL_DEFAULTS[type] || 80;
    
    let portValue = monitor.port ?? urlObj.port;
    
    if (portValue == null || portValue === '') {
        return defaultPort;
    }
    
    if (typeof portValue !== 'string' && typeof portValue !== 'number') {
        return defaultPort;
    }
    
    const port = parseInt(String(portValue), 10);
    
    if (!Number.isNaN(port) && Number.isInteger(port) && port > 0 && port <= 65535) {
        return port;
    }
    
    return defaultPort;
}

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

function getRequestMethod(monitor) {
    return monitor.useHeadForStatus ? 'HEAD' : (monitor.method || 'GET');
}

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
    }
    return base;
}

// Simple test runner
let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  ✓ ${name}`);
        passed++;
    } catch (e) {
        console.log(`  ✗ ${name}`);
        console.log(`    Error: ${e.message}`);
        failed++;
    }
}

function assertEqual(actual, expected, msg = '') {
    if (actual !== expected) {
        throw new Error(`${msg} Expected ${expected}, got ${actual}`);
    }
}

function assertTrue(condition, msg = '') {
    if (!condition) {
        throw new Error(msg || 'Expected true');
    }
}

console.log('Running Unit Tests for Monitor Service Edge Cases...\n');

// ============================================================================
// SSL Certificate Edge Cases
// Requirements: 3.1, 3.2
// ============================================================================
console.log('--- SSL Certificate Edge Cases ---');

test('SSL expired certificate returns DOWN', () => {
    const result = determineSSLStatus({ valid: true, daysRemaining: 0 });
    assertEqual(result.status, 'DOWN');
    assertEqual(result.errorType, 'CERT_HAS_EXPIRED');
});

test('SSL certificate expired yesterday returns DOWN', () => {
    const result = determineSSLStatus({ valid: true, daysRemaining: -1 });
    assertEqual(result.status, 'DOWN');
    assertEqual(result.errorType, 'CERT_HAS_EXPIRED');
});

test('SSL certificate expiring in 3 days returns UP with warning', () => {
    const result = determineSSLStatus({ valid: true, daysRemaining: 3 });
    assertEqual(result.status, 'UP');
    assertEqual(result.errorType, null);
    assertTrue(result.warning !== null, 'Should have warning');
    assertTrue(result.warning.includes('3'), 'Warning should mention days');
});

test('SSL certificate expiring in 7 days (boundary) returns UP with warning', () => {
    const result = determineSSLStatus({ valid: true, daysRemaining: 7 });
    assertEqual(result.status, 'UP');
    assertTrue(result.warning !== null, 'Should have warning at boundary');
});

test('SSL certificate expiring in 8 days returns UP without warning', () => {
    const result = determineSSLStatus({ valid: true, daysRemaining: 8 });
    assertEqual(result.status, 'UP');
    assertEqual(result.warning, null);
});

test('SSL invalid certificate returns DOWN regardless of days', () => {
    const result = determineSSLStatus({ valid: false, daysRemaining: 100 });
    assertEqual(result.status, 'DOWN');
    assertEqual(result.errorType, 'SSL_INVALID');
});

// ============================================================================
// Port Parsing Edge Cases
// Requirements: 5.2
// ============================================================================
console.log('\n--- Port Parsing Edge Cases ---');

test('Empty string port uses protocol default', () => {
    const result = parsePort({ port: '' }, { port: '', type: 'HTTP' });
    assertEqual(result, 80);
});

test('Empty string port for HTTPS uses 443', () => {
    const result = parsePort({ port: '' }, { port: '', type: 'HTTPS' });
    assertEqual(result, 443);
});

test('Null port uses protocol default', () => {
    const result = parsePort({ port: '' }, { port: null, type: 'SSL' });
    assertEqual(result, 443);
});

test('Undefined port uses protocol default', () => {
    const result = parsePort({ port: '' }, { type: 'SMTP' });
    assertEqual(result, 25);
});

test('Port 0 uses protocol default', () => {
    const result = parsePort({ port: '' }, { port: 0, type: 'TCP' });
    assertEqual(result, 80);
});

test('Negative port uses protocol default', () => {
    const result = parsePort({ port: '' }, { port: -1, type: 'UDP' });
    assertEqual(result, 53);
});

test('Port above 65535 uses protocol default', () => {
    const result = parsePort({ port: '' }, { port: 70000, type: 'HTTP' });
    assertEqual(result, 80);
});

test('Valid port string is parsed correctly', () => {
    const result = parsePort({ port: '' }, { port: '8080', type: 'HTTP' });
    assertEqual(result, 8080);
});

test('Valid port number is used directly', () => {
    const result = parsePort({ port: '' }, { port: 3000, type: 'HTTP' });
    assertEqual(result, 3000);
});

// ============================================================================
// HEAD Request Edge Cases
// Requirements: 8.2
// ============================================================================
console.log('\n--- HEAD Request Edge Cases ---');

test('No method config defaults to GET', () => {
    const method = getRequestMethod({});
    assertEqual(method, 'GET');
});

test('useHeadForStatus=true uses HEAD', () => {
    const method = getRequestMethod({ useHeadForStatus: true });
    assertEqual(method, 'HEAD');
});

test('useHeadForStatus=true overrides explicit method', () => {
    const method = getRequestMethod({ useHeadForStatus: true, method: 'POST' });
    assertEqual(method, 'HEAD');
});

test('useHeadForStatus=false respects explicit method', () => {
    const method = getRequestMethod({ useHeadForStatus: false, method: 'POST' });
    assertEqual(method, 'POST');
});

// ============================================================================
// UDP Timeout Edge Cases
// Requirements: 6.1
// ============================================================================
console.log('\n--- UDP Timeout Edge Cases ---');

test('UDP timeout includes connectionless warning', () => {
    const result = createUDPResult('timeout');
    assertEqual(result.status, 'DOWN');
    assertEqual(result.errorType, 'UDP_TIMEOUT');
    assertTrue(result.warning !== null, 'Should have warning');
    assertTrue(result.warning.includes('connectionless'), 'Warning should mention connectionless');
});

test('UDP timeout includes reliability metadata', () => {
    const result = createUDPResult('timeout');
    assertTrue(result.meta !== null, 'Should have meta');
    assertEqual(result.meta.reliability, 'best-effort');
});

// ============================================================================
// DNS Result Format Edge Cases
// ============================================================================
console.log('\n--- DNS Result Format Edge Cases ---');

function parseDnsResult(r) {
    const address = typeof r === 'object' ? r.address : r;
    const family = typeof r === 'object' ? r.family : undefined;
    return { address, family };
}

test('DNS object format extracts address correctly', () => {
    const result = parseDnsResult({ address: '192.168.1.1', family: 4 });
    assertEqual(result.address, '192.168.1.1');
    assertEqual(result.family, 4);
});

test('DNS string format (legacy) works', () => {
    const result = parseDnsResult('10.0.0.1');
    assertEqual(result.address, '10.0.0.1');
    assertEqual(result.family, undefined);
});

test('DNS IPv6 object format works', () => {
    const result = parseDnsResult({ address: '::1', family: 6 });
    assertEqual(result.address, '::1');
    assertEqual(result.family, 6);
});

// ============================================================================
// Summary
// ============================================================================
console.log('\n' + '='.repeat(60));
console.log(`Unit Tests Complete: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

if (failed > 0) {
    process.exit(1);
}
