import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import PrivateRoute from './components/PrivateRoute';
import ErrorBoundary from './components/ErrorBoundary';

// Pages
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import Monitors from './pages/Monitors';
import MonitorDetails from './pages/MonitorDetails';
import Incidents from './pages/Incidents';
import Settings from './pages/Settings';
import Profile from './pages/Profile';

// Admin Pages
import AdminLogin from './pages/admin/AdminLogin';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminUsers from './pages/admin/AdminUsers';
import AdminUserDetail from './pages/admin/AdminUserDetail';
import AdminIncidents from './pages/admin/AdminIncidents';
import AdminHealth from './pages/admin/AdminHealth';
import AdminSettings from './pages/admin/AdminSettings';
import AdminLayout from './layouts/AdminLayout';
import AdminRoute from './components/AdminRoute';
import { AdminAuthProvider } from './context/AdminAuthContext';

// Layout
import DashboardLayout from './layouts/DashboardLayout';



function App() {
    const { loading } = useAuth();

    if (loading) {
        return (
            <div className="loading-container" style={{ minHeight: '100vh' }}>
                <div className="spinner"></div>
            </div>
        );
    }

    return (
        <SocketProvider>
            <Routes>
                {/* Public Routes */}
                <Route path="/" element={<Landing />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />

                {/* Protected Routes */}
                <Route
                    path="/app"
                    element={
                        <PrivateRoute>
                            <DashboardLayout />
                        </PrivateRoute>
                    }
                >
                    <Route index element={<Navigate to="/app/dashboard" replace />} />
                    <Route path="dashboard" element={<Dashboard />} />
                    <Route path="monitors" element={<Monitors />} />
                    <Route path="monitors/:id" element={<MonitorDetails />} />
                    <Route path="incidents" element={<Incidents />} />
                    <Route path="settings" element={<Settings />} />
                    <Route path="profile" element={<Profile />} />
                </Route>

                {/* Admin Routes (Wrapped in Isolated Auth Provider) */}
                <Route path="/admin/*" element={
                    <ErrorBoundary>
                        <AdminAuthProvider>
                            <Routes>
                                <Route path="login" element={<AdminLogin />} />
                                <Route element={
                                    <AdminRoute>
                                        <AdminLayout />
                                    </AdminRoute>
                                }>
                                    <Route index element={<Navigate to="dashboard" replace />} />
                                    <Route path="dashboard" element={<AdminDashboard />} />
                                    <Route path="users" element={<AdminUsers />} />
                                    <Route path="users/:id" element={<AdminUserDetail />} />
                                    <Route path="incidents" element={<AdminIncidents />} />
                                    <Route path="health" element={<AdminHealth />} />
                                    <Route path="settings" element={<AdminSettings />} />
                                </Route>
                            </Routes>
                        </AdminAuthProvider>
                    </ErrorBoundary>
                } />

                {/* 404 */}
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </SocketProvider>
    );
}

export default App;
