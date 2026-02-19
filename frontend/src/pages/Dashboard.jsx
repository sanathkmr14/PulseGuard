import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { statsAPI, monitorAPI, incidentAPI } from '../services/api';
import { useSocket } from '../hooks/useSocket';

// Modern SVG Icons
const Icons = {
    monitors: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
    ),
    active: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
    ),
    down: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
    ),
    degraded: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
    ),
    uptime: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
    ),
    alert: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
    ),
    search: (
        <svg className="w-12 h-12 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
    ),
};

const StatCard = ({ icon, value, label, color, iconColor, glowClass }) => (
    <div className={`glass-card p-5 ${glowClass} cursor-pointer`}>
        <div className={`mb-3 ${iconColor}`}>{icon}</div>
        <div className={`text-3xl font-bold font-heading ${color}`}>{value}</div>
        <div className="text-gray-400 text-sm mt-1">{label}</div>
    </div>
);

const StatusDot = ({ status }) => {
    const colors = { up: 'bg-emerald-500', down: 'bg-red-500', degraded: 'bg-amber-500', paused: 'bg-gray-500', unknown: 'bg-blue-500' };
    return <span className={`w-2.5 h-2.5 rounded-full ${colors[status] || colors.unknown} animate-pulse-slow`} />;
};

const Dashboard = () => {
    const [stats, setStats] = useState(null);
    const [monitors, setMonitors] = useState([]);
    const [incidents, setIncidents] = useState([]);
    const [loading, setLoading] = useState(true);
    const { subscribe } = useSocket();

    const fetchData = useCallback(async () => {
        try {
            const results = await Promise.allSettled([
                statsAPI.getDashboardStats(), // Fixed method name
                monitorAPI.getAll(),
                incidentAPI.getAll()
            ]);

            // Handle Stats
            if (results[0].status === 'fulfilled' && results[0].value.data.success) {
                setStats(results[0].value.data.data);
            } else {
                console.error('Stats fetch failed:', results[0].reason || results[0].value?.data?.message);
                setStats(null); // Ensure fallback or empty state
            }

            // Handle Monitors
            if (results[1].status === 'fulfilled' && results[1].value.data.success) {
                setMonitors(results[1].value.data.data);
            } else {
                console.error('Monitors fetch failed:', results[1].reason);
                setMonitors([]);
            }

            // Handle Incidents
            if (results[2].status === 'fulfilled' && results[2].value.data.success) {
                setIncidents(results[2].value.data.data.filter(x => x.status === 'ongoing'));
            } else {
                console.error('Incidents fetch failed:', results[2].reason);
                setIncidents([]);
            }
        } catch (e) {
            console.error('Unexpected dashboard error:', e);
        } finally {
            setLoading(false);
        }
    }, []);

    const handleMonitorUpdate = useCallback((data) => {
        setMonitors(prev => prev.map(m => m._id === data.monitorId ? { ...m, status: data.status, lastChecked: data.lastChecked, lastResponseTime: data.lastResponseTime } : m));
    }, []);

    useEffect(() => {
        fetchData();
        // Use subscribe pattern for automatic cleanup
        const unsub1 = subscribe('monitor_update', handleMonitorUpdate);
        const unsub2 = subscribe('monitor_status_change', fetchData);
        const unsub3 = subscribe('incident_created', fetchData);
        return () => {
            unsub1();
            unsub2();
            unsub3();
        };
    }, [subscribe, fetchData, handleMonitorUpdate]);

    const isDegradedIncident = (inc) => {
        return ['performance_issue', 'ssl_warning', 'content_issue', 'degraded', 'HIGH_LATENCY'].includes(inc.errorType) ||
            ['performance', 'security', 'content'].includes(inc.degradationCategory);
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
            <div className="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
        </div>
    );

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-white">Dashboard</h1>
                <p className="text-gray-500 mt-1">Monitor your services at a glance</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <StatCard icon={Icons.monitors} value={stats?.totalMonitors || 0} label="Total Monitors" color="text-white" iconColor="text-indigo-400" glowClass="glow-primary" />
                <StatCard icon={Icons.active} value={stats?.activeMonitors || 0} label="Up" color="text-emerald-400" iconColor="text-emerald-400" glowClass="glow-emerald" />
                <StatCard icon={Icons.down} value={stats?.downMonitors || 0} label="Down" color="text-red-400" iconColor="text-red-400" glowClass="glow-red" />
                <StatCard icon={Icons.degraded} value={stats?.degradedMonitors || 0} label="Degraded" color="text-amber-400" iconColor="text-amber-400" glowClass="glow-primary" />
                <StatCard icon={Icons.uptime} value={`${stats?.overallUptime?.toFixed(1) || 0}%`} label="Uptime" color="text-indigo-400" iconColor="text-indigo-400" glowClass="glow-primary" />
            </div>

            {/* Active Incidents */}
            {incidents.length > 0 && (() => {
                const theme = getDashboardColorTheme();
                return (
                    <div className={`${theme.bg} border ${theme.border} rounded-2xl shadow-lg shadow-black/20`}>
                        <div className="flex items-center justify-between p-5 border-b border-gray-800/30">
                            <h2 className={`text-lg font-semibold ${theme.text} flex items-center gap-2`}>
                                <span className={theme.icon}>{Icons.alert}</span>
                                Active Incidents
                            </h2>
                            <Link to="/app/incidents" className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors">View All →</Link>
                        </div>
                        <div className="p-5 space-y-3">
                            {incidents.slice(0, 5).map(inc => {
                                const isDegraded = isDegradedIncident(inc);
                                return (
                                    <div key={inc._id} className={`glass-card p-4 border-l-4 ${isDegraded ? 'border-amber-500/50 border-l-amber-500' : 'border-red-500/50 border-l-red-500'} cursor-pointer`}>
                                        <div className="flex justify-between items-start">
                                            <div className="font-medium text-white">{inc.monitor?.name}</div>
                                            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${isDegraded ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400'}`}>
                                                {isDegraded ? 'Degraded' : 'Critical'}
                                            </span>
                                        </div>
                                        <div className="text-sm text-gray-500 mt-1 truncate">{inc.errorMessage}</div>
                                        <div className="text-xs text-gray-600 mt-2 flex items-center gap-1.5">
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            Started: {new Date(inc.startTime).toLocaleString()}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })()}

            {/* Monitors */}
            <div className="glass-panel rounded-2xl overflow-hidden shadow-2xl">
                <div className="flex items-center justify-between p-5 border-b border-gray-800/30">
                    <h2 className="text-lg font-semibold text-white">Your Monitors</h2>
                    <Link to="/app/monitors" className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors">View All →</Link>
                </div>
                {monitors.length === 0 ? (
                    <div className="p-10 text-center">
                        <div className="flex justify-center mb-4">{Icons.search}</div>
                        <p className="text-gray-500 mb-4">No monitors yet</p>
                        <Link to="/app/monitors" className="inline-block px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors">
                            Create Monitor
                        </Link>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-800/50">
                        {monitors.slice(0, 5).map(m => (
                            <Link key={m._id} to={`/app/monitors/${m._id}`} className="flex items-center justify-between p-4 hover:bg-gray-800/30 transition-colors">
                                <div className="flex items-center gap-3 min-w-0">
                                    <StatusDot status={m.status} />
                                    <div className="min-w-0">
                                        <div className="font-medium text-white truncate">{m.name}</div>
                                        <div className="text-sm text-gray-500 truncate">{m.url}</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4 text-sm">
                                    <span className="text-gray-400 hidden sm:block">{m.lastResponseTime ? `${m.lastResponseTime}ms` : '—'}</span>
                                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold uppercase ${m.status === 'up' ? 'bg-emerald-500/20 text-emerald-400' :
                                        m.status === 'degraded' ? 'bg-amber-500/20 text-amber-400' :
                                            m.status === 'down' ? 'bg-red-500/20 text-red-400' : 'bg-gray-500/20 text-gray-400'
                                        }`}>{m.status}</span>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Dashboard;
