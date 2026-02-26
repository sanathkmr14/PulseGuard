import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { adminAPI } from '../../services/api';
import { debounce } from '../../utils/debounce';

const AdminUsers = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [pagination, setPagination] = useState({
        current: 1,
        pages: 1,
        total: 0
    });

    const fetchUsers = async (page = 1, search = searchTerm) => {
        try {
            setLoading(true);
            const res = await adminAPI.getUsers(search, 50, page);
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

    // Debounced search handler
    const debouncedSearch = useCallback(
        debounce((query) => {
            // Reset to page 1 on new search
            fetchUsers(1, query);
        }, 500),
        []
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
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white mb-1">Users</h1>
                    <p className="text-slate-400">Manage system users and access</p>
                </div>

                <div className="relative">
                    <input
                        type="text"
                        placeholder="Search users..."
                        className="bg-slate-800 border border-slate-700 text-white rounded-lg pl-10 pr-4 py-2 w-full sm:w-64 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        value={searchTerm}
                        onChange={handleSearchChange}
                    />
                    <svg className="w-5 h-5 text-slate-500 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>
            </div>

            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl overflow-hidden shadow-lg">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-800/80 border-b border-slate-700">
                            <tr>
                                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">User</th>
                                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Joined</th>
                                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/50">
                            {loading && users.length === 0 ? (
                                <tr>
                                    <td colSpan="4" className="px-6 py-12 text-center text-slate-500">
                                        <div className="flex items-center justify-center gap-2">
                                            <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                                            Loading users...
                                        </div>
                                    </td>
                                </tr>
                            ) : users.length === 0 ? (
                                <tr>
                                    <td colSpan="4" className="px-6 py-12 text-center text-slate-500">No users found</td>
                                </tr>
                            ) : (
                                users.map(user => (
                                    <tr key={user._id} className="hover:bg-slate-700/30 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center">
                                                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold mr-3 shadow-lg shadow-indigo-500/20 group-hover:scale-105 transition-transform">
                                                    {user.name.charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <div className="text-white font-medium">{user.name}</div>
                                                    <div className="text-xs text-slate-400">{user.email}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${user.isBanned
                                                ? 'bg-red-500/10 text-red-500 border-red-500/20'
                                                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                                }`}>
                                                {user.isBanned ? 'Banned' : 'Active'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-slate-400 text-sm">
                                            {new Date(user.createdAt).toLocaleDateString(undefined, {
                                                year: 'numeric',
                                                month: 'short',
                                                day: 'numeric'
                                            })}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <Link
                                                to={`/admin/users/${user._id}`}
                                                className="text-indigo-400 hover:text-indigo-300 font-medium text-sm transition-colors"
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

                {/* Pagination Controls */}
                <div className="border-t border-slate-700 bg-slate-800/30 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-sm text-slate-400 text-center sm:text-left">
                        Showing page <span className="font-semibold text-white">{pagination.current}</span> of <span className="font-semibold text-white">{pagination.pages}</span>
                        <span className="ml-2 opacity-60">({pagination.total} total)</span>
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                        <button
                            onClick={() => fetchUsers(pagination.current - 1)}
                            disabled={pagination.current === 1}
                            className={`flex-1 sm:flex-none justify-center px-4 py-2 sm:py-1.5 rounded-lg text-sm sm:text-xs font-medium transition-all ${pagination.current === 1
                                ? 'bg-slate-800/50 text-slate-600 cursor-not-allowed'
                                : 'bg-slate-700 hover:bg-slate-600 text-white hover:shadow-lg'
                                }`}
                        >
                            Previous
                        </button>
                        <button
                            onClick={() => fetchUsers(pagination.current + 1)}
                            disabled={pagination.current === pagination.pages}
                            className={`flex-1 sm:flex-none justify-center px-4 py-2 sm:py-1.5 rounded-lg text-sm sm:text-xs font-medium transition-all ${pagination.current === pagination.pages
                                ? 'bg-slate-800/50 text-slate-600 cursor-not-allowed'
                                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                                }`}
                        >
                            Next
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminUsers;
