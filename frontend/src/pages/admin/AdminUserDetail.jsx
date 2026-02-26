import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { adminAPI } from '../../services/api';
import CheckLogsDrawer from '../../components/CheckLogsDrawer';
import ConfirmationModal from '../../components/ConfirmationModal';

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
    const [monitorsPagination, setMonitorsPagination] = useState({ current: 1, pages: 1, total: 0 });
    const [incidentsPage, setIncidentsPage] = useState(1);
    const [incidentsPagination, setIncidentsPagination] = useState({ current: 1, pages: 1, total: 0 });

    // Loading States
    const [monitorsLoading, setMonitorsLoading] = useState(false);
    const [incidentsLoading, setIncidentsLoading] = useState(false);

    // Logs Drawer State
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [selectedMonitor, setSelectedMonitor] = useState(null);
    const [monitorLogs, setMonitorLogs] = useState([]);

    // Modal State
    const [modal, setModal] = useState({
        isOpen: false,
        title: '',
        message: '',
        confirmText: 'Confirm',
        confirmColor: 'indigo',
        onConfirm: () => { }
    });

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

    // Fetch Monitors when tab is active or page changes
    useEffect(() => {
        if (activeTab === 'monitors' && user) {
            fetchMonitors(monitorsPage);
        }
    }, [activeTab, monitorsPage, user]);

    // Fetch Incidents when tab is active or page changes
    useEffect(() => {
        if (activeTab === 'incidents' && user) {
            fetchIncidents(incidentsPage);
        }
    }, [activeTab, incidentsPage, user]);

    const fetchMonitors = async (page) => {
        try {
            setMonitorsLoading(true);
            const res = await adminAPI.getUserMonitors(id, page);
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

    const fetchIncidents = async (page) => {
        try {
            setIncidentsLoading(true);
            const res = await adminAPI.getUserIncidents(id, page);
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
            confirmColor: 'indigo',
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
                    alert('Password reset instructions sent to user.');
                } catch (error) {
                    console.error('Reset trigger failed:', error);
                    alert('Failed to send reset email.');
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
        <div className="space-y-6">
            <button
                onClick={() => navigate('/admin/users')}
                className="flex items-center text-slate-400 hover:text-white transition-colors group"
            >
                <svg className="w-5 h-5 mr-2 transform group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Back to Users
            </button>
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-2xl p-6 sm:p-8">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                    <div className="flex items-center gap-5">
                        <div className="w-20 h-20 rounded-full bg-slate-700 flex items-center justify-center text-3xl font-bold text-white shadow-lg">
                            {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className="text-2xl font-bold text-white">{user.name}</h1>
                            </div>
                            <p className="text-slate-400 font-mono text-sm mb-1">{user.email}</p>
                            <p className="text-slate-500 text-xs">Joined: {new Date(user.createdAt).toLocaleDateString()}</p>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-3 w-full md:w-auto justify-start md:justify-end">
                        <button
                            onClick={handleImpersonate}
                            className="flex-1 min-w-[120px] md:flex-none px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-indigo-500/20"
                        >
                            Login as User
                        </button>
                        <button
                            onClick={handleResetPassword}
                            className="flex-1 min-w-[120px] md:flex-none px-4 py-2 bg-white hover:bg-slate-100 text-slate-900 rounded-lg text-sm font-medium transition-colors shadow-sm"
                        >
                            Reset Password
                        </button>
                        <button
                            onClick={handleBanToggle}
                            className={`flex-1 min-w-[120px] md:flex-none px-4 py-2 rounded-lg text-sm font-medium transition-colors ${user.isBanned
                                ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/20'
                                : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/20'
                                }`}
                        >
                            {user.isBanned ? 'Unban' : 'Ban'}
                        </button>
                        <button
                            onClick={handleDelete}
                            className="flex-1 min-w-[120px] md:flex-none px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-red-500/20"
                        >
                            Delete User
                        </button>
                    </div>

                </div>
            </div>

            <div className="bg-slate-800/30 border border-slate-700 rounded-2xl overflow-hidden">
                <div className="border-b border-slate-700 px-6">
                    <nav className="-mb-px flex space-x-8">
                        {['Monitors', 'Incidents'].map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab.toLowerCase())}
                                className={`
                                    py-4 px-1 border-b-2 font-medium text-sm transition-colors
                                    ${activeTab === tab.toLowerCase()
                                        ? 'border-indigo-500 text-indigo-400'
                                        : 'border-transparent text-slate-400 hover:text-slate-300 hover:border-slate-600'
                                    }
                                `}
                            >
                                {tab}
                            </button>
                        ))}
                    </nav>
                </div>

                <div className="p-6">
                    {activeTab === 'monitors' && (
                        <div>
                            {monitorsLoading ? (
                                <div className="text-center py-8 text-slate-500">Loading monitors...</div>
                            ) : (
                                <>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left">
                                            <thead className="text-xs uppercase text-slate-500 font-semibold bg-slate-800/50 rounded-lg">
                                                <tr>
                                                    <th className="px-4 py-3 rounded-l-lg">Monitor Name</th>
                                                    <th className="px-4 py-3">URL</th>
                                                    <th className="px-4 py-3">Status</th>
                                                    <th className="px-4 py-3">Last Check</th>
                                                    <th className="px-4 py-3 text-right rounded-r-lg">Action</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-700/50">
                                                {monitors.map(monitor => (
                                                    <tr key={monitor._id} className="group hover:bg-slate-800/30 transition-colors">
                                                        <td className="px-4 py-4 font-medium text-white">{monitor.name}</td>
                                                        <td className="px-4 py-4 text-slate-400 font-mono text-xs max-w-[200px] truncate">{monitor.url}</td>
                                                        <td className="px-4 py-4">
                                                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${!monitor.isActive ? 'bg-slate-700 text-slate-400' :
                                                                monitor.status === 'up' ? 'bg-emerald-500/10 text-emerald-500' :
                                                                    monitor.status === 'down' ? 'bg-red-500/10 text-red-500' :
                                                                        monitor.status === 'degraded' ? 'bg-amber-500/10 text-amber-500' :
                                                                            'bg-slate-700 text-slate-400'
                                                                }`}>
                                                                {!monitor.isActive ? 'PAUSED' : (monitor.status || 'UNKNOWN').toUpperCase()}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-4 text-slate-400 text-sm">
                                                            {monitor.lastChecked ? new Date(monitor.lastChecked).toLocaleString() : 'Never'}
                                                        </td>
                                                        <td className="px-4 py-4 text-right">
                                                            <button
                                                                onClick={() => handleViewLogs(monitor)}
                                                                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-300 text-xs rounded-md transition-colors"
                                                            >
                                                                View Logs
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                                {monitors.length === 0 && (
                                                    <tr>
                                                        <td colSpan="5" className="px-4 py-8 text-center text-slate-500">No monitors found for this user.</td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                    {/* Pagination Controls */}
                                    <div className="mt-4 pt-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
                                        <div className="text-sm text-slate-500">
                                            Page {monitorsPagination.current} of {monitorsPagination.pages} ({monitorsPagination.total} items)
                                        </div>
                                        <div className="flex gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                                            <button
                                                onClick={() => setMonitorsPage(old => Math.max(old - 1, 1))}
                                                disabled={monitorsPage === 1}
                                                className="flex-1 sm:flex-none justify-center px-4 py-2 sm:py-1 text-sm bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded border border-slate-700 transition-colors"
                                            >
                                                Previous
                                            </button>
                                            <button
                                                onClick={() => setMonitorsPage(old => Math.min(old + 1, monitorsPagination.pages))}
                                                disabled={monitorsPage === monitorsPagination.pages}
                                                className="flex-1 sm:flex-none justify-center px-4 py-2 sm:py-1 text-sm bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded border border-slate-700 transition-colors"
                                            >
                                                Next
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {activeTab === 'incidents' && (
                        <div>
                            {incidentsLoading ? (
                                <div className="text-center py-8 text-slate-500">Loading incidents...</div>
                            ) : (
                                <div className="space-y-4">
                                    {incidents.length > 0 ? (
                                        <>
                                            {incidents.map(inc => (
                                                <div key={inc._id} className="bg-slate-900/50 rounded-xl border border-slate-700/50 overflow-hidden">
                                                    <div className="p-4 border-b border-slate-800/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`p-2 rounded-lg ${inc.status === 'resolved' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={inc.status === 'resolved' ? "M5 13l4 4L19 7" : "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"} />
                                                                </svg>
                                                            </div>
                                                            <div>
                                                                <div className="flex items-center gap-2">
                                                                    <span className={`text-sm font-bold uppercase tracking-wider shrink-0 ${inc.status === 'resolved' ? 'text-emerald-400' : 'text-red-400'}`}>
                                                                        {inc.status}
                                                                    </span>
                                                                    <span className="text-slate-600 text-xs shrink-0">•</span>
                                                                    <span className="text-slate-300 font-medium text-sm break-all">
                                                                        {inc.monitor?.name || 'Unknown Monitor'} ({inc.monitor?.url || 'No URL'})
                                                                    </span>
                                                                </div>

                                                                <p className="text-xs text-slate-500 mt-0.5">
                                                                    Started: {new Date(inc.startTime).toLocaleString()}
                                                                    {inc.endTime && ` • Resolved: ${new Date(inc.endTime).toLocaleString()}`}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="text-xs text-slate-500 uppercase font-bold mb-1">Duration</p>
                                                            <p className="text-slate-300 font-mono text-sm">
                                                                {inc.duration
                                                                    ? `${Math.round(inc.duration / 1000)}s`
                                                                    : <span className="text-amber-400 animate-pulse">Ongoing</span>
                                                                }
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                            {/* Pagination Controls */}
                                            <div className="mt-4 pt-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
                                                <div className="text-sm text-slate-500">
                                                    Page {incidentsPagination.current} of {incidentsPagination.pages} ({incidentsPagination.total} items)
                                                </div>
                                                <div className="flex gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                                                    <button
                                                        onClick={() => setIncidentsPage(old => Math.max(old - 1, 1))}
                                                        disabled={incidentsPage === 1}
                                                        className="flex-1 sm:flex-none justify-center px-4 py-2 sm:py-1 text-sm bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded border border-slate-700 transition-colors"
                                                    >
                                                        Previous
                                                    </button>
                                                    <button
                                                        onClick={() => setIncidentsPage(old => Math.min(old + 1, incidentsPagination.pages))}
                                                        disabled={incidentsPage === incidentsPagination.pages}
                                                        className="flex-1 sm:flex-none justify-center px-4 py-2 sm:py-1 text-sm bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded border border-slate-700 transition-colors"
                                                    >
                                                        Next
                                                    </button>
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="text-center py-12 bg-slate-800/30 rounded-xl border border-dashed border-slate-700">
                                            <p className="text-slate-400">No incidents found.</p>
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
        </div>
    );
};

export default AdminUserDetail;
