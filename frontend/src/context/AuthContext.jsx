import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext();

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Check if user is logged in on mount
    useEffect(() => {
        const checkAuth = async () => {
            const token = localStorage.getItem('token');
            if (token) {
                const attemptAuth = async (retries = 2) => {
                    try {
                        const response = await authAPI.getMe();
                        setUser(response.data.data);
                    } catch (err) {
                        if (err.response?.status === 401) {
                            localStorage.removeItem('token');
                            setUser(null);
                        } else if (!err.response && retries > 0) {
                            console.warn(`Network error during auth check. Retrying... (${retries} attempts left)`);
                            await new Promise(resolve => setTimeout(resolve, 1000));
                            return attemptAuth(retries - 1);
                        } else {
                            console.error('Auth check failed:', err);
                        }
                    }
                };
                await attemptAuth();
            }
            setLoading(false);
        };

        checkAuth();
    }, []);

    const register = useCallback(async (userData) => {
        try {
            setError(null);
            const response = await authAPI.register(userData);
            const { token, ...userDataObj } = response.data.data;
            // Handle consistent user structure (some backends wrap in 'user' field)
            const finalUser = userDataObj.user || userDataObj;
            // Do not login automatically if preference is just to register
            // localStorage.setItem('token', token);
            // setUser(finalUser);
            return { success: true };
        } catch (err) {
            const message = err.response?.data?.message || 'Registration failed';
            setError(message);
            return { success: false, error: message };
        }
    }, []);

    const login = useCallback(async (credentials) => {
        try {
            setError(null);
            const response = await authAPI.login(credentials);
            const { token, ...user } = response.data.data;
            localStorage.setItem('token', token);
            // Ensure we use the same user data bridge if wrapped
            setUser(user.user || user);
            return { success: true, user: (user.user || user) };
        } catch (err) {
            const message = err.response?.data?.message || 'Login failed';
            setError(message);
            return { success: false, error: message };
        }
    }, []);

    const logout = useCallback(() => {
        localStorage.removeItem('token');
        setUser(null);
    }, []);

    const refreshUser = useCallback(async () => {
        try {
            setError(null);
            const response = await authAPI.getMe();
            setUser(response.data.data);
            return { success: true, user: response.data.data };
        } catch (err) {
            console.error('Failed to refresh user data:', err);
            const message = err.response?.data?.message || 'Failed to refresh user data';
            setError(message);
            return { success: false, error: message };
        }
    }, []);

    const updateProfile = useCallback(async (userData) => {
        try {
            setError(null);
            const response = await authAPI.updateProfile(userData);
            setUser(response.data.data);
            return { success: true, user: response.data.data };
        } catch (err) {
            const message = err.response?.data?.message || 'Update failed';
            setError(message);
            return { success: false, error: message };
        }
    }, []);

    const value = React.useMemo(() => ({
        user,
        loading,
        error,
        register,
        login,
        logout,
        updateProfile,
        refreshUser,
        isAuthenticated: !!user
    }), [user, loading, error, register, login, logout, updateProfile, refreshUser]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};
