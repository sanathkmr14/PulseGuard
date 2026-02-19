import express from 'express';
import { protect } from '../middlewares/auth.middleware.js';
import {
    getDashboardStats,
    getUptimeStats,
    getResponseTimeStats,
    getSystemConfig
} from '../controllers/stats.controller.js';

const router = express.Router();

router.get('/config', protect, getSystemConfig); // GET /api/stats/config
router.get('/dashboard', protect, getDashboardStats);
router.get('/uptime/:monitorId', protect, getUptimeStats);
router.get('/response-time/:monitorId', protect, getResponseTimeStats);

export default router;
