import realtimeAnalyticsService from '../services/realtime-analytics.service.js';

/**
 * Get real-time health state distribution
 */
export const getHealthDistribution = async (req, res) => {
    try {
        const distribution = await realtimeAnalyticsService.getHealthStateDistribution(req.user.id);
        res.json({ success: true, data: distribution });
    } catch (error) {
        res.status(500).json({ success: false, error: { message: 'Failed to get health distribution', details: error.message } });
    }
};

/**
 * Get performance trend analysis
 */
export const getPerformanceTrends = async (req, res) => {
    try {
        const { timeRange = '24h' } = req.query;
        const validRanges = ['1h', '6h', '24h', '7d', '30d'];
        if (!validRanges.includes(timeRange)) {
            return res.status(400).json({ success: false, error: { message: 'Invalid time range', validRanges } });
        }
        const trends = await realtimeAnalyticsService.getPerformanceTrends(req.user.id, timeRange);
        res.json({ success: true, data: trends });
    } catch (error) {
        res.status(500).json({ success: false, error: { message: 'Failed to get performance trends', details: error.message } });
    }
};

/**
 * Get incident analytics and patterns
 */
export const getIncidentAnalytics = async (req, res) => {
    try {
        const { timeRange = '7d' } = req.query;
        const validRanges = ['24h', '7d', '30d', '90d'];
        if (!validRanges.includes(timeRange)) {
            return res.status(400).json({ success: false, error: { message: 'Invalid time range', validRanges } });
        }
        const analytics = await realtimeAnalyticsService.getIncidentAnalytics(req.user.id, timeRange);
        res.json({ success: true, data: analytics });
    } catch (error) {
        res.status(500).json({ success: false, error: { message: 'Failed to get incident analytics', details: error.message } });
    }
};

/**
 * Get predictive failure analysis
 */
export const getPredictiveAnalysis = async (req, res) => {
    try {
        const analysis = await realtimeAnalyticsService.getPredictiveAnalysis(req.user.id);
        res.json({ success: true, data: analysis });
    } catch (error) {
        res.status(500).json({ success: false, error: { message: 'Failed to get predictive analysis', details: error.message } });
    }
};

/**
 * Get SLA/SLO compliance tracking
 */
export const getSLACompliance = async (req, res) => {
    try {
        const { timeRange = '30d' } = req.query;
        const validRanges = ['7d', '30d', '90d'];
        if (!validRanges.includes(timeRange)) {
            return res.status(400).json({ success: false, error: { message: 'Invalid time range', validRanges } });
        }
        const compliance = await realtimeAnalyticsService.getSLACompliance(req.user.id, timeRange);
        res.json({ success: true, data: compliance });
    } catch (error) {
        res.status(500).json({ success: false, error: { message: 'Failed to get SLA compliance', details: error.message } });
    }
};

/**
 * Get comprehensive analytics overview
 */
export const getAnalyticsOverview = async (req, res) => {
    try {
        const userId = req.user.id;
        const [health, performance, incidents, predictive, sla] = await Promise.all([
            realtimeAnalyticsService.getHealthStateDistribution(userId),
            realtimeAnalyticsService.getPerformanceTrends(userId, '24h'),
            realtimeAnalyticsService.getIncidentAnalytics(userId, '7d'),
            realtimeAnalyticsService.getPredictiveAnalysis(userId),
            realtimeAnalyticsService.getSLACompliance(userId, '30d')
        ]);

        res.json({
            success: true,
            data: {
                health: { distribution: health, status: health.percentage.up >= 95 ? 'healthy' : health.percentage.down > 0 ? 'critical' : 'degraded' },
                performance: { trends: performance.summary, status: performance.summary.avgAvailability >= 99 ? 'optimal' : performance.summary.avgAvailability >= 95 ? 'acceptable' : 'poor' },
                incidents: { analytics: { total: incidents.totalIncidents, mttr: incidents.mttr, patterns: incidents.patterns.length }, status: incidents.totalIncidents === 0 ? 'clean' : incidents.totalIncidents < 5 ? 'low_activity' : 'high_activity' },
                predictions: { analysis: predictive, status: predictive.atRiskMonitors.length === 0 ? 'stable' : predictive.atRiskMonitors.length < 3 ? 'monitoring' : 'alert' },
                sla: { compliance: sla, status: sla.compliance ? 'meeting' : 'violating' },
                timestamp: new Date()
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: { message: 'Failed to get overview', details: error.message } });
    }
};

/**
 * Cache and Export methods
 */
export const getCacheStats = async (req, res) => {
    res.json({ success: true, data: { cache: realtimeAnalyticsService.getCacheStats(), timestamp: new Date() } });
};

export const clearCache = async (req, res) => {
    realtimeAnalyticsService.clearCache();
    res.json({ success: true, message: 'Cache cleared' });
};

export const exportAnalytics = async (req, res) => {
    try {
        const { type = 'overview', format = 'json' } = req.query;
        let data;
        switch (type) {
            case 'overview': data = await realtimeAnalyticsService.getHealthStateDistribution(req.user.id); break;
            case 'health': data = await realtimeAnalyticsService.getHealthStateDistribution(req.user.id); break;
            case 'performance': data = await realtimeAnalyticsService.getPerformanceTrends(req.user.id); break;
            case 'incidents': data = await realtimeAnalyticsService.getIncidentAnalytics(req.user.id); break;
            case 'sla': data = await realtimeAnalyticsService.getSLACompliance(req.user.id); break;
            default: return res.status(400).json({ success: false, error: 'Invalid type' });
        }

        if (format === 'csv') {
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=analytics-${type}.csv`);
            res.send(convertToCSV(data));
        } else {
            res.json({ success: true, export: { type, timestamp: new Date(), data } });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: { message: 'Export failed', details: error.message } });
    }
};

const convertToCSV = (data) => {
    if (Array.isArray(data)) return data.map(row => Object.values(row).join(',')).join('\n');
    const flat = {};
    const flatten = (obj, prefix = '') => {
        for (const [key, value] of Object.entries(obj)) {
            const k = prefix ? `${prefix}.${key}` : key;
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) flatten(value, k);
            else flat[k] = value;
        }
    };
    flatten(data);
    return Object.keys(flat).join(',') + '\n' + Object.values(flat).join(',');
};
