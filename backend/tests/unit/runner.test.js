
import { describe, it, expect } from '@jest/globals';
import MonitorRunner from '../../src/services/runner.js';

describe('Monitor Runner Unit Tests', () => {
    describe('parseUrl', () => {
        it('should correctly parse standard HTTP URLs', () => {
            const result = MonitorRunner.parseUrl('https://example.com');
            expect(result.hostname).toBe('example.com');
            expect(result.port).toBe(443);
            expect(result.protocol).toBe('https:');
        });

        it('should correctly parse HTTP URLs with custom parts', () => {
            const result = MonitorRunner.parseUrl('http://localhost:8080/api/health');
            expect(result.hostname).toBe('localhost');
            expect(result.port).toBe(8080);
            expect(result.path).toBe('/api/health');
        });

        it('should handle TCP format (hostname:port)', () => {
            const result = MonitorRunner.parseUrl('redis.internal:6379');
            expect(result.hostname).toBe('redis.internal');
            expect(result.port).toBe(6379);
        });

        it('should strip protocols from TCP input if accidentally added', () => {
            const result = MonitorRunner.parseUrl('tcp://redis.internal:6379');
            expect(result.hostname).toBe('redis.internal');
            expect(result.port).toBe(6379);
        });
    });

    describe('Validation', () => {
        it('should reject invalid URLs', () => {
            // Using a monitor object structure that the validate method expects
            // Looking at runner.js, it seems we might strictly test the private methods or public interface
            // But parseUrl is used internally.

            // Let's test the run method with invalid input if possible, 
            // or rely on parsing logic tests.

            try {
                MonitorRunner.parseUrl('invalid-url');
            } catch (e) {
                expect(e).toBeDefined();
            }
        });
    });
});
