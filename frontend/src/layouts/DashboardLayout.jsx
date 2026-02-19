import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { statsAPI } from '../services/api';

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

    const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');

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
        <div className="min-h-screen bg-[#0a0a0f]">
            {/* System Banner */}
            {(systemConfig?.globalAlert || systemConfig?.maintenanceMode) && (
                <div className="lg:ml-64 bg-indigo-600/10 backdrop-blur-md border-b border-indigo-500/20 text-white px-4 py-3 relative z-[40] animate-fade-in-down shadow-lg shadow-indigo-500/10">
                    <div className="max-w-7xl mx-auto flex items-center justify-center gap-3">
                        {systemConfig.maintenanceMode ? (
                            <>
                                <span className="relative flex h-3 w-3">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                                </span>
                                <span className="font-medium text-sm md:text-base text-indigo-100">
                                    <span className="font-bold text-white tracking-wide uppercase text-xs px-2 py-0.5 rounded bg-white/10 mr-2 border border-white/10">Maintenance</span>
                                    {systemConfig.globalAlert || 'Scheduled maintenance is in progress.'}
                                </span>
                            </>
                        ) : (
                            <>
                                <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span className="font-medium text-sm text-indigo-100">{systemConfig.globalAlert}</span>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Mobile Header */}
            <header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-[#12121a] border-b border-gray-800 flex items-center justify-between px-4 z-50 mt-[systemConfig?.globalAlert?36:0]px">
                <button onClick={() => setSidebarOpen(true)} className="p-2 text-gray-400 hover:text-white">
                    {Icons.menu}
                </button>
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
                        <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 12h4l3-9 4 18 3-9h4" />
                        </svg>
                    </div>
                    <span className="text-lg font-bold text-white">PulseGuard</span>
                </div>
                <button onClick={() => setUserMenuOpen(!userMenuOpen)} className="w-8 h-8 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 flex items-center justify-center text-white font-semibold text-sm">
                    {user?.name?.[0]?.toUpperCase() || 'U'}
                </button>
            </header>

            {/* Mobile Sidebar Overlay */}
            {sidebarOpen && (
                <div className="lg:hidden fixed inset-0 bg-black/60 z-50" onClick={() => setSidebarOpen(false)}>
                    <aside className="w-72 h-full bg-[#12121a] p-6" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
                                    <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 12h4l3-9 4 18 3-9h4" />
                                    </svg>
                                </div>
                                <span className="text-lg font-bold text-white">PulseGuard</span>
                            </div>
                            <button onClick={() => setSidebarOpen(false)} className="p-1 text-gray-400 hover:text-white">
                                {Icons.close}
                            </button>
                        </div>
                        <nav className="space-y-1">
                            {navItems.map(item => (
                                <Link key={item.path} to={item.path} onClick={() => setSidebarOpen(false)}
                                    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${isActive(item.path)
                                        ? 'bg-indigo-600 text-white'
                                        : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                                        }`}>
                                    {item.icon}
                                    <span className="font-medium">{item.label}</span>
                                </Link>
                            ))}
                        </nav>
                    </aside>
                </div>
            )}

            {/* Desktop Sidebar */}
            <aside className="hidden lg:flex flex-col fixed left-0 top-0 bottom-0 w-64 bg-[#12121a] border-r border-gray-800 p-6">
                <div className="mb-10 flex items-center gap-2.5">
                    <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
                        <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 12h4l3-9 4 18 3-9h4" />
                        </svg>
                    </div>
                    <h1 className="text-xl font-bold text-white">PulseGuard</h1>
                </div>
                <nav className="space-y-1">
                    {navItems.map(item => (
                        <Link key={item.path} to={item.path}
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${isActive(item.path)
                                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/20'
                                : 'text-gray-400 hover:bg-gray-800/50 hover:text-white'
                                }`}>
                            {item.icon}
                            <span className="font-medium">{item.label}</span>
                        </Link>
                    ))}

                </nav>
            </aside>

            {/* Main Content */}
            <main className="lg:ml-64 min-h-screen pt-16 lg:pt-0">
                {/* Desktop Header */}
                <header className="hidden lg:flex h-16 items-center justify-end px-8 border-b border-gray-800/50">
                    <div className="relative">
                        <button onClick={() => setUserMenuOpen(!userMenuOpen)}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-800/50 transition-colors">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 flex items-center justify-center text-white font-semibold text-sm">
                                {user?.name?.[0]?.toUpperCase() || 'U'}
                            </div>
                            <span className="text-sm text-gray-300">{user?.name}</span>
                            {Icons.chevronDown}
                        </button>
                        {userMenuOpen && (
                            <div className="absolute right-0 mt-2 w-48 bg-[#1a1a24] border border-gray-800 rounded-xl shadow-xl py-2 z-50">
                                <Link to="/app/profile" onClick={() => setUserMenuOpen(false)} className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-800">Profile</Link>
                                <Link to="/app/settings" onClick={() => setUserMenuOpen(false)} className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-800">Settings</Link>

                                <hr className="my-2 border-gray-800" />
                                <button onClick={logout} className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-500/10">Sign Out</button>
                            </div>
                        )}
                    </div>
                </header>

                {/* Page Content */}
                <div className="p-4 sm:p-6 lg:p-8 animate-fade-in">
                    <Outlet />
                </div>
            </main>
        </div>
    );
};

export default DashboardLayout;
