import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { adminAPI } from '../../services/api';
import CheckLogsDrawer from '../../components/CheckLogsDrawer';
import ConfirmationModal from '../../components/ConfirmationModal';
import AdminMonitorEditModal from '../../components/AdminMonitorEditModal';
import Pagination from '../../components/Pagination';
import Toast from '../../components/Toast';

const AdminUserDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('monitors');

    // Data States
    const [monitors, setMonitors] = useState([]);
    const [incidents, setIncidents] = useState([]);

    // Pagination States
    const [monitorsPage, setMonitorsPage] = useState(1);
    const [monitorsLimit, setMonitorsLimit] = useState(5);
    const [monitorsPagination, setMonitorsPagination] = useState({ current: 1, pages: 1, total: 0 });

    const [incidentsPage, setIncidentsPage] = useState(1);
    const [incidentsLimit, setIncidentsLimit] = useState(5);
    const [incidentsPagination, setIncidentsPagination] = useState({ current: 1, pages: 1, total: 0 });

    const handleMonitorsLimitChange = (newLimit) => {
        setMonitorsLimit(newLimit);
        setMonitorsPage(1);
    };

    const handleIncidentsLimitChange = (newLimit) => {
        setIncidentsLimit(newLimit);
        setIncidentsPage(1);
    };

    // Loading States
    const [monitorsLoading, setMonitorsLoading] = useState(false);
    const [incidentsLoading, setIncidentsLoading] = useState(false);

    // Logs Drawer State
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [selectedMonitor, setSelectedMonitor] = useState(null);
    const [monitorLogs, setMonitorLogs] = useState([]);

    // Edit Monitor State
    const [editModal, setEditModal] = useState({ isOpen: false, monitor: null });

    // Modal State
    const [modal, setModal] = useState({
        isOpen: false,
        title: '',
        message: '',
        confirmText: 'Confirm',
        confirmColor: 'blue',
        onConfirm: () => { }
    });

    const [notification, setNotification] = useState({ type: '', message: '' });

    const showNotification = (type, message) => {
        setNotification({ type, message });
        setTimeout(() => setNotification({ type: '', message: '' }), 4000);
    };

    const openModal = (config) => {
        setModal({ ...config, isOpen: true });
    };

    const closeModal = () => {
        setModal(prev => ({ ...prev, isOpen: false }));
    };

    // Initial User Fetch
    useEffect(() => {
        const fetchUser = async () => {
            try {
                const res = await adminAPI.getUserDetails(id);
                if (res.data.success) {
                    setUser(res.data.data.user);
                }
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        };
        fetchUser();
    }, [id]);

    // Fetch Monitors when tab is active or page/limit changes
    useEffect(() => {
        if (activeTab === 'monitors' && user) {
            fetchMonitors(monitorsPage, monitorsLimit);
        }
    }, [activeTab, monitorsPage, monitorsLimit, user]);

    // Fetch Incidents when tab is active or page/limit changes
    useEffect(() => {
        if (activeTab === 'incidents' && user) {
            fetchIncidents(incidentsPage, incidentsLimit);
        }
    }, [activeTab, incidentsPage, incidentsLimit, user]);

    const fetchMonitors = async (page = 1, limit = monitorsLimit) => {
        try {
            setMonitorsLoading(true);
            const res = await adminAPI.getUserMonitors(id, page, limit);
            if (res.data.success) {
                setMonitors(res.data.data);
                if (res.data.pagination) setMonitorsPagination(res.data.pagination);
            }
        } catch (error) {
            console.error('Failed to fetch monitors:', error);
        } finally {
            setMonitorsLoading(false);
        }
    };

    const fetchIncidents = async (page = 1, limit = incidentsLimit) => {
        try {
            setIncidentsLoading(true);
            const res = await adminAPI.getUserIncidents(id, page, limit);
            if (res.data.success) {
                setIncidents(res.data.data);
                if (res.data.pagination) setIncidentsPagination(res.data.pagination);
            }
        } catch (error) {
            console.error('Failed to fetch incidents:', error);
        } finally {
            setIncidentsLoading(false);
        }
    };

    const handleImpersonate = () => {
        openModal({
            title: 'Login as User',
            message: `Are you sure you want to log in as ${user.name}? You will be redirected to their dashboard.`,
            confirmText: 'Login',
            confirmColor: 'blue',
            onConfirm: async () => {
                try {
                    const res = await adminAPI.impersonateUser(user._id);
                    if (res.data.success) {
                        localStorage.setItem('token', res.data.data.token);
                        window.location.href = '/app/dashboard';
                    }
                } catch (error) {
                    console.error('Impersonation failed:', error);
                }
            }
        });
    };

    const handleResetPassword = () => {
        openModal({
            title: 'Reset Password',
            message: `Send password reset email to ${user.email}? They will receive a link to set a new password.`,
            confirmText: 'Send Email',
            confirmColor: 'amber',
            onConfirm: async () => {
                try {
                    await adminAPI.sendPasswordReset(user.email);
                    closeModal();
                    showNotification('success', 'Password reset instructions sent to user.');
                } catch (error) {
                    console.error('Reset trigger failed:', error);
                    showNotification('error', 'Failed to send reset email.');
                    closeModal();
                }
            }
        });
    };

    const handleBanToggle = () => {
        const action = user.isBanned ? 'Unban' : 'Ban';
        openModal({
            title: `${action} User`,
            message: `Are you sure you want to ${action.toLowerCase()} ${user.name}? ${user.isBanned ? 'They will regain access.' : 'They will lose access immediately.'}`,
            confirmText: action,
            confirmColor: user.isBanned ? 'emerald' : 'amber',
            onConfirm: async () => {
                try {
                    const res = await adminAPI.toggleUserBan(user._id);
                    if (res.data.success) {
                        setUser(prev => ({ ...prev, isBanned: res.data.data.isBanned }));
                        closeModal();
                    }
                } catch (error) {
                    console.error('Ban toggle failed:', error);
                    closeModal();
                }
            }
        });
    };

    const handleDelete = () => {
        openModal({
            title: 'Delete User',
            message: `CRITICAL WARNING: This will permanently delete ${user.name} and ALL their monitors. This action cannot be undone.`,
            confirmText: 'Delete Forever',
            confirmColor: 'red',
            onConfirm: async () => {
                try {
                    await adminAPI.deleteUser(user._id);
                    closeModal();
                    navigate('/admin/users');
                } catch (error) {
                    console.error('Delete failed:', error);
                    closeModal();
                }
            }
        });
    };

    const handleEditMonitor = (monitor) => {
        setEditModal({ isOpen: true, monitor });
    };

    const handleDeleteMonitor = (monitor) => {
        openModal({
            title: 'Delete Monitor',
            message: `CRITICAL WARNING: Are you sure you want to delete ${monitor.name}? All checks and incidents will be lost forever.`,
            confirmText: 'Delete Monitor',
            confirmColor: 'red',
            onConfirm: async () => {
                try {
                    await adminAPI.deleteMonitor(monitor._id);
                    closeModal();
                    showNotification('success', `Monitor "${monitor.name}" deleted successfully.`);
                    fetchMonitors(monitorsPage);
                } catch (error) {
                    console.error('Delete monitor failed:', error);
                    closeModal();
                    showNotification('error', error.response?.data?.message || 'Failed to delete monitor');
                }
            }
        });
    };

    const handleViewLogs = async (monitor) => {
        setSelectedMonitor(monitor);
        setDrawerOpen(true);
        fetchLogs(monitor._id);
    };

    const fetchLogs = async (monitorId) => {
        try {
            const res = await adminAPI.getMonitorLogs(monitorId);
            if (res.data.success) {
                setMonitorLogs(res.data.data);
            }
        } catch (error) {
            console.error('Failed to fetch logs:', error);
        }
    };

    useEffect(() => {
        let intervalId;
        if (drawerOpen && selectedMonitor) {
            fetchLogs(selectedMonitor._id);
            intervalId = setInterval(() => {
                fetchLogs(selectedMonitor._id);
            }, 3000);
        }
        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, [drawerOpen, selectedMonitor]);

    if (loading) return <div className="text-white text-center py-10">Loading profile...</div>;
    if (!user) return <div className="text-white text-center py-10">User not found</div>;

    return (
        <div className="space-y-4">
            <button
                onClick={() => navigate('/admin/users')}
                className="flex items-center text-slate-400 hover:text-white transition-colors group text-sm"
            >
                <svg className="w-4 h-4 mr-1.5 transform group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Back to Users
            </button>
            <div className="bg-slate-800/40 backdrop-blur-xl border border-slate-700/60 rounded-xl p-4 sm:px-5 sm:py-3.5 shadow-lg">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                        <div className="w-11 h-11 rounded-xl bg-blue-600 border border-blue-500/30 flex items-center justify-center text-lg font-bold text-white shadow-md shadow-blue-500/20 shrink-0">
                            {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <div className="flex items-center gap-2.5">
                                <h1 className="text-base sm:text-lg font-bold text-white">{user.name}</h1>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${user.isBanned
                                    ? 'bg-red-500/10 text-red-400 border-red-500/20'
                                    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                    }`}>
                                    {user.isBanned ? 'Banned' : 'Active'}
                                </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs mt-0.5">
                                <span className="text-slate-400 font-mono">{user.email}</span>
                                <span className="text-slate-600 hidden sm:inline">•</span>
                                <span className="text-slate-500">Joined: {new Date(user.createdAt).toLocaleDateString()}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-start md:justify-end">
                        <button
                            onClick={handleImpersonate}
                            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium transition-colors shadow-md shadow-blue-500/20 flex items-center gap-1.5"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                            </svg>
                            Login as User
                        </button>
                        <button
                            onClick={handleResetPassword}
                            className="px-3 py-1.5 bg-slate-700/80 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-600 rounded-lg text-xs font-medium transition-colors"
                        >
                            Reset Password
                        </button>
                        <button
                            onClick={handleBanToggle}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${user.isBanned
                                ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/20'
                                : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/20'
                                }`}
                        >
                            {user.isBanned ? 'Unban' : 'Ban'}
                        </button>
                        <button
                            onClick={handleDelete}
                            className="px-3 py-1.5 bg-red-600/90 hover:bg-red-600 text-white rounded-lg text-xs font-medium transition-colors shadow-md shadow-red-500/20"
                        >
                            Delete User
                        </button>
                    </div>

                </div>
            </div>

            <div className="bg-slate-800/40 backdrop-blur-xl border border-slate-700/60 rounded-xl overflow-hidden shadow-sm">
                <div className="border-b border-slate-700/50 px-4 sm:px-5">
                    <nav className="-mb-px flex space-x-6">
                        {['Monitors', 'Incidents'].map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab.toLowerCase())}
                                className={`
                                    py-2.5 sm:py-3 px-1 border-b-2 font-medium text-xs sm:text-sm transition-colors
                                    ${activeTab === tab.toLowerCase()
                                        ? 'border-blue-500 text-blue-400'
                                        : 'border-transparent text-slate-400 hover:text-slate-300 hover:border-slate-600'
                                    }
                                `}
                            >
                                {tab}
                            </button>
                        ))}
                    </nav>
                </div>

                <div className="p-4 sm:p-5">
                    {activeTab === 'monitors' && (
                        <div>
                            {monitorsLoading ? (
                                <div className="text-center py-8 text-slate-500 text-xs">Loading monitors...</div>
                            ) : (
                                <>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left text-xs text-slate-400">
                                            <thead className="bg-slate-900/50 text-[11px] uppercase font-semibold text-slate-400 border-b border-slate-700/40">
                                                <tr>
                                                    <th className="px-3.5 py-2.5">Monitor Name</th>
                                                    <th className="px-3.5 py-2.5">URL</th>
                                                    <th className="px-3.5 py-2.5">Status</th>
                                                    <th className="px-3.5 py-2.5">Last Check</th>
                                                    <th className="px-3.5 py-2.5 text-right">Action</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-700/40">
                                                {monitors.map(monitor => (
                                                    <tr key={monitor._id} className="group hover:bg-slate-700/25 transition-colors">
                                                        <td className="px-3.5 py-2.5 sm:py-3 font-medium text-white text-xs sm:text-sm">{monitor.name}</td>
                                                        <td className="px-3.5 py-2.5 sm:py-3 text-slate-400 font-mono text-[11px] max-w-[200px] truncate">{monitor.url}</td>
                                                        <td className="px-3.5 py-2.5 sm:py-3">
                                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${!monitor.isActive ? 'bg-slate-700/50 text-slate-400 border-slate-600/40' :
                                                                monitor.status === 'up' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                                                    monitor.status === 'down' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                                                                        monitor.status === 'degraded' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                                                                            'bg-slate-700/50 text-slate-400 border-slate-600/40'
                                                                }`}>
                                                                {!monitor.isActive ? 'PAUSED' : (monitor.status || 'UNKNOWN').toUpperCase()}
                                                            </span>
                                                        </td>
                                                        <td className="px-3.5 py-2.5 sm:py-3 text-slate-400 text-xs font-mono whitespace-nowrap">
                                                            {monitor.lastChecked ? new Date(monitor.lastChecked).toLocaleString() : 'Never'}
                                                        </td>
                                                        <td className="px-3.5 py-2.5 sm:py-3 text-right">
                                                            <div className="flex justify-end gap-1.5">
                                                                <button
                                                                    onClick={() => handleViewLogs(monitor)}
                                                                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-300 text-xs rounded transition-colors"
                                                                >
                                                                    View Logs
                                                                </button>
                                                                <button
                                                                    onClick={() => handleEditMonitor(monitor)}
                                                                    className="px-2.5 py-1 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-400 text-xs rounded transition-colors"
                                                                >
                                                                    Edit
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDeleteMonitor(monitor)}
                                                                    className="px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-xs rounded transition-colors"
                                                                >
                                                                    Delete
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                                {monitors.length === 0 && (
                                                    <tr>
                                                        <td colSpan="5" className="px-4 py-8 text-center text-slate-500 text-xs">No monitors found for this user.</td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                    {/* Numbered Pagination & Limit Selector */}
                                    {monitorsPagination.total > 0 && (
                                        <div className="-mx-4 -mb-4 sm:-mx-5 sm:-mb-5 mt-4 sm:mt-5 flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-2.5 border-t border-slate-700/50 bg-slate-900/40">
                                            <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
                                                <span>Per page:</span>
                                                <select
                                                    value={monitorsLimit}
                                                    onChange={(e) => handleMonitorsLimitChange(Number(e.target.value))}
                                                    className="bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-white font-mono text-[11px] focus:border-blue-500 outline-none cursor-pointer"
                                                >
                                                    <option value={5}>5</option>
                                                    <option value={10}>10</option>
                                                    <option value={20}>20</option>
                                                    <option value={50}>50</option>
                                                </select>
                                            </div>
                                            <Pagination
                                                currentPage={monitorsPagination.current}
                                                totalPages={monitorsPagination.pages}
                                                onPageChange={(p) => setMonitorsPage(p)}
                                                totalItems={monitorsPagination.total}
                                                itemName="monitors"
                                                compact={true}
                                                hideOnSinglePage={false}
                                                className="!border-0 !p-0"
                                            />
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {activeTab === 'incidents' && (
                        <div>
                            {incidentsLoading ? (
                                <div className="text-center py-8 text-slate-500 text-xs">Loading incidents...</div>
                            ) : (
                                <div className="space-y-3">
                                    {incidents.length > 0 ? (
                                        <>
                                            {incidents.map(inc => (
                                                <div key={inc._id} className="bg-slate-900/40 rounded-xl border border-slate-700/50 overflow-hidden">
                                                    <div className="p-3 sm:p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
                                                        <div className="flex items-center gap-2.5">
                                                            <div className={`p-1.5 rounded-lg shrink-0 ${inc.status === 'resolved' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={inc.status === 'resolved' ? "M5 13l4 4L19 7" : "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"} />
                                                                </svg>
                                                            </div>
                                                            <div>
                                                                <div className="flex items-center gap-2">
                                                                    <span className={`text-xs font-bold uppercase tracking-wider shrink-0 ${inc.status === 'resolved' ? 'text-emerald-400' : 'text-red-400'}`}>
                                                                        {inc.status}
                                                                    </span>
                                                                    <span className="text-slate-600 text-xs shrink-0">•</span>
                                                                    <span className="text-slate-300 font-medium text-xs sm:text-sm break-all">
                                                                        {inc.monitor?.name || 'Unknown Monitor'} ({inc.monitor?.url || 'No URL'})
                                                                    </span>
                                                                </div>

                                                                <p className="text-[11px] text-slate-500 mt-0.5 font-mono">
                                                                    Started: {new Date(inc.startTime).toLocaleString()}
                                                                    {inc.endTime && ` • Resolved: ${new Date(inc.endTime).toLocaleString()}`}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <div className="text-left md:text-right shrink-0">
                                                            <p className="text-[10px] text-slate-500 uppercase font-semibold mb-0.5">Duration</p>
                                                            <p className="text-slate-300 font-mono text-xs">
                                                                {inc.duration
                                                                    ? `${Math.round(inc.duration / 1000)}s`
                                                                    : <span className="text-amber-400 animate-pulse">Ongoing</span>
                                                                }
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                            {/* Numbered Pagination & Limit Selector */}
                                            {incidentsPagination.total > 0 && (
                                                <div className="-mx-4 -mb-4 sm:-mx-5 sm:-mb-5 mt-4 sm:mt-5 flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-2.5 border-t border-slate-700/50 bg-slate-900/40">
                                                    <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
                                                        <span>Per page:</span>
                                                        <select
                                                            value={incidentsLimit}
                                                            onChange={(e) => handleIncidentsLimitChange(Number(e.target.value))}
                                                            className="bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-white font-mono text-[11px] focus:border-blue-500 outline-none cursor-pointer"
                                                        >
                                                            <option value={5}>5</option>
                                                            <option value={10}>10</option>
                                                            <option value={20}>20</option>
                                                            <option value={50}>50</option>
                                                        </select>
                                                    </div>
                                                    <Pagination
                                                        currentPage={incidentsPagination.current}
                                                        totalPages={incidentsPagination.pages}
                                                        onPageChange={(p) => setIncidentsPage(p)}
                                                        totalItems={incidentsPagination.total}
                                                        itemName="incidents"
                                                        compact={true}
                                                        hideOnSinglePage={false}
                                                        className="!border-0 !p-0"
                                                    />
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <div className="text-center py-8 bg-slate-800/20 rounded-xl border border-dashed border-slate-700/60">
                                            <p className="text-slate-400 text-xs">No incidents found.</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <CheckLogsDrawer
                isOpen={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                monitorName={selectedMonitor?.name}
                logs={monitorLogs}
            />

            {/* Confirmation Modal */}
            <ConfirmationModal
                isOpen={modal.isOpen}
                onClose={closeModal}
                onConfirm={modal.onConfirm}
                title={modal.title}
                message={modal.message}
                confirmText={modal.confirmText}
                confirmColor={modal.confirmColor}
            />

            <AdminMonitorEditModal
                isOpen={editModal.isOpen}
                onClose={() => setEditModal({ isOpen: false, monitor: null })}
                monitor={editModal.monitor}
                onSuccess={() => fetchMonitors(monitorsPage)}
            />

            {/* Modern Bottom-Center Floating Toast Notification */}
            <Toast notification={notification} onClose={() => setNotification({ type: '', message: '' })} />

        </div>
    );
};

export default AdminUserDetail;
