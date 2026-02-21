import express from 'express';

import { protect } from '../middlewares/auth.middleware.js';
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

// @route   GET /api/monitors/queue/stats
router.get('/queue/stats', protect, getQueueStats);

// @route   GET /api/monitors/health/check
router.get('/health/check', protect, verifyJobHealth);

// @route   GET /api/monitors
router.get('/', protect, getMonitors);

// @route   POST /api/monitors
// Strict rate limit: creating monitors is resource-intensive
router.post('/', protect, strictUserRateLimiter, createMonitor);

// @route   GET /api/monitors/:id
router.get('/:id', protect, getMonitor);

// @route   PUT /api/monitors/:id
router.put('/:id', protect, updateMonitor);

// @route   DELETE /api/monitors/:id
router.delete('/:id', protect, deleteMonitor);

// @route   GET /api/monitors/:id/stats
router.get('/:id/stats', protect, getMonitorStats);

// @route   GET /api/monitors/:id/checks
router.get('/:id/checks', protect, getMonitorChecks);

// @route   POST /api/monitors/:id/check-now
// Strict rate limit: manual checks are resource-intensive
router.post('/:id/check-now', protect, strictUserRateLimiter, checkMonitorNow);

export default router;
