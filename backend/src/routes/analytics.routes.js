import express from 'express';
import { protect } from '../middlewares/auth.middleware.js';
import {
    getHealthDistribution,
    getPerformanceTrends,
    getIncidentAnalytics,
    getPredictiveAnalysis,
    getSLACompliance,
    getAnalyticsOverview,
    getCacheStats,
    clearCache,
    exportAnalytics
} from '../controllers/analytics.controller.js';

const router = express.Router();

router.get('/health-distribution', protect, getHealthDistribution);
router.get('/performance-trends', protect, getPerformanceTrends);
router.get('/incident-analytics', protect, getIncidentAnalytics);
router.get('/predictive-analysis', protect, getPredictiveAnalysis);
router.get('/sla-compliance', protect, getSLACompliance);
router.get('/overview', protect, getAnalyticsOverview);
router.get('/cache-stats', protect, getCacheStats);
router.post('/clear-cache', protect, clearCache);
router.get('/export', protect, exportAnalytics);

export default router;
