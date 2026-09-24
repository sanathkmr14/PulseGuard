import { useState, useEffect } from 'react';
import { adminAPI } from '../../services/api';

const formatValue = (key, value) => {
    if (value === null || value === undefined) return '—';
    if (key === 'lastRun' && value) {
        const diff = Date.now() - new Date(value).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'Just now';
        if (mins < 60) return `${mins}m ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h ago`;
        return new Date(value).toLocaleDateString();
    }
    return value;
};

const AdminHealth = () => {
    const [healthData, setHealthData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [lastUpdated, setLastUpdated] = useState(null);

    const fetchHealth = async (isManual = false) => {
        try {
            if (isManual) setRefreshing(true);
            const res = await adminAPI.getSystemHealth(isManual ? { refresh: 'true' } : {});
            if (res.data.success) {
                setHealthData(res.data.data);
                setLastUpdated(new Date());
            }
        } catch (error) {
            console.error("Failed to fetch system health", error);
        } finally {
            setLoading(false);
            if (isManual) setTimeout(() => setRefreshing(false), 500);
        }
    };

    useEffect(() => {
        fetchHealth();
        const interval = setInterval(() => fetchHealth(), 30000);
        return () => clearInterval(interval);
    }, []);

    if (loading || !healthData) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="flex items-center gap-3 text-slate-400">
                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    <span className="font-medium text-xs sm:text-sm">Connecting to infrastructure telemetry...</span>
                </div>
            </div>
        );
    }

    const { database, queue, workers, system } = healthData;

    return (
        <div className="space-y-4 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-white mb-0.5">System Health</h1>
                    <p className="text-slate-400 text-xs sm:text-sm font-medium">Monitor infrastructure performance and telemetry</p>
                </div>
                <button
                    onClick={() => fetchHealth(true)}
                    disabled={refreshing}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/70 text-slate-300 hover:text-white text-xs font-medium transition-all shadow-sm cursor-pointer disabled:opacity-50"
                >
                    <svg className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-blue-400' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
                </button>
            </div>

            {/* Compact 4-Card Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                {/* 1. Database (MongoDB) */}
                <div className="bg-slate-800/40 backdrop-blur-xl border border-slate-700/60 rounded-xl p-3.5 shadow-sm flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between gap-2 mb-3">
                            <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                                    <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                                    </svg>
                                </div>
                                <h3 className="text-white font-semibold text-xs truncate">MongoDB</h3>
                            </div>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                {database.status}
                            </span>
                        </div>

                        <div className="space-y-1.5 text-xs">
                            <div className="flex justify-between items-center py-1 border-b border-slate-700/30">
                                <span className="text-slate-400 text-[11px]">Collections</span>
                                <span className="text-white font-mono text-[11px] font-semibold">{database.details?.collections ?? '—'}</span>
                            </div>
                            <div className="flex justify-between items-center py-1 border-b border-slate-700/30">
                                <span className="text-slate-400 text-[11px]">Indexes</span>
                                <span className="text-white font-mono text-[11px] font-semibold">{database.details?.indexes ?? '—'}</span>
                            </div>
                            <div className="flex justify-between items-center py-1" title="Continuous live database connection session duration">
                                <span className="text-slate-400 text-[11px]">Conn Uptime</span>
                                <span className="text-white font-mono text-[11px]">{database.details?.uptime ?? '—'}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 2. Job Queue (BullMQ) */}
                <div className="bg-slate-800/40 backdrop-blur-xl border border-slate-700/60 rounded-xl p-3.5 shadow-sm flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between gap-2 mb-2.5">
                            <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                                    <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                                    </svg>
                                </div>
                                <h3 className="text-white font-semibold text-xs truncate">BullMQ Queue</h3>
                            </div>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                {queue.status}
                            </span>
                        </div>

                        {/* Queue Micro Chips */}
                        <div className="grid grid-cols-3 gap-1.5 mb-2">
                            <div className="bg-slate-900/60 border border-slate-700/60 rounded-lg p-1 text-center" title="Jobs executing right at this instant (checks complete in 50-200ms)">
                                <div className="text-[9px] sm:text-[10px] text-slate-400 truncate">Active</div>
                                <div className="text-xs font-mono font-bold text-blue-400">{queue.details?.active ?? 0}</div>
                            </div>
                            <div className="bg-slate-900/60 border border-slate-700/60 rounded-lg p-1 text-center" title="Monitors scheduled and ticking down to next run">
                                <div className="text-[9px] sm:text-[10px] text-slate-400 truncate">Scheduled</div>
                                <div className="text-xs font-mono font-bold text-indigo-400">{queue.details?.scheduled ?? queue.details?.delayed ?? queue.details?.waiting ?? 0}</div>
                            </div>
                            <div className="bg-slate-900/60 border border-slate-700/60 rounded-lg p-1 text-center" title="Failed jobs">
                                <div className="text-[9px] sm:text-[10px] text-slate-400 truncate">Failed</div>
                                <div className="text-xs font-mono font-bold text-red-400">{queue.details?.failed ?? 0}</div>
                            </div>
                        </div>

                        <div className="space-y-1 text-xs">
                            <div className="flex justify-between items-center py-0.5">
                                <span className="text-slate-400 text-[11px]">Jobs Today</span>
                                <span className="text-white font-mono text-[11px] font-semibold">{queue.details?.jobsToday?.toLocaleString() ?? 0}</span>
                            </div>
                            <div className="flex justify-between items-center py-0.5">
                                <span className="text-slate-400 text-[11px]">Last Run</span>
                                <span className="text-white font-mono text-[11px]">{formatValue('lastRun', queue.details?.lastRun)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 3. Worker Nodes */}
                <div className="bg-slate-800/40 backdrop-blur-xl border border-slate-700/60 rounded-xl p-3.5 shadow-sm flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between gap-2 mb-3">
                            <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                                    <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                                    </svg>
                                </div>
                                <h3 className="text-white font-semibold text-xs truncate">Worker Nodes</h3>
                            </div>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                {workers.status}
                            </span>
                        </div>

                        <div className="space-y-1.5 text-xs">
                            <div className="flex justify-between items-center py-1 border-b border-slate-700/30">
                                <span className="text-slate-400 text-[11px]">Instances</span>
                                <span className="text-white font-mono text-[11px] font-semibold">{workers.details?.instances ?? 1} node</span>
                            </div>
                            <div className="flex justify-between items-center py-1 border-b border-slate-700/30">
                                <span className="text-slate-400 text-[11px]">CPU Load</span>
                                <span className="text-white font-mono text-[11px]">{workers.details?.cpuUsage ?? '—'}</span>
                            </div>
                            <div className="flex justify-between items-center py-1">
                                <span className="text-slate-400 text-[11px]">Memory Heap</span>
                                <span className="text-white font-mono text-[11px]">{workers.details?.memoryUsage ?? '—'}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 4. Server Host */}
                <div className="bg-slate-800/40 backdrop-blur-xl border border-slate-700/60 rounded-xl p-3.5 shadow-sm flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between gap-2 mb-3">
                            <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
                                    <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                                    </svg>
                                </div>
                                <h3 className="text-white font-semibold text-xs truncate">Server Host</h3>
                            </div>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                {system.status}
                            </span>
                        </div>

                        <div className="space-y-1.5 text-xs">
                            <div className="flex justify-between items-center py-1 border-b border-slate-700/30">
                                <span className="text-slate-400 text-[11px]">Platform</span>
                                <span className="text-white font-mono text-[11px] capitalize">{system.details?.platform ?? 'Linux'}</span>
                            </div>
                            <div className="flex justify-between items-center py-1 border-b border-slate-700/30">
                                <span className="text-slate-400 text-[11px]">System Uptime</span>
                                <span className="text-white font-mono text-[11px] font-semibold">{system.details?.uptime ?? '—'}</span>
                            </div>
                            <div className="flex justify-between items-center py-1">
                                <span className="text-slate-400 text-[11px]">Service</span>
                                <span className="text-white font-mono text-[11px]">Node.js Runtime</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Clean Status & Maintenance Strip */}
            <div className="bg-slate-800/40 backdrop-blur-xl border border-slate-700/60 rounded-xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-2.5 shadow-sm">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <span className="relative flex h-2 w-2 shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span className="text-xs font-semibold text-white">All Infrastructure Systems Healthy</span>
                    <span className="hidden sm:inline text-slate-600">•</span>
                    <span className="text-xs text-slate-400">Regular maintenance window: Sunday at 02:00 UTC</span>
                </div>
                <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5 shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-700/40 w-full sm:w-auto justify-between sm:justify-end">
                    {lastUpdated && (
                        <span>Updated: {lastUpdated.toLocaleTimeString()}</span>
                    )}
                    {lastUpdated && <span className="text-slate-600">•</span>}
                    <span>Live (30s)</span>
                </div>
            </div>
        </div>
    );
};

export default AdminHealth;
