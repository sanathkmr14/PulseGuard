import { useState, useEffect, useCallback } from 'react';
import { debounce } from '../../utils/debounce';
import { adminAPI } from '../../services/api';
import { useNavigate } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const StatCard = ({ title, value, subtext, icon, color, gradient }) => (
    <div className={`relative overflow-hidden rounded-2xl border border-slate-700/50 p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-${color.split('-')[1]}-500/10 bg-slate-800/40 backdrop-blur-xl group`}>
        {/* Background Gradient Blob */}
        <div className={`absolute -top-12 -right-12 w-32 h-32 rounded-full opacity-10 blur-3xl ${gradient}`} />
        <div className={`absolute -bottom-12 -left-12 w-24 h-24 rounded-full opacity-5 blur-2xl ${gradient}`} />

        <div className="relative z-10 flex items-start justify-between gap-4">
            <div>
                <p className="text-slate-400 text-sm font-medium mb-1 tracking-wide">{title}</p>
                <h3 className="text-3xl font-bold text-white tracking-tight">{value}</h3>
                {subtext && <p className="text-xs text-slate-500 mt-2 font-medium">{subtext}</p>}
            </div>
            <div className={`p-3 rounded-xl bg-slate-800/80 border border-slate-700/50 shadow-lg group-hover:scale-110 transition-transform duration-300 ${color}`}>
                {icon}
            </div>
        </div>
    </div>
);

const AdminDashboard = () => {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [users, setUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState('');

    // Searchable Dropdown State
    const [searchQuery, setSearchQuery] = useState('');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isSearchingUsers, setIsSearchingUsers] = useState(false);

    const navigate = useNavigate();

    // Fetch users (with search and limit)
    const fetchUsers = async (search = '') => {
        try {
            setIsSearchingUsers(true);
            // Limit to 20 for dropdown to keep it fast
            const res = await adminAPI.getUsers(search, 20);
            if (res.data.success) {
                setUsers(res.data.data);
            }
        } catch (error) {
            console.error("Failed to fetch users", error);
        } finally {
            setIsSearchingUsers(false);
        }
    };

    // Debounced search handler
    const debouncedUserSearch = useCallback(
        debounce((query) => {
            fetchUsers(query);
        }, 500),
        []
    );

    useEffect(() => {
        fetchUsers(); // Initial load (top 20)
    }, []);

    const fetchStats = async (userId = '') => {
        try {
            // Pass userId query param if selected
            const query = userId ? `?userId=${userId}` : '';
            const res = await adminAPI.getStats(query);
            if (res.data.success) {
                setStats(res.data.data);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStats(selectedUser);

        // Poll every 5s for real-time updates
        const intervalId = setInterval(() => fetchStats(selectedUser), 5000);
        return () => clearInterval(intervalId);
    }, [selectedUser]); // Refetch when selectedUser changes

    const handleSearchChange = (e) => {
        const query = e.target.value;
        setSearchQuery(query);
        setIsDropdownOpen(true);
        if (query === '') {
            setSelectedUser('');
            fetchUsers(); // Reset list to initial top 20
        } else {
            debouncedUserSearch(query);
        }
    };

    const handleUserSelect = (user) => {
        setSelectedUser(user._id);
        setSearchQuery(user.name);
        setIsDropdownOpen(false);
        // We don't need to refetch users, but we might want to keep the selected user in the list?
        // Current logic replaces list with search results. If selected user is in results, fine.
    };

    const clearUserSelection = () => {
        setSelectedUser('');
        setSearchQuery('');
        setIsDropdownOpen(false);
        fetchUsers(); // Reset to top 20
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[600px]">
                <div className="relative">
                    <div className="w-16 h-16 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-8 h-8 bg-indigo-500 rounded-full opacity-20 animate-pulse"></div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-fade-in pb-12">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400 mb-2">Command Center</h1>
                    <p className="text-slate-400 font-medium">System health and actionable intelligence</p>
                </div>
                <div className="flex items-center gap-3 bg-slate-800/40 backdrop-blur-md border border-slate-700/50 rounded-lg p-1.5">
                    <span className="px-3 py-1 rounded-md bg-emerald-500/10 text-emerald-400 text-xs font-semibold border border-emerald-500/20 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        Live Updates
                    </span>
                    <span className="text-xs text-slate-500 px-2">
                        Last updated: {new Date().toLocaleTimeString()}
                    </span>
                </div>
            </div>

            {/* Zone A: Vital Signs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard
                    title="Active Monitors"
                    value={stats?.monitors?.active || 0}
                    subtext={`out of ${stats?.monitors?.total || 0} total configured`}
                    color="text-emerald-400"
                    gradient="bg-emerald-500"
                    icon={
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
                        </svg>
                    }
                />
                <StatCard
                    title="Total Users"
                    value={stats?.users || 0}
                    subtext="Registered accounts"
                    color="text-indigo-400"
                    gradient="bg-indigo-500"
                    icon={
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                        </svg>
                    }
                />
                <StatCard
                    title="24h Events"
                    value={stats?.incidents24h || 0}
                    subtext="Total alerts generated"
                    color="text-amber-400"
                    gradient="bg-amber-500"
                    icon={
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                        </svg>
                    }
                />
            </div>

            {/* Zone B: Charts & Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Main Chart Section */}
                <div className="lg:col-span-3 bg-slate-800/40 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6 shadow-xl relative z-20">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-4 w-full md:w-auto">
                            <h3 className="text-lg font-bold text-white tracking-wide shrink-0">System Activity</h3>

                            {/* Searchable User Filter */}
                            <div className="relative w-full sm:w-64 sm:ml-4">
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <svg className="h-4 w-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                        </svg>
                                    </div>
                                    <input
                                        type="text"
                                        className="w-full bg-slate-900/50 border border-slate-700 rounded-lg pl-10 pr-8 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all"
                                        placeholder="Filter by user..."
                                        value={searchQuery}
                                        onChange={handleSearchChange}
                                        onFocus={() => setIsDropdownOpen(true)}
                                    />
                                    {isSearchingUsers && (
                                        <div className="absolute inset-y-0 right-8 flex items-center">
                                            <div className="w-3 h-3 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
                                        </div>
                                    )}
                                    {selectedUser && !isSearchingUsers && (
                                        <button
                                            onClick={clearUserSelection}
                                            className="absolute inset-y-0 right-0 pr-2 flex items-center cursor-pointer text-slate-500 hover:text-slate-300"
                                        >
                                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    )}
                                </div>

                                {isDropdownOpen && (
                                    <div className="absolute mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg shadow-xl max-h-60 overflow-y-auto z-50 custom-scrollbar">
                                        {users.length > 0 ? (
                                            <>
                                                <div
                                                    className={`px-4 py-2 text-xs cursor-pointer hover:bg-slate-700/50 transition-colors ${!selectedUser ? 'bg-indigo-500/10 text-indigo-400' : 'text-slate-300'}`}
                                                    onClick={clearUserSelection}
                                                >
                                                    Global (All Users)
                                                </div>
                                                {users.map(user => (
                                                    <div
                                                        key={user._id}
                                                        className={`px-4 py-2 text-xs cursor-pointer hover:bg-slate-700/50 transition-colors flex justify-between items-center ${selectedUser === user._id ? 'bg-indigo-500/10 text-indigo-400' : 'text-slate-300'}`}
                                                        onClick={() => handleUserSelect(user)}
                                                    >
                                                        <span>{user.name}</span>
                                                        <span className="text-[10px] text-slate-500 truncate max-w-[100px]">{user.email}</span>
                                                    </div>
                                                ))}
                                            </>
                                        ) : (
                                            <div className="px-4 py-3 text-xs text-slate-500 text-center">
                                                {isSearchingUsers ? 'Searching...' : 'No users found'}
                                            </div>
                                        )}
                                    </div>
                                )}
                                {/* Backdrop to close dropdown */}
                                {isDropdownOpen && (
                                    <div
                                        className="fixed inset-0 z-40 bg-transparent"
                                        onClick={() => setIsDropdownOpen(false)}
                                    />
                                )}
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2 shrink-0">
                            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/50 border border-slate-700/50 text-xs">
                                <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0"></span>
                                <span className="text-slate-400">Incidents</span>
                            </div>
                            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/50 border border-slate-700/50 text-xs">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                                <span className="text-slate-400">Resolved</span>
                            </div>
                        </div>
                    </div>
                    <div className="h-[300px] w-full min-w-0">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={stats?.systemActivity || []}>
                                <defs>
                                    <linearGradient id="colorIncidents" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorResolved" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} vertical={false} />
                                <XAxis
                                    dataKey="name"
                                    stroke="#94a3b8"
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                    dy={10}
                                />
                                <YAxis
                                    stroke="#94a3b8"
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                    dx={-10}
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: '#1e293b',
                                        border: '1px solid #334155',
                                        borderRadius: '0.75rem',
                                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                                        color: '#f8fafc'
                                    }}
                                    itemStyle={{ fontSize: '12px' }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="incidents"
                                    stroke="#6366f1"
                                    strokeWidth={3}
                                    fillOpacity={1}
                                    fill="url(#colorIncidents)"
                                />
                                <Area
                                    type="monotone"
                                    dataKey="resolved"
                                    stroke="#10b981"
                                    strokeWidth={3}
                                    fillOpacity={1}
                                    fill="url(#colorResolved)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>


            </div>

            {/* Zone C: Recent Signups */}
            <div className="rounded-2xl border border-slate-700/50 bg-slate-800/40 backdrop-blur-xl overflow-hidden shadow-xl">
                <div className="p-6 border-b border-slate-700/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h3 className="text-lg font-bold text-white tracking-wide">Recent Signups</h3>
                        <p className="text-slate-400 text-sm mt-1">New users joining the platform</p>
                    </div>
                    <button
                        onClick={() => navigate('/admin/users')}
                        className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors shadow-lg shadow-indigo-500/20"
                    >
                        View All Users
                    </button>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-400">
                        <thead className="bg-slate-900/40 text-xs uppercase font-semibold text-slate-500">
                            <tr>
                                <th className="px-6 py-4">User</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4">Joined</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/50">
                            {(stats?.recentSignups || []).map((user) => (
                                <tr key={user._id} className="group hover:bg-slate-700/30 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold shadow-lg shadow-indigo-500/20">
                                                {user.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <div className="font-medium text-white">{user.name}</div>
                                                <div className="text-xs text-slate-500">{user.email}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                            Active
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {new Date(user.createdAt).toLocaleDateString(undefined, {
                                            year: 'numeric',
                                            month: 'short',
                                            day: 'numeric'
                                        })}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button
                                            onClick={() => navigate(`/admin/users/${user._id}`)}
                                            className="text-indigo-400 hover:text-indigo-300 font-medium text-sm hover:underline"
                                        >
                                            View Details
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {(stats?.recentSignups || []).length === 0 && (
                    <div className="py-12 text-center text-slate-500 text-sm">
                        No recent signups to display.
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminDashboard;
