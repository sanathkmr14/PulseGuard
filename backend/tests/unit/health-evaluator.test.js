
import { describe, it, expect, beforeEach } from '@jest/globals';
import healthStateService from '../../src/services/health-evaluator.service.js';

describe('Health Evaluator Unit Tests', () => {
    let monitor;
    let stateHistory;

    beforeEach(() => {
        // Reset state for validation
        monitor = {
            _id: 'test-monitor-123',
            name: 'Test Monitor',
            type: 'http',
            alertThreshold: 2
        };
        stateHistory = {
            currentState: 'up',
            lastStateChange: Date.now() - 60000, // 1 min ago
            consecutiveCount: 0
        };
    });

    describe('determineStateWithHysteresis', () => {
        it('should maintain UP state for single failure (hysteresis)', () => {
            const currentCheck = {
                severity: 1, // Complete failure
                status: 'down',
                issues: ['Connection refused']
            };

            // Previous state UP, consecutive failures: 0
            // Should stay UP or go to DEGRADED, but NOT DOWN yet if threshold > 1
            const result = healthStateService.determineStateWithHysteresis(
                currentCheck,
                {}, // Pass empty baseline
                [],
                stateHistory,
                monitor
            );

            expect(result.status).not.toBe('down');
            expect(result.status).toBe('degraded'); // Expecting warning state first
            // The service returns valid transition message
            expect(result.transition.reason).toContain('Hysteresis: Valid state transition');
        });

        it('should switch to DOWN after threshold reached', () => {
            const currentCheck = {
                severity: 1,
                status: 'down',
                issues: ['Connection refused']
            };

            // Simulate 1 previous failure
            stateHistory.consecutiveCount = 1;
            // Monitor threshold is 2, so this (2nd) failure should trigger DOWN

            const result = healthStateService.determineStateWithHysteresis(
                currentCheck,
                {}, // Pass empty baseline
                [],
                stateHistory,
                monitor
            );

            expect(result.status).toBe('down');
            expect(result.reasons[0]).toBe('Connection refused');
        });

        it('should treat SSL warning as UP (with warning)', () => {
            const currentCheck = {
                healthStateSuggestion: 'up',
                isSlowWarning: false,
                severity: 0.3, // Low severity
                issues: [],
                originalStatus: 'up' // Worker says up
            };

            const result = healthStateService.determineStateWithHysteresis(
                currentCheck,
                {}, // Pass empty baseline
                [],
                stateHistory,
                monitor
            );

            expect(result.status).toBe('up');
        });
    });

    describe('analyzeCheckWindow', () => {
        it('should detect flapping pattern', () => {
            const recentChecks = [
                { status: 'up' },
                { status: 'down' },
                { status: 'up' },
                { status: 'down' }
            ];

            const analysis = healthStateService.analyzeCheckWindow(recentChecks);
            expect(analysis.pattern).toBe('flapping');
        });

        it('should detect consistent down pattern', () => {
            const recentChecks = [
                { status: 'down' },
                { status: 'down' },
                { status: 'down' }
            ];

            const analysis = healthStateService.analyzeCheckWindow(recentChecks);
            expect(analysis.pattern).toBe('consistently_down');
        });
    });
});
