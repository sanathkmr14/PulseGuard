import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import TimeAgo from '../components/TimeAgo';
import { monitorAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../hooks/useSocket';
import { swrCache } from '../services/cache';
import Pagination from '../components/Pagination';
import Toast from '../components/Toast';

const StatusDot = ({ status }) => {
    const colors = { up: 'bg-emerald-500', down: 'bg-red-500', degraded: 'bg-amber-500', paused: 'bg-gray-500', unknown: 'bg-blue-500' };
    return <span className={`w-3 h-3 rounded-full ${colors[status] || colors.unknown} animate-pulse-slow shadow-lg`} />;
};

const Monitors = () => {
    const { user } = useAuth();
    const location = useLocation();
    const cachedMonitorsData = swrCache.get('monitors_list');
    const hasMonitorsCache = !!cachedMonitorsData;

    const [monitors, setMonitors] = useState(cachedMonitorsData?.data || []);
    const [counts, setCounts] = useState(cachedMonitorsData?.counts || { all: 0, up: 0, down: 0, degraded: 0, paused: 0 });
    const [loading, setLoading] = useState(!hasMonitorsCache);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [filter, setFilter] = useState('all');
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(8);
    const [pagination, setPagination] = useState(cachedMonitorsData?.pagination || { current: 1, pages: 1, total: 0 });
    const [saving, setSaving] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [editingMonitor, setEditingMonitor] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        type: 'HTTPS',
        url: '',
        port: '',
        alertThreshold: 2,
        headers: '',
        interval: 5,
        timeout: 30000,
        degradedThresholdMs: 2000,
        sslExpiryThresholdDays: 14
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
    const [deleteModal, setDeleteModal] = useState({ show: false, monitor: null, deleting: false, confirmText: '' });

    // Open form automatically if navigating with ?action=new
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        if (params.get('action') === 'new' || params.get('new') === 'true') {
            setShowForm(true);
        }
    }, [location.search]);

    // Handle redirected message (e.g. from deleting monitor on details page)
    useEffect(() => {
        if (location.state?.message) {
            showNotification('success', location.state.message);
            window.history.replaceState({}, document.title);
        }
    }, [location.state]);

    const fetchMonitors = useCallback(async (pageNum = page, statusFilter = filter, limitNum = limit) => {
        try {
            setError(null);
            const params = { page: pageNum, limit: limitNum };
            if (statusFilter && statusFilter !== 'all') {
                params.status = statusFilter;
            }
            const res = await monitorAPI.getAll(params);
            if (res.data.success) {
                setMonitors(res.data.data);
                if (res.data.pagination) setPagination(res.data.pagination);
                if (res.data.counts) setCounts(res.data.counts);
                if (pageNum === 1 && statusFilter === 'all' && limitNum === 8) {
                    swrCache.set('monitors_list', {
                        data: res.data.data,
                        pagination: res.data.pagination,
                        counts: res.data.counts
                    });
                }
            }
        } catch (e) {
            console.error(e);
            if (!swrCache.has('monitors_list')) setError('Failed to fetch monitors. Please try again.');
        } finally {
            setLoading(false);
        }
    }, [page, filter, limit]);

    const handleManualRefresh = async () => {
        setIsRefreshing(true);
        await fetchMonitors(page, filter, limit);
        setTimeout(() => setIsRefreshing(false), 500);
    };

    const handleFilterChange = (newFilter) => {
        setFilter(newFilter);
        setPage(1);
        fetchMonitors(1, newFilter, limit);
    };

    const handleLimitChange = (newLimit) => {
        setLimit(newLimit);
        setPage(1);
        fetchMonitors(1, filter, newLimit);
    };

    const handlePageChange = (newPage) => {
        setPage(newPage);
        fetchMonitors(newPage, filter, limit);
    };

    useEffect(() => {
        fetchMonitors(page, filter, limit);

        const handleUpdate = () => {
            fetchMonitors(page, filter, limit);
        };

        // Use subscribe pattern for automatic cleanup
        const unsubs = [
            subscribe('monitor_update', handleUpdate),
            subscribe('monitor_status_change', handleUpdate),
            subscribe('incident_created', handleUpdate),
            subscribe('incident_resolved', handleUpdate)
        ];
        return () => unsubs.forEach(u => u && u());
    }, [user, subscribe, page, filter, limit, fetchMonitors]);

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
            const payload = { ...formData };
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
                        showNotification('error', 'Headers must be valid JSON format');
                        setSaving(false);
                        return;
                    }
                }
            }
            if (editingMonitor) {
                await monitorAPI.update(editingMonitor._id, payload);
                // Refresh list to get latest data
                await fetchMonitors();
                setEditingMonitor(null);
                showNotification('success', 'Monitor updated successfully');

                // Add safety polling for updates too (just like create)
                // This ensures we catch the result of the "Immediate Check" if socket is missed
                setTimeout(() => fetchMonitors(), 3000);
                setTimeout(() => fetchMonitors(), 5000);
            } else {
                const res = await monitorAPI.create(payload);
                console.log('Monitor created:', res.data);
                // Refresh list to ensure we have the correct structure and latest check data
                await fetchMonitors();
                showNotification('success', 'Monitor created successfully');

                // NOTE: Backend already triggers immediate check via scheduleMonitor()
                // Delayed refresh to catch the first check result
                // Fast endpoints: 3s, Medium endpoints: 8s, Slow endpoints: 15s
                setTimeout(() => fetchMonitors(), 3000);
                setTimeout(() => fetchMonitors(), 8000);
                setTimeout(() => fetchMonitors(), 15000);
            }
            setShowForm(false);
            setFormData({ name: '', type: 'HTTPS', url: '', port: '', alertThreshold: 2, headers: '', interval: 5, timeout: 30000, degradedThresholdMs: 2000, sslExpiryThresholdDays: 14 });
        } catch (e) {
            console.error('Submit error:', e);
            showNotification('error', e.response?.data?.message || 'Failed to save monitor');
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
            port: monitor.port ?? '',
            alertThreshold: monitor.alertThreshold ?? 2,
            headers: monitor.headers ? JSON.stringify(monitor.headers instanceof Map ? Object.fromEntries(monitor.headers) : monitor.headers, null, 2) : '',
            interval: monitor.interval,
            timeout: monitor.timeout || 30000,
            degradedThresholdMs: monitor.degradedThresholdMs || 2000,
            sslExpiryThresholdDays: monitor.sslExpiryThresholdDays || 14
        });
        setShowForm(true);
        // UX Enhancement: Smooth scroll to form at the top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCancelEdit = () => {
        setEditingMonitor(null);
        setShowForm(false);
        setShowAdvanced(false);
        setFormData({ name: '', type: 'HTTPS', url: '', port: '', alertThreshold: 2, headers: '', interval: 5, timeout: 30000, degradedThresholdMs: 2000, sslExpiryThresholdDays: 14 });
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
                ? {
                    ...m,
                    isActive: !isPausing,
                    status: isPausing ? 'paused' : (m.latestCheck?.status || m._previousStatus || (m.status !== 'paused' ? m.status : 'up')),
                    _previousStatus: isPausing ? m.status : m._previousStatus
                }
                : m
        ));

        try {
            let res;
            if (isPausing) {
                res = await monitorAPI.pause(monitor._id);
            } else {
                res = await monitorAPI.resume(monitor._id);
            }

            if (res?.data?.data) {
                const updated = res.data.data;
                setMonitors(prev => {
                    const next = prev.map(m => m._id === monitor._id ? { ...m, ...updated } : m);
                    swrCache.set('monitors_list', { data: next, pagination });
                    return next;
                });
            }
        } catch (e) {
            // Revert UI on failure
            console.error('Toggle failed:', e);
            setMonitors(prev => prev.map(m => m._id === monitor._id ? previousMonitor : m));
            showNotification('error', e.response?.data?.message || 'Failed to update');
        } finally {
            // Clear toggling state from UI and refs immediately so incoming check results are accepted
            togglingIdsRef.current.delete(monitor._id);
            if (timeoutIdsRef.current[monitor._id]) {
                clearTimeout(timeoutIdsRef.current[monitor._id]);
                delete timeoutIdsRef.current[monitor._id];
            }
            setTogglingIds(prev => {
                const next = new Set(prev);
                next.delete(monitor._id);
                return next;
            });
        }
    };

    const openDeleteModal = (monitor) => {
        setDeleteModal({ show: true, monitor, deleting: false, confirmText: '' });
    };

    const closeDeleteModal = () => {
        setDeleteModal({ show: false, monitor: null, deleting: false, confirmText: '' });
    };

    const confirmDelete = async () => {
        if (!deleteModal.monitor) return;
        const deletedName = deleteModal.monitor.name;
        setDeleteModal(prev => ({ ...prev, deleting: true }));
        try {
            await monitorAPI.delete(deleteModal.monitor._id);
            closeDeleteModal();
            showNotification('success', `Monitor "${deletedName}" deleted successfully`);
            await fetchMonitors(page, filter, limit);
        } catch (e) {
            console.error('Delete failed:', e);
            setError(e.response?.data?.message || 'Failed to delete monitor');
            setDeleteModal(prev => ({ ...prev, deleting: false }));
        }
    };

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <div className="w-10 h-10 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        </div>
    );

    return (
        <div className="space-y-6">
            {/* Modern Bottom-Center Floating Toast Notification */}
            <Toast
                notification={notification}
                onClose={() => setNotification({ type: '', message: '' })}
                error={error}
                onErrorClose={() => setError(null)}
            />


            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h1 className="text-2xl sm:text-3xl font-bold text-white font-heading">Monitors</h1>
                        <p className="text-gray-400 mt-1 text-xs sm:text-sm whitespace-nowrap truncate">Track your services in real-time</p>
                    </div>

                    {/* Top Action Row on mobile: Refresh and Add Monitor placed at top-right */}
                    <div className="flex items-center gap-2 sm:hidden shrink-0">
                        <button
                            onClick={handleManualRefresh}
                            disabled={isRefreshing}
                            className="px-2.5 py-1.5 bg-gray-800/60 hover:bg-gray-800 text-gray-300 hover:text-white rounded-lg text-xs font-medium border border-gray-700/50 transition-all flex items-center gap-1.5 shrink-0 disabled:opacity-60 cursor-pointer"
                            title="Refresh monitors"
                        >
                            <span className={isRefreshing ? 'animate-spin text-blue-400' : ''}>
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                            </span>
                            <span>{isRefreshing ? 'Updating...' : 'Refresh'}</span>
                        </button>

                        {!showForm && (
                            <button
                                onClick={() => setShowForm(true)}
                                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 active:scale-[0.98] text-white shadow-sm shadow-blue-500/20 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                                </svg>
                                <span>Add</span>
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                    {/* Desktop Refresh Button (hidden on mobile, shown on sm and above) */}
                    <button
                        onClick={handleManualRefresh}
                        disabled={isRefreshing}
                        className="hidden sm:flex px-2.5 py-1.5 bg-gray-800/60 hover:bg-gray-800 text-gray-300 hover:text-white rounded-lg text-xs font-medium border border-gray-700/50 transition-all items-center gap-1.5 shrink-0 disabled:opacity-60 cursor-pointer"
                        title="Refresh monitors"
                    >
                        <span className={isRefreshing ? 'animate-spin text-blue-400' : ''}>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                        </span>
                        <span>{isRefreshing ? 'Updating...' : 'Refresh'}</span>
                    </button>

                    <div className="flex bg-[#12121a] p-0.5 rounded-lg border border-gray-800 overflow-x-auto max-w-full">
                        {[
                            { id: 'all', label: 'All', count: counts.all },
                            { id: 'up', label: 'Up', count: counts.up },
                            { id: 'down', label: 'Down', count: counts.down },
                            { id: 'degraded', label: 'Degraded', count: counts.degraded },
                            { id: 'paused', label: 'Paused', count: counts.paused }
                        ].map(f => (
                            <button
                                key={f.id}
                                onClick={() => handleFilterChange(f.id)}
                                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                                    filter === f.id
                                        ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/25 font-bold'
                                        : 'text-gray-400 hover:text-white'
                                }`}
                            >
                                <span>{f.label}</span>
                                {f.count !== undefined && f.count !== null && (
                                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                                        filter === f.id
                                            ? 'bg-blue-800 text-white'
                                            : f.id === 'down' && f.count > 0
                                                ? 'bg-red-500/20 text-red-400'
                                                : f.id === 'degraded' && f.count > 0
                                                    ? 'bg-amber-500/20 text-amber-400'
                                                    : f.id === 'up' && f.count > 0
                                                        ? 'bg-emerald-500/20 text-emerald-400'
                                                        : 'bg-gray-800 text-gray-400'
                                    }`}>
                                        {f.count}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Desktop Add Monitor (shown only on sm and above) */}
                    {!showForm && (
                        <button
                            onClick={() => setShowForm(true)}
                            className="hidden sm:flex px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 active:scale-[0.98] text-white shadow-sm shadow-blue-500/20 transition-all items-center gap-1.5 shrink-0 cursor-pointer"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                            </svg>
                            Add Monitor
                        </button>
                    )}
                </div>
            </div>

            {/* Form */}
            {showForm && (
                <div className="bg-[#12121a]/95 backdrop-blur-md border border-gray-800/90 rounded-xl p-3.5 sm:p-4 shadow-lg animate-in">
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-800/60">
                        <span className="w-2 h-2 rounded-full bg-blue-500" />
                        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-200 font-heading">
                            {editingMonitor ? 'Edit Monitor' : 'Add New Monitor'}
                        </h2>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-3">
                        {/* Essential Fields */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                            <div>
                                <label className="block text-[11px] font-medium text-gray-400 mb-1">Name</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Production API"
                                    required
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-2.5 py-1.5 bg-[#0a0a0f] border border-gray-800 rounded-lg text-xs text-white placeholder-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-medium text-gray-400 mb-1">Type</label>
                                <select
                                    value={formData.type}
                                    onChange={e => setFormData({ ...formData, type: e.target.value })}
                                    className="w-full px-2.5 py-1.5 bg-[#0a0a0f] border border-gray-800 rounded-lg text-xs text-white focus:border-blue-500 outline-none"
                                >
                                    {['HTTP', 'HTTPS', 'TCP', 'UDP', 'DNS', 'SMTP', 'SSL', 'PING'].map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[11px] font-medium text-gray-400 mb-1">URL or Hostname</label>
                                <input
                                    type="text"
                                    placeholder="https://example.com"
                                    required
                                    value={formData.url}
                                    onChange={e => setFormData({ ...formData, url: e.target.value })}
                                    className="w-full px-2.5 py-1.5 bg-[#0a0a0f] border border-gray-800 rounded-lg text-xs text-white placeholder-gray-600 focus:border-blue-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-medium text-gray-400 mb-1">Interval (minutes)</label>
                                <input
                                    type="number"
                                    placeholder="5"
                                    min="1"
                                    value={formData.interval}
                                    onChange={e => setFormData({ ...formData, interval: +e.target.value })}
                                    className="w-full px-2.5 py-1.5 bg-[#0a0a0f] border border-gray-800 rounded-lg text-xs text-white focus:border-blue-500 outline-none"
                                />
                            </div>
                        </div>

                        {/* Advanced Settings Toggle */}
                        <div className="flex items-center justify-between pt-1">
                            <button
                                type="button"
                                onClick={() => setShowAdvanced(!showAdvanced)}
                                className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-blue-400 transition-colors"
                            >
                                <svg className={`w-3 h-3 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                                Advanced Settings
                            </button>

                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleCancelEdit}
                                    className="px-3 py-1.5 text-xs text-gray-400 hover:text-white rounded-lg bg-gray-800/60 hover:bg-gray-800 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-sm shadow-blue-500/20 transition-all"
                                >
                                    {saving ? (
                                        <span className="flex items-center gap-1.5">
                                            <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            {editingMonitor ? 'Updating...' : 'Creating...'}
                                        </span>
                                    ) : (editingMonitor ? 'Update Monitor' : 'Create Monitor')}
                                </button>
                            </div>
                        </div>

                        {/* Advanced Fields (Collapsed by default) */}
                        {showAdvanced && (
                            <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-800/50">
                                {/* Port */}
                                <div className="flex-1 min-w-[80px] max-w-[110px]">
                                    <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Port</label>
                                    <input
                                        type="number"
                                        placeholder="443"
                                        min="1"
                                        max="65535"
                                        value={formData.port ?? ''}
                                        onChange={e => setFormData({ ...formData, port: e.target.value === '' ? '' : +e.target.value })}
                                        className="w-full px-2 py-1 bg-[#0a0a0f] border border-gray-800 rounded-lg text-xs text-white focus:border-blue-500 outline-none"
                                    />
                                </div>
                                {/* Alert Threshold */}
                                <div className="flex-1 min-w-[80px] max-w-[110px]">
                                    <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Alert After</label>
                                    <input
                                        type="number"
                                        placeholder="2 failures"
                                        min="1"
                                        max="20"
                                        value={formData.alertThreshold ?? 2}
                                        onChange={e => setFormData({ ...formData, alertThreshold: +e.target.value })}
                                        className="w-full px-2 py-1 bg-[#0a0a0f] border border-gray-800 rounded-lg text-xs text-white focus:border-blue-500 outline-none"
                                    />
                                </div>
                                {/* Timeout */}
                                <div className="flex-1 min-w-[90px] max-w-[120px]">
                                    <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Timeout (ms)</label>
                                    <input
                                        type="number"
                                        placeholder="30000"
                                        min="1000"
                                        value={formData.timeout}
                                        onChange={e => setFormData({ ...formData, timeout: +e.target.value })}
                                        className="w-full px-2 py-1 bg-[#0a0a0f] border border-gray-800 rounded-lg text-xs text-white focus:border-blue-500 outline-none"
                                    />
                                </div>
                                {/* Degraded Threshold */}
                                <div className="flex-1 min-w-[100px] max-w-[130px]">
                                    <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Degraded (ms)</label>
                                    <input
                                        type="number"
                                        placeholder="2000"
                                        min="0"
                                        value={formData.degradedThresholdMs}
                                        onChange={e => setFormData({ ...formData, degradedThresholdMs: +e.target.value })}
                                        className="w-full px-2 py-1 bg-[#0a0a0f] border border-gray-800 rounded-lg text-xs text-white focus:border-blue-500 outline-none"
                                    />
                                </div>
                                {/* SSL Expiry */}
                                {(formData.type === 'SSL' || formData.type === 'HTTPS') && (
                                    <div className="flex-1 min-w-[90px] max-w-[120px]">
                                        <label className="block text-[10px] font-medium text-gray-500 mb-0.5">SSL Alert (days)</label>
                                        <input
                                            type="number"
                                            placeholder="14"
                                            min="1"
                                            max="365"
                                            value={formData.sslExpiryThresholdDays}
                                            onChange={e => setFormData({ ...formData, sslExpiryThresholdDays: +e.target.value })}
                                            className="w-full px-2 py-1 bg-[#0a0a0f] border border-gray-800 rounded-lg text-xs text-white focus:border-blue-500 outline-none"
                                        />
                                    </div>
                                )}
                            </div>

                        )}
                    </form>
                </div>
            )}

            {/* Grid */}
            {monitors.length === 0 ? (
                counts.all === 0 ? (
                    <div className="bg-[#12121a]/90 backdrop-blur-md border border-gray-800/80 rounded-2xl p-10 sm:p-12 text-center flex flex-col items-center justify-center shadow-sm">
                        <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mb-3 shadow-lg shadow-blue-500/5">
                            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                        </div>
                        <h3 className="text-base sm:text-lg font-bold text-white mb-1.5 font-heading">No monitors configured yet</h3>
                        <p className="text-xs text-gray-400 mb-5 whitespace-nowrap">
                            Monitor websites, APIs, SSL & ports with real-time multi-region health checks.
                        </p>
                        <button
                            onClick={() => { setShowForm(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 active:scale-[0.98] text-white text-xs font-semibold rounded-lg shadow-sm shadow-blue-500/20 transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            <span>Add Your First Monitor</span>
                        </button>
                    </div>
                ) : (
                    <div className="bg-[#12121a]/90 backdrop-blur-md border border-gray-800/80 rounded-2xl p-10 sm:p-12 text-center flex flex-col items-center justify-center shadow-sm">
                        <div className="w-12 h-12 rounded-2xl bg-gray-800/50 border border-gray-700/50 text-gray-400 flex items-center justify-center mb-3">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <h3 className="text-base font-bold text-white mb-1 font-heading">No {filter} monitors</h3>
                        <p className="text-xs text-gray-400 mb-4">
                            There are currently no monitors matching &quot;{filter}&quot;.
                        </p>
                        <button
                            onClick={() => handleFilterChange('all')}
                            className="px-3.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
                        >
                            View All Monitors ({counts.all})
                        </button>
                    </div>
                )
            ) : (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {monitors.map(m => (
                        <div
                            key={m._id}
                            className="bg-[#12121a]/90 backdrop-blur-md border border-gray-800/80 rounded-xl p-3 hover:border-gray-700 transition-colors duration-150 group flex flex-col justify-between"
                        >
                            <div>
                                <div className="flex items-center justify-between gap-2 mb-1.5">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <StatusDot status={m.status} />
                                        <h3 className="text-xs sm:text-sm font-semibold text-white group-hover:text-blue-400 transition-colors font-heading truncate">
                                            {m.name}
                                        </h3>
                                        <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                                            m.status === 'up' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' :
                                            m.status === 'degraded' ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20' :
                                            m.status === 'down' ? 'bg-red-500/15 text-red-400 border border-red-500/20' :
                                            'bg-gray-500/15 text-gray-400 border border-gray-500/20'
                                        }`}>
                                            {m.status}
                                        </span>
                                    </div>
                                    <span className="px-1.5 py-0.5 bg-gray-800/80 text-gray-400 font-mono text-[9px] rounded shrink-0 border border-gray-700/50">
                                        {m.type}
                                    </span>
                                </div>

                                <p className="text-[11px] text-gray-500 truncate mb-2 font-mono">
                                    {m.url}
                                </p>

                                <div className="grid grid-cols-3 gap-1 text-center bg-black/25 border border-white/5 rounded-lg py-1 px-1.5 mb-2.5">
                                    <div>
                                        <span className="text-[8px] uppercase font-bold text-gray-500 block leading-tight">Response</span>
                                        <p className={`text-xs font-semibold leading-tight mt-0.5 ${
                                            m.status === 'up' ? 'text-emerald-400' :
                                            m.status === 'degraded' ? 'text-amber-400' :
                                            m.status === 'paused' ? 'text-gray-400' :
                                            m.status === 'unknown' ? 'text-blue-400' : 'text-red-400'
                                        }`}>
                                            {m.lastResponseTime != null ? `${m.lastResponseTime}ms` : '—'}
                                        </p>
                                    </div>
                                    <div>
                                        <span className="text-[8px] uppercase font-bold text-gray-500 block leading-tight">Interval</span>
                                        <p className="text-xs font-medium text-gray-300 leading-tight mt-0.5">{m.interval}m</p>
                                    </div>
                                    <div>
                                        <span className="text-[8px] uppercase font-bold text-gray-500 block leading-tight">Checked</span>
                                        <p className="text-xs font-medium text-gray-300 leading-tight mt-0.5 truncate" title={m.lastChecked ? new Date(m.lastChecked).toLocaleString() : 'Never'}>
                                            {m.lastChecked ? <TimeAgo timestamp={m.lastChecked} /> : (
                                                m.status === 'unknown' ? <span className="text-blue-400 animate-pulse text-[10px]">Checking...</span> : 'Never'
                                            )}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-1.5 pt-0.5">
                                <Link
                                    to={`/app/monitors/${m._id}`}
                                    state={{ initialMonitor: m }}
                                    className="flex-1 py-1 text-center bg-gray-800/60 hover:bg-gray-700/80 text-white text-xs font-medium rounded-md transition-colors border border-gray-700/40"
                                >
                                    Details
                                </Link>
                                <button
                                    onClick={() => handleEdit(m)}
                                    className="p-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-md transition-colors border border-blue-500/20"
                                    title="Edit"
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                </button>
                                <button
                                    onClick={() => handlePauseResume(m)}
                                    disabled={togglingIds.has(m._id)}
                                    className={`p-1 rounded-md transition-colors border ${
                                        m.status === 'paused' || m.isActive === false
                                            ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/20'
                                            : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/20'
                                    }`}
                                    title={m.status === 'paused' || m.isActive === false ? 'Resume' : 'Pause'}
                                >
                                    {m.status === 'paused' || m.isActive === false ? (
                                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M8 5v14l11-7z" />
                                        </svg>
                                    ) : (
                                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                                        </svg>
                                    )}
                                </button>
                                <button
                                    onClick={() => openDeleteModal(m)}
                                    className="p-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-md transition-colors border border-red-500/20"
                                    title="Delete"
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                    {/* Numbered Pagination & Limit Selector */}
                    {/* Mobile: 2-row layout matching screenshot 1:1 */}
                    <div className="flex flex-col gap-2 mt-6 p-3 bg-[#12121a]/90 backdrop-blur-md border border-gray-800/80 rounded-xl sm:hidden">
                        <div className="flex items-center justify-between w-full text-xs text-gray-400 font-mono">
                            <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-[11px] text-gray-400 whitespace-nowrap">Per page:</span>
                                <select
                                    value={limit}
                                    onChange={e => handleLimitChange(Number(e.target.value))}
                                    className="bg-[#0a0a0f] border border-gray-800 rounded px-2 py-0.5 text-white font-mono text-xs focus:border-blue-500 outline-none cursor-pointer"
                                >
                                    <option value={8}>8</option>
                                    <option value={12}>12</option>
                                    <option value={16}>16</option>
                                    <option value={24}>24</option>
                                    <option value={48}>48</option>
                                </select>
                            </div>
                            <div className="text-[11px] text-gray-400 font-mono whitespace-nowrap">
                                Page <span className="font-semibold text-white">{page}</span> of{' '}
                                <span className="font-semibold text-white">{pagination.pages}</span>
                                {pagination.total !== undefined && pagination.total !== null && (
                                    <span className="text-gray-500 ml-1">
                                        ({pagination.total} total)
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="w-full flex items-center justify-center">
                            <Pagination
                                currentPage={page}
                                totalPages={pagination.pages}
                                onPageChange={handlePageChange}
                                totalItems={pagination.total}
                                itemName="monitors"
                                compact={true}
                                hideOnSinglePage={false}
                                showInfo={false}
                                className="!border-0 !p-0"
                            />
                        </div>
                    </div>

                    {/* Desktop & Tablet: clean layout */}
                    <div className="hidden sm:flex items-center justify-between gap-3 mt-6 pt-4 border-t border-gray-800/40">
                        <div className="flex items-center gap-2 text-xs text-gray-400 font-mono">
                            <span>Per page:</span>
                            <select
                                value={limit}
                                onChange={e => handleLimitChange(Number(e.target.value))}
                                className="bg-[#12121a] border border-gray-800 rounded-lg px-2.5 py-1 text-white font-mono text-xs focus:border-blue-500 outline-none cursor-pointer"
                            >
                                <option value={8}>8</option>
                                <option value={12}>12</option>
                                <option value={16}>16</option>
                                <option value={24}>24</option>
                                <option value={48}>48</option>
                            </select>
                        </div>
                        <div className="w-auto">
                            <Pagination
                                currentPage={page}
                                totalPages={pagination.pages}
                                onPageChange={handlePageChange}
                                totalItems={pagination.total}
                                itemName="monitors"
                                card={true}
                                hideOnSinglePage={false}
                            />
                        </div>
                    </div>
                </>
            )}

            {/* Modern Delete Confirmation Modal */}
            {deleteModal.show && deleteModal.monitor && (
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
                                <span className="font-semibold text-white text-sm truncate">{deleteModal.monitor.name}</span>
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-gray-800 text-gray-300 border border-gray-700 uppercase">
                                    {deleteModal.monitor.type || 'HTTPS'}
                                </span>
                            </div>
                            <p className="text-xs font-mono text-gray-400 truncate">{deleteModal.monitor.url}</p>
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
                                To confirm, type <span className="font-mono font-bold text-red-400 select-all bg-red-950/50 px-1.5 py-0.5 rounded border border-red-500/20">{deleteModal.monitor.name}</span> or <span className="font-mono font-bold text-red-400">DELETE</span> below:
                            </label>
                            <input
                                type="text"
                                value={deleteModal.confirmText || ''}
                                onChange={(e) => setDeleteModal(prev => ({ ...prev, confirmText: e.target.value }))}
                                placeholder={`Type "${deleteModal.monitor.name}" or "DELETE"`}
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
                                    (deleteModal.confirmText?.trim() !== deleteModal.monitor.name?.trim() && 
                                     deleteModal.confirmText?.trim().toUpperCase() !== 'DELETE') || 
                                    deleteModal.deleting
                                }
                                className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-35 disabled:hover:bg-red-600 disabled:cursor-not-allowed text-white rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 shadow-sm shadow-red-600/20 hover:scale-[1.01]"
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

export default Monitors;
