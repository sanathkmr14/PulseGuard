import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import PrivateRoute from './components/PrivateRoute';
import ErrorBoundary from './components/ErrorBoundary';

// Lazy-loaded Pages
const Landing = lazy(() => import('./pages/Landing'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Monitors = lazy(() => import('./pages/Monitors'));
const MonitorDetails = lazy(() => import('./pages/MonitorDetails'));
const Incidents = lazy(() => import('./pages/Incidents'));
const Settings = lazy(() => import('./pages/Settings'));
const Profile = lazy(() => import('./pages/Profile'));

// Lazy-loaded Admin Pages
const AdminLogin = lazy(() => import('./pages/admin/AdminLogin'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'));
const AdminUserDetail = lazy(() => import('./pages/admin/AdminUserDetail'));
const AdminIncidents = lazy(() => import('./pages/admin/AdminIncidents'));
const AdminHealth = lazy(() => import('./pages/admin/AdminHealth'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'));
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
            <Suspense fallback={
                <div className="loading-container" style={{ minHeight: '100vh' }}>
                    <div className="spinner"></div>
                </div>
            }>
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
            </Suspense>
        </SocketProvider>
    );
}

export default App;
