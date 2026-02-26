import axios from 'axios';
import config from '../config';

const api = axios.create({
    baseURL: config.API_URL,
    headers: config.HEADERS
});

// Dedicated Admin API Instance (Isolated Session)
const adminInstance = axios.create({
    baseURL: config.API_URL,
    headers: config.HEADERS
});

// Add token to requests (User)
api.interceptors.request.use(
    (axiosConfig) => {
        const token = localStorage.getItem('token');
        if (token) {
            axiosConfig.headers.Authorization = `Bearer ${token}`;
        }
        return axiosConfig;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Admin Interceptor: Use 'adminToken' ONLY
adminInstance.interceptors.request.use(
    (axiosConfig) => {
        const token = localStorage.getItem('adminToken');
        if (token) {
            axiosConfig.headers.Authorization = `Bearer ${token}`;
        }
        return axiosConfig;
    },
    (error) => Promise.reject(error)
);

// Handle responses and errors (User)
api.interceptors.response.use(
    (response) => response,
    (error) => {
        // Handle auth errors - redirect to login if unauthorized or forbidden (banned)
        if (error.response?.status === 401 || error.response?.status === 403) {
            localStorage.removeItem('token');
            if (window.location.pathname !== '/login') {
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

// Handle responses and errors (Admin)
adminInstance.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('adminToken');
        }
        return Promise.reject(error);
    }
);

// Auth API
export const authAPI = {
    register: (data) => api.post('/auth/register', data),
    login: (data) => api.post('/auth/login', data),
    getMe: () => api.get('/auth/me'),
    updateProfile: (data) => api.put('/auth/profile', data),
    forgotPassword: (data) => api.post('/auth/forgot-password', data),
    resetPassword: (data) => api.post('/auth/reset-password', data),
    checkEmail: (email) => api.get('/auth/check-email', { params: { email } }),
    deleteAccount: (password) => api.delete('/auth/delete', { data: { password } })
};

// Monitor API
export const monitorAPI = {
    getAll: (params) => api.get('/monitors', { params }),
    getOne: (id) => api.get(`/monitors/${id}`),
    create: (data) => api.post('/monitors', data),
    update: (id, data) => api.put(`/monitors/${id}`, data),
    delete: (id) => api.delete(`/monitors/${id}`),
    getStats: (id) => api.get(`/monitors/${id}/stats`),
    getChecks: (id, params) => api.get(`/monitors/${id}/checks`, { params }),
    checkNow: (id) => api.post(`/monitors/${id}/check-now`),
    setAlertEmail: (id, data) => api.post(`/monitors/${id}/alert-email`, data),
    removeAlertEmail: (id) => api.delete(`/monitors/${id}/alert-email`),
    pause: (id) => api.put(`/monitors/${id}`, { isActive: false, status: 'paused' }),
    resume: (id) => api.put(`/monitors/${id}`, { isActive: true })
};

// Incident API
export const incidentAPI = {
    getAll: (params) => api.get('/incidents', { params }),
    getOne: (id) => api.get(`/incidents/${id}`),
    getByMonitor: (monitorId) => api.get(`/incidents/monitor/${monitorId}`),
    getActive: (monitorId) => api.get(`/incidents/active-monitor/${monitorId}`)
};

// Stats API
export const statsAPI = {
    getDashboardStats: () => api.get('/stats/dashboard'),
    getUptimeStats: (monitorId, period) => api.get(`/stats/uptime/${monitorId}?period=${period}`),
    getResponseTimeStats: (monitorId, period) => api.get(`/stats/response-time/${monitorId}?period=${period}`),
    getSystemConfig: () => api.get('/stats/config'),
};

// Admin API (Uses adminInstance)
export const adminAPI = {
    login: (credentials) => adminInstance.post('/admin/auth/login', credentials),
    getStats: (query = '') => adminInstance.get(`/admin/stats${query}`),
    getUsers: (search, limit, page) => adminInstance.get('/admin/users', { params: { search, limit, page } }),
    getUserDetails: (id) => adminInstance.get(`/admin/users/${id}`),
    getUserMonitors: (id, page = 1) => adminInstance.get(`/admin/users/${id}/monitors`, { params: { page } }),
    getUserIncidents: (id, page = 1) => adminInstance.get(`/admin/users/${id}/incidents`, { params: { page } }),
    impersonateUser: (id) => adminInstance.post(`/admin/users/${id}/impersonate`),
    toggleUserBan: (id) => adminInstance.put(`/admin/users/${id}/ban`),
    deleteUser: (id) => adminInstance.delete(`/admin/users/${id}`),
    // Trigger the public forgot-password flow for a user
    sendPasswordReset: (email) => api.post('/auth/forgot-password', { email }),
    getMonitorLogs: (id) => adminInstance.get(`/admin/monitors/${id}/logs`),
    getIncidents: (params) => adminInstance.get('/admin/incidents', { params }),
    getSystemHealth: () => adminInstance.get('/admin/stats/health'),
    // Dashboard
    getDashboardStats: (params) => adminInstance.get('/admin/stats', { params }), // supports ?userId=...

    // Settings
    getSettings: () => adminInstance.get('/admin/settings'),
    updateSettings: (data) => adminInstance.put('/admin/settings', data),
};

export default api;
