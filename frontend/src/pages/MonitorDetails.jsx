import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { monitorAPI, statsAPI, incidentAPI } from '../services/api';
import { swrCache } from '../services/cache';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useSocket } from '../hooks/useSocket';
import Pagination from '../components/Pagination';
import Toast from '../components/Toast';

const StatusBadge = ({ status, size = 'md' }) => {
    const styles = {
        up: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
        down: 'bg-red-500/20 text-red-400 border-red-500/30',
        degraded: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
        paused: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
        unknown: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    };
    const isSmall = size === 'sm';
    return (
        <span className={`inline-flex items-center gap-1.5 ${isSmall ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm'} font-semibold uppercase rounded-full border ${styles[status] || styles.unknown} whitespace-nowrap`}>
            <span className={`w-1.5 sm:w-2 h-1.5 sm:h-2 rounded-full animate-pulse-slow shrink-0 ${status === 'up' ? 'bg-emerald-400' : status === 'down' ? 'bg-red-400' : status === 'degraded' ? 'bg-amber-400' : 'bg-gray-400'}`} />
            {status}
        </span>
    );
};

const MonitorDetails = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();
    const { subscribe } = useSocket();

    const initialMonitor = location.state?.initialMonitor || swrCache.get(`monitor_${id}`) || null;
    const [monitor, setMonitor] = useState(initialMonitor);
    const [stats, setStats] = useState(null);
    const [checks, setChecks] = useState([]);
    const [checksPage, setChecksPage] = useState(1);
    const [checksPagination, setChecksPagination] = useState({ current: 1, pages: 1, total: 0 });
    const [activeIncident, setActiveIncident] = useState(null);
    const [responseData, setResponseData] = useState(null);
    const [loading, setLoading] = useState(!initialMonitor);
    const [fetchError, setFetchError] = useState(null);
    const [checking, setChecking] = useState(false);
    const [showEditForm, setShowEditForm] = useState(false);
    const [editFormData, setEditFormData] = useState({});
    const [deleteModal, setDeleteModal] = useState({ show: false, deleting: false, confirmText: '' });
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [notification, setNotification] = useState({ type: '', message: '' });
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [toggling, setToggling] = useState(false);
    const [selectedCheckId, setSelectedCheckId] = useState(null);
    const togglingIdsRef = useRef(new Set());

    // Use refs for instant (synchronous) access to latest values - avoids stale closures
    const lastToggleTimeRef = useRef(0);
    const TOGGLE_COOLDOWN = 500; // 500ms cooldown for faster response

    // Show notification toast
    const showNotification = (type, message) => {
        setNotification({ type, message });
        setTimeout(() => setNotification({ type: '', message: '' }), 4000);
    };

    // Handle monitor updates from socket
    const handleMonitorUpdate = useCallback((data = {}) => {
        const eventMonitorId = data.monitorId || data.monitor?._id || data.monitor || data.id;
        if (eventMonitorId && eventMonitorId !== id) return;
            // Ignore updates for monitors currently being toggled to prevent flickering
            if (togglingIdsRef.current.has(id)) return;
            setMonitor(prev => prev ? {
                ...prev,
                ...(data.status !== undefined ? { status: data.status } : {}),
                ...(data.lastChecked !== undefined ? { lastChecked: data.lastChecked } : {}),
                ...(data.lastResponseTime !== undefined ? { lastResponseTime: data.lastResponseTime } : {}),
                ...(data.isActive !== undefined ? { isActive: data.isActive } : (data.status === 'paused' ? { isActive: false } : {}))
            } : prev);
            if (data.check) {
                setChecks(prev => {
                    const existingIndex = prev.findIndex(c => c._id === data.check._id);
                    if (existingIndex !== -1) {
                        const updated = [...prev];
                        updated[existingIndex] = data.check;
                        return updated;
                    }
                    return [data.check, ...prev.slice(0, 49)];
                });
            }
            monitorAPI.getStats(id).then(r => {
                if (r.data?.data) setStats(r.data.data);
            }).catch(console.error);

            statsAPI.getResponseTimeStats(id, '24h').then(r => {
                if (r.data?.data) setResponseData(r.data.data);
            }).catch(console.error);

            // Fetch active incident if monitor is not up
            if (data.status !== 'up' && data.status !== 'paused') {
                incidentAPI.getActive(id).then(r => setActiveIncident(r.data.data)).catch(console.error);
            } else if (data.status) {
                setActiveIncident(null);
            } else {
                // Incident events without status: refresh active incident state
                incidentAPI.getActive(id).then(r => setActiveIncident(r.data.data)).catch(() => setActiveIncident(null));
            }
    }, [id]);

    useEffect(() => {
        // Reset state immediately when switching monitors to prevent showing previous monitor data
        const cached = location.state?.initialMonitor || swrCache.get(`monitor_${id}`);
        setMonitor(cached || null);
        setStats(null);
        setChecks([]);
        setActiveIncident(null);
        setResponseData(null);
        setLoading(!cached);
        setFetchError(null);
        setChecksPage(1);

        fetchData();
        // Use subscribe pattern for automatic cleanup
        const unsubs = [
            subscribe('monitor_update', handleMonitorUpdate),
            subscribe('monitor_status_change', handleMonitorUpdate),
            subscribe('incident_created', handleMonitorUpdate),
            subscribe('incident_resolved', handleMonitorUpdate)
        ];
        return () => unsubs.forEach(u => u && u());
    }, [id, subscribe, handleMonitorUpdate]);

    useEffect(() => {
        if (id) fetchChecks(checksPage);
    }, [checksPage, id]);

    // Background synchronization every 10s to guarantee real-time data
    useEffect(() => {
        if (!id) return;
        const intervalId = setInterval(() => {
            if (!checking) {
                monitorAPI.getStats(id).then(r => {
                    if (r.data?.data) setStats(r.data.data);
                }).catch(console.error);
                statsAPI.getResponseTimeStats(id, '24h').then(r => {
                    if (r.data?.data) setResponseData(r.data.data);
                }).catch(console.error);
                fetchChecks(checksPage);
            }
        }, 10000);
        return () => clearInterval(intervalId);
    }, [id, checking, checksPage]);



    const fetchData = async () => {
        const monitorId = id?.trim();
        if (!monitorId) {
            console.error('❌ DEBUG: No monitor ID provided in URL');
            setMonitor(null);
            setLoading(false);
            return;
        }

        try {
            const mRes = await monitorAPI.getOne(monitorId);

            if (!mRes.data || !mRes.data.data) {
                setMonitor(null);
                return;
            }

            setMonitor(mRes.data.data);
            swrCache.set(`monitor_${monitorId}`, mRes.data.data);

            const [sRes, rRes, iRes] = await Promise.allSettled([
                monitorAPI.getStats(monitorId),
                statsAPI.getResponseTimeStats(monitorId, '24h'),
                incidentAPI.getActive(monitorId)
            ]);

            if (sRes.status === 'fulfilled') setStats(sRes.value.data.data);
            if (rRes.status === 'fulfilled') setResponseData(rRes.value.data.data);
            if (iRes.status === 'fulfilled') setActiveIncident(iRes.value.data.data);

            // Fetch checks separately with pagination
            await fetchChecks(1);

        } catch (e) {
            setFetchError({
                status: e.response?.status || 'Error',
                message: e.response?.data?.message || e.message || 'Failed to load monitor details'
            });
            setMonitor(null);
        }
        finally { setLoading(false); }
    };

    const fetchChecks = async (page = checksPage) => {
        try {
            const res = await monitorAPI.getChecks(id, { page, limit: 10 });
            if (res.data.success) {
                setChecks(res.data.data);
                setChecksPagination({
                    current: res.data.page,
                    pages: res.data.pages,
                    total: res.data.total
                });
            }
        } catch (e) {
            console.error('Failed to fetch checks:', e);
        }
    };

    const handleManualRefresh = async () => {
        setIsRefreshing(true);
        try {
            await Promise.allSettled([
                fetchData(),
                fetchChecks(checksPage)
            ]);
        } catch (e) {
            console.error('Refresh failed:', e);
        } finally {
            setTimeout(() => setIsRefreshing(false), 500);
        }
    };

    const handleCheckNow = async () => {
        setChecking(true);
        try {
            await monitorAPI.checkNow(id);
            showNotification('success', 'Health check completed successfully!');
            await fetchData();
        } catch (e) {
            console.error('Check now error:', e);
            const errorMsg = e.response?.data?.message || e.message || 'Check failed';
            showNotification('error', errorMsg);
        } finally {
            setChecking(false);
        }
    };

    const handlePauseResume = async (e) => {
        e?.stopPropagation?.();
        e?.preventDefault?.();

        const now = Date.now();
        const isPausing = monitor.isActive !== false && monitor.status !== 'paused';

        // CRITICAL: Check debounce FIRST using refs (synchronous, no stale closures)
        // This prevents any state updates if user clicks too fast
        if (now - lastToggleTimeRef.current < TOGGLE_COOLDOWN || toggling) {
            return;
        }

        // Set processing state immediately to block subsequent clicks
        lastToggleTimeRef.current = now;
        setToggling(true);
        togglingIdsRef.current.add(id);

        // Optimistic Update: Update UI immediately before API call
        const previousMonitor = { ...monitor };

        setMonitor(prev => {
            const restoredStatus = prev?.latestCheck?.status || prev?._previousStatus || checks[0]?.status || (prev?.status !== 'paused' ? prev?.status : 'up');
            return {
                ...prev,
                isActive: !isPausing,
                status: isPausing ? 'paused' : restoredStatus,
                _previousStatus: isPausing ? prev?.status : prev?._previousStatus
            };
        });

        try {
            let res;
            if (isPausing) {
                res = await monitorAPI.pause(id);
            } else {
                res = await monitorAPI.resume(id);
            }

            if (res?.data?.data) {
                setMonitor(prev => ({ ...prev, ...res.data.data }));
            }
        } catch (error) {
            console.error('Toggle failed:', error);
            // Revert UI on failure
            setMonitor(previousMonitor);
            showNotification('error', error.response?.data?.message || 'Failed to toggle monitor status');
        } finally {
            // Clear toggling state from UI and refs immediately so incoming check results are accepted
            togglingIdsRef.current.delete(id);
            setToggling(false);
        }
    };

    const closeDeleteModal = () => {
        setDeleteModal({ show: false, deleting: false, confirmText: '' });
    };

    const confirmDelete = async () => {
        if (!monitor) return;
        const deletedName = monitor.name;
        setDeleteModal(prev => ({ ...prev, deleting: true }));
        try {
            await monitorAPI.delete(id);
            navigate('/app/monitors', { state: { message: `Monitor "${deletedName}" deleted successfully` } });
        } catch (e) {
            console.error('Delete failed:', e);
            showNotification('error', e.response?.data?.message || 'Failed to delete monitor');
            setDeleteModal(prev => ({ ...prev, deleting: false }));
        }
    };

    const handleEditSubmit = async (e) => {
        e.preventDefault();
        try {
            // Validate required fields
            if (!editFormData.name?.trim()) {
                showNotification('error', 'Monitor name is required');
                return;
            }
            if (!editFormData.url?.trim()) {
                showNotification('error', 'Valid URL or hostname is required');
                return;
            }
            if (!editFormData.type) {
                showNotification('error', 'Monitor protocol type is required');
                return;
            }
            if (!editFormData.interval || editFormData.interval < 1) {
                showNotification('error', 'Check interval must be at least 1 minute');
                return;
            }
            if (editFormData.timeout < 1000) {
                showNotification('error', 'Request timeout must be at least 1000ms');
                return;
            }

            const payload = { ...editFormData };
            if (payload.port === '' || payload.port === null) delete payload.port;
            else payload.port = Number(payload.port);
            if (payload.alertThreshold !== undefined && payload.alertThreshold !== '') payload.alertThreshold = Number(payload.alertThreshold);
            if (typeof payload.headers === 'string') {
                const h = payload.headers.trim();
                if (!h) delete payload.headers;
                else {
                    try {
                        payload.headers = JSON.parse(h);
                    } catch {
                        showNotification('error', 'Headers must be valid JSON format (e.g. {"Authorization":"Bearer ..."})');
                        return;
                    }
                }
            }

            const res = await monitorAPI.update(id, payload);

            // TRUST THE RESPONSE: Update local state immediately with the fresh data from the backend
            // This prevents a race condition where a subsequent fetchData() might retrieve stale data from the DB
            setMonitor(res.data.data);

            // Only re-fetch related data that might change due to config (e.g., stats thresholds)
            // But checking is async, so we don't need to fetch checks immediately
            monitorAPI.getStats(id).then(r => setStats(r.data.data)).catch(console.error);

            setShowEditForm(false);
            setShowAdvanced(false);
            showNotification('success', 'Monitor updated successfully');

            // Trigger a background refresh of checks closely after to catch the "Immediate Check"
            // This ensures we see the result of the new configuration soon
            const pollForUpdates = () => {
                // Fetch checks and stats
                monitorAPI.getChecks(id, { limit: 50 }).then(r => setChecks(r.data.data)).catch(console.error);
                monitorAPI.getStats(id).then(r => setStats(r.data.data)).catch(console.error);

                // CRITICAL: Fetch the monitor itself to update the STATUS (Green/Red badge)
                // This acts as a fallback if the socket event is missed or delayed
                monitorAPI.getOne(id).then(r => {
                    if (r.data?.data) {
                        setMonitor(prev => ({ ...prev, ...r.data.data }));
                    }
                }).catch(console.error);
            };

            // Poll at 2 seconds and again at 5 seconds to catch slow responses
            setTimeout(pollForUpdates, 2000);
            setTimeout(pollForUpdates, 5000);

        } catch (e) {
            console.error('Update error:', e);
            showNotification('error', e.response?.data?.message || e.message || 'Failed to update monitor');
        }
    };

    const openEditForm = () => {
        setEditFormData({
            name: monitor.name,
            type: monitor.type,
            url: monitor.url,
            port: monitor.port ?? '',
            alertThreshold: monitor.alertThreshold ?? 2,
            headers: monitor.headers ? JSON.stringify(monitor.headers instanceof Map ? Object.fromEntries(monitor.headers) : monitor.headers, null, 2) : '',
            interval: monitor.interval,
            timeout: monitor.timeout || 30000,
            degradedThresholdMs: monitor.degradedThresholdMs || 2000,
            sslExpiryThresholdDays: monitor.sslExpiryThresholdDays || 14
        });
        setShowAdvanced(false);
        setShowEditForm(true);
    };

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <div className="w-10 h-10 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        </div>
    );

    if (!monitor) return (
        <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
            <div className="w-16 h-16 bg-red-500/10 text-red-400 rounded-2xl flex items-center justify-center mb-4">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
            </div>
            {/* Debug UI removed */}
            <h2 className="text-xl font-bold text-white mb-2">Monitor not found</h2>
            <p className="text-gray-500 max-w-sm mb-8">
                The monitor you are looking for does not exist or you do not have permission to view it.
            </p>
            <div className="flex gap-3">
                <Link to="/app/monitors" className="px-5 py-2 bg-gray-800 hover:bg-gray-700 text-white font-medium text-xs rounded-lg transition-all">
                    Back to List
                </Link>
                <button onClick={() => { setLoading(true); fetchData(); }} className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs rounded-lg transition-all">
                    Try Again
                </button>
            </div>
        </div>
    );

    return (
        <div className="space-y-6">
            {/* Modern Bottom-Center Floating Toast Notification */}
            <Toast notification={notification} onClose={() => setNotification({ type: '', message: '' })} />


            {/* Header (Stable, zero layout shift) */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <Link to="/app/monitors" className="inline-flex items-center gap-1.5 text-blue-400 hover:text-blue-300 text-xs font-medium transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        <span>Back to Monitors</span>
                    </Link>
                    <button
                        onClick={handleManualRefresh}
                        disabled={isRefreshing}
                        className="px-2.5 py-1 bg-gray-800/60 hover:bg-gray-800 text-gray-300 hover:text-white rounded-lg text-xs font-medium border border-gray-700/50 transition-all flex items-center gap-1.5 shrink-0 disabled:opacity-60 cursor-pointer"
                        title="Refresh monitor details"
                    >
                        <svg className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-blue-400' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        <span>{isRefreshing ? 'Updating...' : 'Refresh'}</span>
                    </button>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                            <h1 className="text-xl sm:text-3xl font-bold text-white font-heading truncate">{monitor.name}</h1>
                            <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-[10px] sm:text-[11px] font-bold uppercase rounded-md border border-blue-500/20 font-mono shrink-0">
                                {monitor.type}
                            </span>
                        </div>
                        <p className="text-gray-400 truncate max-w-full sm:max-w-md font-mono text-xs">{monitor.url}</p>
                    </div>

                    <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 w-full sm:w-auto">
                        <button onClick={handleCheckNow}
                            disabled={checking || monitor.status === 'paused' || monitor.isActive === false}
                            title={monitor.status === 'paused' || monitor.isActive === false ? 'Cannot check a paused monitor' : 'Run health check now'}
                            className="px-3.5 py-2 sm:py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-sm shadow-blue-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 cursor-pointer">
                            {checking ? (
                                <>
                                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    <span>Checking...</span>
                                </>
                            ) : (
                                <>
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    <span>Check Now</span>
                                </>
                            )}
                        </button>
                        <button onClick={handlePauseResume}
                            className={`px-3.5 py-2 sm:py-1.5 rounded-lg active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 text-xs font-semibold border cursor-pointer ${monitor.status === 'paused' || monitor.isActive === false
                                ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/20'
                                : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/20'
                                }`}>

                            {monitor.status === 'paused' || monitor.isActive === false ? (
                                <>
                                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M8 5v14l11-7z" />
                                    </svg>
                                    <span>Resume</span>
                                </>
                            ) : (
                                <>
                                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                                    </svg>
                                    <span>Pause</span>
                                </>
                            )}
                        </button>
                        <button onClick={openEditForm}
                            className="px-3.5 py-2 sm:py-1.5 bg-gray-800/80 hover:bg-gray-700 active:scale-[0.98] text-white text-xs font-semibold rounded-lg border border-gray-700/50 transition-all flex items-center justify-center gap-1.5 cursor-pointer">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            <span>Edit</span>
                        </button>
                        <button onClick={() => setDeleteModal({ show: true, deleting: false, confirmText: '' })}
                            className="px-3.5 py-2 sm:py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-semibold rounded-lg border border-red-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            <span>Delete</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Edit Form Modal */}

            {showEditForm && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-[#12121a]/95 backdrop-blur-md border border-gray-800/90 rounded-xl p-4 sm:p-5 w-full max-w-md shadow-2xl animate-in max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-800/60">
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-blue-500" />
                                <h2 className="text-xs font-bold uppercase tracking-wider text-gray-200 font-heading">
                                    Edit Monitor
                                </h2>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowEditForm(false)}
                                className="text-gray-500 hover:text-gray-300 text-xs px-2 py-1 rounded hover:bg-gray-800/60 transition-colors"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleEditSubmit} className="space-y-3">
                            <div>
                                <label className="block text-[11px] font-medium text-gray-400 mb-1">Name</label>
                                <input
                                    type="text"
                                    required
                                    value={editFormData.name}
                                    onChange={e => setEditFormData({ ...editFormData, name: e.target.value })}
                                    className="w-full px-2.5 py-1.5 bg-[#0a0a0f] border border-gray-800 rounded-lg text-xs text-white focus:border-blue-500 outline-none transition-all"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-2.5">
                                <div>
                                    <label className="block text-[11px] font-medium text-gray-400 mb-1">Type</label>
                                    <select
                                        value={editFormData.type}
                                        onChange={e => setEditFormData({ ...editFormData, type: e.target.value })}
                                        className="w-full px-2.5 py-1.5 bg-[#0a0a0f] border border-gray-800 rounded-lg text-xs text-white focus:border-blue-500 outline-none"
                                    >
                                        {['HTTP', 'HTTPS', 'TCP', 'UDP', 'DNS', 'SMTP', 'SSL', 'PING'].map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[11px] font-medium text-gray-400 mb-1">Interval (min)</label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={editFormData.interval}
                                        onChange={e => setEditFormData({ ...editFormData, interval: +e.target.value })}
                                        className="w-full px-2.5 py-1.5 bg-[#0a0a0f] border border-gray-800 rounded-lg text-xs text-white focus:border-blue-500 outline-none"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-[11px] font-medium text-gray-400 mb-1">URL</label>
                                <input
                                    type="text"
                                    required
                                    value={editFormData.url}
                                    onChange={e => setEditFormData({ ...editFormData, url: e.target.value })}
                                    className="w-full px-2.5 py-1.5 bg-[#0a0a0f] border border-gray-800 rounded-lg text-xs text-white focus:border-blue-500 outline-none"
                                />
                            </div>

                            {/* Advanced Settings Toggle */}
                            <button
                                type="button"
                                onClick={() => setShowAdvanced(!showAdvanced)}
                                className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-blue-400 transition-colors pt-0.5"
                            >
                                <svg className={`w-3 h-3 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                                Advanced Settings
                            </button>

                            {/* Advanced Fields (Collapsed by default) */}
                            {showAdvanced && (
                                <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-gray-800/50">
                                    <div>
                                        <label className="block text-[11px] font-medium text-gray-400 mb-1">Port</label>
                                        <input
                                            type="number"
                                            min="1"
                                            max="65535"
                                            placeholder="e.g. 443"
                                            value={editFormData.port ?? ''}
                                            onChange={e => setEditFormData({ ...editFormData, port: e.target.value === '' ? '' : +e.target.value })}
                                            className="w-full px-2.5 py-1.5 bg-[#0a0a0f] border border-gray-800 rounded-lg text-xs text-white focus:border-blue-500 outline-none"
                                        />
                                        <p className="text-[10px] text-gray-600 mt-0.5">Required for TCP/UDP/SMTP</p>
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-medium text-gray-400 mb-1">Alert Threshold</label>
                                        <input
                                            type="number"
                                            min="1"
                                            max="20"
                                            value={editFormData.alertThreshold ?? 2}
                                            onChange={e => setEditFormData({ ...editFormData, alertThreshold: +e.target.value })}
                                            className="w-full px-2.5 py-1.5 bg-[#0a0a0f] border border-gray-800 rounded-lg text-xs text-white focus:border-blue-500 outline-none"
                                        />
                                        <p className="text-[10px] text-gray-600 mt-0.5">Consecutive failures before alert</p>
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-medium text-gray-400 mb-1">Timeout (ms)</label>
                                        <input
                                            type="number"
                                            min="1000"
                                            value={editFormData.timeout}
                                            onChange={e => setEditFormData({ ...editFormData, timeout: +e.target.value })}
                                            className="w-full px-2.5 py-1.5 bg-[#0a0a0f] border border-gray-800 rounded-lg text-xs text-white focus:border-blue-500 outline-none"
                                        />
                                        <p className="text-[10px] text-gray-600 mt-0.5">Max wait time before timeout</p>
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-medium text-gray-400 mb-1">Degraded Threshold (ms)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={editFormData.degradedThresholdMs}
                                            onChange={e => setEditFormData({ ...editFormData, degradedThresholdMs: +e.target.value })}
                                            className="w-full px-2.5 py-1.5 bg-[#0a0a0f] border border-gray-800 rounded-lg text-xs text-white focus:border-blue-500 outline-none"
                                        />
                                        <p className="text-[10px] text-gray-600 mt-0.5">Latency threshold for degraded</p>
                                    </div>
                                    {(editFormData.type === 'SSL' || editFormData.type === 'HTTPS') && (
                                        <div className="col-span-2">
                                            <label className="block text-[11px] font-medium text-gray-400 mb-1">SSL Expiry Alert (days)</label>
                                            <input
                                                type="number"
                                                min="1"
                                                max="365"
                                                value={editFormData.sslExpiryThresholdDays}
                                                onChange={e => setEditFormData({ ...editFormData, sslExpiryThresholdDays: +e.target.value })}
                                                className="w-full px-2.5 py-1.5 bg-[#0a0a0f] border border-gray-800 rounded-lg text-xs text-white focus:border-blue-500 outline-none"
                                            />
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-800/40">
                                <button
                                    type="button"
                                    onClick={() => setShowEditForm(false)}
                                    className="px-3 py-1.5 bg-gray-800/60 hover:bg-gray-800 text-gray-400 hover:text-white text-xs font-semibold rounded-lg transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 active:scale-[0.98] text-white text-xs font-semibold rounded-lg shadow-sm shadow-blue-500/20 transition-all"
                                >
                                    Save Changes
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Stats */}
            {(() => {
                const latestCheck = checks[0];
                const sslDays = latestCheck?.sslInfo?.daysRemaining ?? latestCheck?.sslInfo?.daysUntilExpiry ?? latestCheck?.meta?.daysUntilExpiry;
                const hasSsl = sslDays !== undefined && sslDays !== null;

                return (
                    <div className={`grid grid-cols-2 ${hasSsl ? 'sm:grid-cols-3 lg:grid-cols-5' : 'sm:grid-cols-2 lg:grid-cols-4'} gap-2.5 sm:gap-4`}>
                        <div className="bg-[#12121a]/90 backdrop-blur-md border border-gray-800/80 rounded-xl px-3 sm:px-4 py-3 sm:py-3.5 shadow-sm hover:border-gray-700 transition-all">
                            <p className="text-gray-400 text-xs font-medium mb-1.5 whitespace-nowrap">Status</p>
                            <StatusBadge status={monitor.status} />
                        </div>
                        <div className="bg-[#12121a]/90 backdrop-blur-md border border-gray-800/80 rounded-xl px-3 sm:px-4 py-3 sm:py-3.5 shadow-sm hover:border-emerald-500/30 transition-all">
                            <p className="text-gray-400 text-xs font-medium mb-1 whitespace-nowrap">Uptime</p>
                            <p className="text-lg sm:text-2xl font-bold font-heading text-emerald-400 whitespace-nowrap">
                                {stats?.uptimePercentage !== undefined && stats?.uptimePercentage !== null
                                    ? `${Number(stats.uptimePercentage).toFixed(2)}%`
                                    : '100.00%'}
                            </p>
                        </div>
                        <div className="bg-[#12121a]/90 backdrop-blur-md border border-gray-800/80 rounded-xl px-3 sm:px-4 py-3 sm:py-3.5 shadow-sm hover:border-blue-500/30 transition-all">
                            <p className="text-gray-400 text-xs font-medium mb-1 whitespace-nowrap">Avg Response</p>
                            <p className="text-lg sm:text-2xl font-bold font-heading text-blue-400 whitespace-nowrap">
                                {stats?.avgResponseTime !== undefined && stats?.avgResponseTime !== null
                                    ? `${stats.avgResponseTime}ms`
                                    : monitor.lastResponseTime ? `${monitor.lastResponseTime}ms` : '—'}
                            </p>
                        </div>
                        <div className="bg-[#12121a]/90 backdrop-blur-md border border-gray-800/80 rounded-xl px-3 sm:px-4 py-3 sm:py-3.5 shadow-sm hover:border-gray-700 transition-all">
                            <p className="text-gray-400 text-xs font-medium mb-1 whitespace-nowrap">Total Checks</p>
                            <p className="text-lg sm:text-2xl font-bold font-heading text-white whitespace-nowrap">
                                {(stats?.totalChecks ?? monitor.totalChecks ?? 0).toLocaleString()}
                            </p>
                        </div>

                        {/* SSL Expiry Card - Only show if data exists */}
                        {hasSsl && (() => {
                            let colorClass = 'text-emerald-400';
                            let borderClass = 'hover:border-emerald-500/30';

                            if (sslDays < 14) {
                                colorClass = 'text-red-400';
                                borderClass = 'hover:border-red-500/30';
                            } else if (sslDays < 30) {
                                colorClass = 'text-amber-400';
                                borderClass = 'hover:border-amber-500/30';
                            }

                            return (
                                <div className={`col-span-2 sm:col-span-1 bg-[#12121a]/90 backdrop-blur-md border border-gray-800/80 rounded-xl px-3 sm:px-4 py-3 sm:py-3.5 shadow-sm ${borderClass} transition-all flex sm:block items-center justify-between sm:justify-start`}>
                                    <p className="text-gray-400 text-xs font-medium sm:mb-1 whitespace-nowrap">SSL Expiry</p>
                                    <p className={`text-lg sm:text-2xl font-bold font-heading ${colorClass} whitespace-nowrap`}>
                                        {sslDays < 0 ? `Expired (${Math.abs(sslDays)}d ago)` : sslDays === 0 ? 'Expires Today' : `${sslDays} days`}
                                    </p>
                                </div>
                            );
                        })()}
                    </div>
                );
            })()}

            {/* Global Verification Analysis */}
            {(() => {
                const latestCheckWithVerifications = checks.find(c => c.verifications?.length > 0);

                // Prioritize sources that actually HAVE verification data
                // This fixes the "Stuck Loading" issue where activeIncident implies a failure but hasn't received verifications yet,
                // while the check object might have already received them via socket update.
                let forensicsSource = (selectedCheckId ? checks.find(c => c._id === selectedCheckId) : null);

                // FIX: When monitor is UP and no check is explicitly selected,
                // don't auto-display stale verification data from previous DOWN checks
                if (!forensicsSource && monitor.status !== 'up') {
                    if (activeIncident?.verifications?.length > 0) {
                        forensicsSource = activeIncident;
                    } else if (latestCheckWithVerifications) {
                        forensicsSource = latestCheckWithVerifications;
                    } else {
                        // Fallback to active incident (even if empty) to show "In Progress" status
                        forensicsSource = activeIncident || checks[0] || null;
                    }
                }
                const isUnhealthy = monitor.status === 'down' || monitor.status === 'degraded';
                const isSsrf = forensicsSource?.errorType === 'SSRF_BLOCKED' ||
                    (typeof forensicsSource?.errorMessage === 'string' && forensicsSource.errorMessage.includes('SSRF_PROTECTION')) ||
                    checks[0]?.errorType === 'SSRF_BLOCKED' ||
                    (typeof checks[0]?.errorMessage === 'string' && checks[0].errorMessage.includes('SSRF_PROTECTION'));

                if (isSsrf) {
                    return (
                        <div className="glass-panel border-amber-500/30 bg-amber-500/5 rounded-xl p-5 relative overflow-hidden shadow-xl mb-6">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-amber-500/20 rounded-lg text-amber-400 shrink-0">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                    </svg>
                                </div>
                                <div>
                                    <h2 className="text-base font-semibold text-white font-heading flex items-center gap-2">
                                        SSRF Protection Guard Active
                                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono font-medium">Security Policy</span>
                                    </h2>
                                    <p className="text-xs text-gray-300 mt-1">
                                        Requests to private, loopback, or internal network ranges are blocked by security policy to prevent Server-Side Request Forgery. External global verification is bypassed for local/private addresses.
                                    </p>
                                </div>
                            </div>
                        </div>
                    );
                }
                const hasVerifications = (forensicsSource?.verifications?.filter(v => v.location !== 'Local (Fallback)')?.length || 0) > 0;

                if (!hasVerifications) {
                    if (!isUnhealthy) return null;

                    // Only show pending state if check is recent (< 45 seconds) to avoid perpetual spinner
                    const latestTimestamp = forensicsSource?.timestamp || checks[0]?.timestamp;
                    const isRecent = latestTimestamp && (Date.now() - new Date(latestTimestamp).getTime() < 45000);
                    if (!isRecent) return null;

                    // Show pending state if unhealthy and check is actively running
                    return (
                        <div className="glass-panel border-blue-500/20 rounded-xl p-5 relative overflow-hidden animate-pulse">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-blue-500/20 rounded-lg text-blue-400">
                                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                </div>
                                <div>
                                    <h2 className="text-base font-semibold text-white font-heading">Global Verification In Progress</h2>
                                    <p className="text-xs text-gray-400">
                                        {monitor.status === 'down'
                                            ? 'Verifying status from 5 global regions to confirm failure...'
                                            : 'Verifying global performance consistency...'}
                                    </p>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                                {[1, 2, 3, 4, 5].map(i => (
                                    <div key={i} className="p-3 rounded-xl border border-gray-800/50 bg-gray-800/10 h-20 flex flex-col justify-center">
                                        <div className="w-12 h-2 bg-blue-500/20 rounded mb-2" />
                                        <div className="w-20 h-4 bg-gray-800/50 rounded" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                }

                const verifications = (forensicsSource?.verifications || []).filter(v => v.location !== 'Local (Fallback)');
                const isFromCheck = forensicsSource.timestamp !== undefined;

                return (
                    <div className="glass-panel border-red-500/20 rounded-xl p-5 relative overflow-hidden shadow-xl">
                        <div className="absolute top-0 right-0 p-3 opacity-10">
                            <svg className="w-20 h-20 text-red-500" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
                            </svg>
                        </div>
                        <div className="relative z-10">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-red-500/20 rounded-lg text-red-400">
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h2 className="text-base font-semibold text-white font-heading">Global Verification</h2>
                                        <p className="text-xs text-gray-400">
                                            {isFromCheck ? `Forensics for check at ${new Date(forensicsSource.timestamp).toLocaleString()}` : 'Real-time incident confirmation'}
                                        </p>
                                    </div>
                                </div>
                                {selectedCheckId && (
                                    <button onClick={() => setSelectedCheckId(null)} className="text-xs text-blue-400 hover:text-blue-300">
                                        Reset to latest
                                    </button>
                                )}
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                                {verifications.map((v, i) => {
                                    // Simplified Logic: 429 shows as OFFLINE (Red) now
                                    const statusColor = v.isUp ? 'text-emerald-400' : 'text-red-400';
                                    const glowClass = v.isUp ? 'glow-emerald' : 'glow-red shadow-[0_0_15px_rgba(239,68,68,0.1)]';
                                    const indicatorBg = v.isUp ? 'bg-emerald-500' : 'bg-red-500';
                                    const statusText = v.isUp ? 'ONLINE' : 'OFFLINE';

                                    return (
                                        <div key={i} className={`glass-card p-3 rounded-xl ${glowClass} cursor-pointer`}>
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider font-mono truncate mr-2" title={v.location}>{v.location}</span>
                                                <span className={`w-2 h-2 rounded-full ${indicatorBg}`} />
                                            </div>
                                            <p className={`text-sm font-bold font-heading ${statusColor}`}>
                                                {statusText}
                                            </p>
                                            <p className="text-[10px] text-gray-500 mt-0.5">{v.responseTime}ms latency</p>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Configuration Overview */}
            <div className="bg-[#12121a]/90 backdrop-blur-md border border-gray-800/80 rounded-xl p-4 sm:p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-white font-heading">Configuration Details</h2>
                    <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-[11px] font-bold uppercase rounded-md border border-blue-500/20 font-mono">
                        {monitor.type}
                    </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
                    <div>
                        <p className="text-gray-500 text-[10px] uppercase font-bold mb-0.5">Check Interval</p>
                        <p className="text-white text-xs sm:text-sm font-medium">{monitor.interval} minutes</p>
                    </div>
                    <div>
                        <p className="text-gray-500 text-[10px] uppercase font-bold mb-0.5">Timeout</p>
                        <p className="text-white text-xs sm:text-sm font-medium">{monitor.timeout || 30000}ms</p>
                    </div>
                    <div>
                        <p className="text-gray-500 text-[10px] uppercase font-bold mb-0.5">Degraded Threshold</p>
                        <p className="text-white text-xs sm:text-sm font-medium">{monitor.degradedThresholdMs || 2000}ms</p>
                    </div>
                    {(monitor.type === 'SSL' || monitor.type === 'HTTPS') && (
                        <div>
                            <p className="text-gray-500 text-[10px] uppercase font-bold mb-0.5">SSL Alert Window</p>
                            <p className="text-white text-xs sm:text-sm font-medium">{monitor.sslExpiryThresholdDays || 14} days</p>
                        </div>
                    )}
                    {monitor.port && (
                        <div>
                            <p className="text-gray-500 text-[10px] uppercase font-bold mb-0.5">Port</p>
                            <p className="text-white text-xs sm:text-sm font-medium font-mono">{monitor.port}</p>
                        </div>
                    )}
                    {monitor.method && (
                        <div>
                            <p className="text-gray-500 text-[10px] uppercase font-bold mb-0.5">HTTP Method</p>
                            <p className="text-white text-xs sm:text-sm font-medium font-mono">{monitor.method}</p>
                        </div>
                    )}
                    {monitor.expectedStatusCode && (
                        <div>
                            <p className="text-gray-500 text-[10px] uppercase font-bold mb-0.5">Expected Code</p>
                            <p className="text-white text-xs sm:text-sm font-medium font-mono">{monitor.expectedStatusCode}</p>
                        </div>
                    )}
                    <div>
                        <p className="text-gray-500 text-[10px] uppercase font-bold mb-0.5">Last Checked</p>
                        <p className="text-white text-xs sm:text-sm font-medium truncate">
                            {monitor.lastChecked ? new Date(monitor.lastChecked).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Never'}
                        </p>
                    </div>
                </div>
            </div>

            {/* Chart */}
            {responseData?.trend?.length > 0 && (
                <div className="bg-[#12121a]/90 backdrop-blur-md border border-gray-800/80 rounded-xl p-4 sm:p-5 shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-4">
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                            <h2 className="text-sm font-semibold text-white font-heading">Response Time (24h)</h2>
                        </div>
                        {responseData?.avgResponseTime && (
                            <span className="text-xs font-mono text-gray-400">
                                24h Avg: <strong className="text-blue-400 font-semibold">{Math.round(responseData.avgResponseTime)}ms</strong>
                            </span>
                        )}
                    </div>
                    <ResponsiveContainer width="100%" height={240}>
                        <AreaChart data={responseData.trend} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorAvg" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1f1f2e" vertical={false} />
                            <XAxis
                                dataKey="timestamp"
                                stroke="#4b5563"
                                minTickGap={45}
                                tick={{ fontSize: 11, fill: '#9ca3af' }}
                                tickFormatter={v => new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            />
                            <YAxis
                                stroke="#4b5563"
                                width={48}
                                tick={{ fontSize: 11, fill: '#9ca3af' }}
                                tickFormatter={v => `${v}ms`}
                            />
                            <Tooltip
                                contentStyle={{
                                    background: '#12121a',
                                    border: '1px solid #374151',
                                    borderRadius: '8px',
                                    color: '#fff',
                                    fontSize: '12px',
                                    boxShadow: '0 4px 20px rgba(0,0,0,0.6)'
                                }}
                                formatter={(value) => [`${Math.round(value)}ms`, 'Avg Latency']}
                                labelFormatter={(label) => new Date(label).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            />
                            <Area type="monotone" dataKey="avg" stroke="#3b82f6" strokeWidth={2} fill="url(#colorAvg)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* Checks Table & Mobile Feed */}
            <div className="glass-panel border-gray-800/50 rounded-xl overflow-hidden mb-20 shadow-xl">
                <div className="px-4 py-3 border-b border-gray-800/30 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <h2 className="text-sm font-semibold text-white font-heading">Recent Checks</h2>
                        {checksPagination.total > 0 && (
                            <span className="text-[11px] text-gray-400 font-mono">
                                ({checksPagination.total})
                            </span>
                        )}
                    </div>
                    <button
                        onClick={handleManualRefresh}
                        disabled={isRefreshing}
                        className="px-2 py-1 text-gray-400 hover:text-white hover:bg-gray-800/60 rounded border border-gray-800/60 transition-colors disabled:opacity-50 flex items-center gap-1.5 text-xs cursor-pointer"
                        title="Refresh checks"
                    >
                        <svg className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-blue-400' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        <span className="hidden sm:inline">{isRefreshing ? 'Updating...' : 'Refresh'}</span>
                    </button>
                </div>

                {/* Mobile View: Clean Card List (< md screens) */}
                <div className="md:hidden divide-y divide-gray-800/40">
                    {checks.length === 0 ? (
                        <div className="px-4 py-8 text-center text-xs text-gray-500 font-mono">
                            No check records yet. Click "Check Now" above to initiate a check.
                        </div>
                    ) : (
                        checks.map(c => (
                            <div key={c._id} className="p-3 hover:bg-gray-800/20 transition-colors space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <StatusBadge status={c.status} size="sm" />
                                        <span className={`text-[11px] font-mono font-bold px-1.5 py-0.5 rounded ${
                                            c.status === 'up' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                            c.status === 'degraded' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                                            'bg-red-500/10 text-red-400 border border-red-500/20'
                                        }`}>
                                            {c.statusCode ? `HTTP ${c.statusCode}` : (c.errorType || 'N/A')}
                                        </span>
                                    </div>
                                    <span className="text-xs font-mono font-semibold text-white bg-gray-800/80 px-2 py-0.5 rounded border border-gray-700/50 shrink-0">
                                        {c.responseTime ? `${c.responseTime}ms` : '—'}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between gap-2 text-[11px] text-gray-400">
                                    <span className="font-mono text-gray-400 truncate">
                                        {new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}, {new Date(c.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                    </span>
                                    <div className="truncate max-w-[50%] text-right font-medium shrink-0">
                                        {c.status === 'up' && (!c.errorType || c.errorType === 'SUCCESS' || c.errorType.includes('SUCCESS')) ? (
                                            <span className="text-emerald-400">✓ Healthy</span>
                                        ) : c.status === 'degraded' ? (
                                            <span className="text-amber-400 truncate">{c.errorMessage || c.degradationReasons?.[0] || 'Slow'}</span>
                                        ) : (
                                            <span className="text-red-400 truncate">{c.errorMessage || c.errorType || 'Failed'}</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Desktop View: Full Table (md and above) */}
                <div className="hidden md:block overflow-x-auto">
                    <table className="w-full min-w-[600px]">
                        <thead className="bg-[#0a0a0f]">
                            <tr>
                                {['Time', 'Status', 'Response', 'Code', 'Details'].map(h => (
                                    <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800/30">
                            {checks.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-4 py-8 text-center text-xs text-gray-500 font-mono">
                                        No check records yet. Click "Check Now" above to initiate a check.
                                    </td>
                                </tr>
                            ) : (
                                checks.map(c => (
                                    <tr key={c._id} className="hover:bg-gray-800/20 transition-colors">
                                        <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">{new Date(c.timestamp).toLocaleString()}</td>
                                        <td className="px-4 py-2.5">
                                            <StatusBadge status={c.status} />
                                        </td>
                                        <td className="px-4 py-2.5 text-xs font-medium text-white whitespace-nowrap">{c.responseTime ? `${c.responseTime}ms` : '—'}</td>
                                        <td className="px-4 py-2.5">
                                            <span className={`text-xs font-mono font-semibold ${c.status === 'up' ? 'text-emerald-400' : c.status === 'degraded' ? 'text-amber-400' : 'text-red-400'}`}>
                                                {c.statusCode || 'N/A'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2.5 text-xs">
                                            {c.status === 'up' && (!c.errorType || c.errorType === 'SUCCESS' || c.errorType.includes('SUCCESS')) ? (
                                                <span className="text-emerald-400 font-medium">✓ OK</span>
                                            ) : c.status === 'degraded' && (c.errorType === 'SLOW_RESPONSE' || c.errorType === 'HIGH_LATENCY' || c.errorType === 'HIGH_PING_LATENCY') ? (
                                                <span className="text-amber-400 font-medium">✓ Slow</span>
                                            ) : (
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    {c.errorType && (
                                                        <span className={`px-1.5 py-0.2 text-[10px] font-mono font-semibold rounded ${c.status === 'degraded' ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400'}`}>
                                                            {c.errorType}
                                                        </span>
                                                    )}
                                                    {(c.errorMessage || (c.degradationReasons && c.degradationReasons[0])) && (
                                                        <span className={`${c.status === 'degraded' ? 'text-amber-400' : 'text-red-400'} text-xs font-mono`} title={c.errorMessage || c.degradationReasons[0]}>
                                                            {c.errorMessage || c.degradationReasons[0]}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
                <div className="border-t border-gray-800/40 bg-[#0d0d14]/40">
                    <div className="flex flex-col gap-2 p-3 sm:hidden">
                        <div className="text-[11px] text-gray-400 font-mono text-center">
                            Page <span className="font-semibold text-white">{checksPage}</span> of{' '}
                            <span className="font-semibold text-white">{checksPagination.pages}</span>
                            {checksPagination.total !== undefined && checksPagination.total !== null && (
                                <span className="text-gray-500 ml-1">
                                    ({checksPagination.total} total)
                                </span>
                            )}
                        </div>
                        <div className="w-full flex items-center justify-center">
                            <Pagination
                                currentPage={checksPage}
                                totalPages={checksPagination.pages}
                                onPageChange={(p) => setChecksPage(p)}
                                totalItems={checksPagination.total}
                                itemName="checks"
                                compact={true}
                                hideOnSinglePage={false}
                                showInfo={false}
                                className="!border-0 !p-0"
                            />
                        </div>
                    </div>
                    <div className="hidden sm:block">
                        <Pagination
                            currentPage={checksPage}
                            totalPages={checksPagination.pages}
                            onPageChange={(p) => setChecksPage(p)}
                            totalItems={checksPagination.total}
                            itemName="checks"
                            className="!border-0"
                        />
                    </div>
                </div>
            </div>

            {/* Modern Delete Confirmation Modal */}
            {deleteModal.show && monitor && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
                        onClick={!deleteModal.deleting ? closeDeleteModal : undefined}
                    />

                    {/* Modal Card */}
                    <div className="relative bg-[#12121a]/95 backdrop-blur-md border border-gray-800/90 rounded-2xl p-5 sm:p-6 max-w-md w-full shadow-2xl animate-in fade-in zoom-in-95">
                        {/* Header */}
                        <div className="flex items-start justify-between gap-3 mb-4">
                            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
                                    <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <h3 className="text-sm sm:text-base font-bold text-white font-heading truncate">Delete Monitor</h3>
                                    <p className="text-[11px] sm:text-xs text-gray-400 whitespace-nowrap">
                                        <span className="hidden sm:inline">Permanently remove service and telemetry</span>
                                        <span className="sm:hidden">Remove service & telemetry</span>
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={closeDeleteModal}
                                disabled={deleteModal.deleting}
                                className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-gray-800/60 transition-colors disabled:opacity-40"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Monitor Summary Card */}
                        <div className="bg-[#0b0f19] border border-gray-800/80 rounded-xl p-3 mb-3.5">
                            <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="font-semibold text-white text-sm truncate">{monitor.name}</span>
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-gray-800 text-gray-300 border border-gray-700 uppercase">
                                    {monitor.type || 'HTTPS'}
                                </span>
                            </div>
                            <p className="text-xs font-mono text-gray-400 truncate">{monitor.url}</p>
                        </div>

                        {/* Danger Warning Alert */}
                        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-xs text-red-300 flex items-start gap-2.5 mb-4 leading-relaxed">
                            <svg className="w-4 h-4 text-red-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <span>
                                This action <strong>cannot be undone</strong>. All checks, latency metrics, and incident history will be permanently erased.
                            </span>
                        </div>

                        {/* Confirmation Input Field (The modern professional way) */}
                        <div className="space-y-1.5 mb-5">
                            <label className="block text-xs text-gray-300">
                                To confirm, type <span className="font-mono font-bold text-red-400 select-all bg-red-950/50 px-1.5 py-0.5 rounded border border-red-500/20">{monitor.name}</span> or <span className="font-mono font-bold text-red-400">DELETE</span> below:
                            </label>
                            <input
                                type="text"
                                value={deleteModal.confirmText || ''}
                                onChange={(e) => setDeleteModal(prev => ({ ...prev, confirmText: e.target.value }))}
                                placeholder={`Type "${monitor.name}" or "DELETE"`}
                                disabled={deleteModal.deleting}
                                autoFocus
                                className="w-full bg-[#0b0f19] border border-gray-700/80 focus:border-red-500/80 focus:ring-1 focus:ring-red-500/50 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 outline-none transition-all font-mono"
                            />
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-gray-800/60">
                            <button
                                type="button"
                                onClick={closeDeleteModal}
                                disabled={deleteModal.deleting}
                                className="px-3.5 py-2 bg-gray-800/80 hover:bg-gray-800 text-gray-300 hover:text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={confirmDelete}
                                disabled={
                                    (deleteModal.confirmText?.trim() !== monitor.name?.trim() && 
                                     deleteModal.confirmText?.trim().toUpperCase() !== 'DELETE') || 
                                    deleteModal.deleting
                                }
                                className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-35 disabled:hover:bg-red-600 disabled:cursor-not-allowed text-white rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 shadow-sm shadow-red-600/20 active:scale-[0.98]"
                            >
                                {deleteModal.deleting ? (
                                    <>
                                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        <span>Deleting...</span>
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                        <span>Confirm & Delete</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MonitorDetails;
