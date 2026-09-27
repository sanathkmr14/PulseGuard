import express from 'express';

import { protect } from '../middlewares/auth.middleware.js';
import { adminProtect } from '../middlewares/admin.middleware.js';
import { userRateLimiter, strictUserRateLimiter } from '../middlewares/rate-limit.middleware.js';


const router = express.Router();

import {
    getMonitors,
    createMonitor,
    getMonitor,
    updateMonitor,
    deleteMonitor,
    getMonitorStats,
    getMonitorChecks,
    checkMonitorNow,
    getQueueStats,
    verifyJobHealth
} from '../controllers/monitor.controller.js';

// @route   GET /api/monitors/queue/stats (Admin only)
router.get('/queue/stats', adminProtect, getQueueStats);

// @route   GET /api/monitors/health/check (Admin only)
router.get('/health/check', adminProtect, verifyJobHealth);

// Authenticate all remaining monitor routes and apply user rate limiting
router.use(protect);
router.use(userRateLimiter);

// @route   GET /api/monitors
router.get('/', getMonitors);

// @route   POST /api/monitors
// Strict rate limit: creating monitors is resource-intensive
router.post('/', strictUserRateLimiter, createMonitor);

// @route   GET /api/monitors/:id
router.get('/:id', getMonitor);

// @route   PUT /api/monitors/:id
router.put('/:id', updateMonitor);

// @route   DELETE /api/monitors/:id
router.delete('/:id', deleteMonitor);

// @route   GET /api/monitors/:id/stats
router.get('/:id/stats', getMonitorStats);

// @route   GET /api/monitors/:id/checks
router.get('/:id/checks', getMonitorChecks);

// @route   POST /api/monitors/:id/check-now
// Strict rate limit: manual checks are resource-intensive
router.post('/:id/check-now', strictUserRateLimiter, checkMonitorNow);

export default router;
