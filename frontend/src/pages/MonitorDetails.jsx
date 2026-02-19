import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { monitorAPI, statsAPI, incidentAPI } from '../services/api';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useSocket } from '../hooks/useSocket';

const StatusBadge = ({ status }) => {
    const styles = {
        up: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
        down: 'bg-red-500/20 text-red-400 border-red-500/30',
        degraded: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
        paused: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
        unknown: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    };
    return (
        <span className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm font-semibold uppercase rounded-full border ${styles[status] || styles.unknown}`}>
            <span className={`w-2 h-2 rounded-full animate-pulse-slow ${status === 'up' ? 'bg-emerald-400' : status === 'down' ? 'bg-red-400' : status === 'degraded' ? 'bg-amber-400' : 'bg-gray-400'}`} />
            {status}
        </span>
    );
};

const MonitorDetails = () => {
    const { id } = useParams();
    const { user } = useAuth();
    const { subscribe } = useSocket();
    const [monitor, setMonitor] = useState(null);
    const [stats, setStats] = useState(null);
    const [checks, setChecks] = useState([]);
    const [checksPage, setChecksPage] = useState(1);
    const [checksPagination, setChecksPagination] = useState({ current: 1, pages: 1, total: 0 });
    const [activeIncident, setActiveIncident] = useState(null);
    const [responseData, setResponseData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState(null);
    const [checking, setChecking] = useState(false);
    const [showEditForm, setShowEditForm] = useState(false);
    const [editFormData, setEditFormData] = useState({});
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [notification, setNotification] = useState({ type: '', message: '' });
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
    const handleMonitorUpdate = useCallback((data) => {
        if (data.monitorId === id) {
            // Ignore updates for monitors currently being toggled to prevent flickering
            if (togglingIdsRef.current.has(id)) return;
            setMonitor(prev => prev ? {
                ...prev,
                status: data.status,
                lastChecked: data.lastChecked,
                lastResponseTime: data.lastResponseTime,
                isActive: data.status === 'paused' ? false : (prev.isActive ?? true)
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
            monitorAPI.getStats(id).then(r => setStats(r.data.data)).catch(console.error);

            // Fetch active incident if monitor is not up
            if (data.status !== 'up' && data.status !== 'paused') {
                incidentAPI.getActive(id).then(r => setActiveIncident(r.data.data)).catch(console.error);
            } else {
                setActiveIncident(null);
            }
        }
    }, [id]);

    useEffect(() => {
        fetchData();
        // Use subscribe pattern for automatic cleanup
        const unsub = subscribe('monitor_update', handleMonitorUpdate);
        return unsub;
    }, [id, subscribe, handleMonitorUpdate]);

    useEffect(() => {
        if (id) fetchChecks(checksPage);
    }, [checksPage]);



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
            const res = await monitorAPI.getChecks(id, { page, limit: 20 });
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

    const handleCheckNow = async () => {
        setChecking(true);
        try { await monitorAPI.checkNow(id); await fetchData(); }
        catch (e) { console.error(e); }
        finally { setChecking(false); }
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

        setMonitor(prev => ({
            ...prev,
            isActive: !isPausing,
            status: isPausing ? 'paused' : 'unknown'
        }));

        try {
            if (isPausing) {
                await monitorAPI.pause(id);
            } else {
                await monitorAPI.resume(id);
            }
        } catch (error) {
            console.error('Toggle failed:', error);
            // Revert UI on failure
            setMonitor(previousMonitor);
            showNotification('error', error.response?.data?.message || 'Failed to toggle monitor status');
        } finally {
            // Clear toggling state from UI immediately
            setToggling(false);
            togglingIdsRef.current.delete(id);
        }
    };


    const handleEditSubmit = async (e) => {
        e.preventDefault();
        try {
            // Validate required fields
            if (!editFormData.name?.trim()) {
                showNotification('error', '❌ Monitor name is required');
                return;
            }
            if (!editFormData.url?.trim()) {
                showNotification('error', '❌ URL/hostname is required');
                return;
            }
            if (!editFormData.type) {
                showNotification('error', '❌ Monitor type is required');
                return;
            }
            if (!editFormData.interval || editFormData.interval < 1) {
                showNotification('error', '❌ Interval must be at least 1 minute');
                return;
            }
            if (editFormData.timeout < 1000) {
                showNotification('error', '❌ Timeout must be at least 1000ms');
                return;
            }

            const res = await monitorAPI.update(id, editFormData);

            // TRUST THE RESPONSE: Update local state immediately with the fresh data from the backend
            // This prevents a race condition where a subsequent fetchData() might retrieve stale data from the DB
            setMonitor(res.data.data);

            // Only re-fetch related data that might change due to config (e.g., stats thresholds)
            // But checking is async, so we don't need to fetch checks immediately
            monitorAPI.getStats(id).then(r => setStats(r.data.data)).catch(console.error);

            setShowEditForm(false);
            setShowAdvanced(false);
            showNotification('success', '✅ Monitor updated successfully!');

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
            showNotification('error', `❌ ${e.response?.data?.message || e.message || 'Failed to update monitor'}`);
        }
    };

    const openEditForm = () => {
        setEditFormData({
            name: monitor.name,
            type: monitor.type,
            url: monitor.url,
            interval: monitor.interval,
            timeout: monitor.timeout || 30000,
            degradedThresholdMs: monitor.degradedThresholdMs || 2000,
            sslExpiryThresholdDays: monitor.sslExpiryThresholdDays || 30
        });
        setShowAdvanced(false);
        setShowEditForm(true);
    };

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <div className="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
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
                <Link to="/app/monitors" className="px-6 py-2.5 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-xl transition-all">
                    Back to List
                </Link>
                <button onClick={() => { setLoading(true); fetchData(); }} className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition-all">
                    Try Again
                </button>
            </div>
        </div>
    );

    return (
        <div className="space-y-6">
            {/* Notification Toast */}
            {notification.message && (
                <div className={`fixed top-4 left-1/2 -translate-x-1/2 p-4 rounded-xl border flex items-center gap-3 z-50 animate-in ${notification.type === 'success'
                    ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
                    : 'bg-red-500/20 border-red-500/30 text-red-400'
                    }`}>
                    {notification.message}
                </div>
            )}

            {/* Header */}
            <div>
                <Link to="/app/monitors" className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 text-sm mb-3">
                    ← Back to Monitors
                </Link>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold text-white">{monitor.name}</h1>
                        <p className="text-gray-500 mt-1 truncate max-w-md">{monitor.url}</p>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        <button onClick={handleCheckNow} disabled={checking || monitor.status === 'paused'}
                            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-xl transition-all flex items-center gap-2">
                            {checking ? (
                                <>
                                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Checking...
                                </>
                            ) : (
                                <>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    Check Now
                                </>
                            )}
                        </button>
                        <button onClick={handlePauseResume}
                            className={`px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 font-medium ${monitor.status === 'paused' || monitor.isActive === false
                                ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400'
                                : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400'
                                }`}>

                            {monitor.status === 'paused' || monitor.isActive === false ? (
                                <>
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M8 5v14l11-7z" />
                                    </svg>
                                    Resume
                                </>
                            ) : (
                                <>
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                                    </svg>
                                    Pause
                                </>
                            )}
                        </button>
                        <button onClick={openEditForm}
                            className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-xl transition-all flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Edit
                        </button>
                    </div>
                </div>
            </div>

            {/* Edit Form Modal */}

            {showEditForm && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                    <div className="bg-[#12121a] border border-gray-800 rounded-2xl p-6 w-full max-w-lg">
                        <h2 className="text-xl font-semibold text-white mb-5">Edit Monitor</h2>
                        <form onSubmit={handleEditSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">Name</label>
                                <input type="text" required value={editFormData.name} onChange={e => setEditFormData({ ...editFormData, name: e.target.value })}
                                    className="w-full px-4 py-3 bg-[#0a0a0f] border border-gray-800 rounded-xl text-white focus:border-indigo-500 outline-none" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">Type</label>
                                    <select value={editFormData.type} onChange={e => setEditFormData({ ...editFormData, type: e.target.value })}
                                        className="w-full px-4 py-3 bg-[#0a0a0f] border border-gray-800 rounded-xl text-white focus:border-indigo-500 outline-none">
                                        {['HTTP', 'HTTPS', 'TCP', 'UDP', 'DNS', 'SMTP', 'SSL', 'PING'].map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">Interval (min)</label>
                                    <input type="number" min="1" value={editFormData.interval} onChange={e => setEditFormData({ ...editFormData, interval: +e.target.value })}
                                        className="w-full px-4 py-3 bg-[#0a0a0f] border border-gray-800 rounded-xl text-white focus:border-indigo-500 outline-none" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">URL</label>
                                <input type="text" required value={editFormData.url} onChange={e => setEditFormData({ ...editFormData, url: e.target.value })}
                                    className="w-full px-4 py-3 bg-[#0a0a0f] border border-gray-800 rounded-xl text-white focus:border-indigo-500 outline-none" />
                            </div>

                            {/* Advanced Settings Toggle */}
                            <button type="button" onClick={() => setShowAdvanced(!showAdvanced)}
                                className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors mt-2">
                                <svg className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                                Advanced Settings
                            </button>

                            {/* Advanced Fields (Collapsed by default) */}
                            {showAdvanced && (
                                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-800/50">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-2">Timeout (ms)</label>
                                        <input type="number" min="1000" value={editFormData.timeout} onChange={e => setEditFormData({ ...editFormData, timeout: +e.target.value })}
                                            className="w-full px-4 py-3 bg-[#0a0a0f] border border-gray-800 rounded-xl text-white focus:border-indigo-500 outline-none" />
                                        <p className="text-xs text-gray-600 mt-1">Max wait time before marking as down</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-2">Degraded Threshold (ms)</label>
                                        <input type="number" min="0" value={editFormData.degradedThresholdMs} onChange={e => setEditFormData({ ...editFormData, degradedThresholdMs: +e.target.value })}
                                            className="w-full px-4 py-3 bg-[#0a0a0f] border border-gray-800 rounded-xl text-white focus:border-indigo-500 outline-none" />
                                        <p className="text-xs text-gray-600 mt-1">Response time above this = degraded status</p>
                                    </div>
                                    {(editFormData.type === 'SSL' || editFormData.type === 'HTTPS') && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-400 mb-2">SSL Expiry Alert (days)</label>
                                            <input type="number" min="1" max="365" value={editFormData.sslExpiryThresholdDays} onChange={e => setEditFormData({ ...editFormData, sslExpiryThresholdDays: +e.target.value })}
                                                className="w-full px-4 py-3 bg-[#0a0a0f] border border-gray-800 rounded-xl text-white focus:border-indigo-500 outline-none" />
                                            <p className="text-xs text-gray-600 mt-1">Alert when cert expires within this many days</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="flex gap-3 pt-2">
                                <button type="submit" className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition-colors">
                                    Save Changes
                                </button>
                                <button type="button" onClick={() => setShowEditForm(false)} className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-xl transition-colors">
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="glass-card p-5 glow-primary cursor-pointer">
                    <p className="text-gray-400 text-sm mb-2">Status</p>
                    <StatusBadge status={monitor.status} />
                </div>
                <div className="glass-card p-5 glow-emerald cursor-pointer">
                    <p className="text-gray-400 text-sm mb-1">Uptime</p>
                    <p className="text-2xl font-bold font-heading text-emerald-400">{stats?.uptimePercentage?.toFixed(2) || 0}%</p>
                </div>
                <div className="glass-card p-5 glow-primary cursor-pointer">
                    <p className="text-gray-400 text-sm mb-1">Avg Response</p>
                    <p className="text-2xl font-bold font-heading text-indigo-400">{stats?.avgResponseTime || 0}ms</p>
                </div>
                <div className="glass-card p-5 glow-primary cursor-pointer">
                    <p className="text-gray-400 text-sm mb-1">Total Checks</p>
                    <p className="text-2xl font-bold font-heading text-white">{stats?.totalChecks || 0}</p>
                </div>

                {/* SSL Expiry Card - Only show if data exists */}
                {(() => {
                    const latestCheck = checks[0];
                    const sslDays = latestCheck?.meta?.daysUntilExpiry ?? latestCheck?.sslInfo?.daysUntilExpiry;

                    if (sslDays !== undefined && sslDays !== null) {
                        let colorClass = 'text-emerald-400';
                        let glowClass = 'glow-emerald';

                        if (sslDays < 14) {
                            colorClass = 'text-red-400';
                            glowClass = 'glow-red';
                        } else if (sslDays < 30) {
                            colorClass = 'text-amber-400';
                            glowClass = 'glow-amber';
                        }

                        return (
                            <div className={`glass-card p-5 ${glowClass} cursor-pointer`}>
                                <p className="text-gray-400 text-sm mb-1">SSL Expiry</p>
                                <p className={`text-2xl font-bold font-heading ${colorClass}`}>{sslDays} days</p>
                            </div>
                        );
                    }
                    return null;
                })()}
            </div>

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
                const hasVerifications = forensicsSource?.verifications?.filter(v => v.location !== 'Local (Fallback)').length > 0;

                if (!hasVerifications) {
                    if (!isUnhealthy) return null;

                    // Show pending state if unhealthy but no results yet
                    return (
                        <div className="glass-panel border-indigo-500/20 rounded-2xl p-5 relative overflow-hidden animate-pulse">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400">
                                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                </div>
                                <div>
                                    <h2 className="text-lg font-semibold text-white font-heading">Global Verification In Progress</h2>
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
                                        <div className="w-12 h-2 bg-indigo-500/20 rounded mb-2" />
                                        <div className="w-20 h-4 bg-gray-800/50 rounded" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                }

                const verifications = forensicsSource.verifications.filter(v => v.location !== 'Local (Fallback)');
                const isFromCheck = forensicsSource.timestamp !== undefined;

                return (
                    <div className="glass-panel border-red-500/20 rounded-2xl p-5 relative overflow-hidden shadow-2xl">
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
                                        <h2 className="text-lg font-semibold text-white font-heading">Global Verification</h2>
                                        <p className="text-xs text-gray-400">
                                            {isFromCheck ? `Forensics for check at ${new Date(forensicsSource.timestamp).toLocaleString()}` : 'Real-time incident confirmation'}
                                        </p>
                                    </div>
                                </div>
                                {selectedCheckId && (
                                    <button onClick={() => setSelectedCheckId(null)} className="text-xs text-indigo-400 hover:text-indigo-300">
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
            <div className="bg-[#12121a] border border-gray-800/50 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-white">Monitor Configuration</h2>
                    <span className="px-2 py-1 bg-indigo-500/10 text-indigo-400 text-xs font-bold uppercase rounded-lg border border-indigo-500/20">
                        {monitor.type}
                    </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <div>
                        <p className="text-gray-500 text-xs uppercase font-bold mb-1">Check Interval</p>
                        <p className="text-white font-medium">{monitor.interval} minutes</p>
                    </div>
                    <div>
                        <p className="text-gray-500 text-xs uppercase font-bold mb-1">Timeout</p>
                        <p className="text-white font-medium">{monitor.timeout || 30000}ms</p>
                    </div>
                    <div>
                        <p className="text-gray-500 text-xs uppercase font-bold mb-1">Degraded Threshold</p>
                        <p className="text-white font-medium">{monitor.degradedThresholdMs || 2000}ms</p>
                    </div>
                    {(monitor.type === 'SSL' || monitor.type === 'HTTPS') && (
                        <div>
                            <p className="text-gray-500 text-xs uppercase font-bold mb-1">SSL Alert Window</p>
                            <p className="text-white font-medium">{monitor.sslExpiryThresholdDays || 30} days</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Chart */}
            {responseData?.trend?.length > 0 && (
                <div className="bg-[#12121a] border border-gray-800/50 rounded-2xl p-5">
                    <h2 className="text-lg font-semibold text-white mb-4">Response Time (24h)</h2>
                    <ResponsiveContainer width="100%" height={250}>
                        <AreaChart data={responseData.trend}>
                            <defs>
                                <linearGradient id="colorAvg" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1f1f2e" />
                            <XAxis dataKey="timestamp" stroke="#4b5563" tick={{ fontSize: 12 }} tickFormatter={v => new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} />
                            <YAxis stroke="#4b5563" tick={{ fontSize: 12 }} />
                            <Tooltip contentStyle={{ background: '#12121a', border: '1px solid #1f1f2e', borderRadius: '12px', color: '#fff' }} />
                            <Area type="monotone" dataKey="avg" stroke="#6366f1" strokeWidth={2} fill="url(#colorAvg)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* Checks Table */}
            <div className="glass-panel border-gray-800/50 rounded-2xl overflow-hidden mb-20 shadow-2xl">
                <div className="p-5 border-b border-gray-800/30">
                    <h2 className="text-lg font-semibold text-white font-heading">Recent Checks</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[600px]">
                        <thead className="bg-[#0a0a0f]">
                            <tr>
                                {['Time', 'Status', 'Response', 'Code', 'Details'].map(h => (
                                    <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800/30">
                            {checks.map(c => (
                                <tr key={c._id} className="hover:bg-gray-800/20 transition-colors">
                                    <td className="px-5 py-4 text-sm text-gray-400 whitespace-nowrap">{new Date(c.timestamp).toLocaleString()}</td>
                                    <td className="px-5 py-4">
                                        <StatusBadge status={c.status} />
                                    </td>
                                    <td className="px-5 py-4 text-sm font-medium text-white whitespace-nowrap">{c.responseTime ? `${c.responseTime}ms` : '—'}</td>
                                    <td className="px-5 py-4">
                                        <span className={`text-sm font-medium ${c.status === 'up' ? 'text-emerald-400' : c.status === 'degraded' ? 'text-amber-400' : 'text-red-400'}`}>
                                            {c.statusCode || 'N/A'}
                                        </span>
                                    </td>
                                    <td className="px-5 py-4 text-sm">
                                        {c.status === 'up' && (!c.errorType || c.errorType === 'SUCCESS' || c.errorType.includes('SUCCESS')) ? (
                                            <span className="text-emerald-400">✓ OK</span>
                                        ) : c.status === 'degraded' && (c.errorType === 'SLOW_RESPONSE' || c.errorType === 'HIGH_LATENCY' || c.errorType === 'HIGH_PING_LATENCY') ? (
                                            <span className="text-amber-400">✓ Slow</span>
                                        ) : (
                                            <div>
                                                {c.errorType && <span className={`px-2 py-0.5 text-xs rounded ${c.status === 'degraded' ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400'}`}>{c.errorType}</span>}
                                                {(c.errorMessage || (c.degradationReasons && c.degradationReasons[0])) && (
                                                    <p className={`${c.status === 'degraded' ? 'text-amber-400' : 'text-red-400'} text-xs mt-1 max-w-md`}>
                                                        {c.errorMessage || c.degradationReasons[0]}
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
                {checksPagination.pages > 1 && (
                    <div className="flex justify-between items-center p-5 border-t border-gray-800/30">
                        <div className="text-sm text-gray-400">
                            Page {checksPagination.current} of {checksPagination.pages} ({checksPagination.total} total checks)
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setChecksPage(old => Math.max(old - 1, 1))}
                                disabled={checksPage === 1}
                                className="px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg border border-gray-700 transition-colors"
                            >
                                Previous
                            </button>
                            <button
                                onClick={() => setChecksPage(old => Math.min(old + 1, checksPagination.pages))}
                                disabled={checksPage === checksPagination.pages}
                                className="px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg border border-gray-700 transition-colors"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MonitorDetails;
