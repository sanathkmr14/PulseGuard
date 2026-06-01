import { jest } from '@jest/globals';
import { getDashboardStats, getUsers, getUserMonitors, getUserIncidents } from '../../src/controllers/admin.controller.js';
import User from '../../src/models/User.js';
import Monitor from '../../src/models/Monitor.js';
import Incident from '../../src/models/Incident.js';
import mongoose from 'mongoose';

// Mock Config and services that are not tested
jest.mock('../../src/models/Check.js', () => ({}));
jest.mock('../../src/models/Config.js', () => ({}));
jest.mock('../../src/services/scheduler.service.js', () => ({}));
jest.mock('../../src/services/enhanced-alert.service.js', () => ({
    getAlertStatistics: jest.fn().mockResolvedValue({})
}));

describe('Admin Controller Unit Tests', () => {
    let req, res;
    let spyUserFind, spyUserCount, spyUserFindById, spyUserAggregate;
    let spyMonitorFind, spyMonitorCount, spyMonitorAggregate;
    let spyIncidentFind, spyIncidentCount, spyIncidentAggregate;

    beforeEach(() => {
        jest.clearAllMocks();
        req = {
            query: {},
            params: {}
        };
        res = {
            json: jest.fn().mockReturnThis(),
            status: jest.fn().mockReturnThis()
        };

        // Create spies
        spyUserFind = jest.spyOn(User, 'find');
        spyUserCount = jest.spyOn(User, 'countDocuments');
        spyUserFindById = jest.spyOn(User, 'findById');
        spyUserAggregate = jest.spyOn(User, 'aggregate');

        spyMonitorFind = jest.spyOn(Monitor, 'find');
        spyMonitorCount = jest.spyOn(Monitor, 'countDocuments');
        spyMonitorAggregate = jest.spyOn(Monitor, 'aggregate');

        spyIncidentFind = jest.spyOn(Incident, 'find');
        spyIncidentCount = jest.spyOn(Incident, 'countDocuments');
        spyIncidentAggregate = jest.spyOn(Incident, 'aggregate');
    });

    afterEach(() => {
        // Restore spies
        spyUserFind.mockRestore();
        spyUserCount.mockRestore();
        spyUserFindById.mockRestore();
        spyUserAggregate.mockRestore();
        spyMonitorFind.mockRestore();
        spyMonitorCount.mockRestore();
        spyMonitorAggregate.mockRestore();
        spyIncidentFind.mockRestore();
        spyIncidentCount.mockRestore();
        spyIncidentAggregate.mockRestore();
    });

    describe('getUsers with Pagination', () => {
        it('should fetch users list with pagination defaults', async () => {
            req.query = {};
            spyUserFind.mockReturnValue({
                select: jest.fn().mockReturnThis(),
                sort: jest.fn().mockReturnThis(),
                skip: jest.fn().mockReturnThis(),
                limit: jest.fn().mockResolvedValue([{ _id: 'u1', name: 'User 1' }])
            });
            spyUserCount.mockResolvedValue(1);

            await getUsers(req, res);

            expect(spyUserFind).toHaveBeenCalledWith({ role: 'user' });
            expect(res.json).toHaveBeenCalledWith({
                success: true,
                data: [{ _id: 'u1', name: 'User 1' }],
                pagination: {
                    current: 1,
                    pages: 1,
                    total: 1
                }
            });
        });

        it('should handle custom limit and page', async () => {
            req.query = { limit: '10', page: '2' };
            const mockLimit = jest.fn().mockResolvedValue([{ _id: 'u2', name: 'User 2' }]);
            const mockSkip = jest.fn().mockReturnValue({ limit: mockLimit });
            const mockSort = jest.fn().mockReturnValue({ skip: mockSkip });
            const mockSelect = jest.fn().mockReturnValue({ sort: mockSort });
            spyUserFind.mockReturnValue({ select: mockSelect });
            spyUserCount.mockResolvedValue(15);

            await getUsers(req, res);

            expect(mockSkip).toHaveBeenCalledWith(10); // (2-1)*10
            expect(mockLimit).toHaveBeenCalledWith(10);
            expect(res.json).toHaveBeenCalledWith({
                success: true,
                data: [{ _id: 'u2', name: 'User 2' }],
                pagination: {
                    current: 2,
                    pages: 2,
                    total: 15
                }
            });
        });
    });

    describe('getUserMonitors safe parsing', () => {
        it('should safely parse page and limit to integers', async () => {
            req.params = { id: '69a064f121407e6f3815397d' };
            req.query = { page: '3', limit: '15' };

            spyUserFindById.mockResolvedValue({ _id: req.params.id });
            const mockLimit = jest.fn().mockResolvedValue([{ name: 'Monitor 1' }]);
            const mockSkip = jest.fn().mockReturnValue({ limit: mockLimit });
            const mockSort = jest.fn().mockReturnValue({ skip: mockSkip });
            spyMonitorFind.mockReturnValue({ sort: mockSort });
            spyMonitorCount.mockResolvedValue(35);

            await getUserMonitors(req, res);

            expect(mockSkip).toHaveBeenCalledWith(30); // (3-1) * 15
            expect(mockLimit).toHaveBeenCalledWith(15);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: true,
                pagination: {
                    current: 3,
                    pages: 3,
                    total: 35
                }
            }));
        });
    });

    describe('getDashboardStats with User Filtering', () => {
        it('should filter statistics by userId when provided', async () => {
            const testUserId = '69a064f121407e6f3815397d';
            req.query = { userId: testUserId };

            const mockMonitorIds = [{ _id: 'm1' }, { _id: 'm2' }];
            spyMonitorFind.mockReturnValue({
                select: jest.fn().mockResolvedValue(mockMonitorIds)
            });

            spyUserCount.mockResolvedValue(5);
            
            // Handle countDocuments mock
            spyMonitorCount.mockImplementation((query) => {
                if (query && query.isActive) {
                    return Promise.resolve(1);
                }
                return Promise.resolve(2);
            });

            spyIncidentCount.mockResolvedValue(0);
            spyUserAggregate.mockResolvedValue([]);
            spyMonitorAggregate.mockResolvedValue([]);
            spyIncidentAggregate.mockResolvedValue([]);

            spyUserFind.mockReturnValue({
                sort: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis(),
                select: jest.fn().mockResolvedValue([])
            });

            spyIncidentFind.mockReturnValue({
                sort: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis(),
                populate: jest.fn().mockResolvedValue([])
            });

            await getDashboardStats(req, res);

            // Verify total/active counts are filtered by user
            expect(spyMonitorCount).toHaveBeenNthCalledWith(1, { user: testUserId });
            expect(spyMonitorCount).toHaveBeenNthCalledWith(2, { isActive: true, user: testUserId });

            // Verify incident counts are filtered
            expect(spyIncidentCount).toHaveBeenNthCalledWith(1, expect.objectContaining({
                monitor: { $in: ['m1', 'm2'] }
            }));
        });
    });
});
