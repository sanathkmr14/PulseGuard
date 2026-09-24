import { useState, useEffect, useRef } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { statsAPI, monitorAPI, incidentAPI } from '../services/api';
import { swrCache } from '../services/cache';
import Logo from '../components/Logo';

// Modern SVG Icons (unchanged)
const Icons = {
    dashboard: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 12a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1v-7z" />
        </svg>
    ),
    monitors: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
    ),
    incidents: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
    ),
    analytics: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
    ),
    statusPages: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
    ),
    menu: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
    ),
    close: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
    ),
    chevronDown: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
    ),
};

const navItems = [
    { path: '/app/dashboard', label: 'Dashboard', icon: Icons.dashboard },
    { path: '/app/monitors', label: 'Monitors', icon: Icons.monitors },
    { path: '/app/incidents', label: 'Incidents', icon: Icons.incidents },
];



const DashboardLayout = () => {
    const { user, logout } = useAuth();
    const location = useLocation();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [userMenuOpen, setUserMenuOpen] = useState(false);
    const [systemConfig, setSystemConfig] = useState(null);
    const userMenuRef = useRef(null);
    const mobileToggleRef = useRef(null);
    const mobileDropdownRef = useRef(null);

    const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');

    const prefetchData = (path) => {
        if (path === '/app/monitors' && !swrCache.has('monitors_list')) {
            monitorAPI.getAll({ page: 1, limit: 12 }).then(res => {
                if (res.data?.success) {
                    swrCache.set('monitors_list', { data: res.data.data, pagination: res.data.pagination });
                }
            }).catch(() => {});
        } else if (path === '/app/dashboard' && !swrCache.has('dashboard_stats')) {
            statsAPI.getDashboardStats().then(res => {
                if (res.data?.success) swrCache.set('dashboard_stats', res.data.data);
            }).catch(() => {});
        } else if (path === '/app/incidents' && !swrCache.has('incidents_list')) {
            incidentAPI.getAll({ page: 1, limit: 10 }).then(res => {
                if (res.data?.success) swrCache.set('incidents_list', { incidents: res.data.data, pagination: res.data.pagination });
            }).catch(() => {});
        }
    };

    // Close user menu and mobile menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
                setUserMenuOpen(false);
            }
            if (
                mobileDropdownRef.current &&
                !mobileDropdownRef.current.contains(e.target) &&
                mobileToggleRef.current &&
                !mobileToggleRef.current.contains(e.target)
            ) {
                setSidebarOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Close menus on route change
    useEffect(() => {
        setSidebarOpen(false);
        setUserMenuOpen(false);
    }, [location.pathname]);

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const res = await statsAPI.getSystemConfig();
                if (res.data.success) {
                    setSystemConfig(res.data.data);
                }
            } catch (err) {
                console.error("Config load error", err);
            }
        };
        fetchConfig();
    }, []);

    return (
        <div className="min-h-screen bg-[#0a0a0f] flex flex-col">
            {/* System Banner */}
            {(systemConfig?.globalAlert || systemConfig?.maintenanceMode) && (
                <div className="bg-blue-600/10 backdrop-blur-md border-b border-blue-500/20 text-white px-4 py-3 relative z-[60] animate-fade-in-down shadow-lg shadow-blue-500/10">
                    <div className="max-w-7xl mx-auto flex items-center justify-center gap-3">
                        {systemConfig.maintenanceMode ? (
                            <>
                                <span className="relative flex h-3 w-3">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                                </span>
                                <span className="font-medium text-sm md:text-base text-blue-100">
                                    <span className="font-bold text-white tracking-wide uppercase text-xs px-2 py-0.5 rounded bg-white/10 mr-2 border border-white/10">Maintenance</span>
                                    {systemConfig.globalAlert || 'Scheduled maintenance is in progress.'}
                                </span>
                            </>
                        ) : (
                            <>
                                <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span className="font-medium text-sm text-blue-100">{systemConfig.globalAlert}</span>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Top Navigation Bar */}
            <header className="sticky top-0 z-50 bg-[#12121a]/95 backdrop-blur-md border-b border-gray-800/80">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="relative flex items-center justify-between h-16">
                        {/* Left: Mobile 3-Lines Menu Toggle (Left on mobile, hidden on desktop) */}
                        <div className="flex items-center md:hidden">
                            <button
                                ref={mobileToggleRef}
                                onClick={() => setSidebarOpen(!sidebarOpen)}
                                className="p-2 -ml-2 text-gray-400 hover:text-white hover:bg-gray-800/60 rounded-xl transition-colors cursor-pointer"
                                aria-label="Toggle Navigation"
                            >
                                {sidebarOpen ? Icons.close : Icons.menu}
                            </button>
                        </div>

                        {/* Brand Logo: Centered on mobile, left on desktop */}
                        <div className="flex items-center absolute left-1/2 -translate-x-1/2 md:static md:translate-x-0">
                            <Link to="/app/dashboard" className="flex items-center">
                                <Logo size="md" showText={true} textClassName="text-xl font-bold text-white tracking-tight" />
                            </Link>
                        </div>

                        {/* Center: Clean Professional Desktop Nav Links (No box / no colored background) */}
                        <nav className="hidden md:flex items-center gap-8 absolute left-1/2 -translate-x-1/2 h-full">
                            {navItems.map(item => {
                                const active = isActive(item.path);
                                return (
                                    <Link
                                        key={item.path}
                                        to={item.path}
                                        onMouseEnter={() => prefetchData(item.path)}
                                        onTouchStart={() => prefetchData(item.path)}
                                        className={`group relative flex items-center gap-2 h-full text-sm font-medium transition-colors ${
                                            active
                                                ? 'text-white font-semibold'
                                                : 'text-gray-400 hover:text-gray-200'
                                        }`}
                                    >
                                        <span className={`transition-colors ${active ? 'text-blue-400' : 'text-gray-400 group-hover:text-gray-200'}`}>
                                            {item.icon}
                                        </span>
                                        <span>{item.label}</span>

                                        {/* Professional Active Underline Indicator */}
                                        {active && (
                                            <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-500 rounded-t-full shadow-sm shadow-blue-500/50" />
                                        )}
                                    </Link>
                                );
                            })}
                        </nav>

                        {/* Right: Mobile spacer balance (hidden on desktop) */}
                        <div className="w-8 md:hidden" />

                        {/* Right: User Menu (Desktop only - mobile accesses profile via 3-lines menu) */}
                        <div className="hidden md:flex items-center gap-3">
                            <div className="relative" ref={userMenuRef}>
                                <button
                                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                                    className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl hover:bg-gray-800/40 border border-transparent hover:border-gray-800 transition-all cursor-pointer"
                                >
                                    <div className="w-8 h-8 rounded-full bg-blue-600 border border-blue-500/40 flex items-center justify-center text-white font-bold text-xs shadow-sm shadow-blue-600/30 shrink-0">
                                        {user?.name?.[0]?.toUpperCase() || 'U'}
                                    </div>
                                    <span className="text-sm text-gray-300 font-medium hidden sm:block">{user?.name}</span>
                                    <span className="text-gray-400">{Icons.chevronDown}</span>
                                </button>

                                {userMenuOpen && (
                                    <div className="absolute right-0 mt-2 w-56 bg-[#12121a]/95 backdrop-blur-xl border border-gray-800/90 rounded-2xl shadow-2xl py-2 z-50 animate-fade-in divide-y divide-gray-800/60">
                                        <div className="px-4 py-3 flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-full bg-blue-600 border border-blue-500/40 flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm shadow-blue-600/30">
                                                {user?.name?.[0]?.toUpperCase() || 'U'}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-xs font-bold text-white truncate font-heading">{user?.name || 'User'}</p>
                                                <p className="text-[11px] text-gray-400 truncate font-mono">{user?.email}</p>
                                            </div>
                                        </div>
                                        <div className="py-1 px-1">
                                            <Link
                                                to="/app/profile"
                                                onClick={() => setUserMenuOpen(false)}
                                                className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-gray-300 hover:text-white hover:bg-gray-800/70 rounded-lg transition-colors group"
                                            >
                                                <svg className="w-4 h-4 text-gray-400 group-hover:text-blue-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                                </svg>
                                                <span>Profile</span>
                                            </Link>
                                            <Link
                                                to="/app/settings"
                                                onClick={() => setUserMenuOpen(false)}
                                                className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-gray-300 hover:text-white hover:bg-gray-800/70 rounded-lg transition-colors group"
                                            >
                                                <svg className="w-4 h-4 text-gray-400 group-hover:text-blue-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                </svg>
                                                <span>Settings & Alerts</span>
                                            </Link>
                                        </div>
                                        <div className="py-1 px-1">
                                            <button
                                                onClick={() => {
                                                    logout();
                                                    setUserMenuOpen(false);
                                                }}
                                                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors group cursor-pointer"
                                            >
                                                <svg className="w-4 h-4 text-red-400/80 group-hover:text-red-300 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                                </svg>
                                                <span>Sign Out</span>
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Mobile Navigation Dropdown */}
                    {sidebarOpen && (
                        <div ref={mobileDropdownRef} className="md:hidden border-t border-gray-800/80 py-3 space-y-1 animate-fade-in">
                            {navItems.map(item => {
                                const active = isActive(item.path);
                                return (
                                    <Link
                                        key={item.path}
                                        to={item.path}
                                        onTouchStart={() => prefetchData(item.path)}
                                        onClick={() => setSidebarOpen(false)}
                                        className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                                            active
                                                ? 'text-white font-semibold border-l-2 border-blue-500 bg-white/[0.02]'
                                                : 'text-gray-400 hover:text-white hover:bg-gray-800/30'
                                        }`}
                                    >
                                        <span className={active ? 'text-blue-400' : 'text-gray-400'}>{item.icon}</span>
                                        <span>{item.label}</span>
                                    </Link>
                                );
                            })}

                            <div className="pt-2 mt-2 border-t border-gray-800/60 space-y-1">
                                <Link
                                    to="/app/profile"
                                    onClick={() => setSidebarOpen(false)}
                                    className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800/30 transition-colors"
                                >
                                    <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                    </svg>
                                    <span>Profile</span>
                                </Link>
                                <Link
                                    to="/app/settings"
                                    onClick={() => setSidebarOpen(false)}
                                    className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800/30 transition-colors"
                                >
                                    <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                    <span>Settings & Alerts</span>
                                </Link>
                                <button
                                    onClick={() => {
                                        setSidebarOpen(false);
                                        logout();
                                    }}
                                    className="w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                                >
                                    <svg className="w-5 h-5 text-red-400/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                    </svg>
                                    <span>Sign Out</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 animate-fade-in">
                <Outlet />
            </main>
        </div>
    );
};

export default DashboardLayout;
