import { useState, useEffect, useRef } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext';

const AdminLayout = () => {
    const { adminUser: user, logout } = useAdminAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const [userMenuOpen, setUserMenuOpen] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false); // Added mobile sidebar state
    const userMenuRef = useRef(null);
    const mobileMenuRef = useRef(null);

    // Close user menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (userMenuRef.current && !userMenuRef.current.contains(e.target) &&
                mobileMenuRef.current && !mobileMenuRef.current.contains(e.target)) {
                setUserMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Close sidebar on route change
    useEffect(() => {
        setSidebarOpen(false);
    }, [location.pathname]);

    const handleLogout = () => {
        logout();
        navigate('/admin/login');
    };

    const navItems = [
        {
            path: '/admin/dashboard', label: 'Overview', icon: (
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
            )
        },
        {
            path: '/admin/users', label: 'Users', icon: (
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
            )
        },
        {
            path: '/admin/incidents', label: 'System Alerts', icon: (
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
            )
        },
        {
            path: '/admin/health', label: 'System Health', icon: (
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
            )
        },
        {
            path: '/admin/settings', label: 'Settings', icon: (
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
            )
        }
    ];

    const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');

    return (
        <div className="min-h-screen bg-slate-900 font-inter text-slate-300">
            {/* Mobile Sidebar Overlay */}
            {sidebarOpen && (
                <div className="lg:hidden fixed inset-0 z-40 flex">
                    {/* Backdrop */}
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={() => setSidebarOpen(false)}></div>

                    {/* Sliding Sidebar */}
                    <aside className="relative flex-1 flex flex-col max-w-xs w-full bg-slate-900 border-r border-slate-800 p-6 transform transition-transform duration-300 ease-in-out">
                        <div className="mb-8 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                    </svg>
                                </div>
                                <span className="text-lg font-bold text-white tracking-tight">PulseGuard <span className="text-indigo-400 font-normal ml-0.5">Admin</span></span>
                            </div>
                            <button onClick={() => setSidebarOpen(false)} className="p-1 text-slate-400 hover:text-white rounded-full hover:bg-slate-800">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <nav className="space-y-1">
                            {navItems.map(item => (
                                <Link key={item.path} to={item.path}
                                    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${isActive(item.path)
                                        ? 'bg-indigo-600/10 text-indigo-400 font-medium'
                                        : 'text-slate-400 hover:bg-slate-800/50 hover:text-white font-medium'
                                        }`}>
                                    {item.icon}
                                    <span>{item.label}</span>
                                </Link>
                            ))}
                        </nav>
                    </aside>
                </div>
            )}

            {/* Desktop Sidebar */}
            <aside className="hidden lg:flex flex-col fixed inset-y-0 left-0 w-64 bg-slate-900 border-r border-slate-800 z-30">
                <div className="flex items-center h-16 px-6 border-b border-slate-800">
                    <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center mr-3">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                    </div>
                    <span className="text-lg font-bold text-white tracking-tight">PulseGuard <span className="text-indigo-400 font-normal ml-1">Admin</span></span>
                </div>

                <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                    {navItems.map((item) => (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive(item.path)
                                ? 'bg-indigo-600/10 text-indigo-400'
                                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                                }`}
                        >
                            {item.icon}
                            {item.label}
                        </Link>
                    ))}
                </nav>
            </aside>

            {/* Mobile Header */}
            <header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 flex items-center justify-between px-4 z-20">
                <button onClick={() => setSidebarOpen(true)} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                </button>
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                        <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                    </div>
                    <span className="text-lg font-bold text-white tracking-tight">Admin</span>
                </div>

                <div className="relative" ref={mobileMenuRef}>
                    <button onClick={() => setUserMenuOpen(!userMenuOpen)}
                        className="flex items-center gap-2 p-1 rounded-full hover:bg-slate-800 transition-colors">
                        <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-white font-semibold text-sm border border-slate-600">
                            {user?.name?.[0]?.toUpperCase() || 'A'}
                        </div>
                    </button>
                    {userMenuOpen && (
                        <div className="absolute right-0 mt-2 w-48 bg-slate-800 border border-slate-700 rounded-xl shadow-xl py-2 z-[60]">
                            <div className="px-4 py-2 border-b border-slate-700">
                                <p className="text-sm font-semibold text-white truncate">{user?.name}</p>
                                <p className="text-xs text-slate-400 truncate">{user?.email}</p>
                            </div>
                            <button onClick={handleLogout} className="w-full text-left px-4 py-2 mt-1 text-sm text-red-400 hover:bg-slate-700/50 transition-colors font-medium">Sign Out</button>
                        </div>
                    )}
                </div>
            </header>

            {/* Main Content Area */}
            <div className="lg:pl-64 flex flex-col min-h-screen pt-16 lg:pt-0">
                {/* Desktop Header */}
                <header className="hidden lg:flex h-16 px-8 border-b border-slate-800 bg-slate-900/80 backdrop-blur-xl items-center justify-between sticky top-0 z-20">
                    <div className="flex-1" />

                    <div className="relative" ref={userMenuRef}>
                        <button
                            onClick={() => setUserMenuOpen(!userMenuOpen)}
                            className="flex items-center gap-3 py-1 px-2 rounded-lg hover:bg-slate-800 transition-colors"
                        >
                            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-white text-sm font-medium border border-slate-600">
                                {user?.name?.[0]?.toUpperCase() || 'A'}
                            </div>
                            <span className="text-sm text-slate-300 font-medium">{user?.name}</span>
                            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>

                        {userMenuOpen && (
                            <div className="absolute right-0 mt-2 w-48 bg-slate-800 border border-slate-700 rounded-xl shadow-xl py-2 transform origin-top-right transition-all">
                                <div className="px-4 py-2 border-b border-slate-700">
                                    <p className="text-sm font-semibold text-white truncate">{user?.name}</p>
                                    <p className="text-xs text-slate-400 truncate">{user?.email}</p>
                                </div>
                                <button
                                    onClick={handleLogout}
                                    className="w-full text-left px-4 py-2 mt-1 text-sm text-red-400 hover:bg-slate-700/50 transition-colors font-medium"
                                >
                                    Sign Out
                                </button>
                            </div>
                        )}
                    </div>
                </header>

                {/* Page Content */}
                <main className="flex-1 p-4 sm:p-6 lg:p-8 animate-fade-in">
                    <Outlet />
                </main>
            </div>
        </div>
    );
};

export default AdminLayout;
