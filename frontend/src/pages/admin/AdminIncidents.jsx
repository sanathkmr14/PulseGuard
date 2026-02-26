import { useState, useEffect, useCallback } from 'react';
import { adminAPI } from '../../services/api';
import { debounce } from '../../utils/debounce';

const AdminIncidents = () => {
    const [incidents, setIncidents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });

    // Filters
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('all'); // Default to all to show full history
    const [sort, setSort] = useState('createdAt');

    const fetchIncidents = async (page = 1, currentSearch = search) => {
        try {
            setLoading(true);
            const res = await adminAPI.getIncidents({
                page,
                limit: 50,
                search: currentSearch,
                status: status === 'all' ? undefined : status, // API expects undefined for all if not handled
                sort
            });

            if (res.data.success) {
                setIncidents(res.data.data);
                setPagination(res.data.pagination);
            }
        } catch (error) {
            console.error("Failed to fetch incidents", error);
        } finally {
            setLoading(false);
        }
    };

    // Debounced search
    const debouncedSearch = useCallback(
        debounce((query) => {
            fetchIncidents(1, query);
        }, 500),
        [status, sort] // Re-create if filters change
    );

    useEffect(() => {
        fetchIncidents(1);
    }, [status, sort]); // Refresh when non-text filters change

    const handleSearchChange = (e) => {
        setSearch(e.target.value);
        debouncedSearch(e.target.value);
    };

    const handlePageChange = (newPage) => {
        if (newPage >= 1 && newPage <= pagination.pages) {
            fetchIncidents(newPage);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white mb-1">System Alerts</h1>
                    <p className="text-slate-400">View and manage system-wide alerts and incidents</p>
                </div>
            </div>

            {/* Filters Bar */}
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-4 flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                    <input
                        type="text"
                        placeholder="Search monitor, user, or email..."
                        className="bg-slate-900 border border-slate-700 text-white rounded-lg pl-10 pr-4 py-2 w-full focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        value={search}
                        onChange={handleSearchChange}
                    />
                    <svg className="w-5 h-5 text-slate-500 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>

                <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="bg-slate-900 border border-slate-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-[150px]"
                >
                    <option value="ongoing">Ongoing (Critical)</option>
                    <option value="resolved">Resolved</option>
                    <option value="all">All Statuses</option>
                </select>

                <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                    className="bg-slate-900 border border-slate-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-[180px]"
                >
                    <option value="createdAt">Newest First</option>
                    <option value="oldest">Oldest First</option>
                    <option value="duration_desc">Longest Duration</option>
                </select>
            </div>

            {/* Table */}
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-800/80 border-b border-slate-700">
                            <tr>
                                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Monitor</th>
                                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">User</th>
                                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Notification</th>
                                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Duration</th>
                                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Started</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700">
                            {loading ? (
                                <tr>
                                    <td colSpan="6" className="px-6 py-12 text-center">
                                        <div className="flex justify-center items-center gap-2 text-slate-400">
                                            <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                                            Loading alerts...
                                        </div>
                                    </td>
                                </tr>
                            ) : incidents.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="px-6 py-12 text-center text-slate-500">
                                        <div className="flex flex-col items-center gap-2">
                                            <p>No alerts found matching your filters</p>
                                            {(search || status !== 'all') && (
                                                <button
                                                    onClick={() => {
                                                        setSearch('');
                                                        setStatus('all');
                                                        fetchIncidents(1, '');
                                                    }}
                                                    className="text-indigo-400 hover:text-indigo-300 text-sm font-medium"
                                                >
                                                    Clear filters
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                incidents.map(incident => (
                                    <tr key={incident._id} className="hover:bg-slate-800/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="font-medium text-white">{incident.monitor?.name || 'Unknown'}</div>
                                            <div className="text-xs text-slate-500 truncate max-w-[200px]">{incident.monitor?.url}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-[10px] text-white font-bold">
                                                    {incident.monitor?.user?.name?.charAt(0) || '?'}
                                                </div>
                                                <span className="text-sm text-slate-300">{incident.monitor?.user?.name || 'Unknown'}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {incident.status === 'ongoing' ? (
                                                incident.severity === 'high' || incident.errorType?.includes('DOWN') ? (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-500 border border-red-500/20">
                                                        <span className="relative flex h-2 w-2">
                                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                                                        </span>
                                                        Critical
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-500 border border-amber-500/20">
                                                        <span className="relative flex h-2 w-2">
                                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                                                        </span>
                                                        Degraded
                                                    </span>
                                                )
                                            ) : (
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                    Resolved
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            {incident.notificationsSent?.email ? (
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                                    Notified
                                                </span>
                                            ) : (incident.monitor?.user?.notificationPreferences?.email === false) ? (
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-700/30 text-slate-500 border border-slate-600">
                                                    Disabled
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-500 border border-amber-500/20">
                                                    Pending
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-slate-300 font-mono">
                                            {incident.duration ? (
                                                `${Math.round(incident.duration / 1000 / 60)}m`
                                            ) : (
                                                <span className="text-amber-500">Active</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-slate-400">
                                            {new Date(incident.createdAt).toLocaleString()}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="px-6 py-4 border-t border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
                    <div className="text-sm text-slate-400">
                        Showing page <span className="font-medium text-white">{pagination.page}</span> of <span className="font-medium text-white">{pagination.pages}</span>
                        <span className="ml-2 opacity-50">({pagination.total} total)</span>
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                        <button
                            onClick={() => handlePageChange(pagination.page - 1)}
                            disabled={pagination.page === 1 || loading}
                            className="flex-1 sm:flex-none justify-center px-4 py-2 sm:py-1 text-sm rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Previous
                        </button>
                        <button
                            onClick={() => handlePageChange(pagination.page + 1)}
                            disabled={pagination.page >= pagination.pages || loading}
                            className="flex-1 sm:flex-none justify-center px-4 py-2 sm:py-1 text-sm rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Next
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminIncidents;
