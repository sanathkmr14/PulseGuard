import { format, formatDistanceToNow, parseISO } from 'date-fns';

/**
 * Format a date string into a human-readable format.
 * @param {string} dateString - ISO date string
 * @param {string} formatStr - Desired format (default: 'MMM d, yyyy HH:mm:ss')
 * @returns {string} Formatted date
 */
export const formatDate = (dateString, formatStr = 'MMM d, yyyy HH:mm:ss') => {
    if (!dateString) return '-';
    try {
        const date = typeof dateString === 'string' ? parseISO(dateString) : dateString;
        return format(date, formatStr);
    } catch (error) {
        console.error('Error formatting date:', error);
        return dateString;
    }
};

/**
 * Get relative time from now (e.g., '5 minutes ago')
 * @param {string} dateString - ISO date string
 * @returns {string} Relative time
 */
export const formatRelativeTime = (dateString) => {
    if (!dateString) return '-';
    try {
        const date = typeof dateString === 'string' ? parseISO(dateString) : dateString;
        return formatDistanceToNow(date, { addSuffix: true });
    } catch (error) {
        console.error('Error formatting relative time:', error);
        return dateString;
    }
};

export default {
    formatDate,
    formatRelativeTime
};
