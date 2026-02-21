import Incident from '../models/Incident.js';
import Monitor from '../models/Monitor.js';

/**
 * Get all incidents for user's monitors
 */
export const getIncidents = async (req, res) => {
    try {
        const { page = 1, limit = 15, status } = req.query;
        const skip = (page - 1) * limit;

        const monitors = await Monitor.find({ user: req.user._id });
        const monitorIds = monitors.map(m => m._id);

        // Build query
        const query = { monitor: { $in: monitorIds } };
        if (status && status !== 'all') {
            query.status = status;
        }

        const incidents = await Incident.find(query)
            .populate('monitor', 'name url type')
            .sort({ status: 1, startTime: -1 }) // Prioritize 'ongoing' over 'resolved', then by time
            .skip(parseInt(skip))
            .limit(parseInt(limit));

        const total = await Incident.countDocuments(query);

        const validIncidents = incidents.filter(incident => incident.monitor !== null);
        const orphanedCount = incidents.length - validIncidents.length;

        res.json({
            success: true,
            count: validIncidents.length,
            data: validIncidents,
            pagination: {
                current: parseInt(page),
                pages: Math.ceil(Math.max(0, total - orphanedCount) / limit),
                total: Math.max(0, total - orphanedCount)
            }
        });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

/**
 * Get single incident
 */
export const getIncident = async (req, res) => {
    try {
        const incident = await Incident.findById(req.params.id)
            .populate('monitor', 'name url type user');

        if (!incident) {
            return res.status(404).json({ success: false, message: 'Incident not found' });
        }

        if (incident.monitor.user.toString() !== req.user._id.toString()) {
            return res.status(401).json({ success: false, message: 'Not authorized' });
        }

        res.json({ success: true, data: incident });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

/**
 * Get incidents for a specific monitor
 */
export const getMonitorIncidents = async (req, res) => {
    try {
        const monitor = await Monitor.findById(req.params.monitorId);

        if (!monitor) {
            return res.status(404).json({ success: false, message: 'Monitor not found' });
        }

        if (monitor.user.toString() !== req.user._id.toString()) {
            return res.status(401).json({ success: false, message: 'Not authorized' });
        }

        const incidents = await Incident.find({ monitor: monitor._id }).sort({ startTime: -1 });

        res.json({
            success: true,
            count: incidents.length,
            data: incidents
        });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

/**
 * Get the active (ongoing) incident for a specific monitor
 */
export const getActiveMonitorIncident = async (req, res) => {
    try {
        const monitor = await Monitor.findById(req.params.monitorId);

        if (!monitor) {
            return res.status(404).json({ success: false, message: 'Monitor not found' });
        }

        if (monitor.user.toString() !== req.user._id.toString()) {
            return res.status(401).json({ success: false, message: 'Not authorized' });
        }

        const incident = await Incident.findOne({
            monitor: monitor._id,
            status: 'ongoing'
        }).sort({ startTime: -1 });

        res.json({
            success: true,
            data: incident
        });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};
