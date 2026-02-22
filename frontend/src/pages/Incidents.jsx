import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { incidentAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../hooks/useSocket';

const StatusBadge = ({ status, colorScheme }) => {
    return (
        <span className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold uppercase rounded-full border ${colorScheme.badge}`}>
            <span className={`w-2 h-2 rounded-full ${colorScheme.dot} ${status === 'ongoing' ? 'animate-pulse-slow' : ''}`} />
            {status}
        </span>
    );
};

const Incidents = () => {
    const { user } = useAuth();
    const [incidents, setIncidents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState({ current: 1, pages: 1, total: 0 });

    const { subscribe } = useSocket();

    useEffect(() => {
        fetchIncidents(page, filter);

        // Use subscribe pattern for automatic cleanup
        const unsub1 = subscribe('incident_created', () => fetchIncidents(page, filter));
        const unsub2 = subscribe('monitor_status_change', () => fetchIncidents(page, filter));

        return () => {
            unsub1();
            unsub2();
        };
    }, [subscribe, page, filter]);

    const fetchIncidents = async (pageNum = page, statusFilter = filter) => {
        try {
            setLoading(true);
            const params = { page: pageNum, limit: 15 };
            if (statusFilter && statusFilter !== 'all') {
                params.status = statusFilter;
            }
            const response = await incidentAPI.getAll(params);
            setIncidents(response.data.data);
            if (response.data.pagination) setPagination(response.data.pagination);
        } catch (error) {
            console.error('Error fetching incidents:', error);
        } finally {
            setLoading(false);
        }
    };

    const getColorScheme = (incident) => {
        if (incident.status === 'resolved') {
            return {
                border: 'border-l-emerald-500',
                bg: 'bg-emerald-500/10',
                text: 'text-emerald-400',
                badge: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
                dot: 'bg-emerald-400',
                alertBg: 'bg-emerald-500/10',
                alertBorder: 'border-emerald-500/20'
            };
        }

        const isDegraded = ['performance_issue', 'ssl_warning', 'content_issue', 'degraded', 'HIGH_LATENCY', 'HTTP_RATE_LIMIT'].includes(incident.errorType) ||
            ['performance', 'security', 'content'].includes(incident.degradationCategory);

        if (isDegraded) {
            return {
                border: 'border-l-amber-500',
                bg: 'bg-amber-500/10',
                text: 'text-amber-400',
                badge: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
                dot: 'bg-amber-400',
                alertBg: 'bg-amber-500/10',
                alertBorder: 'border-amber-500/20'
            };
        }

        return {
            border: 'border-l-red-500',
            bg: 'bg-red-500/10',
            text: 'text-red-400',
            badge: 'bg-red-500/20 text-red-400 border-red-500/30',
            dot: 'bg-red-400',
            alertBg: 'bg-red-500/10',
            alertBorder: 'border-red-500/20'
        };
    };

    const formatDuration = (ms) => {
        if (!ms) return 'Ongoing';
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        if (days > 0) return `${days}d ${hours % 24}h`;
        if (hours > 0) return `${hours}h ${minutes % 60}m`;
        if (minutes > 0) return `${minutes}m`;
        return `${seconds}s`;
    };

    const handleFilterChange = (newFilter) => {
        setFilter(newFilter);
        setPage(1); // Reset to page 1 when filter changes
    };

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <div className="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
        </div>
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-white font-heading">Incidents</h1>
                    <p className="text-gray-400 mt-1">Track downtime events and incidents</p>
                </div>
                <div className="flex gap-2">
                    {['all', 'ongoing', 'resolved'].map(f => (
                        <button key={f} onClick={() => handleFilterChange(f)}
                            className={`px-4 py-2 text-sm font-medium rounded-xl transition-all ${filter === f
                                ? 'bg-indigo-600 text-white'
                                : 'bg-gray-800/50 text-gray-400 hover:bg-gray-800 hover:text-white'
                                }`}>
                            {f.charAt(0).toUpperCase() + f.slice(1)}
                        </button>
                    ))}
                </div>
            </div>

            {incidents.length === 0 ? (
                <div className="glass-panel rounded-2xl p-12 text-center h-64 flex flex-col items-center justify-center">
                    <div className="text-5xl mb-4">✅</div>
                    <h3 className="text-xl font-semibold text-white mb-2 font-heading">No incidents recorded</h3>
                    <p className="text-gray-400">All your monitors are running smoothly!</p>
                </div>
            ) : (
                <>
                    <div className="space-y-3">
                        {incidents.map((incident) => {
                            const schema = getColorScheme(incident);
                            return (
                                <div key={incident._id}
                                    className={`glass-card p-4 border-l-4 ${schema.border} shadow-xl`}>
                                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
                                        <div>
                                            <h3 className="text-lg font-semibold text-white mb-1 font-heading">
                                                {incident.monitor ? (
                                                    <Link to={`/app/monitors/${incident.monitor._id}`} className="hover:text-indigo-400 transition-colors">
                                                        {incident.monitor.name}
                                                    </Link>
                                                ) : 'Unknown Monitor'}
                                            </h3>
                                            <p className="text-sm text-gray-500 truncate max-w-md font-mono">{incident.monitor?.url}</p>
                                        </div>
                                        <StatusBadge status={incident.status} colorScheme={schema} />
                                    </div>

                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-3">
                                        <div>
                                            <p className="text-[10px] uppercase font-bold text-gray-500 mb-1">Started</p>
                                            <p className="text-sm text-white font-medium">{new Date(incident.startTime).toLocaleString()}</p>
                                        </div>
                                        {incident.endTime && (
                                            <div>
                                                <p className="text-[10px] uppercase font-bold text-gray-500 mb-1">Resolved</p>
                                                <p className="text-sm text-white font-medium">{new Date(incident.endTime).toLocaleString()}</p>
                                            </div>
                                        )}
                                        <div>
                                            <p className="text-[10px] uppercase font-bold text-gray-500 mb-1">Duration</p>
                                            <p className={`text-sm font-bold font-heading ${incident.status === 'ongoing' ? schema.text : 'text-white'}`}>
                                                {formatDuration(incident.duration)}
                                            </p>
                                        </div>
                                        {incident.statusCode && (
                                            <div>
                                                <p className="text-[10px] uppercase font-bold text-gray-500 mb-1">Status Code</p>
                                                <p className="text-sm font-bold font-heading text-white">{incident.statusCode}</p>
                                            </div>
                                        )}
                                    </div>

                                    {(incident.errorMessage || incident.errorType) && (
                                        <div className={`p-4 border rounded-xl ${schema.alertBg} ${schema.alertBorder}`}>
                                            {incident.errorType && (
                                                <div className="flex items-center gap-2 mb-2">
                                                    <span className="text-xs text-gray-500">Error Type:</span>
                                                    <span className={`px-2 py-0.5 text-xs font-semibold rounded ${schema.badge}`}>
                                                        {incident.errorType}
                                                    </span>
                                                </div>
                                            )}
                                            {incident.errorMessage && (
                                                <p className={`text-sm ${schema.text}`}>{incident.errorMessage}</p>
                                            )}
                                        </div>
                                    )}

                                    {incident.verifications?.length > 0 && (
                                        <div className="mt-4 pt-4 border-t border-gray-800/30">
                                            <p className="text-[10px] uppercase font-bold text-gray-600 mb-2 tracking-wider">Verification Regions</p>
                                            <div className="flex flex-wrap gap-2">
                                                {incident.verifications.map((v, i) => (
                                                    <div key={i} className={`flex items-center gap-2 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-all
                                                        ${v.isUp
                                                            ? 'bg-emerald-500/5 border-emerald-500/10 text-emerald-500/70'
                                                            : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
                                                        <span className={`w-1.5 h-1.5 rounded-full ${v.isUp ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-red-500'}`} />
                                                        {v.location}
                                                        <span className="text-[10px] opacity-40 italic ml-1">{v.responseTime}ms</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Pagination Controls */}
                    {pagination.pages > 1 && (
                        <div className="flex flex-col sm:flex-row justify-between items-center mt-6 gap-4 px-2">
                            <div className="text-sm text-gray-400 text-center sm:text-left">
                                Page {pagination.current} of {pagination.pages} ({pagination.total} total incidents)
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setPage(old => Math.max(old - 1, 1))}
                                    disabled={page === 1}
                                    className="px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg border border-gray-700 transition-colors"
                                >
                                    Previous
                                </button>
                                <button
                                    onClick={() => setPage(old => Math.min(old + 1, pagination.pages))}
                                    disabled={page === pagination.pages}
                                    className="px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg border border-gray-700 transition-colors"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default Incidents;
