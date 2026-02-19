
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import app from '../../src/server.js';
import User from '../../src/models/User.js';
import Monitor from '../../src/models/Monitor.js';

describe('Monitor Integration Tests', () => {
    let authToken;
    const testUser = {
        name: 'Test Monitor User',
        email: 'monitor-test@example.com',
        password: 'password123'
    };

    beforeAll(async () => {
        // Clean up previous test users
        await User.deleteOne({ email: testUser.email });

        // Register a user to get token
        const res = await request(app)
            .post('/api/auth/register')
            .send(testUser);

        if (res.status !== 201) {
            console.error('Test Registration Failed:', res.status, res.body);
        }
        authToken = res.body.data.token;
    });

    afterAll(async () => {
        // Cleanup
        if (authToken) {
            const user = await User.findOne({ email: testUser.email });
            if (user) {
                await Monitor.deleteMany({ user: user._id });
                await User.deleteOne({ _id: user._id });
            }
        }
    });

    it('should create a new HTTP monitor', async () => {
        const monitorData = {
            name: 'Integration Test Monitor',
            url: 'https://www.google.com',
            type: 'HTTP',
            interval: 10
        };

        const res = await request(app)
            .post('/api/monitors')
            .set('Authorization', `Bearer ${authToken}`)
            .send(monitorData);

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data.name).toBe(monitorData.name);
        expect(res.body.data.isActive).toBe(true);

        // Check database
        const savedMonitor = await Monitor.findById(res.body.data._id);
        expect(savedMonitor).toBeDefined();
        expect(savedMonitor.url).toBe(monitorData.url);
    });

    it('should prevent creating monitor without auth', async () => {
        const monitorData = {
            name: 'Unauthorized Monitor',
            url: 'https://example.com',
            type: 'HTTP'
        };

        const res = await request(app)
            .post('/api/monitors')
            .send(monitorData);

        expect(res.status).toBe(401);
    });

    it('should only return monitors owned by the user', async () => {
        // Create another user and a monitor
        const otherUser = {
            name: 'Other User',
            email: 'other@example.com',
            password: 'password123'
        };

        await request(app).post('/api/auth/register').send(otherUser);
        const loginRes = await request(app).post('/api/auth/login').send({
            email: otherUser.email,
            password: otherUser.password
        });
        const otherToken = loginRes.body.data.token;

        await request(app)
            .post('/api/monitors')
            .set('Authorization', `Bearer ${otherToken}`)
            .send({
                name: 'Other User Monitor',
                url: 'https://other.com',
                type: 'HTTP'
            });

        // Request monitors as the original test user
        const res = await request(app)
            .get('/api/monitors')
            .set('Authorization', `Bearer ${authToken}`);

        expect(res.status).toBe(200);
        // Should find at least the one we created in the first test
        // But crucially, should NOT find the "Other User Monitor"
        const names = res.body.data.map(m => m.name);
        expect(names).toContain('Integration Test Monitor');
        expect(names).not.toContain('Other User Monitor');

        // Cleanup other user
        const savedOtherUser = await User.findOne({ email: otherUser.email });
        if (savedOtherUser) {
            await Monitor.deleteMany({ user: savedOtherUser._id });
            await User.deleteOne({ _id: savedOtherUser._id });
        }
    });
});
