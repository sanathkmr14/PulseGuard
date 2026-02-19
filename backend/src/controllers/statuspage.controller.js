import StatusPage from '../models/StatusPage.js';
import Monitor from '../models/Monitor.js';
import Check from '../models/Check.js';
import Incident from '../models/Incident.js';

/**
 * Get all status pages for logged in user
 */
export const getStatusPages = async (req, res) => {
    try {
        const statusPages = await StatusPage.find({ user: req.user._id })
            .populate('monitors', 'name url type status')
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            count: statusPages.length,
            data: statusPages
        });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

/**
 * Create new status page
 */
export const createStatusPage = async (req, res) => {
    try {
        const statusPage = await StatusPage.create({ ...req.body, user: req.user._id });
        res.status(201).json({ success: true, data: statusPage });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

/**
 * Get single status page
 */
export const getStatusPage = async (req, res) => {
    try {
        const statusPage = await StatusPage.findById(req.params.id)
            .populate('monitors', 'name url type status lastChecked lastResponseTime');

        if (!statusPage) {
            return res.status(404).json({ success: false, message: 'Status page not found' });
        }

        if (statusPage.user.toString() !== req.user._id.toString()) {
            return res.status(401).json({ success: false, message: 'Not authorized' });
        }

        res.json({ success: true, data: statusPage });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

/**
 * Update status page
 */
export const updateStatusPage = async (req, res) => {
    try {
        let statusPage = await StatusPage.findById(req.params.id);

        if (!statusPage) {
            return res.status(404).json({ success: false, message: 'Status page not found' });
        }

        if (statusPage.user.toString() !== req.user._id.toString()) {
            return res.status(401).json({ success: false, message: 'Not authorized' });
        }

        statusPage = await StatusPage.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        res.json({ success: true, data: statusPage });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

/**
 * Delete status page
 */
export const deleteStatusPage = async (req, res) => {
    try {
        const statusPage = await StatusPage.findById(req.params.id);

        if (!statusPage) {
            return res.status(404).json({ success: false, message: 'Status page not found' });
        }

        if (statusPage.user.toString() !== req.user._id.toString()) {
            return res.status(401).json({ success: false, message: 'Not authorized' });
        }

        await statusPage.deleteOne();
        res.json({ success: true, data: {} });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

/**
 * Get public status page by slug
 */
export const getPublicStatusPage = async (req, res) => {
    try {
        const statusPage = await StatusPage.findOne({ slug: req.params.slug })
            .populate('monitors', 'name url type status lastChecked lastResponseTime totalChecks successfulChecks');

        if (!statusPage) {
            return res.status(404).json({ success: false, message: 'Status page not found' });
        }

        if (!statusPage.isPublic) {
            return res.status(403).json({ success: false, message: 'This status page is private' });
        }

        const monitorIds = statusPage.monitors.map(m => m._id);
        const recentIncidents = await Incident.find({
            monitor: { $in: monitorIds },
            startTime: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        }).populate('monitor', 'name').sort({ startTime: -1 }).limit(10);

        const monitorsWithUptime = await Promise.all(
            statusPage.monitors.map(async (monitor) => {
                const uptimePercentage = monitor.totalChecks > 0
                    ? ((monitor.successfulChecks / monitor.totalChecks) * 100).toFixed(2)
                    : 100;

                const last90Days = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
                const checks = await Check.find({
                    monitor: monitor._id,
                    timestamp: { $gte: last90Days }
                }).sort({ timestamp: 1 });

                return {
                    ...monitor.toObject(),
                    uptimePercentage: parseFloat(uptimePercentage),
                    recentChecks: checks.slice(-90)
                };
            })
        );

        res.json({
            success: true,
            data: {
                name: statusPage.name,
                slug: statusPage.slug,
                branding: statusPage.branding,
                showUptime: statusPage.showUptime,
                showIncidents: statusPage.showIncidents,
                showResponseTime: statusPage.showResponseTime,
                monitors: monitorsWithUptime,
                recentIncidents: statusPage.showIncidents ? recentIncidents : []
            }
        });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};
