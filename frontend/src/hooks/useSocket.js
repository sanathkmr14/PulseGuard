import { useCallback, useEffect, useRef } from 'react';
import { useSocketContext } from '../context/SocketContext';

export const useSocket = () => {
    const { socket, connected } = useSocketContext();

    // Use ref to keep track of current socket instance for cleanup in callbacks
    const socketRef = useRef(socket);

    useEffect(() => {
        socketRef.current = socket;
    }, [socket]);

    // Subscribe pattern with automatic cleanup
    // Returns unsubscribe function
    const subscribe = useCallback((event, callback) => {
        const currentSocket = socketRef.current;
        if (currentSocket) {
            currentSocket.on(event, callback);
        }

        // Return cleanup function
        return () => {
            if (currentSocket) {
                currentSocket.off(event, callback);
            }
        };
    }, []);

    // Legacy 'on' method (manual cleanup required)
    const on = useCallback((event, callback) => {
        if (socketRef.current) {
            socketRef.current.on(event, callback);
        }
    }, []);

    const off = useCallback((event, callback) => {
        if (socketRef.current) {
            socketRef.current.off(event, callback);
        }
    }, []);

    const emit = useCallback((event, data) => {
        if (socketRef.current) {
            socketRef.current.emit(event, data);
        }
    }, []);

    return {
        socket,
        connected,
        subscribe,
        on,
        off,
        emit
    };
};

