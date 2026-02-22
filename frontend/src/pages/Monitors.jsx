import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import TimeAgo from '../components/TimeAgo';
import { monitorAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../hooks/useSocket';

const StatusDot = ({ status }) => {
    const colors = { up: 'bg-emerald-500', down: 'bg-red-500', degraded: 'bg-amber-500', paused: 'bg-gray-500', unknown: 'bg-blue-500' };
    return <span className={`w-3 h-3 rounded-full ${colors[status] || colors.unknown} animate-pulse-slow shadow-lg`} />;
};

const Monitors = () => {
    const { user } = useAuth();
    const [monitors, setMonitors] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState({ current: 1, pages: 1, total: 0 });
    const [saving, setSaving] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [editingMonitor, setEditingMonitor] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        type: 'HTTPS',
        url: '',
        interval: 5,
        timeout: 30000,
        degradedThresholdMs: 2000,
        sslExpiryThresholdDays: 30
    });
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [togglingIds, setTogglingIds] = useState(new Set());
    const togglingIdsRef = useRef(new Set());
    const timeoutIdsRef = useRef({});
    // Use refs for instant (synchronous) access to latest values - avoids stale closures
    const lastToggleTimeRef = useRef(0);
    const isProcessingRef = useRef(false);
    const TOGGLE_COOLDOWN = 500; // 500ms cooldown for faster response

    const { subscribe } = useSocket();
    const [error, setError] = useState(null);
    const [deleteModal, setDeleteModal] = useState({ show: false, monitor: null, deleting: false });

    useEffect(() => {
        fetchMonitors(page);

        const handleUpdate = (data) => {
            setMonitors(prev => {
                // Check if this monitor exists in our state
                const exists = prev.some(m => m._id === data.monitorId);
                if (!exists) {
                    // New monitor update - trigger a fetch to get the latest data
                    fetchMonitors();
                    return prev;
                }

                return prev.map(m => {
                    // Ignore updates for monitors currently being toggled to prevent flickering
                    if (togglingIdsRef.current.has(m._id)) return m;
                    return m._id === data.monitorId ? { ...m, status: data.status, lastChecked: data.lastChecked, lastResponseTime: data.lastResponseTime } : m
                });
            });
        };

        // Use subscribe pattern for automatic cleanup
        const unsub = subscribe('monitor_update', handleUpdate);
        return unsub;
    }, [user, subscribe, page]);



    const fetchMonitors = async (pageNum = page) => {
        try {
            setError(null);
            const res = await monitorAPI.getAll({ page: pageNum, limit: 12 });
            setMonitors(res.data.data);
            if (res.data.pagination) setPagination(res.data.pagination);
        }
        catch (e) {
            console.error(e);
            setError('Failed to fetch monitors. Please try again.');
        }
        finally { setLoading(false); }
    };

    const [notification, setNotification] = useState({ type: '', message: '' });

    // Show notification toast
    const showNotification = (type, message) => {
        setNotification({ type, message });
        setTimeout(() => setNotification({ type: '', message: '' }), 4000);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            if (editingMonitor) {
                await monitorAPI.update(editingMonitor._id, formData);
                // Refresh list to get latest data
                await fetchMonitors();
                setEditingMonitor(null);
                showNotification('success', '✅ Monitor updated successfully!');

                // Add safety polling for updates too (just like create)
                // This ensures we catch the result of the "Immediate Check" if socket is missed
                setTimeout(() => fetchMonitors(), 3000);
                setTimeout(() => fetchMonitors(), 5000);
            } else {
                const res = await monitorAPI.create(formData);
                console.log('Monitor created:', res.data);
                // Refresh list to ensure we have the correct structure and latest check data
                await fetchMonitors();
                showNotification('success', '✅ Monitor created successfully!');

                // NOTE: Backend already triggers immediate check via scheduleMonitor()
                // Delayed refresh to catch the first check result
                // Fast endpoints: 3s, Medium endpoints: 8s, Slow endpoints: 15s
                setTimeout(() => fetchMonitors(), 3000);
                setTimeout(() => fetchMonitors(), 8000);
                setTimeout(() => fetchMonitors(), 15000);
            }
            setShowForm(false);
            setFormData({ name: '', type: 'HTTPS', url: '', interval: 5, timeout: 30000, degradedThresholdMs: 2000, sslExpiryThresholdDays: 30 });
        } catch (e) {
            console.error('Submit error:', e);
            showNotification('error', `❌ ${e.response?.data?.message || 'Failed to save'}`);
        } finally {
            setSaving(false);
        }
    };

    const handleEdit = (monitor) => {
        setEditingMonitor(monitor);
        setFormData({
            name: monitor.name,
            type: monitor.type,
            url: monitor.url,
            interval: monitor.interval,
            timeout: monitor.timeout || 30000,
            degradedThresholdMs: monitor.degradedThresholdMs || 2000,
            sslExpiryThresholdDays: monitor.sslExpiryThresholdDays || 30
        });
        setShowForm(true);
        // UX Enhancement: Smooth scroll to form at the top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCancelEdit = () => {
        setEditingMonitor(null);
        setShowForm(false);
        setShowAdvanced(false);
        setFormData({ name: '', type: 'HTTPS', url: '', interval: 5, timeout: 30000, degradedThresholdMs: 2000, sslExpiryThresholdDays: 30 });
    };

    const handlePauseResume = async (monitor) => {
        const now = Date.now();
        const isPausing = monitor.isActive !== false && monitor.status !== 'paused';

        // CRITICAL: Check debounce FIRST using refs (synchronous, no stale closures)
        // This prevents any state updates if user clicks too fast
        if (now - lastToggleTimeRef.current < TOGGLE_COOLDOWN || togglingIds.has(monitor._id)) {
            return;
        }

        // Set processing state immediately to block subsequent clicks
        lastToggleTimeRef.current = now;
        togglingIdsRef.current.add(monitor._id);
        setTogglingIds(prev => new Set(prev).add(monitor._id));

        // Optimistic Update: Update UI immediately before API call
        const previousMonitor = { ...monitor };

        setMonitors(prev => prev.map(m =>
            m._id === monitor._id
                ? { ...m, isActive: !isPausing, status: isPausing ? 'paused' : 'unknown' }
                : m
        ));

        try {
            if (isPausing) {
                await monitorAPI.pause(monitor._id);
            } else {
                await monitorAPI.resume(monitor._id);
            }
        } catch (e) {
            // Revert UI on failure
            console.error('Toggle failed:', e);
            setMonitors(prev => prev.map(m => m._id === monitor._id ? previousMonitor : m));
            alert(e.response?.data?.message || 'Failed to update');
        } finally {
            // Clear toggling state from UI immediately
            setTogglingIds(prev => {
                const next = new Set(prev);
                next.delete(monitor._id);
                return next;
            });

            // Keep blocking socket updates for a short while to prevent flickering
            if (timeoutIdsRef.current[monitor._id]) {
                clearTimeout(timeoutIdsRef.current[monitor._id]);
            }
            timeoutIdsRef.current[monitor._id] = setTimeout(() => {
                togglingIdsRef.current.delete(monitor._id);
                delete timeoutIdsRef.current[monitor._id];
            }, 2000);
        }
    };

    const openDeleteModal = (monitor) => {
        setDeleteModal({ show: true, monitor, deleting: false });
    };

    const closeDeleteModal = () => {
        setDeleteModal({ show: false, monitor: null, deleting: false });
    };

    const confirmDelete = async () => {
        if (!deleteModal.monitor) return;
        setDeleteModal(prev => ({ ...prev, deleting: true }));
        try {
            await monitorAPI.delete(deleteModal.monitor._id);
            setMonitors(prev => prev.filter(m => m._id !== deleteModal.monitor._id));
            closeDeleteModal();
        } catch (e) {
            console.error('Delete failed:', e);
            setError(e.response?.data?.message || 'Failed to delete monitor');
            setDeleteModal(prev => ({ ...prev, deleting: false }));
        }
    };

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <div className="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
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
            {/* Error Toast */}
            {error && (
                <div className="fixed top-4 right-4 p-4 rounded-xl border flex items-center gap-3 z-50 bg-red-500/20 border-red-500/30 text-red-400">
                    <span>{error}</span>
                    <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            )}

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-white font-heading">Monitors</h1>
                    <p className="text-gray-400 mt-1">Track your services in real-time</p>
                </div>
                <button onClick={() => showForm ? handleCancelEdit() : setShowForm(true)}
                    className={`px-5 py-2.5 font-medium rounded-xl transition-all flex items-center gap-2 ${showForm
                        ? 'bg-gray-700 hover:bg-gray-600 text-white'
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white hover:scale-105 shadow-lg shadow-indigo-600/20'
                        }`}>
                    {showForm ? (
                        <>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                            </svg>
                            Cancel
                        </>
                    ) : (
                        <>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Add Monitor
                        </>
                    )}
                </button>
            </div>

            {/* Form */}
            {showForm && (
                <div className="glass-panel rounded-2xl p-6 shadow-2xl">
                    <h2 className="text-xl font-semibold text-white mb-5 font-heading">{editingMonitor ? 'Edit Monitor' : 'New Monitor'}</h2>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Essential Fields */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1.5">Name</label>
                                <input type="text" placeholder="My Website" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-4 py-3 bg-[#0a0a0f] border border-gray-800 rounded-xl text-white placeholder-gray-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1.5">Type</label>
                                <select value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })}
                                    className="w-full px-4 py-3 bg-[#0a0a0f] border border-gray-800 rounded-xl text-white focus:border-indigo-500 outline-none">
                                    {['HTTP', 'HTTPS', 'TCP', 'UDP', 'DNS', 'SMTP', 'SSL', 'PING'].map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div className="sm:col-span-2 lg:col-span-1">
                                <label className="block text-sm font-medium text-gray-400 mb-1.5">URL or Hostname</label>
                                <input type="text" placeholder="https://example.com" required value={formData.url} onChange={e => setFormData({ ...formData, url: e.target.value })}
                                    className="w-full px-4 py-3 bg-[#0a0a0f] border border-gray-800 rounded-xl text-white placeholder-gray-600 focus:border-indigo-500 outline-none" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1.5">Check Interval (minutes)</label>
                                <input type="number" placeholder="5" min="1" value={formData.interval} onChange={e => setFormData({ ...formData, interval: +e.target.value })}
                                    className="w-full px-4 py-3 bg-[#12121a] border border-gray-800 rounded-xl text-white focus:border-indigo-500 outline-none" />
                            </div>
                        </div>

                        {/* Advanced Settings Toggle */}
                        <button type="button" onClick={() => setShowAdvanced(!showAdvanced)}
                            className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors">
                            <svg className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                            Advanced Settings
                        </button>

                        {/* Advanced Fields (Collapsed by default) */}
                        {showAdvanced && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2 border-t border-gray-800/50">
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1.5">Timeout (ms)</label>
                                    <input type="number" placeholder="30000" min="1000" value={formData.timeout} onChange={e => setFormData({ ...formData, timeout: +e.target.value })}
                                        className="w-full px-4 py-3 bg-[#0a0a0f] border border-gray-800 rounded-xl text-white focus:border-indigo-500 outline-none" />
                                    <p className="text-xs text-gray-600 mt-1">Max wait time before marking as down</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1.5">Degraded Threshold (ms)</label>
                                    <input type="number" placeholder="2000" min="0" value={formData.degradedThresholdMs} onChange={e => setFormData({ ...formData, degradedThresholdMs: +e.target.value })}
                                        className="w-full px-4 py-3 bg-[#0a0a0f] border border-gray-800 rounded-xl text-white focus:border-indigo-500 outline-none" />
                                    <p className="text-xs text-gray-600 mt-1">Response time above this = degraded status</p>
                                </div>
                                {(formData.type === 'SSL' || formData.type === 'HTTPS') && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-1.5">SSL Expiry Alert (days)</label>
                                        <input type="number" placeholder="30" min="1" max="365" value={formData.sslExpiryThresholdDays} onChange={e => setFormData({ ...formData, sslExpiryThresholdDays: +e.target.value })}
                                            className="w-full px-4 py-3 bg-[#0a0a0f] border border-gray-800 rounded-xl text-white focus:border-indigo-500 outline-none" />
                                        <p className="text-xs text-gray-600 mt-1">Alert when cert expires within this many days</p>
                                    </div>
                                )}


                            </div>
                        )}

                        <button type="submit" disabled={saving} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-xl transition-colors">
                            {saving ? (
                                <span className="flex items-center justify-center gap-2">
                                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    {editingMonitor ? 'Updating...' : 'Creating...'}
                                </span>
                            ) : (editingMonitor ? 'Update Monitor' : 'Create Monitor')}
                        </button>
                    </form>
                </div>
            )}

            {/* Grid */}
            {monitors.length === 0 ? (
                <div className="glass-panel rounded-2xl p-12 text-center h-64 flex flex-col items-center justify-center">
                    <div className="text-5xl mb-4">📡</div>
                    <h3 className="text-xl font-semibold text-white mb-2 font-heading">No monitors yet</h3>
                    <p className="text-gray-400">Add your first monitor to start tracking</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {monitors.map(m => (
                        <div key={m._id} className={`glass-card p-5 ${m.status === 'up' ? 'glow-emerald' : m.status === 'down' ? 'glow-red' : 'glow-primary'} cursor-pointer group`}>
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <StatusDot status={m.status} />
                                    <div>
                                        <h3 className="font-semibold text-white group-hover:text-indigo-400 transition-colors font-heading">{m.name}</h3>
                                        <span className={`text-[10px] font-bold uppercase tracking-wider ${m.status === 'up' ? 'text-emerald-400' : m.status === 'degraded' ? 'text-amber-400' : m.status === 'down' ? 'text-red-400' : 'text-gray-400'
                                            }`}>{m.status}</span>
                                    </div>
                                </div>
                                <span className="px-2 py-1 bg-gray-800/50 text-gray-400 text-xs rounded-lg">{m.type}</span>
                            </div>
                            <p className="text-sm text-gray-500 truncate mb-4">{m.url}</p>
                            <div className="grid grid-cols-2 gap-4 text-sm mb-5">
                                <div>
                                    <span className="text-gray-500 text-[10px] uppercase font-bold">Response</span>
                                    <p className={`font-bold font-heading ${m.status === 'up' ? 'text-emerald-400' : m.status === 'degraded' ? 'text-amber-400' : 'text-red-400'}`}>
                                        {m.lastResponseTime ? `${m.lastResponseTime}ms` : '—'}
                                    </p>
                                </div>
                                <div>
                                    <span className="text-gray-600 text-xs">Interval</span>
                                    <p className="text-white font-medium">{m.interval}m</p>
                                </div>
                            </div>

                            {/* Timestamp Visibility Enhancement */}
                            <div className="flex items-center gap-1.5 mb-5 text-[10px] text-gray-400 bg-black/30 px-3 py-1.5 rounded-lg w-fit border border-white/5">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span className="uppercase tracking-wide font-medium">
                                    {m.lastChecked ? <TimeAgo timestamp={m.lastChecked} /> : 'Never checked'}
                                </span>
                            </div>

                            <div className="flex gap-2">
                                <Link to={`/app/monitors/${m._id}`} className="flex-1 py-2.5 text-center bg-gray-800/50 hover:bg-gray-800 text-white text-sm rounded-xl transition-colors">
                                    Details
                                </Link>
                                <button onClick={() => handleEdit(m)} className="px-3 py-2.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-xl transition-colors" title="Edit">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                </button>
                                <button onClick={() => handlePauseResume(m)} disabled={togglingIds.has(m._id)}
                                    className={`px-3 py-2.5 rounded-xl transition-colors ${m.status === 'paused' || m.isActive === false
                                        ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400'
                                        : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400'
                                        }`}
                                    title={m.status === 'paused' || m.isActive === false ? 'Resume' : 'Pause'}>
                                    {m.status === 'paused' || m.isActive === false ? (
                                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M8 5v14l11-7z" />
                                        </svg>
                                    ) : (
                                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                                        </svg>
                                    )}
                                </button>
                                <button onClick={() => openDeleteModal(m)} className="px-3 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl transition-colors" title="Delete">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Pagination */}
            {pagination.pages > 1 && (
                <div className="flex justify-between items-center mt-6 px-2">
                    <div className="text-sm text-slate-400">
                        Page {pagination.current} of {pagination.pages} ({pagination.total} total monitors)
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setPage(old => Math.max(old - 1, 1))}
                            disabled={page === 1}
                            className="px-4 py-2 text-sm bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg border border-slate-700 transition-colors"
                        >
                            Previous
                        </button>
                        <button
                            onClick={() => setPage(old => Math.min(old + 1, pagination.pages))}
                            disabled={page === pagination.pages}
                            className="px-4 py-2 text-sm bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg border border-slate-700 transition-colors"
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteModal.show && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeDeleteModal} />

                    {/* Modal */}
                    <div className="relative bg-[#12121a] border border-gray-800/50 rounded-2xl p-6 max-w-md w-full shadow-2xl">
                        {/* Warning Icon */}
                        <div className="flex justify-center mb-4">
                            <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
                                <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                        </div>

                        {/* Title */}
                        <h3 className="text-xl font-semibold text-white text-center mb-2">Delete Monitor</h3>

                        {/* Message */}
                        <p className="text-gray-400 text-center mb-2">
                            Are you sure you want to delete <span className="text-white font-medium">{deleteModal.monitor?.name}</span>?
                        </p>
                        <p className="text-gray-500 text-sm text-center mb-6">
                            This action cannot be undone. All associated checks and incidents will be permanently removed.
                        </p>

                        {/* Buttons */}
                        <div className="flex gap-3">
                            <button
                                onClick={closeDeleteModal}
                                disabled={deleteModal.deleting}
                                className="flex-1 px-4 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmDelete}
                                disabled={deleteModal.deleting}
                                className="flex-1 px-4 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {deleteModal.deleting ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Deleting...
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                        Delete Monitor
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

export default Monitors;
