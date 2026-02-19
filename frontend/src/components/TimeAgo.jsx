import { useState, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';

const TimeAgo = ({ timestamp, addSuffix = true }) => {
    // Force update functionality
    const [, setTick] = useState(0);

    useEffect(() => {
        // Determine smart interval based on how recent the timestamp is
        const calcInterval = () => {
            if (!timestamp) return 60000;
            const diffInSeconds = Math.abs((new Date() - new Date(timestamp)) / 1000);

            if (diffInSeconds < 60) return 1000;      // Every second if < 1 minute (shows "less than 5 seconds ago")
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

        return (
            <span title={date.toLocaleString()}>
                {formatDistanceToNow(date, { addSuffix, includeSeconds: true })}
            </span>
        );
    } catch (e) {
        return <span>Unknown</span>;
    }
};

export default TimeAgo;
