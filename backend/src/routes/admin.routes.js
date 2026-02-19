import express from 'express';
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

const router = express.Router();

// Public Admin Route
router.post('/auth/login', adminLogin);

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
router.get('/incidents', getIncidents);

export default router;
