import Config from '../models/Config.js';

/**
 * Maintenance Mode Middleware
 * Blocks access to all routes except authentication and admin endpoints
 * when the global maintenanceMode flag is active.
 */
export const maintenanceMode = async (req, res, next) => {
    try {
        // 1. Define routes that must ALWAYS be accessible (even in maintenance)
        const bypassRoutes = [
            '/api/auth/login',         // Standard login
            '/api/admin/auth/login',   // Admin login
            '/health'                  // Infrastructure health check
        ];

        if (bypassRoutes.some(route => req.originalUrl.startsWith(route))) {
            return next();
        }

        // 2. Optimization: Maintenance mode is infrequently changed. 
        // In a high-traffic system, we would cache this in Redis.
        // For now, we fetch from Config (Phase 11: Audit Fix).
        const config = await Config.findOne({ key: 'GLOBAL_SETTINGS' }).lean();

        if (config?.value?.maintenanceMode) {
            // 3. Allow admins to bypass maintenance mode
            // Note: This relies on the auth middleware running before this, 
            // BUT if we apply this globally in server.js, auth hasn't run yet.
            // We'll check for the admin role if req.user exists, 
            // or allow if the path is an admin path (isolation).

            if (req.user && req.user.role === 'admin') {
                return next();
            }

            // If it's an admin route, we let it through (admin.routes.js has its own protection)
            if (req.originalUrl.startsWith('/api/admin')) {
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
