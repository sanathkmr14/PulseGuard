import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { statsAPI, monitorAPI, incidentAPI } from '../services/api';
import { useSocket } from '../hooks/useSocket';
import { swrCache } from '../services/cache';
import TimeAgo from '../components/TimeAgo';
import Pagination from '../components/Pagination';

// Modern SVG Icons - Accurate & Professional
const Icons = {
    monitors: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
    ),
    active: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="16 9 10 15 7 12" />
        </svg>
    ),
    down: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
    ),
    degraded: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
    ),
    uptime: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
    ),
    alert: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
    ),
    search: (
        <svg className="w-10 h-10 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
    ),
    refresh: (
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 4v6h-6" />
            <path d="M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
        </svg>
    ),
};

const StatCard = ({ icon, value, label, shortLabel, valueColor = 'text-white', badgeStyle, hoverBorder = 'hover:border-blue-500/30' }) => (
    <div className={`bg-[#12121a]/90 backdrop-blur-md border border-gray-800/80 rounded-xl p-2 sm:px-4 sm:py-3.5 transition-all duration-200 ${hoverBorder} hover:bg-[#151522] group flex flex-col sm:flex-row items-center sm:justify-between text-center sm:text-left gap-1 sm:gap-2`}>
        <div className="min-w-0 flex-1 order-2 sm:order-1 w-full sm:w-auto">
            <span className="text-[9px] sm:text-[11px] font-semibold uppercase tracking-tight sm:tracking-wider text-gray-400 block truncate" title={label}>
                <span className="sm:hidden">{shortLabel || label}</span>
                <span className="hidden sm:inline">{label}</span>
            </span>
            <span className={`text-sm sm:text-2xl font-bold font-heading tracking-tight mt-0.5 block truncate ${valueColor}`}>
                {value}
            </span>
        </div>
        <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center border shrink-0 transition-transform duration-200 group-hover:scale-105 order-1 sm:order-2 ${badgeStyle}`}>
            <span className="scale-75 sm:scale-100 flex items-center justify-center">
                {icon}
            </span>
        </div>
    </div>
);

const StatusDot = ({ status }) => {
    const colors = { up: 'bg-emerald-500', down: 'bg-red-500', degraded: 'bg-amber-500', paused: 'bg-gray-500', unknown: 'bg-blue-500' };
    return <span className={`w-2.5 h-2.5 rounded-full ${colors[status] || colors.unknown} animate-pulse-slow`} />;
};

const Dashboard = () => {
    const cachedStats = swrCache.get('dashboard_stats');
    const cachedMonitors = swrCache.get('dashboard_monitors');
    const cachedIncidents = swrCache.get('dashboard_incidents');
    const hasCache = !!cachedStats;

    const [stats, setStats] = useState(cachedStats);
    const [monitors, setMonitors] = useState(cachedMonitors?.data || []);
    const [monitorsPage, setMonitorsPage] = useState(1);
    const [monitorsLimit, setMonitorsLimit] = useState(6);
    const [monitorsPagination, setMonitorsPagination] = useState(cachedMonitors?.pagination || { current: 1, pages: 1, total: 0 });

    const [incidents, setIncidents] = useState(cachedIncidents?.data || []);
    const [incidentsFilter, setIncidentsFilter] = useState('all');
    const [incidentsPage, setIncidentsPage] = useState(1);
    const [incidentsLimit, setIncidentsLimit] = useState(3);
    const [incidentsCounts, setIncidentsCounts] = useState(cachedIncidents?.counts || { all: 0, ongoing: 0, resolved: 0 });
    const [incidentsPagination, setIncidentsPagination] = useState(cachedIncidents?.pagination || { current: 1, pages: 1, total: 0 });

    const [loading, setLoading] = useState(!hasCache);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const { subscribe } = useSocket();

    const isInitialMonitorsMount = useRef(true);
    const isInitialIncidentsMount = useRef(true);

    const monitorsPaginationRef = useRef(monitorsPagination);
    useEffect(() => {
        monitorsPaginationRef.current = monitorsPagination;
    }, [monitorsPagination]);

    const incidentsPaginationRef = useRef(incidentsPagination);
    useEffect(() => {
        incidentsPaginationRef.current = incidentsPagination;
    }, [incidentsPagination]);

    const fetchMonitors = useCallback(async (mPage = monitorsPage, mLimit = monitorsLimit) => {
        try {
            const res = await monitorAPI.getAll({ page: mPage, limit: mLimit });
            if (res.data.success) {
                setMonitors(res.data.data);
                if (res.data.pagination) {
                    setMonitorsPagination(prev => (
                        prev?.current === res.data.pagination.current &&
                        prev?.pages === res.data.pagination.pages &&
                        prev?.total === res.data.pagination.total
                    ) ? prev : res.data.pagination);
                }
                if (mPage === 1 && mLimit === 6) {
                    swrCache.set('dashboard_monitors', { data: res.data.data, pagination: res.data.pagination });
                }
            }
        } catch (e) {
            console.error('Monitors fetch failed:', e);
            if (!swrCache.has('dashboard_monitors')) setMonitors([]);
        }
    }, [monitorsPage, monitorsLimit]);

    const handleMonitorsLimitChange = (newLimit) => {
        setMonitorsLimit(newLimit);
        setMonitorsPage(1);
        fetchMonitors(1, newLimit);
    };

    const handleMonitorsPageChange = (newPage) => {
        setMonitorsPage(newPage);
        fetchMonitors(newPage, monitorsLimit);
    };

    const fetchIncidents = useCallback(async (iPage = incidentsPage, iFilter = incidentsFilter, iLimit = incidentsLimit) => {
        try {
            const params = { page: iPage, limit: iLimit };
            if (iFilter && iFilter !== 'all') {
                params.status = iFilter;
            }
            const res = await incidentAPI.getAll(params);
            if (res.data.success) {
                setIncidents(res.data.data);
                if (res.data.pagination) {
                    setIncidentsPagination(prev => (
                        prev?.current === res.data.pagination.current &&
                        prev?.pages === res.data.pagination.pages &&
                        prev?.total === res.data.pagination.total
                    ) ? prev : res.data.pagination);
                }
                if (res.data.counts) {
                    setIncidentsCounts(res.data.counts);
                }
                if (iPage === 1 && iFilter === 'all' && iLimit === 3) {
                    swrCache.set('dashboard_incidents', {
                        data: res.data.data,
                        pagination: res.data.pagination,
                        counts: res.data.counts
                    });
                }
            }
        } catch (e) {
            console.error('Incidents fetch failed:', e);
            if (!swrCache.has('dashboard_incidents')) setIncidents([]);
        }
    }, [incidentsPage, incidentsFilter, incidentsLimit]);

    const handleIncidentFilterChange = (newFilter) => {
        setIncidentsFilter(newFilter);
        setIncidentsPage(1);
        fetchIncidents(1, newFilter, incidentsLimit);
    };

    const handleIncidentLimitChange = (newLimit) => {
        setIncidentsLimit(newLimit);
        setIncidentsPage(1);
        fetchIncidents(1, incidentsFilter, newLimit);
    };

    const handleIncidentPageChange = (newPage) => {
        setIncidentsPage(newPage);
        fetchIncidents(newPage, incidentsFilter, incidentsLimit);
    };

    const fetchStats = useCallback(async () => {
        try {
            const res = await statsAPI.getDashboardStats();
            if (res.data.success) {
                setStats(res.data.data);
                swrCache.set('dashboard_stats', res.data.data);
            }
        } catch (e) {
            console.error('Stats fetch failed:', e);
        }
    }, []);

    const fetchAll = useCallback(async () => {
        await Promise.allSettled([
            fetchStats(),
            fetchMonitors(monitorsPage, monitorsLimit),
            fetchIncidents(incidentsPage, incidentsFilter, incidentsLimit)
        ]);
        setLoading(false);
    }, [fetchStats, fetchMonitors, fetchIncidents, monitorsPage, monitorsLimit, incidentsPage, incidentsFilter, incidentsLimit]);

    const fetchAllRef = useRef(fetchAll);
    useEffect(() => {
        fetchAllRef.current = fetchAll;
    }, [fetchAll]);

    const handleManualRefresh = async () => {
        setIsRefreshing(true);
        await fetchAll();
        setTimeout(() => setIsRefreshing(false), 500);
    };

    const handleMonitorUpdate = useCallback((data) => {
        setMonitors(prev => {
            const next = prev.map(m => m._id === data.monitorId ? { ...m, status: data.status, lastChecked: data.lastChecked, lastResponseTime: data.lastResponseTime } : m);
            swrCache.set('dashboard_monitors', { data: next, pagination: monitorsPaginationRef.current });
            return next;
        });
    }, []);

    const handleMonitorUpdateRef = useRef(handleMonitorUpdate);
    useEffect(() => {
        handleMonitorUpdateRef.current = handleMonitorUpdate;
    }, [handleMonitorUpdate]);

    useEffect(() => {
        fetchAllRef.current();
        const unsub1 = subscribe('monitor_update', (data) => handleMonitorUpdateRef.current?.(data));
        const unsub2 = subscribe('monitor_status_change', () => fetchAllRef.current?.());
        const unsub3 = subscribe('incident_created', () => fetchAllRef.current?.());
        const unsub4 = subscribe('incident_resolved', () => fetchAllRef.current?.());
        const unsub5 = subscribe('monitor_created', () => fetchAllRef.current?.());
        const unsub6 = subscribe('monitor_deleted', () => fetchAllRef.current?.());
        return () => {
            unsub1();
            unsub2();
            unsub3();
            unsub4();
            unsub5();
            unsub6();
        };
    }, [subscribe]);

    useEffect(() => {
        if (isInitialMonitorsMount.current) {
            isInitialMonitorsMount.current = false;
            return;
        }
        fetchMonitors(monitorsPage, monitorsLimit);
    }, [monitorsPage, monitorsLimit, fetchMonitors]);

    useEffect(() => {
        if (isInitialIncidentsMount.current) {
            isInitialIncidentsMount.current = false;
            return;
        }
        fetchIncidents(incidentsPage, incidentsFilter, incidentsLimit);
    }, [incidentsPage, incidentsFilter, incidentsLimit, fetchIncidents]);

    const isDegradedIncident = (inc) => {
        return inc?.statusCode === 429 ||
            ['performance_issue', 'ssl_warning', 'content_issue', 'degraded', 'HIGH_LATENCY', 'HTTP_RATE_LIMIT', 'RATE_LIMIT'].includes(inc?.errorType) ||
            ['performance', 'security', 'content'].includes(inc?.degradationCategory);
    };

    const formatErrorType = (type, statusCode, errorMessage = '') => {
        if (statusCode === 429 || type === 'HTTP_RATE_LIMIT') return 'RATE LIMIT';
        if (/slow|latency/i.test(errorMessage) || type === 'HIGH_LATENCY' || type === 'high_latency') return 'LATENCY';
        if (!type) return '';
        if (type === 'performance_issue') return 'PERFORMANCE';
        if (type === 'ssl_warning') return 'SSL WARNING';
        if (type === 'content_issue') return 'CONTENT';
        if (type === 'HTTP_CLIENT_ERROR') return 'CLIENT ERROR';
        if (type === 'HTTP_SERVER_ERROR') return 'SERVER ERROR';
        return type.replace(/_/g, ' ').toUpperCase();
    };

    const formatShortError = (msg) => {
        if (!msg) return 'Service failure detected';
        let clean = msg;
        clean = clean.replace(/^Performance degradation:\s*/i, '');
        clean = clean.replace(/^Performance issue:\s*/i, '');
        clean = clean.replace(/^Rate Limit exceeded:\s*/i, '');
        clean = clean.replace(/^Degradation detected:\s*/i, '');

        // Format slow response cleanly: "Slow response: 5215ms (threshold: 2000ms)" -> "Slow Response (5215ms)"
        const slowMatch = clean.match(/Slow response:\s*(\d+ms)/i);
        if (slowMatch) {
            return `Slow Response (${slowMatch[1]})`;
        }
        const latencyMatch = clean.match(/high latency(?: detected)?:\s*(\d+ms)/i);
        if (latencyMatch) {
            return `High Latency (${latencyMatch[1]})`;
        }

        clean = clean.replace(/\s*\(threshold:.*?\)/i, '');
        clean = clean.replace(/\s*exceeds threshold.*$/i, '');
        if (clean.includes('—')) return clean.split('—')[0].trim();
        if (clean.includes(' - ')) return clean.split(' - ')[0].trim();
        return clean.trim();
    };

    const formatDuration = (ms, startTime, endTime) => {
        const actualMs = ms || (startTime ? Math.max(0, (endTime ? new Date(endTime).getTime() : Date.now()) - new Date(startTime).getTime()) : 0);
        if (!actualMs) return '0s';
        const seconds = Math.floor(actualMs / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        if (days > 0) return `${days}d ${hours % 24}h`;
        if (hours > 0) return `${hours}h ${minutes % 60}m`;
        if (minutes > 0) return `${minutes}m`;
        return `${seconds}s`;
    };

    const getDashboardColorTheme = () => {
        if (incidents.length === 0) return null;
        const hasCritical = incidents.some(inc => !isDegradedIncident(inc));
        return hasCritical
            ? { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', icon: 'text-red-400' }
            : { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400', icon: 'text-amber-400' };
    };

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <div className="w-10 h-10 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        </div>
    );

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-white font-heading">Dashboard</h1>
                    <p className="text-gray-500 mt-1 text-xs sm:text-sm">Monitor your services at a glance</p>
                </div>
                <button
                    onClick={handleManualRefresh}
                    disabled={isRefreshing}
                    className="px-2.5 py-1.5 bg-gray-800/60 hover:bg-gray-800 text-gray-300 hover:text-white rounded-lg text-xs font-medium border border-gray-700/50 transition-all flex items-center gap-1.5 shrink-0 disabled:opacity-60 cursor-pointer"
                    title="Refresh dashboard metrics"
                >
                    <span className={isRefreshing ? 'animate-spin text-blue-400' : ''}>
                        {Icons.refresh}
                    </span>
                    <span>{isRefreshing ? 'Updating...' : 'Refresh'}</span>
                </button>
            </div>

            {/* System Status Banner */}
            {(() => {
                const isAllUp = (stats?.downMonitors || 0) === 0 && (stats?.degradedMonitors || 0) === 0;
                const hasDown = (stats?.downMonitors || 0) > 0;
                const hasDegraded = (stats?.degradedMonitors || 0) > 0;

                if (hasDown) {
                    return (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg shadow-red-500/5">
                            <div className="flex items-start sm:items-center gap-3 min-w-0">
                                <div className="w-9 h-9 rounded-lg bg-red-500/15 border border-red-500/30 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                                    <span className="relative flex h-3 w-3">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                                    </span>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h2 className="text-xs sm:text-sm font-bold text-white font-heading">
                                            System Outage Detected
                                        </h2>
                                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 whitespace-nowrap">
                                            {stats?.downMonitors} {stats?.downMonitors === 1 ? 'Service Down' : 'Services Down'}
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-gray-400 mt-0.5 truncate whitespace-nowrap">
                                        Active incidents require immediate attention.
                                    </p>
                                </div>
                            </div>
                            <Link to="/app/incidents" className="w-full sm:w-auto text-center px-3.5 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-semibold shrink-0 transition-colors shadow-sm shadow-red-600/30">
                                View Incidents
                            </Link>
                        </div>
                    );
                }

                if (hasDegraded) {
                    return (
                        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg shadow-amber-500/5">
                            <div className="flex items-start sm:items-center gap-3 min-w-0">
                                <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                                    <span className="relative flex h-3 w-3">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                                    </span>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h2 className="text-xs sm:text-sm font-bold text-white font-heading">
                                            Performance Degradation
                                        </h2>
                                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 whitespace-nowrap">
                                            {stats?.degradedMonitors} Degraded
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-gray-400 mt-0.5 truncate whitespace-nowrap">
                                        Elevated latency or SSL expiry alerts detected.
                                    </p>
                                </div>
                            </div>
                            <Link to="/app/incidents" className="w-full sm:w-auto text-center px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold shrink-0 transition-colors shadow-sm shadow-amber-600/30">
                                Review Status
                            </Link>
                        </div>
                    );
                }

                if (monitors.length === 0) {
                    return (
                        <div className="bg-[#12121a]/90 backdrop-blur-md border border-blue-500/20 rounded-xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm hover:border-blue-500/30 transition-all">
                            <div className="flex items-start sm:items-center gap-3 min-w-0">
                                <div className="w-9 h-9 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                                    <span className="relative flex h-2.5 w-2.5">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
                                    </span>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h2 className="text-xs sm:text-sm font-bold text-white font-heading">
                                            Ready to Monitor
                                        </h2>
                                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/20 whitespace-nowrap">
                                            0 Active
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-gray-400 mt-0.5 truncate whitespace-nowrap">
                                        Add your first service to begin automated uptime telemetry.
                                    </p>
                                </div>
                            </div>
                            <Link
                                to="/app/monitors?action=new"
                                className="w-full sm:w-auto text-center px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shrink-0 transition-colors flex items-center justify-center gap-1.5 shadow-sm shadow-blue-500/20"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                <span>Add Monitor</span>
                            </Link>
                        </div>
                    );
                }

                return (
                    <div className="bg-[#12121a]/90 backdrop-blur-md border border-emerald-500/20 rounded-xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm hover:border-emerald-500/30 transition-all">
                        <div className="flex items-start sm:items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                                <span className="relative flex h-2.5 w-2.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                                </span>
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h2 className="text-xs sm:text-sm font-bold text-white font-heading">
                                        All Systems Operational
                                    </h2>
                                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
                                        100% Healthy
                                    </span>
                                </div>
                                <p className="text-[11px] text-gray-400 mt-0.5 truncate whitespace-nowrap">
                                    All {stats?.totalMonitors ?? monitors.length} monitored service{(stats?.totalMonitors ?? monitors.length) === 1 ? '' : 's'} responding normally.
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={handleManualRefresh}
                            disabled={isRefreshing}
                            className="w-full sm:w-auto justify-center px-2.5 py-1.5 bg-gray-800/60 hover:bg-gray-800 text-gray-300 hover:text-white rounded-lg text-xs font-medium border border-gray-700/50 transition-all flex items-center gap-1.5 shrink-0 disabled:opacity-70 cursor-pointer"
                            title="Refresh dashboard metrics"
                        >
                            <svg className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-blue-400' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            <span>{isRefreshing ? 'Updating...' : 'Refresh'}</span>
                        </button>
                    </div>
                );
            })()}

            {/* Stats - All 5 Boxes in One Line */}
            <div className="grid grid-cols-5 gap-1.5 sm:gap-3 lg:gap-4">
                <StatCard
                    icon={Icons.monitors}
                    value={stats?.totalMonitors ?? monitors.length ?? 0}
                    label="Total Monitors"
                    shortLabel="Total"
                    valueColor="text-white"
                    badgeStyle="bg-blue-500/10 text-blue-400 border-blue-500/20"
                    hoverBorder="hover:border-blue-500/30"
                />
                <StatCard
                    icon={Icons.active}
                    value={stats?.activeMonitors ?? monitors.filter(m => m.status === 'up').length ?? 0}
                    label="Up"
                    shortLabel="Up"
                    valueColor="text-emerald-400"
                    badgeStyle="bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    hoverBorder="hover:border-emerald-500/30"
                />
                <StatCard
                    icon={Icons.down}
                    value={stats?.downMonitors ?? 0}
                    label="Down"
                    shortLabel="Down"
                    valueColor="text-red-400"
                    badgeStyle="bg-red-500/10 text-red-400 border-red-500/20"
                    hoverBorder="hover:border-red-500/30"
                />
                <StatCard
                    icon={Icons.degraded}
                    value={stats?.degradedMonitors ?? 0}
                    label="Degraded"
                    shortLabel="Degraded"
                    valueColor="text-amber-400"
                    badgeStyle="bg-amber-500/10 text-amber-400 border-amber-500/20"
                    hoverBorder="hover:border-amber-500/30"
                />
                <StatCard
                    icon={Icons.uptime}
                    value={`${stats?.overallUptime !== undefined ? stats.overallUptime.toFixed(1) : '100.0'}%`}
                    label="Uptime"
                    shortLabel="Uptime"
                    valueColor="text-emerald-400"
                    badgeStyle="bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    hoverBorder="hover:border-emerald-500/30"
                />
            </div>

            {/* 2-Column Professional Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
                {/* Left (Main) Column: Monitored Services */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="bg-[#12121a]/90 backdrop-blur-md border border-gray-800/80 rounded-xl overflow-hidden shadow-sm">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/50">
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-blue-500" />
                                <h2 className="text-xs font-bold uppercase tracking-wider text-gray-200 font-heading">
                                    Your Monitors
                                </h2>
                                <span className="px-1.5 py-0.2 text-[10px] font-mono font-semibold bg-gray-800 text-gray-400 rounded">
                                    {monitorsPagination.total || stats?.totalMonitors || monitors.length}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleManualRefresh}
                                    disabled={isRefreshing}
                                    className="p-1 text-gray-400 hover:text-white hover:bg-gray-800/60 rounded border border-gray-800/60 transition-colors disabled:opacity-50 cursor-pointer"
                                    title="Refresh monitors"
                                >
                                    <span className={isRefreshing ? 'animate-spin block text-blue-400' : 'block'}>
                                        {Icons.refresh}
                                    </span>
                                </button>
                                <Link to="/app/monitors" className="text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors flex items-center gap-1">
                                    <span>Manage All</span>
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                </Link>
                            </div>
                        </div>

                        {monitors.length === 0 ? (
                            <div className="p-8 text-center">
                                <div className="flex justify-center mb-2 text-gray-500">{Icons.search}</div>
                                <h3 className="text-sm font-semibold text-white mb-1">No monitors yet</h3>
                                <p className="text-xs text-gray-500 mb-3">Add your first endpoint to start tracking uptime</p>
                                <Link to="/app/monitors?action=new" className="inline-block px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow-sm shadow-blue-500/20 transition-colors">
                                    Create Monitor
                                </Link>
                            </div>
                        ) : (
                            <>
                                <div className="p-3 space-y-2.5">
                                    {monitors.map(m => (
                                        <Link
                                            key={m._id}
                                            to={`/app/monitors/${m._id}`}
                                            className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-[#0e0e16]/90 hover:bg-[#151522] border border-gray-800/70 hover:border-gray-700 rounded-xl transition-all duration-200 group gap-3"
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                <StatusDot status={m.status} />
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs sm:text-sm font-semibold text-white group-hover:text-blue-400 transition-colors font-heading truncate">
                                                            {m.name}
                                                        </span>
                                                        <span className="px-1.5 py-0.5 bg-gray-800/90 text-gray-400 text-[9px] font-mono rounded border border-gray-700/50 uppercase font-semibold">
                                                            {m.type || 'HTTPS'}
                                                        </span>
                                                    </div>
                                                    <span className="text-[11px] text-gray-500 font-mono truncate block mt-0.5">
                                                        {m.url}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between sm:justify-end gap-4 sm:gap-6 border-t sm:border-t-0 pt-2.5 sm:pt-0 border-gray-800/40 shrink-0">
                                                <div className="text-left sm:text-right">
                                                    <span className="text-[9px] text-gray-500 uppercase block font-semibold">Response</span>
                                                    <span className={`text-xs font-mono font-semibold ${
                                                        m.status === 'up' ? 'text-emerald-400' :
                                                        m.status === 'degraded' ? 'text-amber-400' : 'text-red-400'
                                                    }`}>
                                                        {m.lastResponseTime ? `${m.lastResponseTime}ms` : '—'}
                                                    </span>
                                                </div>
                                                <div className="text-left sm:text-right">
                                                    <span className="text-[9px] text-gray-500 uppercase block font-semibold">Interval</span>
                                                    <span className="text-xs font-mono text-gray-300">
                                                        {m.interval}m
                                                    </span>
                                                </div>
                                                <div className="text-left sm:text-right">
                                                    <span className="text-[9px] text-gray-500 uppercase block font-semibold">Uptime</span>
                                                    <span className="text-xs font-mono text-emerald-400 font-semibold">
                                                        {m.uptimePercentage !== undefined ? `${Number(m.uptimePercentage).toFixed(1)}%` : '100%'}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                                                        m.status === 'up' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' :
                                                        m.status === 'degraded' ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20' :
                                                        m.status === 'down' ? 'bg-red-500/15 text-red-400 border border-red-500/20' :
                                                        'bg-gray-500/15 text-gray-400 border border-gray-500/20'
                                                    }`}>
                                                        {m.status}
                                                    </span>
                                                    <svg className="w-4 h-4 text-gray-600 group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all hidden sm:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                    </svg>
                                                </div>
                                            </div>
                                        </Link>
                                    ))}
                                </div>

                                {/* Monitored Services Numbered Pagination & Limit Selector */}
                                {/* Mobile: 2-row layout matching screenshot 1:1 */}
                                <div className="flex flex-col gap-2 px-3 py-2.5 border-t border-gray-800/40 bg-[#0d0d14]/40 md:hidden">
                                    <div className="flex items-center justify-between w-full text-xs text-gray-400 font-mono">
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <span className="text-[11px] text-gray-400 whitespace-nowrap">Per page:</span>
                                            <select
                                                value={monitorsLimit}
                                                onChange={e => handleMonitorsLimitChange(Number(e.target.value))}
                                                className="bg-[#12121a] border border-gray-800 rounded px-2 py-0.5 text-white font-mono text-xs focus:border-blue-500 outline-none cursor-pointer"
                                            >
                                                <option value={4}>4</option>
                                                <option value={6}>6</option>
                                                <option value={8}>8</option>
                                                <option value={12}>12</option>
                                            </select>
                                        </div>
                                        <div className="text-[11px] text-gray-400 font-mono whitespace-nowrap">
                                            Page <span className="font-semibold text-white">{monitorsPage}</span> of{' '}
                                            <span className="font-semibold text-white">{monitorsPagination.pages}</span>
                                            {monitorsPagination.total !== undefined && monitorsPagination.total !== null && (
                                                <span className="text-gray-500 ml-1">
                                                    ({monitorsPagination.total} total)
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="w-full flex items-center justify-center">
                                        <Pagination
                                            currentPage={monitorsPage}
                                            totalPages={monitorsPagination.pages}
                                            onPageChange={handleMonitorsPageChange}
                                            totalItems={monitorsPagination.total}
                                            itemName="monitors"
                                            compact={true}
                                            hideOnSinglePage={false}
                                            showInfo={false}
                                            className="!border-0 !p-0"
                                        />
                                    </div>
                                </div>

                                {/* Desktop: clean single-row layout */}
                                <div className="hidden md:flex items-center justify-between gap-3 p-3.5 sm:px-4 border-t border-gray-800/40 bg-[#0d0d14]/30">
                                    <div className="flex items-center gap-2 text-xs text-gray-400 font-mono">
                                        <span>Per page:</span>
                                        <select
                                            value={monitorsLimit}
                                            onChange={e => handleMonitorsLimitChange(Number(e.target.value))}
                                            className="bg-[#12121a] border border-gray-800 rounded-lg px-2.5 py-1 text-white font-mono text-xs focus:border-blue-500 outline-none cursor-pointer"
                                        >
                                            <option value={4}>4</option>
                                            <option value={6}>6</option>
                                            <option value={8}>8</option>
                                            <option value={12}>12</option>
                                        </select>
                                    </div>
                                    <div className="w-auto">
                                        <Pagination
                                            currentPage={monitorsPage}
                                            totalPages={monitorsPagination.pages}
                                            onPageChange={handleMonitorsPageChange}
                                            totalItems={monitorsPagination.total}
                                            itemName="monitors"
                                            hideOnSinglePage={false}
                                            className="!border-0 !p-0"
                                        />
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Right Column: Active Incidents & Infrastructure Overview */}
                <div className="space-y-4">
                    {/* Incidents Card */}
                    {(() => {
                        const hasOngoing = (incidentsCounts?.ongoing || 0) > 0;
                        const hasCritical = incidents.some(inc => !inc.resolved && !isDegradedIncident(inc));

                        const cardBorder = hasOngoing ? (hasCritical ? 'border-red-500/30' : 'border-amber-500/30') : 'border-gray-800/80';
                        const headerBorder = hasOngoing ? (hasCritical ? 'border-red-500/20' : 'border-amber-500/20') : 'border-gray-800/60';
                        const headerBg = hasOngoing ? (hasCritical ? 'bg-red-500/10' : 'bg-amber-500/10') : 'bg-[#151520]/80';
                        const headerText = hasOngoing ? (hasCritical ? 'text-red-400' : 'text-amber-400') : 'text-gray-200';
                        const headerLink = hasOngoing ? (hasCritical ? 'text-red-300 hover:text-white' : 'text-amber-300 hover:text-white') : 'text-blue-400 hover:text-blue-300';
                        const headerDot = hasOngoing ? (hasCritical ? 'bg-red-400' : 'bg-amber-400') : 'bg-emerald-400';

                        return (
                            <div className={`bg-[#12121a]/95 backdrop-blur-md border ${cardBorder} rounded-xl shadow-sm overflow-hidden`}>
                                {/* Header: Status Tabs & Manual Refresh */}
                                <div className={`px-3.5 py-3 border-b ${headerBorder} ${headerBg} space-y-2.5`}>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className={`w-2 h-2 rounded-full ${headerDot} ${hasOngoing ? 'animate-pulse' : ''}`} />
                                            <h2 className={`text-xs font-bold uppercase tracking-wider ${headerText} font-heading`}>
                                                Incidents ({incidentsPagination.total || 0})
                                            </h2>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={handleManualRefresh}
                                                disabled={isRefreshing}
                                                className="p-1 text-gray-400 hover:text-white hover:bg-gray-800/60 rounded border border-gray-800/60 transition-colors disabled:opacity-50 cursor-pointer"
                                                title="Refresh incidents"
                                            >
                                                <span className={isRefreshing ? 'animate-spin block text-blue-400' : 'block'}>
                                                    {Icons.refresh}
                                                </span>
                                            </button>
                                            <Link
                                                to="/app/incidents"
                                                className={`text-xs ${headerLink} font-semibold transition-colors flex items-center gap-1`}
                                            >
                                                <span>History</span>
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                </svg>
                                            </Link>
                                        </div>
                                    </div>

                                    {/* Status Filter Tabs (All, Ongoing, Resolved) */}
                                    <div className="flex items-center bg-[#0d0d14] p-0.5 rounded-lg border border-gray-800/80">
                                        {[
                                            { id: 'all', label: 'All', count: incidentsCounts.all },
                                            { id: 'ongoing', label: 'Ongoing', count: incidentsCounts.ongoing },
                                            { id: 'resolved', label: 'Resolved', count: incidentsCounts.resolved }
                                        ].map(f => (
                                            <button
                                                key={f.id}
                                                onClick={() => handleIncidentFilterChange(f.id)}
                                                className={`flex-1 py-1 text-[11px] font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                                    incidentsFilter === f.id
                                                        ? 'bg-blue-600 text-white shadow-sm font-bold'
                                                        : 'text-gray-400 hover:text-white'
                                                }`}
                                            >
                                                <span>{f.label}</span>
                                                {f.count !== undefined && f.count !== null && (
                                                    <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                                                        incidentsFilter === f.id
                                                            ? 'bg-blue-800 text-white'
                                                            : f.id === 'ongoing' && f.count > 0
                                                                ? 'bg-red-500/20 text-red-400'
                                                                : f.id === 'resolved' && f.count > 0
                                                                    ? 'bg-emerald-500/20 text-emerald-400'
                                                                    : 'bg-gray-800 text-gray-400'
                                                    }`}>
                                                        {f.count}
                                                    </span>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Incidents List or Empty State */}
                                {incidents.length === 0 ? (
                                    <div className="py-8 px-4 text-center">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-2.5 ${
                                            incidentsFilter === 'ongoing'
                                                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                                                : 'bg-gray-800/50 border border-gray-700/50 text-gray-400'
                                        }`}>
                                            {incidentsFilter === 'ongoing' ? (
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                                </svg>
                                            ) : (
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                                </svg>
                                            )}
                                        </div>
                                        <h3 className="text-xs font-semibold text-white mb-0.5">
                                            {incidentsFilter === 'ongoing' ? 'All Systems Operational' : `No ${incidentsFilter === 'resolved' ? 'Resolved' : ''} Incidents`}
                                        </h3>
                                        <p className="text-[11px] text-gray-400 max-w-xs mx-auto">
                                            {incidentsFilter === 'ongoing'
                                                ? 'Zero active outages or performance degradations detected.'
                                                : `There are currently no ${incidentsFilter} incidents recorded.`}
                                        </p>
                                        {incidentsFilter !== 'all' && (incidentsCounts.all > 0) && (
                                            <button
                                                onClick={() => handleIncidentFilterChange('all')}
                                                className="mt-3 px-2.5 py-1 text-[11px] font-medium text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-md transition-colors cursor-pointer"
                                            >
                                                View All Incidents ({incidentsCounts.all})
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <>
                                        <div className="p-3 space-y-2.5">
                                            {incidents.map(inc => {
                                                const isResolved = inc.status === 'resolved' || !!inc.resolved;
                                                const isDegraded = !isResolved && isDegradedIncident(inc);

                                                const statusColor = isResolved
                                                    ? 'text-emerald-400'
                                                    : isDegraded
                                                        ? 'text-amber-400'
                                                        : 'text-red-400';
                                                const dotBg = isResolved
                                                    ? 'bg-emerald-400'
                                                    : isDegraded
                                                        ? 'bg-amber-400'
                                                        : 'bg-red-400';
                                                const badgeBg = isResolved
                                                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
                                                    : isDegraded
                                                        ? 'bg-amber-500/15 text-amber-400 border-amber-500/25'
                                                        : 'bg-red-500/15 text-red-400 border-red-500/25';
                                                const borderAccent = isResolved
                                                    ? 'border-gray-800/70 hover:border-gray-700/80'
                                                    : isDegraded
                                                        ? 'border-amber-500/20 hover:border-amber-500/40'
                                                        : 'border-red-500/20 hover:border-red-500/40';

                                                return (
                                                    <div
                                                        key={inc._id}
                                                        className={`p-3 bg-black/40 border ${borderAccent} rounded-lg transition-all space-y-2`}
                                                    >
                                                        {/* Top Row: Name (Link), Protocol, HTTP Status, Pill */}
                                                        <div className="flex items-center justify-between gap-2">
                                                            <div className="flex items-center gap-1.5 min-w-0">
                                                                <span className={`w-2 h-2 rounded-full ${dotBg} ${!isResolved ? 'animate-pulse' : ''} shrink-0`} />
                                                                {inc.monitor ? (
                                                                    <Link
                                                                        to={`/app/monitors/${inc.monitor._id}`}
                                                                        className="text-xs font-bold text-white hover:text-blue-400 transition-colors truncate font-heading"
                                                                        title={inc.monitor.name}
                                                                    >
                                                                        {inc.monitor.name}
                                                                    </Link>
                                                                ) : (
                                                                    <span className="text-xs font-semibold text-white truncate">Unknown Endpoint</span>
                                                                )}
                                                                {inc.monitor?.type && (
                                                                    <span className="px-1.5 py-0.2 bg-gray-800/80 text-gray-400 text-[9px] font-mono rounded border border-gray-700/60 font-semibold uppercase shrink-0">
                                                                        {inc.monitor.type}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-1.5 shrink-0">
                                                                {inc.statusCode && (
                                                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-black/60 border border-gray-800 text-gray-300">
                                                                        HTTP {inc.statusCode}
                                                                    </span>
                                                                )}
                                                                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${badgeBg} flex items-center gap-1`}>
                                                                    {!isResolved && <span className={`w-1.5 h-1.5 rounded-full ${dotBg} animate-ping`} />}
                                                                    <span>{isResolved ? 'Resolved' : isDegraded ? 'Degraded' : 'Down'}</span>
                                                                </span>
                                                            </div>
                                                        </div>

                                                        {/* Error Reason Callout with Tooltip */}
                                                        {(inc.errorMessage || inc.errorType) && (
                                                            <div className="flex items-center gap-2 py-1 px-2 rounded bg-[#0a0a0f] border border-gray-800/80 text-[11px] font-mono">
                                                                {inc.errorType && (
                                                                    <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase shrink-0 ${badgeBg}`}>
                                                                        {formatErrorType(inc.errorType, inc.statusCode, inc.errorMessage)}
                                                                    </span>
                                                                )}
                                                                {(() => {
                                                                    const clean = formatShortError(inc.errorMessage);
                                                                    const typeText = formatErrorType(inc.errorType, inc.statusCode, inc.errorMessage);
                                                                    const isDup = clean && typeText && (
                                                                        clean.trim().toLowerCase().replace(/[_\s-]+/g, '') === typeText.trim().toLowerCase().replace(/[_\s-]+/g, '') ||
                                                                        (clean.toLowerCase().includes('timeout') && typeText.toLowerCase().includes('timeout')) ||
                                                                        (clean.toLowerCase().includes('refused') && typeText.toLowerCase().includes('refused')) ||
                                                                        (clean.toLowerCase().includes('dns') && typeText.toLowerCase().includes('dns'))
                                                                    );
                                                                    if (isDup && inc.errorType) return null;
                                                                    return (
                                                                        <span
                                                                            className={`truncate flex-1 ${statusColor}`}
                                                                            title={inc.errorMessage}
                                                                        >
                                                                            {clean}
                                                                        </span>
                                                                    );
                                                                })()}
                                                            </div>
                                                        )}

                                                        {/* Bottom Strip: Timestamp & Live Relative TimeAgo / Duration */}
                                                        <div className="flex items-center justify-between text-[10px] font-mono text-gray-400 pt-1 border-t border-gray-800/40">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="text-gray-500">Started:</span>
                                                                <span className="text-gray-300 font-semibold" title={new Date(inc.startTime).toLocaleString()}>
                                                                    {new Date(inc.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                                                </span>
                                                                <span className="text-gray-600">•</span>
                                                                <span className="text-blue-400 font-medium">
                                                                    <TimeAgo timestamp={inc.startTime} />
                                                                </span>
                                                            </div>
                                                            <span className={`${statusColor} font-medium flex items-center gap-1`}>
                                                                <span className={`w-1.5 h-1.5 rounded-full ${dotBg} ${!isResolved ? 'animate-pulse' : ''}`} />
                                                                {isResolved ? (
                                                                    <span>Resolved {inc.duration ? `(${formatDuration(inc.duration, inc.startTime, inc.endTime)})` : ''}</span>
                                                                ) : isDegraded ? (
                                                                    'Active Degradation'
                                                                ) : (
                                                                    'Active Outage'
                                                                )}
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* Numbered Pagination & Limit Selector */}
                                        <div className="flex flex-col gap-2 px-3 py-2.5 border-t border-gray-800/40 bg-[#0d0d14]/40">
                                            <div className="flex items-center justify-between w-full text-xs text-gray-400 font-mono">
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    <span className="text-[11px] text-gray-500 whitespace-nowrap">Per page:</span>
                                                    <select
                                                        value={incidentsLimit}
                                                        onChange={e => handleIncidentLimitChange(Number(e.target.value))}
                                                        className="bg-[#12121a] border border-gray-800 rounded px-2 py-0.5 text-white font-mono text-xs focus:border-blue-500 outline-none cursor-pointer"
                                                    >
                                                        <option value={3}>3</option>
                                                        <option value={5}>5</option>
                                                    </select>
                                                </div>
                                                <div className="text-[11px] text-gray-400 font-mono whitespace-nowrap">
                                                    Page <span className="font-semibold text-white">{incidentsPage}</span> of{' '}
                                                    <span className="font-semibold text-white">{incidentsPagination.pages}</span>
                                                    {incidentsPagination.total !== undefined && incidentsPagination.total !== null && (
                                                        <span className="text-gray-500 ml-1">
                                                            ({incidentsPagination.total} total)
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="w-full flex items-center justify-center">
                                                <Pagination
                                                    currentPage={incidentsPage}
                                                    totalPages={incidentsPagination.pages}
                                                    onPageChange={handleIncidentPageChange}
                                                    totalItems={incidentsPagination.total}
                                                    itemName="incidents"
                                                    compact={true}
                                                    hideOnSinglePage={false}
                                                    showInfo={false}
                                                    className="!border-0 !p-0"
                                                />
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        );
                    })()}

                    {/* Infrastructure Pulse Summary */}
                    <div className="bg-[#12121a]/90 backdrop-blur-md border border-gray-800/80 rounded-xl p-4 shadow-sm space-y-3">
                        <div className="flex items-center justify-between pb-2.5 border-b border-gray-800/50">
                            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-300 font-heading">
                                Infrastructure Pulse
                            </h2>
                            <span className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-mono">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                Live Telemetry
                            </span>
                        </div>
                        <div className="space-y-2.5 text-xs">
                            <div className="flex items-center justify-between">
                                <span className="text-gray-400">Total Telemetry Checks</span>
                                <span className="font-mono font-semibold text-white">
                                    {(stats?.totalChecks !== undefined
                                        ? stats.totalChecks
                                        : monitors.reduce((acc, m) => acc + (m.totalChecks || 0), 0)
                                    ).toLocaleString()}
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-gray-400">Avg Global Latency</span>
                                <span className="font-mono font-semibold text-blue-400">
                                    {stats?.avgLatency != null
                                        ? `${stats.avgLatency}ms`
                                        : (() => {
                                            const withRt = monitors.filter(m => m.lastResponseTime);
                                            if (withRt.length === 0) return '—';
                                            const avg = Math.round(withRt.reduce((a, m) => a + m.lastResponseTime, 0) / withRt.length);
                                            return `${avg}ms`;
                                        })()}
                                </span>
                            </div>
                            <div className="space-y-1 pt-0.5">
                                <div className="flex items-center justify-between">
                                    <span className="text-gray-400">Monitored Protocols</span>
                                    <span className="font-mono text-gray-500 text-[10px]">
                                        {((stats?.protocols && stats.protocols.length > 0)
                                            ? stats.protocols.length
                                            : (monitors.length === 0 ? 0 : Array.from(new Set(monitors.map(m => m.type || 'HTTPS'))).length))} Active
                                    </span>
                                </div>
                                <div className="font-mono text-gray-300 text-[11px] whitespace-nowrap overflow-x-auto no-scrollbar py-0.5">
                                    {stats?.protocols && stats.protocols.length > 0
                                        ? stats.protocols.join(', ')
                                        : (monitors.length === 0 ? 'None' : (Array.from(new Set(monitors.map(m => m.type || 'HTTPS'))).join(', ') || 'HTTPS'))}
                                </div>
                            </div>
                            <div className="flex items-center justify-between pt-1 border-t border-gray-800/40">
                                <span className="text-gray-400">System SLA Rating</span>
                                <span className="font-mono font-bold text-emerald-400">
                                    {stats?.overallUptime !== undefined ? `${stats.overallUptime.toFixed(2)}%` : (monitors.length === 0 ? 'N/A' : '100.00%')}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
