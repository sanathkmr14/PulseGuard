import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import User from '../models/User.js';
import notificationService from '../services/notification.service.js';

const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

/**
 * Register a new user
 */
export const register = async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const userExists = await User.findOne({ email });

        if (userExists) {
            return res.status(400).json({ success: false, message: 'User already exists' });
        }

        const user = await User.create({ name, email, password });
        res.status(201).json({
            success: true,
            data: {
                _id: user._id,
                name: user.name,
                email: user.email,
                token: generateToken(user._id)
            }
        });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

/**
 * Login user
 */
export const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email }).select('+password');

        if (!user || !(await user.comparePassword(password))) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        if (user.isBanned) {
            return res.status(403).json({ success: false, message: 'Your account has been banned. Please contact support.' });
        }

        res.json({
            success: true,
            data: {
                _id: user._id,
                name: user.name,
                email: user.email,
                token: generateToken(user._id)
            }
        });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

/**
 * Get current user
 */
export const getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        res.json({ success: true, data: user });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

/**
 * Update user profile
 */
export const updateProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('+password');
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        // SECURITY PATCH: Require current password ONLY for SENSITIVE changes
        // Use normalized lowercase comparison for email
        const newEmail = req.body.email ? req.body.email.toLowerCase().trim() : undefined;
        const currentEmail = user.email.toLowerCase();
        const isEmailChanging = newEmail && newEmail !== currentEmail;
        const isPasswordChanging = !!req.body.password;

        if (isEmailChanging || isPasswordChanging) {
            if (!req.body.currentPassword) {
                return res.status(400).json({
                    success: false,
                    message: `Current password is required to change ${isEmailChanging ? 'email' : 'password'}`
                });
            }
            // Verify current password
            const isMatch = await user.comparePassword(req.body.currentPassword);
            if (!isMatch) {
                return res.status(401).json({ success: false, message: 'Invalid current password' });
            }
        }

        // Whitelist allowed fields for update (Phase 9: Security Fix)
        const allowedProfileFields = ['name', 'email', 'password', 'notificationPreferences', 'contactEmails', 'slackWebhook', 'phoneNumber', 'webhookUrl'];
        const profileData = {};
        allowedProfileFields.forEach(field => {
            if (req.body[field] !== undefined) profileData[field] = req.body[field];
        });

        user.name = profileData.name || user.name;
        user.email = profileData.email || user.email;

        if (profileData.notificationPreferences) {
            user.notificationPreferences = { ...user.notificationPreferences, ...profileData.notificationPreferences };
        }

        if (profileData.contactEmails !== undefined) {
            let incoming = Array.isArray(profileData.contactEmails) ? profileData.contactEmails.map(e => e.trim()).filter(Boolean) : [];
            if (incoming.length > 0) {
                const registered = await User.find({ email: { $in: incoming } }).select('email');
                const registeredEmails = registered.map(r => r.email);
                if (incoming.some(e => !registeredEmails.includes(e))) {
                    return res.status(400).json({ success: false, message: 'Please add registered email ID.' });
                }
            }

            const previousEmails = user.contactEmails || [];
            const newEmails = incoming.filter(e => !previousEmails.includes(e));
            const removedEmails = previousEmails.filter(e => !incoming.includes(e));

            user.contactEmails = incoming;

            for (const email of newEmails) {
                await notificationService.sendEmail(email, 'Email Alerts Enabled - PulseGuard', notificationService.getContactEmailConfirmationHTML(email));
            }
            for (const email of removedEmails) {
                await notificationService.sendEmail(email, 'Email Alerts Disabled - PulseGuard', notificationService.getContactEmailRemovalHTML(email));
            }
        }

        user.slackWebhook = profileData.slackWebhook !== undefined ? profileData.slackWebhook : user.slackWebhook;
        user.phoneNumber = profileData.phoneNumber !== undefined ? profileData.phoneNumber : user.phoneNumber;
        user.webhookUrl = profileData.webhookUrl !== undefined ? profileData.webhookUrl : user.webhookUrl;
        if (profileData.password) user.password = profileData.password;

        const updatedUser = await user.save();
        updatedUser.password = undefined; // Prevent password leak
        res.json({ success: true, data: updatedUser });
    } catch (error) {
        // Handle duplicate email error specifically
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: 'Email address is already in use' });
        }
        res.status(400).json({ success: false, message: error.message });
    }
};

/**
 * Forgot password
 */
export const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });

        // SECURITY: Always return same generic response to prevent email enumeration
        // Do not reveal whether email exists in the system
        if (!user) {
            return res.json({ success: true, message: 'If a matching account exists, reset instructions have been sent' });
        }

        const resetToken = crypto.randomBytes(32).toString('hex');
        user.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
        user.passwordResetExpires = Date.now() + 3600000;
        await user.save({ validateBeforeSave: false });

        const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${resetToken}`;
        await notificationService.sendEmail(user.email, 'Reset your PulseGuard password', notificationService.getPasswordResetEmailHTML(user.name, resetUrl));

        res.json({ success: true, message: 'If a matching account exists, reset instructions have been sent' });
    } catch (error) {
        // SECURITY: Return same generic message even on error
        res.json({ success: true, message: 'If a matching account exists, reset instructions have been sent' });
    }
};

/**
 * Reset password
 */
export const resetPassword = async (req, res) => {
    try {
        const { token, password } = req.body;
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

        const user = await User.findOne({ passwordResetToken: hashedToken, passwordResetExpires: { $gt: Date.now() } }).select('+password');
        if (!user) return res.status(400).json({ success: false, message: 'Invalid/expired token' });

        user.password = password;
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;
        await user.save();

        res.json({ success: true, message: 'Password reset successful' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Process failed' });
    }
};

/**
 * Check email existence
 * NOTE: This endpoint is used by Settings to verify contact emails are registered.
 * Rate limiting should be applied at the route level to prevent enumeration attacks.
 */
export const checkEmail = async (req, res) => {
    try {
        // SECURITY: Cast to String to prevent NoSQL injection object attacks
        const email = String(req.query.email || '').trim();
        const user = await User.findOne({ email });
        res.json({ success: true, exists: !!user });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Check failed' });
    }
};

/**
 * Delete account
 */
export const deleteAccount = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('+password');
        if (!user || !(await user.comparePassword(req.body.password))) {
            return res.status(401).json({ success: false, message: 'Incorrect password or user not found' });
        }

        await user.deleteOne();
        res.json({ success: true, message: 'Account deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Delete failed' });
    }
};
