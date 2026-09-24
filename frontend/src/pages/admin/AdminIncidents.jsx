import { useState, useEffect, useCallback } from 'react';
import { adminAPI } from '../../services/api';
import { debounce } from '../../utils/debounce';
import Pagination from '../../components/Pagination';

const AdminIncidents = () => {
    const [incidents, setIncidents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(10);
    const [pagination, setPagination] = useState({ current: 1, pages: 1, total: 0 });

    // Filters
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('all'); // Default to all to show full history
    const [sort, setSort] = useState('createdAt');

    const fetchIncidents = async (targetPage = page, currentSearch = search, currentLimit = limit) => {
        try {
            setLoading(true);
            const res = await adminAPI.getIncidents({
                page: targetPage,
                limit: currentLimit,
                search: currentSearch,
                status: status === 'all' ? undefined : status,
                sort
            });

            if (res.data.success) {
                setIncidents(res.data.data);
                setPagination({
                    current: res.data.pagination?.current || targetPage,
                    pages: res.data.pagination?.pages || 1,
                    total: res.data.pagination?.total || 0
                });
                setPage(targetPage);
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
            fetchIncidents(1, query, limit);
        }, 500),
        [status, sort, limit]
    );

    useEffect(() => {
        fetchIncidents(1, search, limit);
    }, [status, sort]);

    const handleSearchChange = (e) => {
        setSearch(e.target.value);
        debouncedSearch(e.target.value);
    };

    const handleLimitChange = (newLimit) => {
        setLimit(newLimit);
        fetchIncidents(1, search, newLimit);
    };

    const handlePageChange = (newPage) => {
        if (newPage >= 1 && newPage <= pagination.pages) {
            fetchIncidents(newPage, search, limit);
        }
    };

    return (
        <div className="space-y-4 sm:space-y-5 animate-fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-white mb-0.5">System Alerts</h1>
                    <p className="text-slate-400 text-xs sm:text-sm font-medium">View and manage system-wide alerts and incidents</p>
                </div>
            </div>

            {/* Filters Bar */}
            <div className="bg-slate-800/40 backdrop-blur-xl border border-slate-700/60 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-sm">
                <div className="relative w-full sm:w-64 md:w-72">
                    <input
                        type="text"
                        placeholder="Search monitor, user, or email..."
                        className="bg-slate-800/90 border border-slate-700 text-white rounded-lg pl-8 pr-3 py-1.5 w-full text-xs placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all"
                        value={search}
                        onChange={handleSearchChange}
                    />
                    <svg className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>

                <div className="grid grid-cols-2 sm:flex sm:flex-nowrap items-center gap-2 w-full sm:w-auto">
                    <select
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                        className="bg-slate-800/90 border border-slate-700 text-white rounded-lg px-2.5 sm:px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 w-full sm:w-auto min-w-0 sm:min-w-[130px] cursor-pointer"
                    >
                        <option value="ongoing">Ongoing (Critical)</option>
                        <option value="resolved">Resolved</option>
                        <option value="all">All Statuses</option>
                    </select>

                    <select
                        value={sort}
                        onChange={(e) => setSort(e.target.value)}
                        className="bg-slate-800/90 border border-slate-700 text-white rounded-lg px-2.5 sm:px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 w-full sm:w-auto min-w-0 sm:min-w-[130px] cursor-pointer"
                    >
                        <option value="createdAt">Newest First</option>
                        <option value="oldest">Oldest First</option>
                        <option value="duration_desc">Longest Duration</option>
                    </select>
                </div>
            </div>

            {/* Table */}
            <div className="bg-slate-800/40 backdrop-blur-xl border border-slate-700/60 rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-400">
                        <thead className="bg-slate-900/50 text-[11px] uppercase font-semibold text-slate-400 border-b border-slate-700/40">
                            <tr>
                                <th className="px-3.5 py-2.5">Monitor</th>
                                <th className="px-3.5 py-2.5">User</th>
                                <th className="px-3.5 py-2.5">Status</th>
                                <th className="px-3.5 py-2.5">Notification</th>
                                <th className="px-3.5 py-2.5">Duration</th>
                                <th className="px-3.5 py-2.5">Started</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/40">
                            {loading ? (
                                <tr>
                                    <td colSpan="6" className="px-4 py-8 text-center text-slate-500">
                                        <div className="flex justify-center items-center gap-2 text-xs">
                                            <div className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                            Loading alerts...
                                        </div>
                                    </td>
                                </tr>
                            ) : incidents.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="px-4 py-8 text-center text-slate-500 text-xs">
                                        <div className="flex flex-col items-center gap-2">
                                            <p>No alerts found matching your filters</p>
                                            {(search || status !== 'all') && (
                                                <button
                                                    onClick={() => {
                                                        setSearch('');
                                                        setStatus('all');
                                                        fetchIncidents(1, '', limit);
                                                    }}
                                                    className="text-blue-400 hover:text-blue-300 text-xs font-medium"
                                                >
                                                    Clear filters
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                incidents.map(incident => (
                                    <tr key={incident._id} className="hover:bg-slate-700/25 transition-colors">
                                        <td className="px-3.5 py-2.5 sm:py-3">
                                            <div className="font-medium text-white text-xs sm:text-sm">{incident.monitor?.name || 'Unknown'}</div>
                                            <div className="text-[11px] text-slate-500 truncate max-w-[200px] font-mono">{incident.monitor?.url}</div>
                                        </td>
                                        <td className="px-3.5 py-2.5 sm:py-3">
                                            <div className="flex items-center gap-2">
                                                <div className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-[10px] text-white font-bold shrink-0">
                                                    {incident.monitor?.user?.name?.charAt(0) || '?'}
                                                </div>
                                                <span className="text-xs text-slate-300 truncate max-w-[120px]">{incident.monitor?.user?.name || 'Unknown'}</span>
                                            </div>
                                        </td>
                                        <td className="px-3.5 py-2.5 sm:py-3">
                                            {incident.status === 'ongoing' ? (
                                                incident.severity === 'high' || incident.errorType?.includes('DOWN') ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                                                        <span className="relative flex h-1.5 w-1.5">
                                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500"></span>
                                                        </span>
                                                        Critical
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                                        <span className="relative flex h-1.5 w-1.5">
                                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500"></span>
                                                        </span>
                                                        Degraded
                                                    </span>
                                                )
                                            ) : (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                    Resolved
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-3.5 py-2.5 sm:py-3">
                                            {incident.notificationsSent?.email ? (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                    Notified
                                                </span>
                                            ) : (incident.monitor?.user?.notificationPreferences?.email === false) ? (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-700/30 text-slate-500 border border-slate-600">
                                                    Disabled
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                                    Pending
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-3.5 py-2.5 sm:py-3 text-xs text-slate-300 font-mono">
                                            {incident.duration ? (
                                                `${Math.round(incident.duration / 1000 / 60)}m`
                                            ) : (
                                                <span className="text-amber-400 animate-pulse">Active</span>
                                            )}
                                        </td>
                                        <td className="px-3.5 py-2.5 sm:py-3 text-xs text-slate-400 font-mono whitespace-nowrap">
                                            {new Date(incident.createdAt).toLocaleString(undefined, {
                                                month: 'short',
                                                day: 'numeric',
                                                hour: '2-digit',
                                                minute: '2-digit'
                                            })}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Numbered Pagination & Limit Selector */}
                {pagination.total > 0 && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-2.5 border-t border-slate-700/50 bg-slate-900/40">
                        <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
                            <span>Per page:</span>
                            <select
                                value={limit}
                                onChange={(e) => handleLimitChange(Number(e.target.value))}
                                className="bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-white font-mono text-[11px] focus:border-blue-500 outline-none cursor-pointer"
                            >
                                <option value={5}>5</option>
                                <option value={10}>10</option>
                                <option value={20}>20</option>
                                <option value={50}>50</option>
                            </select>
                        </div>
                        <Pagination
                            currentPage={pagination.current}
                            totalPages={pagination.pages}
                            onPageChange={(p) => handlePageChange(p)}
                            totalItems={pagination.total}
                            itemName="alerts"
                            compact={true}
                            hideOnSinglePage={false}
                            className="!border-0 !p-0"
                        />
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminIncidents;
