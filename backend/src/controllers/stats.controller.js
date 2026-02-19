import statsService from '../services/stats.service.js';
import Monitor from '../models/Monitor.js';
import Config from '../models/Config.js';

/**
 * Get dashboard statistics
 */
export const getDashboardStats = async (req, res) => {
    try {
        console.log('API: getDashboardStats called for user:', req.user._id);
        const stats = await statsService.getDashboardStats(req.user._id);
        console.log('API: getDashboardStats result:', stats);
        res.json({ success: true, data: stats });
    } catch (error) {
        console.error('API: getDashboardStats error:', error);
        res.status(400).json({ success: false, message: error.message });
    }
};

/**
 * Get uptime statistics for a monitor
 */
export const getUptimeStats = async (req, res) => {
    try {
        // SECURITY FIX: Verify user owns this monitor
        const monitor = await Monitor.findById(req.params.monitorId);
        if (!monitor) {
            return res.status(404).json({ success: false, message: 'Monitor not found' });
        }
        if (monitor.user.toString() !== req.user._id.toString()) {
            return res.status(401).json({ success: false, message: 'Not authorized' });
        }

        const { period = '24h' } = req.query;
        let startDate;
        const endDate = new Date();

        switch (period) {
            case '1h': startDate = new Date(Date.now() - 60 * 60 * 1000); break;
            case '24h': startDate = new Date(Date.now() - 24 * 60 * 60 * 1000); break;
            case '7d': startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); break;
            case '30d': startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); break;
            default: startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
        }

        const uptimePercentage = await statsService.calculateUptime(req.params.monitorId, startDate, endDate);
        const bucketSize = (period === '7d' || period === '30d') ? 'day' : 'hour';
        const trend = await statsService.getUptimeTrend(req.params.monitorId, startDate, endDate, bucketSize);

        res.json({
            success: true,
            data: { uptimePercentage, period, startDate, endDate, trend }
        });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

/**
 * Get response time statistics for a monitor
 */
export const getResponseTimeStats = async (req, res) => {
    try {
        // SECURITY FIX: Verify user owns this monitor
        const monitor = await Monitor.findById(req.params.monitorId);
        if (!monitor) {
            return res.status(404).json({ success: false, message: 'Monitor not found' });
        }
        if (monitor.user.toString() !== req.user._id.toString()) {
            return res.status(401).json({ success: false, message: 'Not authorized' });
        }

        const { period = '24h' } = req.query;
        let startDate;
        const endDate = new Date();

        switch (period) {
            case '1h': startDate = new Date(Date.now() - 60 * 60 * 1000); break;
            case '24h': startDate = new Date(Date.now() - 24 * 60 * 60 * 1000); break;
            case '7d': startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); break;
            case '30d': startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); break;
            default: startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
        }

        const avgResponseTime = await statsService.calculateAvgResponseTime(req.params.monitorId, startDate, endDate);
        const bucketSize = (period === '7d' || period === '30d') ? 'day' : 'hour';
        const trend = await statsService.getResponseTimeTrend(req.params.monitorId, startDate, endDate, bucketSize);

        res.json({
            success: true,
            data: { avgResponseTime, period, startDate, endDate, trend }
        });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

/**
 * Get Public System Config (Global Alerts)
 */
export const getSystemConfig = async (req, res) => {
    try {
        const config = await Config.findOne({ key: 'GLOBAL_SETTINGS' });
        // Return defaults if not set, or selected fields
        const data = config ? {
            globalAlert: config.value.globalAlert,
            maintenanceMode: config.value.maintenanceMode
        } : { globalAlert: '', maintenanceMode: false };

        res.json({ success: true, data });
    } catch (error) {
        // Silent fail for config (don't break dashboard)
        console.error('Config fetch error:', error);
        res.json({ success: true, data: { globalAlert: '', maintenanceMode: false } });
    }
};
