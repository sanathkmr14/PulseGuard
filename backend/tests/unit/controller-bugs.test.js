import { jest } from '@jest/globals';
import { resetPassword } from '../../src/controllers/auth.controller.js';
import { adminLogin, getUserDetails } from '../../src/controllers/admin.controller.js';
import { getIncident, getIncidents, getMonitorIncidents, getActiveMonitorIncident } from '../../src/controllers/incident.controller.js';
import { getUptimeStats, getResponseTimeStats } from '../../src/controllers/stats.controller.js';
import User from '../../src/models/User.js';
import Monitor from '../../src/models/Monitor.js';
import Incident from '../../src/models/Incident.js';

describe('Controller Bug Fixes Verification', () => {
    let req, res;

    beforeEach(() => {
        req = { body: {}, params: {}, query: {}, user: { _id: '507f1f77bcf86cd799439011' } };
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis()
        };
        jest.clearAllMocks();
    });

    describe('auth.controller.js - resetPassword', () => {
        it('should return 400 when token is missing or not a string', async () => {
            req.body = { password: 'newPassword123' };
            await resetPassword(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                message: expect.stringContaining('Token and password are required')
            }));
        });

        it('should return 400 when password is missing or shorter than 8 chars', async () => {
            req.body = { token: 'validtoken123', password: 'short' };
            await resetPassword(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                message: expect.stringContaining('at least 8 characters')
            }));
        });
    });

    describe('admin.controller.js - adminLogin & getUserDetails', () => {
        it('should return 400 when email or password is missing', async () => {
            req.body = { email: 'admin@pulseguard.com' };
            await adminLogin(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                message: 'Email and password are required'
            }));
        });

        it('should return 400 when email is not a string (prevent NoSQL injection)', async () => {
            req.body = { email: { $ne: null }, password: 'password123' };
            await adminLogin(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                message: 'Email and password are required'
            }));
        });

        it('should reject invalid user ID format with 400 instead of 500 cast error', async () => {
            req.params = { id: 'invalid-id' };
            await getUserDetails(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                message: 'Invalid user ID format'
            }));
        });
    });

    describe('incident.controller.js - ObjectId & Pagination validation', () => {
        it('should return 400 for malformed incident ID in getIncident', async () => {
            req.params = { id: 'not-an-object-id' };
            await getIncident(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                message: 'Invalid incident ID format'
            }));
        });

        it('should return 400 for malformed monitor ID in getMonitorIncidents', async () => {
            req.params = { monitorId: 'not-an-object-id' };
            await getMonitorIncidents(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                message: 'Invalid monitor ID format'
            }));
        });

        it('should safely clamp negative or invalid pagination values in getIncidents', async () => {
            req.query = { page: '-5', limit: '0' };
            jest.spyOn(Monitor, 'find').mockResolvedValue([]);
            jest.spyOn(Incident, 'find').mockReturnValue({
                populate: jest.fn().mockReturnThis(),
                sort: jest.fn().mockReturnThis(),
                skip: jest.fn().mockReturnThis(),
                limit: jest.fn().mockResolvedValue([])
            });
            jest.spyOn(Incident, 'countDocuments').mockResolvedValue(0);

            await getIncidents(req, res);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: true,
                pagination: expect.objectContaining({
                    current: 1
                })
            }));
        });

        it('should allow admin to access getMonitorIncidents and getActiveMonitorIncident for another user monitor', async () => {
            req.params = { monitorId: '507f1f77bcf86cd799439033' };
            req.user = { _id: '507f1f77bcf86cd799439099', role: 'admin' };
            const otherUserMonitor = {
                _id: '507f1f77bcf86cd799439033',
                user: '507f1f77bcf86cd799439011'
            };
            jest.spyOn(Monitor, 'findById').mockResolvedValue(otherUserMonitor);
            jest.spyOn(Incident, 'find').mockReturnValue({
                sort: jest.fn().mockResolvedValue([])
            });
            jest.spyOn(Incident, 'findOne').mockReturnValue({
                sort: jest.fn().mockResolvedValue(null)
            });

            await getMonitorIncidents(req, res);
            expect(res.status).not.toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));

            await getActiveMonitorIncident(req, res);
            expect(res.status).not.toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        });

        it('should block non-admin regular user from accessing another user monitor incidents', async () => {
            req.params = { monitorId: '507f1f77bcf86cd799439033' };
            req.user = { _id: '507f1f77bcf86cd799439099', role: 'user' };
            const otherUserMonitor = {
                _id: '507f1f77bcf86cd799439033',
                user: '507f1f77bcf86cd799439011'
            };
            jest.spyOn(Monitor, 'findById').mockResolvedValue(otherUserMonitor);

            await getMonitorIncidents(req, res);
            expect(res.status).toHaveBeenCalledWith(401);

            await getActiveMonitorIncident(req, res);
            expect(res.status).toHaveBeenCalledWith(401);
        });
    });

    describe('stats.controller.js - ObjectId validation', () => {
        it('should return 400 for malformed monitor ID in getUptimeStats', async () => {
            req.params = { monitorId: 'bad_id' };
            await getUptimeStats(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                message: 'Invalid monitor ID format'
            }));
        });

        it('should return 400 for malformed monitor ID in getResponseTimeStats', async () => {
            req.params = { monitorId: 'bad_id' };
            await getResponseTimeStats(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                message: 'Invalid monitor ID format'
            }));
        });

        it('should allow admin to access getUptimeStats and getResponseTimeStats for another user monitor', async () => {
            req.params = { monitorId: '507f1f77bcf86cd799439033' };
            req.user = { _id: '507f1f77bcf86cd799439099', role: 'admin' };
            const otherUserMonitor = {
                _id: '507f1f77bcf86cd799439033',
                user: '507f1f77bcf86cd799439011'
            };
            jest.spyOn(Monitor, 'findById').mockResolvedValue(otherUserMonitor);
            const statsService = (await import('../../src/services/stats.service.js')).default;
            jest.spyOn(statsService, 'calculateUptime').mockResolvedValue(99.5);
            jest.spyOn(statsService, 'getUptimeTrend').mockResolvedValue([]);
            jest.spyOn(statsService, 'calculateAvgResponseTime').mockResolvedValue(120);
            jest.spyOn(statsService, 'getResponseTimeTrend').mockResolvedValue([]);

            await getUptimeStats(req, res);
            expect(res.status).not.toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));

            await getResponseTimeStats(req, res);
            expect(res.status).not.toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        });

        it('should block non-admin regular user from accessing another user stats', async () => {
            req.params = { monitorId: '507f1f77bcf86cd799439033' };
            req.user = { _id: '507f1f77bcf86cd799439099', role: 'user' };
            const otherUserMonitor = {
                _id: '507f1f77bcf86cd799439033',
                user: '507f1f77bcf86cd799439011'
            };
            jest.spyOn(Monitor, 'findById').mockResolvedValue(otherUserMonitor);

            await getUptimeStats(req, res);
            expect(res.status).toHaveBeenCalledWith(401);

            await getResponseTimeStats(req, res);
            expect(res.status).toHaveBeenCalledWith(401);
        });
    });

    describe('auth.controller.js - deleteAccount & updateProfile validation', () => {
        it('should return 400 when password is missing in deleteAccount', async () => {
            const { deleteAccount } = await import('../../src/controllers/auth.controller.js');
            req.body = {};
            await deleteAccount(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                message: 'Password is required to delete account'
            }));
        });

        it('should return 400 when changing email without currentPassword in updateProfile', async () => {
            const { updateProfile } = await import('../../src/controllers/auth.controller.js');
            req.body = { email: 'different@example.com' };
            jest.spyOn(User, 'findById').mockReturnValue({
                select: jest.fn().mockResolvedValue({
                    _id: req.user._id,
                    email: 'original@example.com',
                    comparePassword: jest.fn()
                })
            });

            await updateProfile(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                message: 'Current password is required to change email'
            }));
        });

        it('should return 400 when changing password without currentPassword in updateProfile', async () => {
            const { updateProfile } = await import('../../src/controllers/auth.controller.js');
            req.body = { password: 'newSecurePassword123' };
            jest.spyOn(User, 'findById').mockReturnValue({
                select: jest.fn().mockResolvedValue({
                    _id: req.user._id,
                    email: 'original@example.com',
                    comparePassword: jest.fn()
                })
            });

            await updateProfile(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                message: 'Current password is required to change password'
            }));
        });
    });

    describe('User model - toJSON preserves notification settings fields', () => {
        it('should preserve slackWebhook, phoneNumber, and webhookUrl in toJSON', () => {
            const userDoc = new User({
                name: 'Test User',
                email: 'test@example.com',
                password: 'password123',
                slackWebhook: 'https://hooks.slack.com/services/T00/B00/X00',
                phoneNumber: '+1234567890',
                webhookUrl: 'https://webhook.site/abc'
            });

            const json = userDoc.toJSON();
            expect(json.slackWebhook).toBe('https://hooks.slack.com/services/T00/B00/X00');
            expect(json.phoneNumber).toBe('+1234567890');
            expect(json.webhookUrl).toBe('https://webhook.site/abc');
            expect(json.password).toBeUndefined();
        });
    });

    describe('Cascading Deletes - User and Monitor Data Lifecycle', () => {
        it('should verify deleteMonitor deletes monitor, all checks, all incidents, and purges Redis keys', async () => {
            const { deleteMonitor } = await import('../../src/controllers/monitor.controller.js');
            const Check = (await import('../../src/models/Check.js')).default;
            const Incident = (await import('../../src/models/Incident.js')).default;
            const schedulerService = (await import('../../src/services/scheduler.service.js')).default;
            const healthStateService = (await import('../../src/services/health-evaluator.service.js')).default;
            const enhancedAlertService = (await import('../../src/services/enhanced-alert.service.js')).default;

            const monitorId = '507f1f77bcf86cd799439022';
            req.params = { id: monitorId };

            jest.spyOn(Monitor, 'findById').mockResolvedValue({
                _id: monitorId,
                name: 'Test Monitor',
                user: req.user._id,
                deleteOne: jest.fn().mockResolvedValue(true)
            });

            const deleteManyChecksSpy = jest.spyOn(Check, 'deleteMany').mockResolvedValue({ deletedCount: 50 });
            const deleteManyIncidentsSpy = jest.spyOn(Incident, 'deleteMany').mockResolvedValue({ deletedCount: 3 });
            const removeMonitorSpy = jest.spyOn(schedulerService, 'removeMonitor').mockResolvedValue(true);
            const cleanupStateSpy = jest.spyOn(healthStateService, 'cleanupState').mockResolvedValue(true);
            const clearSuppressionSpy = jest.spyOn(enhancedAlertService, 'clearAlertSuppression').mockResolvedValue(true);

            await deleteMonitor(req, res);

            expect(removeMonitorSpy).toHaveBeenCalledWith(monitorId);
            expect(deleteManyChecksSpy).toHaveBeenCalledWith(expect.objectContaining({ monitor: expect.anything() }));
            expect(deleteManyIncidentsSpy).toHaveBeenCalledWith(expect.objectContaining({ monitor: expect.anything() }));
            expect(cleanupStateSpy).toHaveBeenCalledWith(monitorId);
            expect(clearSuppressionSpy).toHaveBeenCalledWith(monitorId);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, message: 'Monitor deleted' }));
        });
    });
});
