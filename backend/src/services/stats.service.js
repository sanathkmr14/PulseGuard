import Check from '../models/Check.js';
import Monitor from '../models/Monitor.js';
import Incident from '../models/Incident.js';
import mongoose from 'mongoose';

class StatsService {
    // Calculate uptime percentage for a time period
    async calculateUptime(monitorId, startDate, endDate) {
        try {
            const result = await Check.aggregate([
                {
                    $match: {
                        monitor: new mongoose.Types.ObjectId(monitorId),
                        timestamp: { $gte: startDate, $lte: endDate }
                    }
                },
                {
                    $group: {
                        _id: null,
                        total: { $sum: 1 },
                        up: {
                            $sum: {
                                $cond: [{ $in: ["$status", ["up", "degraded"]] }, 1, 0]
                            }
                        }
                    }
                }
            ]);

            if (result.length === 0 || result[0].total === 0) {
                return 100; // No checks means no downtime
            }

            const { total, up } = result[0];
            const uptimePercentage = (up / total) * 100;

            return parseFloat(uptimePercentage.toFixed(2));
        } catch (error) {
            console.error('Error calculating uptime:', error);
            return 0;
        }
    }

    // Calculate average response time
    async calculateAvgResponseTime(monitorId, startDate, endDate) {
        try {
            const result = await Check.aggregate([
                {
                    $match: {
                        monitor: new mongoose.Types.ObjectId(monitorId),
                        timestamp: { $gte: startDate, $lte: endDate },
                        responseTime: { $ne: null }
                    }
                },
                {
                    $group: {
                        _id: null,
                        avgResponseTime: { $avg: "$responseTime" }
                    }
                }
            ]);

            if (result.length === 0) {
                return 0;
            }

            return Math.round(result[0].avgResponseTime || 0);
        } catch (error) {
            console.error('Error calculating average response time:', error);
            return 0;
        }
    }

    // Get uptime data for chart (hourly/daily buckets)
    async getUptimeTrend(monitorId, startDate, endDate, bucketSize = 'hour') {
        try {
            // Determine format for grouping
            // MongoDB $dateToString format
            const format = bucketSize === 'hour' ? "%Y-%m-%dT%H:00:00.000Z" : "%Y-%m-%dT00:00:00.000Z";

            const trend = await Check.aggregate([
                {
                    $match: {
                        monitor: new mongoose.Types.ObjectId(monitorId),
                        timestamp: { $gte: startDate, $lte: endDate }
                    }
                },
                {
                    $group: {
                        _id: {
                            $dateToString: { format: format, date: "$timestamp" }
                        },
                        total: { $sum: 1 },
                        up: {
                            $sum: {
                                $cond: [{ $in: ["$status", ["up", "degraded"]] }, 1, 0]
                            }
                        }
                    }
                },
                { $sort: { _id: 1 } }
            ]);

            return trend.map(item => ({
                timestamp: item._id,
                uptime: item.total > 0 ? parseFloat(((item.up / item.total) * 100).toFixed(2)) : 100,
                checks: item.total
            }));
        } catch (error) {
            console.error('Error getting uptime trend:', error);
            return [];
        }
    }

    // Get response time trend
    async getResponseTimeTrend(monitorId, startDate, endDate, bucketSize = 'hour') {
        try {
            const format = bucketSize === 'hour' ? "%Y-%m-%dT%H:00:00.000Z" : "%Y-%m-%dT00:00:00.000Z";

            const trend = await Check.aggregate([
                {
                    $match: {
                        monitor: new mongoose.Types.ObjectId(monitorId),
                        timestamp: { $gte: startDate, $lte: endDate },
                        responseTime: { $ne: null }
                    }
                },
                {
                    $group: {
                        _id: {
                            $dateToString: { format: format, date: "$timestamp" }
                        },
                        avg: { $avg: "$responseTime" },
                        min: { $min: "$responseTime" },
                        max: { $max: "$responseTime" }
                    }
                },
                { $sort: { _id: 1 } }
            ]);

            return trend.map(item => ({
                timestamp: item._id,
                avg: Math.round(item.avg),
                min: item.min,
                max: item.max
            }));
        } catch (error) {
            console.error('Error getting response time trend:', error);
            return [];
        }
    }

    // Get dashboard statistics
    async getDashboardStats(userId) {
        try {
            const monitors = await Monitor.find({ user: userId }).select('_id status totalChecks successfulChecks');

            const totalMonitors = monitors.length;

            // Efficient in-memory counts (small data set usually, monitors < 1000)
            const activeMonitors = monitors.filter(m => m.status === 'up').length;
            const downMonitors = monitors.filter(m => m.status === 'down').length;
            const degradedMonitors = monitors.filter(m => m.status === 'degraded').length;

            // Calculate overall uptime from pre-aggregated fields on Monitor model
            let totalChecksCount = 0;
            let totalSuccessfulCount = 0;

            monitors.forEach(monitor => {
                totalChecksCount += monitor.totalChecks || 0;
                totalSuccessfulCount += monitor.successfulChecks || 0;
            });

            const overallUptime = totalChecksCount > 0
                ? parseFloat(((totalSuccessfulCount / totalChecksCount) * 100).toFixed(2))
                : 100;

            const monitorIds = monitors.map(m => m._id);

            // Parallel incident counts
            const [ongoingIncidents, recentIncidents] = await Promise.all([
                Incident.countDocuments({
                    monitor: { $in: monitorIds },
                    status: 'ongoing'
                }),
                Incident.countDocuments({
                    monitor: { $in: monitorIds },
                    startTime: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
                })
            ]);

            return {
                totalMonitors,
                activeMonitors,
                downMonitors,
                degradedMonitors,
                overallUptime,
                ongoingIncidents,
                recentIncidents
            };
        } catch (error) {
            console.error('Error getting dashboard stats:', error);
            return {
                totalMonitors: 0,
                activeMonitors: 0,
                downMonitors: 0,
                degradedMonitors: 0,
                overallUptime: 0,
                ongoingIncidents: 0,
                recentIncidents: 0
            };
        }
    }
}

export default new StatsService();
