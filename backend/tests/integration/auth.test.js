
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import app from '../../src/server.js';
import User from '../../src/models/User.js';

describe('Auth Integration Tests', () => {
    const testUser = {
        name: 'Rate Limit Test',
        email: 'ratelimit@example.com',
        password: 'password123'
    };

    beforeAll(async () => {
        await User.deleteOne({ email: testUser.email });
        await request(app).post('/api/auth/register').send(testUser);
    });

    afterAll(async () => {
        await User.deleteOne({ email: testUser.email });
    });

    it('should success login with correct credentials', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({
                email: testUser.email,
                password: testUser.password
            });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.token).toBeDefined();
    });

    // NOTE: This test is tricky because it depends on the global state of the rate limiter.
    // Ideally we'd mock the rate limiter or use a separate instance, but for integration 
    // we can just spam requests.
    it.skip('should enforce rate limits on login', async () => {
        // Limit is 20 per 15 mins for auth routes
        // We need to send > 20 requests

        const promises = [];
        for (let i = 0; i < 25; i++) {
            promises.push(
                request(app)
                    .post('/api/auth/login')
                    .send({
                        email: testUser.email,
                        password: 'wrongpassword' // Failures also count
                    })
            );
        }

        const responses = await Promise.all(promises);
        const rateLimited = responses.some(res => res.status === 429);
        expect(rateLimited).toBe(true);
    }, 10000);

    it('should REJECT sensitive profile update without currentPassword', async () => {
        // Create fresh user to avoid rate limits
        const secureUser = {
            name: 'Secure User',
            email: 'secure@example.com',
            password: 'password123'
        };
        await User.deleteOne({ email: secureUser.email });
        const registerRes = await request(app).post('/api/auth/register').send(secureUser);
        expect(registerRes.status).toBe(201); // Ensure register success

        // Login
        const loginRes = await request(app)
            .post('/api/auth/login')
            .send({
                email: secureUser.email,
                password: secureUser.password
            });
        expect(loginRes.status).toBe(200); // Ensure login success

        const token = loginRes.body.data.token;

        // Attempt update email
        const updateRes = await request(app)
            .put('/api/auth/profile')
            .set('Authorization', `Bearer ${token}`)
            .send({
                email: 'newemail@example.com'
            });

        expect(updateRes.status).toBe(400);
        expect(updateRes.body.message).toMatch(/Current password is required/);

        // Cleanup
        await User.deleteOne({ email: secureUser.email });
    });

    it('should ALLOW profile update with correct currentPassword', async () => {
        // Create fresh user
        const correctUser = {
            name: 'Correct User',
            email: 'correct@example.com',
            password: 'password123'
        };
        await User.deleteOne({ email: correctUser.email });
        const registerRes = await request(app).post('/api/auth/register').send(correctUser);
        expect(registerRes.status).toBe(201);

        // Login
        const loginRes = await request(app)
            .post('/api/auth/login')
            .send({
                email: correctUser.email,
                password: correctUser.password
            });
        expect(loginRes.status).toBe(200);

        const token = loginRes.body.data.token;

        // Attempt update
        const updateRes = await request(app)
            .put('/api/auth/profile')
            .set('Authorization', `Bearer ${token}`)
            .send({
                name: 'Updated Name',
                email: 'secure-update@example.com',
                currentPassword: correctUser.password
            });

        if (updateRes.status !== 200) {
            console.log('Update Failed Response:', JSON.stringify(updateRes.body, null, 2));
        }

        expect(updateRes.status).toBe(200);
        expect(updateRes.body.data.email).toBe('secure-update@example.com');

        // Cleanup
        await User.deleteOne({ email: 'secure-update@example.com' }); // Email changed
    });
});
