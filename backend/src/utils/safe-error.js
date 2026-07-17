/**
 * [H5 SECURITY FIX] Safe Error Response Utility
 *
 * In production, raw error.message can leak MongoDB internals, stack frames,
 * or connection details. This utility returns a generic message in production
 * and the real error only in development/test environments.
 *
 * @param {Error} error - The caught error
 * @param {string} [fallback='An unexpected error occurred'] - Generic fallback message
 * @returns {string} Safe message to send to clients
 */
export const safeErrorMessage = (error, fallback = 'An unexpected error occurred') => {
    if (process.env.NODE_ENV === 'production') {
        return fallback;
    }
    return error?.message || fallback;
};

export default safeErrorMessage;
