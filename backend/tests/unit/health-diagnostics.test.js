import { jest } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../src/server.js';
import schedulerService from '../../src/services/scheduler.service.js';

const origReadyStateDesc = Object.getOwnPropertyDescriptor(mongoose.connection, 'readyState')
    || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(mongoose.connection), 'readyState');

function setReadyState(valueOrFn) {
    if (typeof valueOrFn === 'function') {
        Object.defineProperty(mongoose.connection, 'readyState', {
            get: valueOrFn,
            configurable: true
        });
    } else {
        Object.defineProperty(mongoose.connection, 'readyState', {
            get: () => valueOrFn,
            configurable: true
        });
    }
}

function restoreReadyState() {
    delete mongoose.connection.readyState;
    if (origReadyStateDesc && Object.prototype.hasOwnProperty.call(mongoose.connection, 'readyState')) {
        Object.defineProperty(mongoose.connection, 'readyState', origReadyStateDesc);
    }
}

describe('Health Check Endpoint Diagnostics', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Reset defaults
        setReadyState(1);
        schedulerService.isMaster = true;
        schedulerService.isReady = true;
    });

    afterEach(() => {
        restoreReadyState();
    });

    it('should return 200 UP when DB and Scheduler are healthy', async () => {
        const response = await request(app).get('/health');

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('UP');
        expect(response.body.services.database.healthy).toBe(true);
        expect(response.body.services.scheduler.healthy).toBe(true);
    });

    it('should return 503 DEGRADED when DB is disconnected', async () => {
        setReadyState(0); // Disconnected

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
        setReadyState(() => { throw new Error('DB Error'); });

        const response = await request(app).get('/health');

        expect(response.status).toBe(503);
        expect(response.body.status).toBe('DOWN');
        expect(response.body.error).toBe('DB Error');
    });
});
