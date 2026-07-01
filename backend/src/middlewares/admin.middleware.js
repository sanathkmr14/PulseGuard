import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export const adminProtect = async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        return res.status(401).json({ success: false, message: 'Not authorized to access this route' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select('+passwordChangedAt');

        if (!user) {
            return res.status(401).json({ success: false, message: 'No user found with this id' });
        }

        if (user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Access denied: Admins only' });
        }

        // Check if admin is banned
        if (user.isBanned) {
            return res.status(403).json({ success: false, message: 'Your account has been banned. Please contact support.' });
        }

        // Check if admin recently changed password
        if (user.changedPasswordAfter(decoded.iat)) {
            return res.status(401).json({ success: false, message: 'User recently changed password! Please log in again.' });
        }

        req.user = user;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, message: 'Not authorized to access this route' });
    }
};
