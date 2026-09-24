import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { adminAPI } from '../../services/api';
import { debounce } from '../../utils/debounce';
import Pagination from '../../components/Pagination';

const AdminUsers = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [limit, setLimit] = useState(10);
    const [pagination, setPagination] = useState({
        current: 1,
        pages: 1,
        total: 0
    });

    const fetchUsers = async (page = 1, search = searchTerm, currentLimit = limit) => {
        try {
            setLoading(true);
            const res = await adminAPI.getUsers(search, currentLimit, page);
            if (res.data.success) {
                setUsers(res.data.data);
                if (res.data.pagination) {
                    setPagination(res.data.pagination);
                } else {
                    // Fallback if pagination missing (legacy)
                    setPagination({ current: 1, pages: 1, total: res.data.data.length });
                }
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleLimitChange = (newLimit) => {
        setLimit(newLimit);
        fetchUsers(1, searchTerm, newLimit);
    };

    // Debounced search handler
    const debouncedSearch = useCallback(
        debounce((query) => {
            // Reset to page 1 on new search
            fetchUsers(1, query);
        }, 500),
        [limit]
    );

    useEffect(() => {
        fetchUsers();
    }, []);

    const handleSearchChange = (e) => {
        const query = e.target.value;
        setSearchTerm(query);
        debouncedSearch(query);
    };

    return (
        <div className="space-y-4 sm:space-y-5 animate-fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-white mb-0.5">Users</h1>
                    <p className="text-slate-400 text-xs sm:text-sm font-medium">Manage system users and access</p>
                </div>

                <div className="relative">
                    <input
                        type="text"
                        placeholder="Search users..."
                        className="bg-slate-800/90 border border-slate-700 text-white rounded-lg pl-8 pr-3 py-1.5 w-full sm:w-60 text-xs placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all"
                        value={searchTerm}
                        onChange={handleSearchChange}
                    />
                    <svg className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>
            </div>

            <div className="bg-slate-800/40 backdrop-blur-xl border border-slate-700/60 rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-400">
                        <thead className="bg-slate-900/50 text-[11px] uppercase font-semibold text-slate-400 border-b border-slate-700/40">
                            <tr>
                                <th className="px-4 py-2.5">User</th>
                                <th className="px-4 py-2.5">Status</th>
                                <th className="px-4 py-2.5">Joined</th>
                                <th className="px-4 py-2.5 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/40">
                            {loading && users.length === 0 ? (
                                <tr>
                                    <td colSpan="4" className="px-4 py-8 text-center text-slate-500">
                                        <div className="flex items-center justify-center gap-2 text-xs">
                                            <div className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                            Loading users...
                                        </div>
                                    </td>
                                </tr>
                            ) : users.length === 0 ? (
                                <tr>
                                    <td colSpan="4" className="px-4 py-8 text-center text-slate-500 text-xs">No users found</td>
                                </tr>
                            ) : (
                                users.map(user => (
                                    <tr key={user._id} className="hover:bg-slate-700/25 transition-colors group">
                                        <td className="px-4 py-2.5 sm:py-3">
                                            <div className="flex items-center gap-2.5">
                                                <div className="w-7 h-7 rounded-lg bg-blue-600 border border-blue-500/30 flex items-center justify-center text-white text-xs font-bold shadow-sm shadow-blue-500/20 shrink-0">
                                                    {user.name?.charAt(0).toUpperCase() || 'U'}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="text-white font-medium text-xs sm:text-sm truncate">{user.name}</div>
                                                    <div className="text-[11px] text-slate-500 truncate">{user.email}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-2.5 sm:py-3">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${user.isBanned
                                                ? 'bg-red-500/10 text-red-400 border-red-500/20'
                                                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                                }`}>
                                                {user.isBanned ? 'Banned' : 'Active'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2.5 sm:py-3 text-slate-400 text-xs font-mono whitespace-nowrap">
                                            {new Date(user.createdAt).toLocaleDateString(undefined, {
                                                year: 'numeric',
                                                month: 'short',
                                                day: 'numeric'
                                            })}
                                        </td>
                                        <td className="px-4 py-2.5 sm:py-3 text-right">
                                            <Link
                                                to={`/admin/users/${user._id}`}
                                                className="text-xs text-blue-400 hover:text-blue-300 font-medium px-2 py-1 rounded hover:bg-blue-500/10 transition-colors"
                                            >
                                                View Details
                                            </Link>
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
                            onPageChange={(p) => fetchUsers(p, searchTerm, limit)}
                            totalItems={pagination.total}
                            itemName="users"
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

export default AdminUsers;
