import express from 'express';
import { protect } from '../middlewares/auth.middleware.js';
import {
    getIncidents,
    getIncident,
    getMonitorIncidents,
    getActiveMonitorIncident
} from '../controllers/incident.controller.js';

const router = express.Router();

router.get('/', protect, getIncidents);
router.get('/active-monitor/:monitorId', protect, getActiveMonitorIncident);
router.get('/:id', protect, getIncident);
router.get('/monitor/:monitorId', protect, getMonitorIncidents);

export default router;
