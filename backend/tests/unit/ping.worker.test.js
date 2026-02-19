
// Mock child_process before importing the worker
import { jest } from '@jest/globals';

const mockExec = jest.fn();
jest.unstable_mockModule('child_process', () => ({
    exec: mockExec
}));

jest.unstable_mockModule('util', () => ({
    promisify: (fn) => {
        return (...args) => {
            return new Promise((resolve, reject) => {
                fn(...args, (err, stdout, stderr) => {
                    if (err) reject(err);
                    else resolve({ stdout, stderr });
                });
            });
        };
    }
}));

// Dynamic import to apply mocks
const { checkPing } = await import('../../src/workers/ping.worker.js');

describe('PING Worker Unit Tests', () => {
    let mockMonitor;
    let mockResult;
    let mockOptions;

    beforeEach(() => {
        jest.clearAllMocks();
        mockMonitor = {
            url: '8.8.8.8',
            timeout: 5000,
            degradedThresholdMs: 200
        };
        mockResult = {
            reset: jest.fn()
        };
        mockOptions = {
            detectErrorType: jest.fn(),
            formatErrorMessage: jest.fn(),
            determineHealthStateFromError: jest.fn().mockImplementation((type) => {
                return { healthState: 'DOWN', errorType: type };
            }),
            parseUrl: jest.fn().mockReturnValue({ hostname: '8.8.8.8' })
        };
    });

    it('should correctly parse RTT from Mac/Linux ping output', async () => {
        // Arrange
        const pingOutput = `
PING 8.8.8.8 (8.8.8.8): 56 data bytes
64 bytes from 8.8.8.8: icmp_seq=0 ttl=118 time=20.062 ms
64 bytes from 8.8.8.8: icmp_seq=1 ttl=118 time=21.100 ms

--- 8.8.8.8 ping statistics ---
2 packets transmitted, 2 packets received, 0.0% packet loss
round-trip min/avg/max/stddev = 20.062/20.581/21.100/0.519 ms
`;
        mockExec.mockImplementation((cmd, options, cb) => {
            if (typeof options === 'function') {
                cb = options;
            }
            cb(null, pingOutput, '');
        });

        // Act
        await checkPing(mockMonitor, mockResult, mockOptions);

        // Assert
        expect(mockResult.responseTime).toBe(20.581); // Should use avg
        expect(mockResult.healthState).toBe('UP');
        expect(mockResult.packetLoss).toBe(0);
    });

    it('should correctly handle 100% packet loss', async () => {
        // Arrange
        const pingOutput = `
PING 8.8.8.8 (8.8.8.8): 56 data bytes

--- 8.8.8.8 ping statistics ---
2 packets transmitted, 0 packets received, 100.0% packet loss
`;
        // When ping fails (non-zero exit), exec returns error
        mockExec.mockImplementation((cmd, options, cb) => {
            if (typeof options === 'function') {
                cb = options;
            }
            cb(new Error('Command failed'), pingOutput, '');
        });

        // Act
        try {
            await checkPing(mockMonitor, mockResult, mockOptions);
        } catch (e) {
            // Expected to throw or reject based on worker implementation
        }

        // Assert
        expect(mockResult.packetLoss).toBe(100);
        expect(mockResult.healthState).toBe('DOWN');
    });
});
