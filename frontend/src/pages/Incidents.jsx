import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { incidentAPI, statsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../hooks/useSocket';
import { swrCache } from '../services/cache';
import Pagination from '../components/Pagination';

// Modern SVG Icons for Incidents
const Icons = {
    shieldCheck: (
        <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="m9 12 2 2 4-4" />
        </svg>
    ),
    alertTriangle: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
    ),
    alertCircle: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
    ),
    checkCircle: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
    ),
    pulse: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
    ),
    clock: (
        <svg className="w-3.5 h-3.5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
        </svg>
    ),
    refresh: (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
    )
};

const StatCard = ({ icon, label, value, subtext, valueColor = 'text-white', badgeStyle }) => (
    <div className="bg-[#12121a]/90 backdrop-blur-md border border-gray-800/80 rounded-xl px-4 py-3.5 transition-all duration-200 hover:border-gray-700 hover:bg-[#151522] group">
        <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 block truncate">
                    {label}
                </span>
                <span className={`text-2xl font-bold font-heading tracking-tight mt-0.5 block ${valueColor}`}>
                    {value}
                </span>
                {subtext && (
                    <span className="text-[10px] text-gray-500 block mt-0.5 truncate">
                        {subtext}
                    </span>
                )}
            </div>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center border shrink-0 transition-transform duration-200 group-hover:scale-105 ${badgeStyle}`}>
                {icon}
            </div>
        </div>
    </div>
);

const Incidents = () => {
    const { user } = useAuth();
    const cachedIncidentsData = swrCache.get('incidents_list');
    const hasIncidentsCache = !!cachedIncidentsData;

    const [incidents, setIncidents] = useState(cachedIncidentsData?.incidents || []);
    const [stats, setStats] = useState(cachedIncidentsData?.stats || null);
    const [counts, setCounts] = useState(cachedIncidentsData?.counts || { all: 0, ongoing: 0, resolved: 0 });
    const [loading, setLoading] = useState(!hasIncidentsCache);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [filter, setFilter] = useState('all');
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(10);
    const [pagination, setPagination] = useState(cachedIncidentsData?.pagination || { current: 1, pages: 1, total: 0 });

    const { subscribe } = useSocket();

    const fetchIncidents = useCallback(async (pageNum = page, statusFilter = filter, limitNum = limit) => {
        try {
            const params = { page: pageNum, limit: limitNum };
            if (statusFilter && statusFilter !== 'all') {
                params.status = statusFilter;
            }
            const [incidentsRes, statsRes] = await Promise.allSettled([
                incidentAPI.getAll(params),
                statsAPI.getDashboardStats()
            ]);

            let newIncidents = incidents;
            let newPagination = pagination;
            let newStats = stats;
            let newCounts = counts;

            if (incidentsRes.status === 'fulfilled' && incidentsRes.value.data.success) {
                newIncidents = incidentsRes.value.data.data;
                setIncidents(newIncidents);
                if (incidentsRes.value.data.pagination) {
                    newPagination = incidentsRes.value.data.pagination;
                    setPagination(newPagination);
                }
                if (incidentsRes.value.data.counts) {
                    newCounts = incidentsRes.value.data.counts;
                    setCounts(newCounts);
                }
            } else if (!swrCache.has('incidents_list')) {
                setIncidents([]);
            }

            if (statsRes.status === 'fulfilled' && statsRes.value.data.success) {
                newStats = statsRes.value.data.data;
                setStats(newStats);
            }

            if (pageNum === 1 && statusFilter === 'all' && limitNum === 10) {
                swrCache.set('incidents_list', {
                    incidents: newIncidents,
                    pagination: newPagination,
                    stats: newStats,
                    counts: newCounts
                });
            }
        } catch (error) {
            console.error('Error fetching incidents:', error);
        } finally {
            setLoading(false);
        }
    }, [page, filter, limit]);

    const handleManualRefresh = async () => {
        setIsRefreshing(true);
        await fetchIncidents(page, filter, limit);
        setTimeout(() => setIsRefreshing(false), 500);
    };

    const handleFilterChange = (newFilter) => {
        setFilter(newFilter);
        setPage(1);
        fetchIncidents(1, newFilter, limit);
    };

    const handleLimitChange = (newLimit) => {
        setLimit(newLimit);
        setPage(1);
        fetchIncidents(1, filter, newLimit);
    };

    const handlePageChange = (newPage) => {
        setPage(newPage);
        fetchIncidents(newPage, filter, limit);
    };

    useEffect(() => {
        fetchIncidents(page, filter, limit);

        const unsub1 = subscribe('incident_created', () => fetchIncidents(page, filter, limit));
        const unsub2 = subscribe('incident_resolved', () => fetchIncidents(page, filter, limit));
        const unsub3 = subscribe('monitor_status_change', () => fetchIncidents(page, filter, limit));
        const unsub4 = subscribe('monitor_down', () => fetchIncidents(page, filter, limit));
        const unsub5 = subscribe('monitor_degraded', () => fetchIncidents(page, filter, limit));

        return () => {
            unsub1();
            unsub2();
            unsub3();
            unsub4();
            unsub5();
        };
    }, [subscribe, page, filter, limit, fetchIncidents]);

    const formatErrorType = (type, statusCode) => {
        if (statusCode === 429 || type === 'HTTP_RATE_LIMIT') return 'RATE LIMIT';
        if (!type) return '';
        if (type === 'performance_issue') return 'PERFORMANCE';
        if (type === 'ssl_warning') return 'SSL WARNING';
        if (type === 'content_issue') return 'CONTENT';
        if (type === 'HIGH_LATENCY' || type === 'high_latency') return 'LATENCY';
        if (type === 'HTTP_CLIENT_ERROR') return 'CLIENT ERROR';
        if (type === 'HTTP_SERVER_ERROR') return 'SERVER ERROR';
        return type.replace(/_/g, ' ').toUpperCase();
    };

    const getColorScheme = (incident) => {
        if (incident.status === 'resolved') {
            return {
                border: 'border-l-emerald-500',
                bg: 'bg-emerald-500/10',
                text: 'text-emerald-400',
                badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
                dot: 'bg-emerald-400',
                alertBg: 'bg-emerald-500/5',
                alertBorder: 'border-emerald-500/20'
            };
        }

        const isDegraded = incident.statusCode === 429 ||
            ['performance_issue', 'ssl_warning', 'content_issue', 'degraded', 'HIGH_LATENCY', 'HTTP_RATE_LIMIT', 'RATE_LIMIT'].includes(incident.errorType) ||
            ['performance', 'security', 'content'].includes(incident.degradationCategory);

        if (isDegraded) {
            return {
                border: 'border-l-amber-500',
                bg: 'bg-amber-500/10',
                text: 'text-amber-400',
                badge: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
                dot: 'bg-amber-400',
                alertBg: 'bg-amber-500/5',
                alertBorder: 'border-amber-500/20'
            };
        }

        return {
            border: 'border-l-red-500',
            bg: 'bg-red-500/10',
            text: 'text-red-400',
            badge: 'bg-red-500/15 text-red-400 border-red-500/25',
            dot: 'bg-red-400',
            alertBg: 'bg-red-500/5',
            alertBorder: 'border-red-500/20'
        };
    };

    const formatDuration = (ms, startTime) => {
        const actualMs = ms || (startTime ? Math.max(0, Date.now() - new Date(startTime).getTime()) : 0);
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

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <div className="w-10 h-10 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        </div>
    );

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h1 className="text-2xl sm:text-3xl font-bold text-white font-heading">Incidents</h1>
                        <p className="text-gray-400 mt-1 text-xs sm:text-sm whitespace-nowrap truncate">
                            <span className="hidden sm:inline">Real-time incident response and historical downtime telemetry</span>
                            <span className="sm:hidden">Real-time incident response & telemetry</span>
                        </p>
                    </div>
                    {/* Mobile Refresh Button: Top Right beside Incidents */}
                    <button
                        onClick={handleManualRefresh}
                        disabled={isRefreshing}
                        className="sm:hidden px-2.5 py-1.5 bg-gray-800/60 hover:bg-gray-800 text-gray-300 hover:text-white rounded-lg text-xs font-medium border border-gray-700/50 transition-all flex items-center gap-1.5 shrink-0 disabled:opacity-60 cursor-pointer"
                        title="Refresh incidents"
                    >
                        <span className={isRefreshing ? 'animate-spin text-blue-400' : ''}>
                            {Icons.refresh}
                        </span>
                        <span>{isRefreshing ? 'Updating...' : 'Refresh'}</span>
                    </button>
                </div>
                <div className="flex items-center gap-2">
                    {/* Desktop Refresh Button */}
                    <button
                        onClick={handleManualRefresh}
                        disabled={isRefreshing}
                        className="hidden sm:flex px-2.5 py-1.5 bg-gray-800/60 hover:bg-gray-800 text-gray-300 hover:text-white rounded-lg text-xs font-medium border border-gray-700/50 transition-all items-center gap-1.5 shrink-0 disabled:opacity-60 cursor-pointer"
                        title="Refresh incidents"
                    >
                        <span className={isRefreshing ? 'animate-spin text-blue-400' : ''}>
                            {Icons.refresh}
                        </span>
                        <span>{isRefreshing ? 'Updating...' : 'Refresh'}</span>
                    </button>
                    <div className="flex bg-[#12121a] p-0.5 rounded-lg border border-gray-800 overflow-x-auto max-w-full w-full sm:w-auto">
                        {[
                            { id: 'all', label: 'All', count: counts.all },
                            { id: 'ongoing', label: 'Ongoing', count: counts.ongoing },
                            { id: 'resolved', label: 'Resolved', count: counts.resolved }
                        ].map(f => (
                            <button
                                key={f.id}
                                onClick={() => handleFilterChange(f.id)}
                                className={`flex-1 sm:flex-initial px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 ${
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
            </div>

            {/* KPI Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <StatCard
                    icon={Icons.alertTriangle}
                    label="Ongoing Incidents"
                    value={stats?.ongoingIncidents || 0}
                    subtext={stats?.ongoingIncidents > 0 ? "Requires immediate triage" : "Zero active outages"}
                    valueColor={stats?.ongoingIncidents > 0 ? "text-red-400" : "text-emerald-400"}
                    badgeStyle={stats?.ongoingIncidents > 0 ? "bg-red-500/10 text-red-400 border-red-500/20" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"}
                />
                <StatCard
                    icon={Icons.alertCircle}
                    label="Degraded Services"
                    value={stats?.degradedMonitors || 0}
                    subtext={stats?.degradedMonitors > 0 ? "High latency or SSL warning" : "Normal performance"}
                    valueColor={stats?.degradedMonitors > 0 ? "text-amber-400" : "text-emerald-400"}
                    badgeStyle={stats?.degradedMonitors > 0 ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"}
                />
                <StatCard
                    icon={Icons.checkCircle}
                    label="Total Recorded"
                    value={pagination.total || 0}
                    subtext={filter === 'all' ? 'All historical events' : `Filtered by ${filter}`}
                    valueColor="text-white"
                    badgeStyle="bg-blue-500/10 text-blue-400 border-blue-500/20"
                />
                <StatCard
                    icon={Icons.pulse}
                    label="Fleet Health"
                    value={stats?.overallUptime !== undefined ? `${stats.overallUptime.toFixed(1)}%` : '100.0%'}
                    subtext="Overall uptime rating"
                    valueColor="text-emerald-400"
                    badgeStyle="bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                />
            </div>

            {/* Content Area */}
            {incidents.length === 0 ? (
                <div className="bg-[#12121a]/90 backdrop-blur-md border border-gray-800/80 rounded-2xl p-10 sm:p-14 text-center flex flex-col items-center justify-center shadow-sm">
                    {/* Glowing Emerald Radar Shield */}
                    <div className="relative mb-5">
                        <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/10">
                            {Icons.shieldCheck}
                        </div>
                        <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500"></span>
                        </span>
                    </div>

                    <h2 className="text-lg sm:text-xl font-bold text-white mb-1.5 font-heading">
                        {filter === 'ongoing'
                            ? 'Zero Ongoing Outages'
                            : filter === 'resolved'
                            ? 'No Resolved Incidents Yet'
                            : 'All Systems Operating Normally'}
                    </h2>
                    <p className="text-xs sm:text-sm text-gray-400 mx-auto leading-relaxed whitespace-nowrap">
                        {filter === 'ongoing'
                            ? 'Every monitored service is passing health checks with zero active disruptions.'
                            : 'No downtime incidents recorded for your monitors. Your endpoints are running reliably within SLA.'}
                    </p>

                    <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                        <Link
                            to="/app/monitors"
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow-sm shadow-blue-500/20 transition-all flex items-center gap-1.5"
                        >
                            <span>View Monitored Fleet</span>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        </Link>
                        <Link
                            to="/app/dashboard"
                            className="px-4 py-2 bg-gray-800/80 hover:bg-gray-800 text-gray-300 hover:text-white text-xs font-medium rounded-lg border border-gray-700/60 transition-colors"
                        >
                            Dashboard Overview
                        </Link>
                    </div>
                </div>
            ) : (
                <>
                    <div className="space-y-2.5">
                        {incidents.map((incident) => {
                            const schema = getColorScheme(incident);
                            const isOngoing = incident.status === 'ongoing';
                            const isDegraded = incident.statusCode === 429 ||
                                ['performance_issue', 'ssl_warning', 'content_issue', 'degraded', 'HIGH_LATENCY', 'HTTP_RATE_LIMIT', 'RATE_LIMIT'].includes(incident.errorType) ||
                                ['performance', 'security', 'content'].includes(incident.degradationCategory);
                            return (
                                <div
                                    key={incident._id}
                                    className={`bg-[#12121a]/95 backdrop-blur-md border border-gray-800/80 border-l-4 ${schema.border} rounded-xl p-3 sm:p-3.5 shadow-sm hover:border-gray-700 transition-all`}
                                >
                                    {/* Top Row: Name, Type, URL, HTTP Code & Status Badge */}
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                                        <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                            <span className={`w-2 h-2 rounded-full ${schema.dot} ${isOngoing ? 'animate-pulse' : ''} shrink-0`} />
                                            <h3 className="text-xs sm:text-sm font-bold text-white font-heading truncate">
                                                {incident.monitor ? (
                                                    <Link to={`/app/monitors/${incident.monitor._id}`} className="hover:text-blue-400 transition-colors">
                                                        {incident.monitor.name}
                                                    </Link>
                                                ) : 'Unknown Endpoint'}
                                            </h3>
                                            {incident.monitor?.type && (
                                                <span className="px-1.5 py-0.2 bg-gray-800 text-gray-400 text-[9px] font-mono rounded border border-gray-700 font-semibold uppercase shrink-0">
                                                    {incident.monitor.type}
                                                </span>
                                            )}
                                            <span className="text-[11px] text-gray-500 font-mono truncate max-w-[200px] sm:max-w-xs md:max-w-sm">
                                                {incident.monitor?.url}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                                            {incident.statusCode && (
                                                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-black/40 border border-gray-800 text-gray-300">
                                                    HTTP {incident.statusCode}
                                                </span>
                                            )}
                                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold uppercase rounded-full border ${schema.badge}`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${schema.dot} ${isOngoing ? 'animate-pulse' : ''}`} />
                                                <span>{incident.status}</span>
                                                <span className="font-mono opacity-80 font-semibold">({formatDuration(incident.duration, incident.startTime)})</span>
                                            </span>
                                        </div>
                                    </div>

                                    {/* Diagnostic Callout Banner */}
                                    {(incident.errorMessage || incident.errorType) && (
                                        <div className={`px-2.5 py-1.5 rounded-lg border text-xs flex items-center gap-2 ${schema.alertBg} ${schema.alertBorder} mb-2`}>
                                            {incident.errorType && (
                                                <span className="px-1.5 py-0.2 bg-black/50 text-gray-200 rounded text-[9px] font-mono font-bold border border-gray-700/60 shrink-0">
                                                    {formatErrorType(incident.errorType, incident.statusCode)}
                                                </span>
                                            )}
                                            {incident.errorMessage && (
                                                <p className={`font-mono text-[11px] leading-snug truncate flex-1 ${schema.text}`} title={incident.errorMessage}>
                                                    {incident.errorMessage}
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    {/* Bottom Telemetry & Multi-Region Strip */}
                                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-800/40 text-[10px] font-mono text-gray-400">
                                        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                                            <span>
                                                Started: <strong className="text-gray-300 font-semibold">{new Date(incident.startTime).toLocaleString()}</strong>
                                            </span>
                                            {incident.endTime ? (
                                                <span>
                                                    Resolved: <strong className="text-emerald-400 font-semibold">{new Date(incident.endTime).toLocaleString()}</strong>
                                                </span>
                                            ) : (
                                                <span className={`${isDegraded ? 'text-amber-400' : 'text-red-400'} font-semibold flex items-center gap-1`}>
                                                    <span className={`w-1.5 h-1.5 rounded-full ${isDegraded ? 'bg-amber-400' : 'bg-red-400'} animate-ping`} />
                                                    {isDegraded ? 'Active Degradation' : 'Active Outage'}
                                                </span>
                                            )}
                                        </div>

                                        {/* Multi-Region Probes Chips */}
                                        {incident.verifications?.length > 0 && (
                                            <div className="flex items-center gap-1 flex-wrap">
                                                <span className="text-gray-500 uppercase text-[9px] font-bold mr-0.5">Probes:</span>
                                                {incident.verifications.map((v, i) => (
                                                    <span
                                                        key={i}
                                                        className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-mono border ${
                                                            v.isUp
                                                                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                                                : 'bg-red-500/10 border-red-500/20 text-red-400'
                                                        }`}
                                                        title={`${v.location}: ${v.isUp ? 'UP' : 'DOWN'} (${v.responseTime}ms)`}
                                                    >
                                                        <span className={`w-1 h-1 rounded-full ${v.isUp ? 'bg-emerald-400' : 'bg-red-400'}`} />
                                                        <span>{v.location.split(',')[0]}</span>
                                                        <span className="text-gray-500">{v.responseTime}ms</span>
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
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
                                    <option value={5}>5</option>
                                    <option value={10}>10</option>
                                    <option value={20}>20</option>
                                    <option value={50}>50</option>
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
                                itemName="incidents"
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
                                <option value={5}>5</option>
                                <option value={10}>10</option>
                                <option value={20}>20</option>
                                <option value={50}>50</option>
                            </select>
                        </div>
                        <div className="w-auto">
                            <Pagination
                                currentPage={page}
                                totalPages={pagination.pages}
                                onPageChange={handlePageChange}
                                totalItems={pagination.total}
                                itemName="incidents"
                                card={true}
                                hideOnSinglePage={false}
                            />
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default Incidents;

