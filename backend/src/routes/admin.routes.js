import express from 'express';
import rateLimit from 'express-rate-limit';
import { adminProtect } from '../middlewares/admin.middleware.js';
import {
    adminLogin,
    getDashboardStats,
    getSystemHealth,
    getSettings,
    updateSettings,
    getUsers,
    getUserDetails,
    impersonateUser,
    deleteUser,
    getMonitorLogs,
    toggleUserBan,
    getIncidents,
    getUserMonitors,
    getUserIncidents
} from '../controllers/admin.controller.js';
import { updateMonitor, deleteMonitor } from '../controllers/monitor.controller.js';

const router = express.Router();

// [C1 SECURITY FIX] Strict rate limiter for admin login — 5 attempts per 15 minutes.
// Previously this route had NO rate limiting, making it brute-forceable.
const adminAuthLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    message: { success: false, message: 'Too many admin login attempts. Please try again after 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => process.env.NODE_ENV === 'test',
});

// Public Admin Route
router.post('/auth/login', adminAuthLimiter, adminLogin);

// Protected Admin Routes
router.use(adminProtect);

// Dashboard Stats
router.get('/stats', getDashboardStats);
router.get('/stats/health', getSystemHealth);

// System Settings
router.get('/settings', getSettings);
router.put('/settings', updateSettings);
router.get('/users', getUsers);
router.get('/users/:id', getUserDetails);
router.get('/users/:id/monitors', getUserMonitors);
router.get('/users/:id/incidents', getUserIncidents);
router.post('/users/:id/impersonate', impersonateUser);
router.put('/users/:id/ban', toggleUserBan);
router.delete('/users/:id', deleteUser);
router.get('/monitors/:id/logs', getMonitorLogs);
router.put('/monitors/:id', updateMonitor);
router.delete('/monitors/:id', deleteMonitor);
router.get('/incidents', getIncidents);

export default router;
