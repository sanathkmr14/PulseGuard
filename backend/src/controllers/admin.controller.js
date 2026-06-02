import User from '../models/User.js';
import Monitor from '../models/Monitor.js';
import Check from '../models/Check.js';
import Incident from '../models/Incident.js';
import schedulerService from '../services/scheduler.service.js';
import Config from '../models/Config.js';
import mongoose from 'mongoose';
import os from 'os';
import jwt from 'jsonwebtoken';
import enhancedAlertService from '../services/enhanced-alert.service.js';
import redisClient from '../config/redis-cache.js';

const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '12h' }); // Admin token 12h
};

// Helper: Escape Regex special characters for safe NoSQL search
const escapeRegex = (string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

// @desc    Admin Login
// @route   POST /api/admin/auth/login
// @access  Public
export const adminLogin = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email }).select('+password');

        if (!user || user.role !== 'admin' || !(await user.comparePassword(password))) {
            return res.status(401).json({ success: false, message: 'Invalid admin credentials' });
        }

        res.json({
            success: true,
            data: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                token: generateToken(user._id)
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get Dashboard Stats
// @route   GET /api/admin/stats
// @access  Admin
export const getDashboardStats = async (req, res) => {
    try {
        const { userId } = req.query;
        const cacheKey = userId ? `admin:stats:${userId}` : 'admin:stats:global';

        try {
            const cachedData = await redisClient.get(cacheKey);
            if (cachedData) {
                return res.json({
                    success: true,
                    data: JSON.parse(cachedData)
                });
            }
        } catch (cacheErr) {
            console.error('[Redis Cache Get Error]:', cacheErr.message);
        }

        let monitorFilter = {};
        let monitorUserFilter = {};

        // If filtering by user, we need to limit the scope of Incidents and Monitors
        if (userId) {
            const userMonitors = await Monitor.find({ user: userId }).select('_id');
            const monitorIds = userMonitors.map(m => m._id);
            monitorFilter = { monitor: { $in: monitorIds } };
            monitorUserFilter = { user: userId };
        }

        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        
        const matchStage = {};
        if (userId) {
            matchStage.user = new mongoose.Types.ObjectId(userId);
        }

        const last7Days = new Date();
        last7Days.setDate(last7Days.getDate() - 6);
        last7Days.setHours(0, 0, 0, 0);

        // Run all independent DB queries in parallel
        const [
            totalUsers,
            totalMonitors,
            activeMonitors,
            incidents24h,
            activeIncidents,
            growthStats,
            monitorDistribution,
            incidentsRaw,
            resolvedRaw,
            recentSignups,
            recentCriticalAlerts
        ] = await Promise.all([
            User.countDocuments({ role: 'user' }),
            Monitor.countDocuments(monitorUserFilter),
            Monitor.countDocuments({ isActive: true, ...monitorUserFilter }),
            Incident.countDocuments({
                createdAt: { $gte: oneDayAgo },
                ...monitorFilter
            }),
            Incident.countDocuments({
                status: 'ongoing',
                ...monitorFilter
            }),
            User.aggregate([
                { $match: { createdAt: { $gte: thirtyDaysAgo }, role: 'user' } },
                {
                    $group: {
                        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                        count: { $sum: 1 }
                    }
                },
                { $sort: { _id: 1 } }
            ]),
            Monitor.aggregate([
                { $match: matchStage },
                {
                    $group: {
                        _id: "$type",
                        count: { $sum: 1 }
                    }
                }
            ]),
            Incident.aggregate([
                {
                    $match: {
                        createdAt: { $gte: last7Days },
                        ...monitorFilter
                    }
                },
                {
                    $group: {
                        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                        count: { $sum: 1 }
                    }
                }
            ]),
            Incident.aggregate([
                {
                    $match: {
                        endTime: { $gte: last7Days },
                        status: 'resolved',
                        ...monitorFilter
                    }
                },
                {
                    $group: {
                        _id: { $dateToString: { format: "%Y-%m-%d", date: "$endTime" } },
                        count: { $sum: 1 }
                    }
                }
            ]),
            User.find({ role: 'user' })
                .sort({ createdAt: -1 })
                .limit(5)
                .select('name email createdAt'),
            Incident.find({ status: 'ongoing', ...monitorFilter })
                .sort({ createdAt: -1 })
                .limit(10)
                .populate({
                    path: 'monitor',
                    select: 'name type url user',
                    populate: {
                        path: 'user',
                        select: 'name email notificationPreferences'
                    }
                })
        ]);

        const systemHealth = activeIncidents === 0 ? 'Operational' : 'Degraded';

        // Merge and Format for Chart
        const systemActivity = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date();
            d.setDate(d.getDate() - (6 - i));
            const dateStr = d.toISOString().split('T')[0];
            const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });

            const incidentCount = incidentsRaw.find(r => r._id === dateStr)?.count || 0;
            const resolvedCount = resolvedRaw.find(r => r._id === dateStr)?.count || 0;

            systemActivity.push({
                name: dayName,
                date: dateStr,
                incidents: incidentCount,
                resolved: resolvedCount
            });
        }

        const responseData = {
            users: totalUsers,
            monitors: {
                total: totalMonitors,
                active: activeMonitors
            },
            incidents24h,
            activeIncidents,
            systemHealth,
            growthStats,
            monitorDistribution,
            systemActivity,
            recentSignups,
            recentCriticalAlerts
        };

        try {
            await redisClient.set(cacheKey, JSON.stringify(responseData), 'EX', 5);
        } catch (cacheErr) {
            console.error('[Redis Cache Set Error]:', cacheErr.message);
        }

        res.json({
            success: true,
            data: responseData
        });
    } catch (error) {
        console.error('Admin Stats Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get All Users
// @route   GET /api/admin/users
// @access  Admin
export const getUsers = async (req, res) => {
    try {
        const { search, limit = 50, page = 1 } = req.query;
        let query = { role: 'user' };

        if (search) {
            const escapedSearch = escapeRegex(search);
            query.$or = [
                { name: { $regex: escapedSearch, $options: 'i' } },
                { email: { $regex: escapedSearch, $options: 'i' } }
            ];
        }

        const limitVal = parseInt(limit) || 50;
        const pageVal = parseInt(page) || 1;
        const skipVal = (pageVal - 1) * limitVal;

        const users = await User.find(query)
            .select('-password')
            .sort('-createdAt')
            .skip(skipVal)
            .limit(limitVal);

        const total = await User.countDocuments(query);

        res.json({
            success: true,
            data: users,
            pagination: {
                current: pageVal,
                pages: Math.ceil(total / limitVal),
                total
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get User Details
// @route   GET /api/admin/users/:id
// @access  Admin
export const getUserDetails = async (req, res) => {
    try {
        const [user, monitors] = await Promise.all([
            User.findById(req.params.id).select('-password'),
            Monitor.find({ user: req.params.id }).sort('-createdAt')
        ]);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const incidents = await Incident.find({ monitor: { $in: monitors.map(m => m._id) } }).sort('-createdAt').limit(10);

        res.json({
            success: true,
            data: {
                user,
                monitors,
                recentIncidents: incidents
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Impersonate User (Login as User)
// @route   POST /api/admin/users/:id/impersonate
// @access  Admin
export const impersonateUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        // SECURITY: Audit log for impersonation
        console.log(`🔐 [AUDIT] Admin Impersonation: admin=${req.user._id} (${req.user.email}) impersonated user=${user._id} (${user.email}) at ${new Date().toISOString()}`);

        // Generate a standard user token for them
        const userToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

        res.json({
            success: true,
            data: {
                token: userToken,
                user: {
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role
                }
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Delete User
// @route   DELETE /api/admin/users/:id
// @access  Admin
export const deleteUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        // Trigger cascading delete (User model pre hook should wait for this)
        await user.deleteOne();

        res.json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Toggle User Ban Status
// @route   PUT /api/admin/users/:id/ban
// @access  Admin
export const toggleUserBan = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        if (user.role === 'admin') {
            return res.status(403).json({ success: false, message: 'Cannot ban an admin user' });
        }

        user.isBanned = !user.isBanned;
        await user.save();

        res.json({
            success: true,
            message: `User ${user.isBanned ? 'banned' : 'unbanned'} successfully`,
            data: { isBanned: user.isBanned }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get All Incidents with Filters
// @route   GET /api/admin/incidents
// @access  Admin
export const getIncidents = async (req, res) => {
    try {
        const { page = 1, limit = 50, search, status, sort } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        // Build Aggregation Pipeline
        const pipeline = [];

        // 1. Lookup Monitor
        pipeline.push({
            $lookup: {
                from: 'monitors',
                localField: 'monitor',
                foreignField: '_id',
                as: 'monitor'
            }
        });
        pipeline.push({ $unwind: { path: '$monitor', preserveNullAndEmptyArrays: true } });

        // 2. Lookup User
        pipeline.push({
            $lookup: {
                from: 'users',
                localField: 'monitor.user',
                foreignField: '_id',
                as: 'monitor.user'
            }
        });
        pipeline.push({ $unwind: { path: '$monitor.user', preserveNullAndEmptyArrays: true } });

        // 3. Match Filters
        const match = {};

        // Status Filter
        if (status && status !== 'all') {
            match.status = status;
        }

        // Search Filter (Monitor Name, URL, or User Name)
        if (search) {
            const escapedSearch = escapeRegex(search);
            match.$or = [
                { 'monitor.name': { $regex: escapedSearch, $options: 'i' } },
                { 'monitor.url': { $regex: escapedSearch, $options: 'i' } },
                { 'monitor.user.name': { $regex: escapedSearch, $options: 'i' } },
                { 'monitor.user.email': { $regex: escapedSearch, $options: 'i' } }
            ];
        }

        pipeline.push({ $match: match });

        // 4. Sort
        let sortStage = { createdAt: -1 }; // Default Newest First
        if (sort === 'oldest') sortStage = { createdAt: 1 };
        if (sort === 'duration_desc') sortStage = { duration: -1 };

        pipeline.push({ $sort: sortStage });

        // 5. Facet for Pagination
        pipeline.push({
            $facet: {
                data: [{ $skip: skip }, { $limit: limitNum }],
                total: [{ $count: 'count' }]
            }
        });

        const result = await Incident.aggregate(pipeline);

        const incidents = result[0].data;
        const total = result[0].total[0] ? result[0].total[0].count : 0;

        res.json({
            success: true,
            data: incidents,
            pagination: {
                total,
                pages: Math.ceil(total / limitNum),
                current: pageNum
            }
        });
    } catch (error) {
        console.error('Get Incidents Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get Check Logs for a Monitor
// @route   GET /api/admin/monitors/:id/logs
// @access  Admin
export const getMonitorLogs = async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`🔍 [Admin] Fetching logs for monitor: ${id}`);

        const logs = await Check.find({ monitor: id })
            .sort({ timestamp: -1 })
            .limit(50)
            .select('status statusCode responseTime timestamp errorMessage errorType');

        console.log(`   ✅ Found ${logs.length} logs for ${id}`);
        res.json({ success: true, data: logs });
    } catch (error) {
        console.error(`   ❌ Error fetching logs for ${req.params.id}:`, error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get User Monitors (Paginated)
// @route   GET /api/admin/users/:id/monitors
// @access  Admin
export const getUserMonitors = async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const pageNum = parseInt(page) || 1;
        const limitNum = parseInt(limit) || 20;
        const skip = (pageNum - 1) * limitNum;

        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const monitors = await Monitor.find({ user: user._id })
            .sort('-createdAt')
            .skip(skip)
            .limit(limitNum);

        const total = await Monitor.countDocuments({ user: user._id });

        res.json({
            success: true,
            data: monitors,
            pagination: {
                current: pageNum,
                pages: Math.ceil(total / limitNum),
                total
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get User Incidents (Paginated)
// @route   GET /api/admin/users/:id/incidents
// @access  Admin
export const getUserIncidents = async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const pageNum = parseInt(page) || 1;
        const limitNum = parseInt(limit) || 20;
        const skip = (pageNum - 1) * limitNum;

        const [user, monitors] = await Promise.all([
            User.findById(req.params.id),
            Monitor.find({ user: req.params.id }).select('_id')
        ]);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        // Find all monitor IDs for this user first
        const monitorIds = monitors.map(m => m._id);

        const [incidents, total] = await Promise.all([
            Incident.find({ monitor: { $in: monitorIds } })
                .sort('-createdAt')
                .skip(skip)
                .limit(limitNum)
                .populate('monitor', 'name url'),
            Incident.countDocuments({ monitor: { $in: monitorIds } })
        ]);

        res.json({
            success: true,
            data: incidents,
            pagination: {
                current: pageNum,
                pages: Math.ceil(total / limitNum),
                total
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get System Health (Real-time Infrastructure Stats)
// @route   GET /api/admin/health
// @access  Admin
export const getSystemHealth = async (req, res) => {
    try {
        const cacheKey = 'admin:system:health';
        try {
            const cachedData = await redisClient.get(cacheKey);
            if (cachedData) {
                return res.json({
                    success: true,
                    data: JSON.parse(cachedData)
                });
            }
        } catch (cacheErr) {
            console.error('[Redis Cache Get Error]:', cacheErr.message);
        }

        // 1. Database Stats (MongoDB)
        let dbStats = { collections: 0, indexes: 0, uptime: 0 };
        let dbStatus = 'Disconnected';

        if (mongoose.connection.readyState === 1) {
            dbStatus = 'Connected';
            const stats = await mongoose.connection.db.stats();
            dbStats = {
                collections: stats.collections,
                indexes: stats.indexes,
                uptime: Math.floor(process.uptime()) // Use process uptime as proxy if db uptime unavailable
            };
        }

        // 2. Queue Stats (BullMQ via Scheduler + Check collection for historical data)
        let queueStats = { active: 0, waiting: 0, completed: 0, failed: 0, jobsToday: 0, lastRun: null };
        let queueStatus = 'Unknown';

        try {
            if (schedulerService.queue) {
                const counts = await schedulerService.queue.getJobCounts('active', 'waiting', 'completed', 'failed');

                // Get jobs processed today from Check collection (more informative than BullMQ counts)
                const startOfDay = new Date();
                startOfDay.setHours(0, 0, 0, 0);

                const [jobsToday, lastCheck] = await Promise.all([
                    Check.countDocuments({ timestamp: { $gte: startOfDay } }),
                    Check.findOne().sort({ timestamp: -1 }).select('timestamp').lean()
                ]);

                queueStats = {
                    ...counts,
                    jobsToday,
                    lastRun: lastCheck?.timestamp || null
                };
                queueStatus = 'Operational';
            }
        } catch (e) {
            console.error('Queue stats error:', e);
            queueStatus = 'Degraded';
        }

        // 3. System/Host Stats (OS)
        const cpus = os.cpus();
        const freeMem = os.freemem();
        const totalMem = os.totalmem();
        const usedMem = totalMem - freeMem;

        const systemStats = {
            platform: os.platform(),
            nodeVersion: process.version,
            uptime: Math.floor(os.uptime()),
            memoryUsage: `${Math.round(usedMem / 1024 / 1024)}MB / ${Math.round(totalMem / 1024 / 1024)}MB`,
            cpuModel: cpus[0]?.model || 'Unknown',
            cpuCount: cpus.length
        };

        // 4. Worker Simulation (Single Node vs Cluster)
        // Switch to System Load Average for more meaningful "current" metric
        const loadAvg = os.loadavg()[0]; // 1-minute load average
        const cpuCount = cpus.length || 1;
        const loadPercentage = Math.round((loadAvg / cpuCount) * 100);

        const workerStats = {
            instances: 1,
            status: 'Running',
            cpuUsage: `${loadPercentage}% (System Load)`
        };

        const responseData = {
            database: {
                status: dbStatus,
                details: {
                    collections: dbStats.collections,
                    indexes: dbStats.indexes,
                    uptime: formatUptime(dbStats.uptime)
                }
            },
            queue: {
                status: queueStatus,
                details: queueStats
            },
            workers: {
                status: workerStats.status,
                details: {
                    instances: workerStats.instances,
                    cpuUsage: workerStats.cpuUsage,
                    memoryUsage: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`
                }
            },
            system: {
                status: 'Operational',
                details: {
                    platform: systemStats.platform,
                    nodeVersion: systemStats.nodeVersion,
                    uptime: formatUptime(systemStats.uptime)
                }
            },
            alerts: await enhancedAlertService.getAlertStatistics()
        };

        try {
            await redisClient.set(cacheKey, JSON.stringify(responseData), 'EX', 10);
        } catch (cacheErr) {
            console.error('[Redis Cache Set Error]:', cacheErr.message);
        }

        res.json({
            success: true,
            data: responseData
        });
    } catch (error) {
        console.error('System Health Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Helper: Format seconds to 1d 2h 3m
const formatUptime = (seconds) => {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
};

// @desc    Get System Settings
// @route   GET /api/admin/settings
// @access  Admin
export const getSettings = async (req, res) => {
    try {
        let config = await Config.findOne({ key: 'GLOBAL_SETTINGS' });

        // If no config exists yet, return defaults (and optionally create it)
        if (!config) {
            config = {
                value: {
                    maintenanceMode: false,
                    globalAlert: '',
                    allowSignups: true
                }
            };
        }

        res.json({
            success: true,
            data: config.value
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Update System Settings
// @route   PUT /api/admin/settings
// @access  Admin
export const updateSettings = async (req, res) => {
    try {
        const { maintenanceMode, globalAlert, allowSignups } = req.body;

        // Upsert (Update or Create if new)
        const config = await Config.findOneAndUpdate(
            { key: 'GLOBAL_SETTINGS' },
            {
                $set: {
                    value: {
                        maintenanceMode,
                        globalAlert,
                        allowSignups: allowSignups !== undefined ? allowSignups : true
                    },
                    updatedBy: req.user._id
                }
            },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );

        res.json({
            success: true,
            data: config.value,
            message: 'System settings updated successfully'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
