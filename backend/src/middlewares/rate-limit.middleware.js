import rateLimit from 'express-rate-limit';

/**
 * Per-User Rate Limiter Middleware
 * Limits requests by user ID for authenticated users, preventing API abuse
 * even when users access from multiple IP addresses.
 */
export const userRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 300, // Limit each user to 300 requests per windowMs
    message: {
        success: false,
        message: 'Rate limit exceeded for your account. Please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Key by user ID only (skip handles unauthenticated)
    keyGenerator: (req) => {
        return `user_${req.user._id.toString()}`;
    },
    // Skip if user not authenticated (IP limiter in server.js handles it)
    skip: (req) => !req.user
});

/**
 * Stricter per-user rate limiter for resource-intensive operations
 * (e.g., check-now, create monitor)
 */
export const strictUserRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // Limit each user to 50 intensive operations per windowMs
    message: {
        success: false,
        message: 'Too many resource-intensive requests. Please wait before trying again.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        return `user_intensive_${req.user._id.toString()}`;
    },
    // Skip if user not authenticated
    skip: (req) => !req.user
});

export default userRateLimiter;


