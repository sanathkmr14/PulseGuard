import { jest } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../src/server.js';
import schedulerService from '../../src/services/scheduler.service.js';

// Mock scheduler service
jest.mock('../../src/services/scheduler.service.js', () => ({
    isMaster: true,
    isReady: true,
    setIO: jest.fn(),
    initialize: jest.fn(),
    shutdown: jest.fn()
}));

// Mock mongoose
jest.mock('mongoose', () => {
    const original = jest.requireActual('mongoose');
    return {
        ...original,
        connect: jest.fn(),
        connection: {
            readyState: 1 // Connected
        }
    };
});

describe('Health Check Endpoint Diagnostics', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Reset defaults
        mongoose.connection.readyState = 1;
        schedulerService.isMaster = true;
        schedulerService.isReady = true;
    });

    it('should return 200 UP when DB and Scheduler are healthy', async () => {
        const response = await request(app).get('/health');

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('UP');
        expect(response.body.services.database.healthy).toBe(true);
        expect(response.body.services.scheduler.healthy).toBe(true);
    });

    it('should return 503 DEGRADED when DB is disconnected', async () => {
        mongoose.connection.readyState = 0; // Disconnected

        const response = await request(app).get('/health');

        expect(response.status).toBe(503);
        expect(response.body.status).toBe('DEGRADED');
        expect(response.body.services.database.healthy).toBe(false);
        expect(response.body.services.database.status).toBe('disconnected');
    });

    it('should return 503 DEGRADED when Scheduler is not ready', async () => {
        schedulerService.isReady = false;

        const response = await request(app).get('/health');

        expect(response.status).toBe(503);
        expect(response.body.status).toBe('DEGRADED');
        expect(response.body.services.scheduler.healthy).toBe(false);
        expect(response.body.services.scheduler.status).toBe('initializing');
    });

    it('should return 503 DEGRADED when Scheduler is offline (isMaster undefined)', async () => {
        delete schedulerService.isMaster;
        schedulerService.isReady = false;

        const response = await request(app).get('/health');

        expect(response.status).toBe(503);
        expect(response.body.status).toBe('DEGRADED');
        expect(response.body.services.scheduler.status).toBe('offline');
    });

    it('should return 503 DOWN when an error occurs', async () => {
        // Force an error by making readyState access throw
        Object.defineProperty(mongoose.connection, 'readyState', {
            get: () => { throw new Error('DB Error'); }
        });

        const response = await request(app).get('/health');

        expect(response.status).toBe(503);
        expect(response.body.status).toBe('DOWN');
        expect(response.body.error).toBe('DB Error');
    });
});
