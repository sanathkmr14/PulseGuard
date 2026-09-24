import { useState, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';

export const formatCompactTimeAgo = (date, addSuffix = true) => {
    if (!date) return 'Never';
    const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
    if (isNaN(d.getTime())) return 'Invalid date';

    const diffInSeconds = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));

    if (diffInSeconds < 5) return 'Just now';
    if (diffInSeconds < 60) return addSuffix ? `${diffInSeconds}s ago` : `${diffInSeconds}s`;

    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return addSuffix ? `${diffInMinutes}m ago` : `${diffInMinutes}m`;

    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return addSuffix ? `${diffInHours}h ago` : `${diffInHours}h`;

    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 30) return addSuffix ? `${diffInDays}d ago` : `${diffInDays}d`;

    const diffInMonths = Math.floor(diffInDays / 30);
    if (diffInMonths < 12) return addSuffix ? `${diffInMonths}mo ago` : `${diffInMonths}mo`;

    const diffInYears = Math.floor(diffInDays / 365);
    return addSuffix ? `${diffInYears}y ago` : `${diffInYears}y`;
};

const TimeAgo = ({ timestamp, addSuffix = true, compact = true }) => {
    // Force update functionality
    const [, setTick] = useState(0);

    useEffect(() => {
        // Determine smart interval based on how recent the timestamp is
        const calcInterval = () => {
            if (!timestamp) return 60000;
            const diffInSeconds = Math.abs((Date.now() - new Date(timestamp).getTime()) / 1000);

            if (diffInSeconds < 60) return 10000;     // Every 10s for recent checks (prevents constant re-render churn)
            if (diffInSeconds < 3600) return 30000;   // Every 30s if < 1 hour
            return 60000;                             // Every minute otherwise
        };

        const tick = () => setTick(t => t + 1);

        // Initial setup
        let intervalId = setInterval(tick, calcInterval());

        // Dynamic adjustment wrapper
        const outputInterval = setInterval(() => {
            // Re-evaluate interval preference dynamically
            const newDelay = calcInterval();
            clearInterval(intervalId);
            intervalId = setInterval(tick, newDelay);
        }, 30000); // Check every 30s if we should change our refresh rate

        return () => {
            clearInterval(intervalId);
            clearInterval(outputInterval);
        };
    }, [timestamp]);

    if (!timestamp) return <span>Never</span>;

    try {
        const date = new Date(timestamp);
        // Valid date check
        if (isNaN(date.getTime())) return <span>Invalid date</span>;

        const text = compact
            ? formatCompactTimeAgo(date, addSuffix)
            : formatDistanceToNow(date, { addSuffix, includeSeconds: true });

        return (
            <span title={date.toLocaleString()}>
                {text}
            </span>
        );
    } catch (e) {
        return <span>Unknown</span>;
    }
};

export default TimeAgo;
