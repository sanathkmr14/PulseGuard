import { useCallback } from 'react';
import { useSocketContext } from '../context/SocketContext';

export const useSocket = () => {
    const { socket, connected } = useSocketContext();

    // Subscribe pattern with automatic cleanup
    // Returns unsubscribe function; updates when socket instance changes
    const subscribe = useCallback((event, callback) => {
        if (!socket) return () => {};

        socket.on(event, callback);

        // Return cleanup function
        return () => {
            socket.off(event, callback);
        };
    }, [socket]);

    // Legacy 'on' method (manual cleanup required)
    const on = useCallback((event, callback) => {
        if (socket) {
            socket.on(event, callback);
        }
    }, [socket]);

    const off = useCallback((event, callback) => {
        if (socket) {
            socket.off(event, callback);
        }
    }, [socket]);

    const emit = useCallback((event, data) => {
        if (socket) {
            socket.emit(event, data);
        }
    }, [socket]);

    return {
        socket,
        connected,
        subscribe,
        on,
        off,
        emit
    };
};

