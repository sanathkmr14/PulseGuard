import React, { createContext, useState, useEffect, useRef, useContext } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext();

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5010';

export const useSocketContext = () => {
    const context = useContext(SocketContext);
    if (!context) {
        throw new Error('useSocketContext must be used within a SocketProvider');
    }
    return context;
};

export const SocketProvider = ({ children }) => {
    const [socket, setSocket] = useState(null);
    const [connected, setConnected] = useState(false);
    const { user } = useAuth();

    // Use ref for stable socket reference
    const socketRef = useRef(null);

    // Keep ref in sync
    useEffect(() => {
        socketRef.current = socket;
    }, [socket]);

    useEffect(() => {
        // If no user, disconnect existing socket
        if (!user) {
            if (socketRef.current) {
                console.log('User logged out, disconnecting socket...');
                socketRef.current.disconnect();
                setSocket(null);
                setConnected(false);
            }
            return;
        }

        const token = localStorage.getItem('token');

        // If we have a socket but the token changed/refresh, we might need to reconnect?
        // For simplicity, we only connect if no socket exists.
        // A full reconnect on every token refresh might be overkill unless the server rejects the old one.
        // But for "Log in -> Log out -> Log in", this dependency on [user] is sufficient.

        // If user exists but no socket, or socket disconnected, connect
        if (!socketRef.current) {
            console.log('Initializing secure socket connection...');

            const newSocket = io(SOCKET_URL, {
                transports: ['websocket'],
                reconnection: true,
                reconnectionDelay: 1000,
                reconnectionAttempts: 5,
                // Phase 6: Authenticate handshake with JWT
                auth: { token }
            });

            newSocket.on('connect', () => {
                console.log('Secure Socket connected:', newSocket.id);
                setConnected(true);
                // Note: Room joining is handled automatically by server using JWT context
            });

            newSocket.on('connect_error', (error) => {
                console.error('Secure Socket connection error:', error.message);
                setConnected(false);
            });

            newSocket.on('disconnect', (reason) => {
                console.log('Secure Socket disconnected:', reason);
                setConnected(false);
            });

            setSocket(newSocket);
        }

        // Cleanup on unmount is tricky for a global provider. 
        // We generally want it to persist unless the App unmounts entirely.
        return () => {
            // Optional: Disconnect on unmount? 
            // Usually fine to leave it for the browser to close on tab close, 
            // but satisfying React strict mode:
            // if (socketRef.current) socketRef.current.disconnect();
        };
    }, [user]); // Re-run when user changes (login/logout)

    const value = {
        socket,
        connected
    };

    return (
        <SocketContext.Provider value={value}>
            {children}
        </SocketContext.Provider>
    );
};
