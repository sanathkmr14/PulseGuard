import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { adminAPI } from '../services/api';
import { jwtDecode } from 'jwt-decode'; // We might need to decode locally if no /me endpoint for admin exists yet

const AdminAuthContext = createContext();

export const useAdminAuth = () => {
    const context = useContext(AdminAuthContext);
    if (!context) {
        throw new Error('useAdminAuth must be used within AdminAuthProvider');
    }
    return context;
};

export const AdminAuthProvider = ({ children }) => {
    const [adminUser, setAdminUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Check if admin is logged in on mount
    useEffect(() => {
        const checkAuth = async () => {
            const token = localStorage.getItem('adminToken');
            if (token) {
                try {
                    // Try to decode token first to avoid unnecessary calls if expired
                    const decoded = jwtDecode(token);
                    if (decoded.exp * 1000 < Date.now()) {
                        throw new Error('Token expired');
                    }

                    // We don't have a dedicated /admin/auth/me endpoint yet, 
                    // but we can trust the decoded token or add an endpoint.
                    // For now, let's use the decoded user data + validity check
                    // Try to restore full user data from local storage
                    const cachedUser = localStorage.getItem('adminUserData');
                    if (cachedUser) {
                        setAdminUser(JSON.parse(cachedUser));
                    } else {
                        // Fallback to token data if cache missing (e.g. cleared storage)
                        setAdminUser({
                            _id: decoded.id,
                            role: 'admin',
                            name: 'Admin', // Placeholder
                            email: 'admin@pulseguard.com' // Placeholder
                        });
                    }

                } catch (err) {
                    console.error('Admin Auth Check Failed:', err);
                    localStorage.removeItem('adminToken');
                    localStorage.removeItem('adminUserData');
                    setAdminUser(null);
                }
            }
            setLoading(false);
        };

        checkAuth();
    }, []);

    const login = useCallback(async (credentials) => {
        try {
            setError(null);
            const response = await adminAPI.login(credentials);
            if (response.data.success) {
                const { token, ...userData } = response.data.data;
                localStorage.setItem('adminToken', token);
                localStorage.setItem('adminUserData', JSON.stringify(userData));
                setAdminUser(userData);
                return { success: true };
            }
            return { success: false, error: 'Login failed' };
        } catch (err) {
            const message = err.response?.data?.message || 'Login failed';
            setError(message);
            return { success: false, error: message };
        }
    }, []);

    const logout = useCallback(() => {
        localStorage.removeItem('adminToken');
        localStorage.removeItem('adminUserData');
        setAdminUser(null);
        // Force redirect handled by components
    }, []);

    const value = React.useMemo(() => ({
        adminUser,
        loading,
        error,
        login,
        logout,
        isAuthenticated: !!adminUser
    }), [adminUser, loading, error, login, logout]);

    return (
        <AdminAuthContext.Provider value={value}>
            {children}
        </AdminAuthContext.Provider>
    );
};

export default AdminAuthProvider;
