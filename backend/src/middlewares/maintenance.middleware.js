import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Config from '../models/Config.js';

/**
 * Maintenance Mode Middleware
 * Blocks access to all routes except authentication and admin endpoints
 * when the global maintenanceMode flag is active.
 */
export const maintenanceMode = async (req, res, next) => {
    try {
        // [M2 SECURITY FIX] Use req.path with exact matching and trailing slash normalization.
        // IMPORTANT: This middleware is mounted as app.use('/api/', maintenanceMode) in server.js,
        // so Express strips the '/api/' prefix from req.path. For a request to /api/auth/login,
        // req.path = '/auth/login' (NOT '/api/auth/login').
        const bypassRoutes = [
            '/auth/login',
            '/admin/auth/login',
            '/auth/me',
            '/auth/forgot-password',
            '/auth/reset-password',
            '/stats/config',
        ];

        const normalizedPath = (req.path || '').replace(/\/+$/, '') || '/';

        if (bypassRoutes.includes(normalizedPath)) {
            return next();
        }

        // 2. Optimization: Maintenance mode is infrequently changed. 
        // In a high-traffic system, we would cache this in Redis.
        // For now, we fetch from Config (Phase 11: Audit Fix).
        const config = await Config.findOne({ key: 'GLOBAL_SETTINGS' }).lean();

        if (config?.value?.maintenanceMode) {
            // 3. Allow admins to bypass maintenance mode
            if (req.user && req.user.role === 'admin') {
                return next();
            }

            // If token provided, authenticate admin early to allow bypass on non-admin routes
            if (req.headers.authorization?.startsWith('Bearer ')) {
                try {
                    const token = req.headers.authorization.split(' ')[1];
                    const decoded = jwt.verify(token, process.env.JWT_SECRET);
                    if (decoded?.id) {
                        const user = await User.findById(decoded.id).select('role isBanned');
                        if (user && !user.isBanned && user.role === 'admin') {
                            req.user = user;
                            return next();
                        }
                    }
                } catch {
                    // Ignore token errors here, downstream handlers will reject appropriately
                }
            }

            // If it's an admin route, we let it through (admin.routes.js has its own protection)
            if (req.originalUrl?.startsWith('/api/admin')) {
                return next();
            }

            return res.status(503).json({
                success: false,
                message: 'PulseGuard is currently undergoing maintenance. Most operations are temporarily disabled.',
                maintenance: true
            });
        }

        next();
    } catch (error) {
        // Fail Open: If we can't fetch config, don't bring down the whole system
        console.error('⚠️ Maintenance middleware error:', error.message);
        next();
    }
};

export default maintenanceMode;
