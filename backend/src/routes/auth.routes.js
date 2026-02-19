import express from 'express';
import { protect } from '../middlewares/auth.middleware.js';
import {
    register,
    login,
    getMe,
    updateProfile,
    forgotPassword,
    resetPassword,
    checkEmail,
    deleteAccount
} from '../controllers/auth.controller.js';

const router = express.Router();
import rateLimit from 'express-rate-limit';

// Strict limiter for auth endpoints (5 attempts per 15 min)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { success: false, message: 'Too many login attempts, please try again after 15 minutes' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req, res) => process.env.NODE_ENV === 'test',
});

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.get('/me', protect, getMe);
router.put('/profile', protect, updateProfile);
router.post('/forgot-password', authLimiter, forgotPassword);
router.post('/reset-password', authLimiter, resetPassword);
router.get('/check-email', authLimiter, checkEmail);
router.delete('/delete', protect, deleteAccount);

export default router;
