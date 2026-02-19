import express from 'express';
import { protect } from '../middlewares/auth.middleware.js';
import {
    getStatusPages,
    createStatusPage,
    getStatusPage,
    updateStatusPage,
    deleteStatusPage,
    getPublicStatusPage
} from '../controllers/statuspage.controller.js';

const router = express.Router();

// Private routes
router.get('/', protect, getStatusPages);
router.post('/', protect, createStatusPage);
router.get('/:id', protect, getStatusPage);
router.put('/:id', protect, updateStatusPage);
router.delete('/:id', protect, deleteStatusPage);

// Public route
router.get('/public/:slug', getPublicStatusPage);

export default router;
