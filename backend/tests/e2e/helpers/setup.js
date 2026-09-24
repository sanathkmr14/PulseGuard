import dns from 'dns';
import child_process from 'child_process';
import { promisify } from 'util';

// Initialize globalThis.monitor to prevent ReferenceError: monitor is not defined
// when http.worker.js:54 accesses monitor.headers inside makeSingleRequest
globalThis.monitor = {};

// Register promisify.custom hooks for DNS so resolve4 / resolve6 execute in-process
dns.resolve4[promisify.custom] = (hostname) => {
    if (hostname.includes('nxdomain') || hostname.includes('unresolvable') || hostname.includes('invalid')) {
        const err = new Error(`queryA ENOTFOUND ${hostname}`);
        err.code = 'ENOTFOUND';
        return Promise.reject(err);
    }
    return Promise.resolve(['127.0.0.1']);
};

dns.resolve6[promisify.custom] = (hostname) => {
    if (hostname.includes('nxdomain') || hostname.includes('unresolvable') || hostname.includes('invalid')) {
        const err = new Error(`queryAaaa ENOTFOUND ${hostname}`);
        err.code = 'ENOTFOUND';
        return Promise.reject(err);
    }
    return Promise.resolve(['::1']);
};

// Register mock child_process.execFile so ping worker operates in sandbox
const originalExecFile = child_process.execFile;
function mockExecFile(file, args, options, callback) {
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }
    return originalExecFile(file, args, options, callback);
}

mockExecFile[promisify.custom] = (file, args) => {
    const target = args[args.length - 1];
    if (target === '192.0.2.1' || String(target).includes('unreachable') || String(target).includes('invalid')) {
        const unreachableOutput = `
PING ${target} (${target}): 56 data bytes

--- ${target} ping statistics ---
2 packets transmitted, 0 packets received, 100.0% packet loss
`;
        const err = new Error('Command failed: ping');
        err.code = 2;
        err.stdout = unreachableOutput;
        return Promise.reject(err);
    }

    const successOutput = `
PING ${target} (${target}): 56 data bytes
64 bytes from ${target}: icmp_seq=0 ttl=64 time=1.234 ms
64 bytes from ${target}: icmp_seq=1 ttl=64 time=1.456 ms

--- ${target} ping statistics ---
2 packets transmitted, 2 packets received, 0.0% packet loss
round-trip min/avg/max/stddev = 1.234/1.345/1.456/0.111 ms
`;
    return Promise.resolve({ stdout: successOutput, stderr: '' });
};

child_process.execFile = mockExecFile;
