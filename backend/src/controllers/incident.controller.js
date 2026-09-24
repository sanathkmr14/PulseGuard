import mongoose from 'mongoose';
import Incident from '../models/Incident.js';
import Monitor from '../models/Monitor.js';
import safeErrorMessage from '../utils/safe-error.js';

/**
 * Get all incidents for user's monitors
 */
export const getIncidents = async (req, res) => {
    try {
        const { page = 1, limit = 15, status } = req.query;
        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 15));
        const skip = (pageNum - 1) * limitNum;

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
            .skip(skip)
            .limit(limitNum);

        const [totalAll, ongoingCount, resolvedCount] = await Promise.all([
            Incident.countDocuments({ monitor: { $in: monitorIds } }),
            Incident.countDocuments({ monitor: { $in: monitorIds }, status: 'ongoing' }),
            Incident.countDocuments({ monitor: { $in: monitorIds }, status: 'resolved' })
        ]);

        const currentTotal = status === 'ongoing' ? ongoingCount : status === 'resolved' ? resolvedCount : totalAll;

        const validIncidents = incidents.filter(incident => incident.monitor !== null);

        res.json({
            success: true,
            count: validIncidents.length,
            data: validIncidents,
            counts: {
                all: totalAll,
                ongoing: ongoingCount,
                resolved: resolvedCount
            },
            pagination: {
                current: pageNum,
                pages: Math.ceil(currentTotal / limitNum) || 1,
                total: currentTotal
            }
        });
    } catch (error) {
        res.status(400).json({ success: false, message: safeErrorMessage(error) });
    }
};

/**
 * Get single incident
 */
export const getIncident = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, message: 'Invalid incident ID format' });
        }
        const incident = await Incident.findById(req.params.id)
            .populate('monitor', 'name url type user');

        if (!incident) {
            return res.status(404).json({ success: false, message: 'Incident not found' });
        }

        // [M4 SECURITY FIX] Guard against orphaned incidents (monitor was deleted) and allow admin access
        if (!incident.monitor || (incident.monitor.user.toString() !== req.user._id.toString() && req.user.role !== 'admin')) {
            return res.status(404).json({ success: false, message: 'Incident not found' });
        }

        res.json({ success: true, data: incident });
    } catch (error) {
        res.status(400).json({ success: false, message: safeErrorMessage(error) });
    }
};

/**
 * Get incidents for a specific monitor
 */
export const getMonitorIncidents = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.monitorId)) {
            return res.status(400).json({ success: false, message: 'Invalid monitor ID format' });
        }
        const monitor = await Monitor.findById(req.params.monitorId);

        if (!monitor) {
            return res.status(404).json({ success: false, message: 'Monitor not found' });
        }

        if (monitor.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(401).json({ success: false, message: 'Not authorized' });
        }

        const incidents = await Incident.find({ monitor: monitor._id }).sort({ startTime: -1 });

        res.json({
            success: true,
            count: incidents.length,
            data: incidents
        });
    } catch (error) {
        res.status(400).json({ success: false, message: safeErrorMessage(error) });
    }
};

/**
 * Get the active (ongoing) incident for a specific monitor
 */
export const getActiveMonitorIncident = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.monitorId)) {
            return res.status(400).json({ success: false, message: 'Invalid monitor ID format' });
        }
        const monitor = await Monitor.findById(req.params.monitorId);

        if (!monitor) {
            return res.status(404).json({ success: false, message: 'Monitor not found' });
        }

        if (monitor.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
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
        res.status(400).json({ success: false, message: safeErrorMessage(error) });
    }
};
