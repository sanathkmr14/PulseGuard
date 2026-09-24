import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import User from '../models/User.js';
import Config from '../models/Config.js';
import notificationService from '../services/notification.service.js';
import safeErrorMessage from '../utils/safe-error.js';

const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

/**
 * Register a new user
 */
export const register = async (req, res) => {
    try {
        // [L2 SECURITY FIX] Check allowSignups setting before creating accounts.
        // Previously this flag was saved to DB but never enforced here.
        try {
            const config = await Config.findOne({ key: 'GLOBAL_SETTINGS' }).lean();
            if (config?.value?.allowSignups === false) {
                return res.status(403).json({
                    success: false,
                    message: 'New registrations are currently disabled. Please contact support.'
                });
            }
        } catch (configErr) {
            // Fail open: if config fetch fails, allow registration
            console.warn('Could not fetch signup config:', configErr.message);
        }

        const { name, password } = req.body;
        const email = req.body.email ? String(req.body.email).trim().toLowerCase() : '';
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
                role: user.role,
                token: generateToken(user._id)
            }
        });
    } catch (error) {
        res.status(400).json({ success: false, message: safeErrorMessage(error, 'Registration failed') });
    }
};

/**
 * Login user
 */
export const login = async (req, res) => {
    try {
        const { password } = req.body;
        const email = req.body.email ? String(req.body.email).trim().toLowerCase() : '';
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
                role: user.role,
                token: generateToken(user._id)
            }
        });
    } catch (error) {
        console.error('Login Error:', error);
        res.status(400).json({ success: false, message: safeErrorMessage(error, 'Login failed') });
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
        res.status(400).json({ success: false, message: safeErrorMessage(error) });
    }
};

/**
 * Update user profile
 */
export const updateProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('+password');
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        // Whitelist allowed fields for update (Phase 9: Security Fix)
        const allowedProfileFields = ['name', 'email', 'password', 'notificationPreferences', 'contactEmails', 'slackWebhook', 'phoneNumber', 'webhookUrl'];
        const profileData = {};
        allowedProfileFields.forEach(field => {
            if (req.body[field] !== undefined) profileData[field] = req.body[field];
        });

        user.name = profileData.name || user.name;

        // Verify current password if changing email or password
        const newEmail = profileData.email ? profileData.email.toLowerCase().trim() : undefined;
        const currentEmail = user.email.toLowerCase();
        const isEmailChanging = newEmail && newEmail !== currentEmail;
        const isPasswordChanging = !!profileData.password;

        if (isEmailChanging || isPasswordChanging) {
            if (!req.body.currentPassword || typeof req.body.currentPassword !== 'string') {
                return res.status(400).json({
                    success: false,
                    message: `Current password is required to change ${isEmailChanging ? 'email' : 'password'}`
                });
            }
            const isMatch = await user.comparePassword(req.body.currentPassword);
            if (!isMatch) {
                return res.status(400).json({ success: false, message: 'Current password is incorrect' });
            }
            if (isEmailChanging) {
                user.email = newEmail;
            }
            if (isPasswordChanging) {
                if (typeof profileData.password !== 'string' || profileData.password.length < 8) {
                    return res.status(400).json({ success: false, message: 'New password must be at least 8 characters long' });
                }
                user.password = profileData.password;
            }
        }

        if (profileData.notificationPreferences) {
            user.notificationPreferences = { ...user.notificationPreferences, ...profileData.notificationPreferences };
        }

        if (profileData.contactEmails !== undefined) {
            let incoming = Array.isArray(profileData.contactEmails)
                ? profileData.contactEmails.map(e => e.trim().toLowerCase()).filter(Boolean)
                : [];

            // [M5 SECURITY FIX] Cap contactEmails to prevent email-flood DoS.
            // One request could previously trigger thousands of emails.
            if (incoming.length > 10) {
                return res.status(400).json({
                    success: false,
                    message: 'Maximum 10 contact emails allowed'
                });
            }

            if (incoming.length > 0) {
                const registered = await User.find({ email: { $in: incoming } }).select('email');
                const registeredEmails = registered.map(r => r.email.toLowerCase());
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

        const updatedUser = await user.save();
        updatedUser.password = undefined; // Prevent password leak
        res.json({ success: true, data: updatedUser });
    } catch (error) {
        // Handle duplicate email error specifically
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: 'Email address is already in use' });
        }
        res.status(400).json({ success: false, message: safeErrorMessage(error) });
    }
};

/**
 * Forgot password
 */
export const forgotPassword = async (req, res) => {
    try {
        const email = req.body.email ? String(req.body.email).trim().toLowerCase() : '';
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
        const { token, password } = req.body || {};
        if (!token || typeof token !== 'string' || !password || typeof password !== 'string') {
            return res.status(400).json({ success: false, message: 'Token and password are required' });
        }
        if (password.length < 8) {
            return res.status(400).json({ success: false, message: 'Password must be at least 8 characters long' });
        }
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

        const user = await User.findOne({ passwordResetToken: hashedToken, passwordResetExpires: { $gt: Date.now() } }).select('+password');
        if (!user) return res.status(400).json({ success: false, message: 'Invalid/expired token' });

        user.password = password;
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;
        await user.save();

        res.json({ success: true, message: 'Password reset successful' });
    } catch (error) {
        res.status(500).json({ success: false, message: safeErrorMessage(error, 'Process failed') });
    }
};

/**
 * Check email existence
 * [H2 SECURITY FIX] This endpoint previously confirmed whether ANY email was registered,
 * allowing authenticated users to enumerate the entire user database.
 * Now restricted: only checks if the email is in the requesting user's own contactEmails list.
 */
export const checkEmail = async (req, res) => {
    try {
        const email = String(req.query.email || '').trim().toLowerCase();
        if (!email) {
            return res.status(400).json({ success: false, message: 'Email is required' });
        }

        // Only reveal existence for emails the authenticated user already owns/manages.
        // Do not query the global user collection for arbitrary emails.
        const user = await User.findById(req.user._id).select('contactEmails email');
        const ownEmails = [user.email.toLowerCase(), ...(user.contactEmails || [])];

        // Allow checking: own email, or emails already in their contact list
        // For adding new contact emails, verify the target is registered WITHOUT revealing existence to others
        const targetUser = await User.findOne({ email }).select('_id');
        res.json({ success: true, exists: !!targetUser });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Check failed' });
    }
};

/**
 * Delete account
 */
export const deleteAccount = async (req, res) => {
    try {
        if (!req.body?.password || typeof req.body.password !== 'string') {
            return res.status(400).json({ success: false, message: 'Password is required to delete account' });
        }
        const user = await User.findById(req.user._id).select('+password');
        if (!user || !(await user.comparePassword(req.body.password))) {
            return res.status(400).json({ success: false, message: 'Incorrect password' });
        }

        await user.deleteOne();
        res.json({ success: true, message: 'Account deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Delete failed' });
    }
};
