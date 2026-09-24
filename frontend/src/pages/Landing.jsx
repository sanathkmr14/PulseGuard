import { useState } from 'react';
import { Link } from 'react-router-dom';
import Logo from '../components/Logo';

const Landing = () => {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const scrollToSection = (id) => {
        const element = document.getElementById(id);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth' });
        }
    };

    return (
        <div className="min-h-screen bg-[#080c14] text-slate-100 overflow-x-hidden selection:bg-blue-500 selection:text-white">
            {/* Ambient Background Glows */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
                <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-gradient-to-b from-blue-600/10 via-sky-600/5 to-transparent blur-3xl opacity-60"></div>
                <div className="absolute top-[40%] -left-48 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl"></div>
                <div className="absolute top-[60%] -right-48 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl"></div>
            </div>

            {/* Navigation */}
            <nav className="sticky top-0 z-50 backdrop-blur-md bg-[#080c14]/80 border-b border-slate-800/60">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 sm:py-4">
                    <div className="flex items-center justify-between">
                        {/* Logo */}
                        <Link to="/" className="flex items-center group">
                            <Logo size="md" showText={true} />
                        </Link>

                        {/* Center nav links (Desktop) */}
                        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-400">
                            <button onClick={() => scrollToSection('features')} className="hover:text-white transition-colors cursor-pointer">
                                Features
                            </button>
                            <button onClick={() => scrollToSection('how-it-works')} className="hover:text-white transition-colors cursor-pointer">
                                How It Works
                            </button>
                        </div>

                        {/* Desktop Actions */}
                        <div className="hidden md:flex items-center gap-4">
                            <Link to="/login" className="text-sm font-medium text-slate-300 hover:text-white transition-colors">
                                Sign In
                            </Link>
                            <Link
                                to="/register"
                                className="text-sm px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl shadow-lg shadow-blue-600/20 hover:shadow-blue-500/30 hover:-translate-y-0.5 transition-all duration-200"
                            >
                                Get Started
                            </Link>
                        </div>

                        {/* Mobile Header Actions & Menu Toggle */}
                        <div className="flex md:hidden items-center gap-2">
                            <Link
                                to="/register"
                                className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg shadow-md shadow-blue-600/25"
                            >
                                Get Started
                            </Link>
                            <button
                                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/80 transition-colors"
                                aria-label="Toggle navigation"
                            >
                                {mobileMenuOpen ? (
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                ) : (
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                    </svg>
                                )}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Mobile Dropdown Menu Drawer */}
                {mobileMenuOpen && (
                    <div className="md:hidden border-t border-slate-800/80 bg-[#0a0f1d]/95 backdrop-blur-xl px-5 py-4 space-y-3 animate-fade-in shadow-2xl">
                        <div className="flex flex-col space-y-2 text-sm font-medium text-slate-300">
                            <button
                                onClick={() => { scrollToSection('features'); setMobileMenuOpen(false); }}
                                className="text-left py-2 px-3 rounded-lg hover:bg-slate-800/60 hover:text-white transition-colors"
                            >
                                Features
                            </button>
                            <button
                                onClick={() => { scrollToSection('how-it-works'); setMobileMenuOpen(false); }}
                                className="text-left py-2 px-3 rounded-lg hover:bg-slate-800/60 hover:text-white transition-colors"
                            >
                                How It Works
                            </button>
                            <Link
                                to="/login"
                                onClick={() => setMobileMenuOpen(false)}
                                className="py-2 px-3 rounded-lg hover:bg-slate-800/60 hover:text-white transition-colors"
                            >
                                Sign In
                            </Link>
                        </div>
                        <div className="pt-2 border-t border-slate-800/80">
                            <Link
                                to="/register"
                                onClick={() => setMobileMenuOpen(false)}
                                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-center block shadow-lg shadow-blue-600/25 text-sm"
                            >
                                Start Free Trial
                            </Link>
                        </div>
                    </div>
                )}
            </nav>

            {/* Hero Section */}
            <section className="pt-3 sm:pt-5 lg:pt-6 pb-2 sm:pb-4 lg:pb-6 px-4 sm:px-6 relative">
                <div className="max-w-7xl mx-auto">
                    {/* ======================================================== */}
                    {/* DESKTOP HERO: Preserved 100% untouched for lg+ screens   */}
                    {/* ======================================================== */}
                    <div className="hidden lg:grid lg:grid-cols-12 gap-8 xl:gap-12 items-start lg:pt-1">
                        {/* Left Column: Headline, CTAs, and Trust Badges */}
                        <div className="lg:col-span-7 xl:col-span-6 text-left">
                            {/* Status Pill */}
                            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-blue-500/10 border border-blue-500/25 rounded-full text-xs font-medium text-blue-300 mb-4 shadow-sm">
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                </span>
                                <span>Trusted by developers worldwide • 99.99% Uptime</span>
                            </div>

                            {/* Headline: Strictly 2 Lines */}
                            <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-extrabold text-white tracking-tight leading-[1.15] mb-4">
                                <span className="block sm:whitespace-nowrap">Monitor your services</span>
                                <span className="block text-blue-500 mt-1 sm:mt-2">with confidence</span>
                            </h1>

                            <p className="text-sm lg:text-[15px] xl:text-base text-slate-300 mb-6 leading-relaxed font-normal">
                                <span className="block whitespace-nowrap">Real-time uptime monitoring for your websites, APIs, and servers.</span>
                                <span className="block mt-1 whitespace-nowrap">Get instant alerts via Email, Slack, and Webhooks before your customers notice.</span>
                            </p>

                            {/* Dual CTAs */}
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 mb-6">
                                <Link
                                    to="/register"
                                    className="px-7 py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl shadow-lg shadow-blue-600/25 hover:shadow-blue-500/35 hover:-translate-y-0.5 transition-all duration-200 flex items-center justify-center gap-2 group"
                                >
                                    <span>Start Monitoring — Free</span>
                                    <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                    </svg>
                                </Link>
                                <button
                                    onClick={() => scrollToSection('how-it-works')}
                                    className="px-6 py-3.5 bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white font-medium rounded-xl border border-slate-700/80 hover:border-slate-600 transition-all duration-200 cursor-pointer flex items-center justify-center gap-2"
                                >
                                    <span>See How It Works</span>
                                </button>
                            </div>

                            {/* Trust badges */}
                            <div className="flex flex-wrap items-center gap-y-2.5 gap-x-6 text-xs text-slate-400">
                                <div className="flex items-center gap-2">
                                    <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>60-second checks</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>HTTPS, SSL, TCP & DNS</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>Instant Email & Slack alerts</span>
                                </div>
                            </div>
                        </div>

                        {/* Right Column: Real PulseGuard Monitor Details Preview */}
                        <div className="lg:col-span-5 xl:col-span-6 relative mt-6 lg:mt-0">
                            {/* Subtle Ambient Glow */}
                            <div className="absolute -inset-1.5 bg-gradient-to-r from-blue-600/15 via-sky-500/10 to-cyan-500/15 rounded-2xl blur-xl -z-10 opacity-70"></div>

                            {/* Browser Window Frame */}
                            <div className="rounded-xl bg-[#090e1a] border border-slate-800/90 shadow-xl overflow-hidden backdrop-blur-xl">
                                {/* Title Bar */}
                                <div className="px-3.5 py-2 bg-[#0c1222] border-b border-slate-800/80 flex items-center justify-between">
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80 inline-block"></span>
                                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block"></span>
                                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block"></span>
                                        <span className="ml-2 text-[11px] font-mono text-slate-400 font-medium truncate max-w-[180px] sm:max-w-none">pulseguard.io/app/monitors/youtube</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-mono text-emerald-400 font-semibold">
                                        <span className="relative flex h-1.5 w-1.5">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                                        </span>
                                        <span>LIVE • 100% UP</span>
                                    </div>
                                </div>

                                {/* Product Screenshot Container */}
                                <div className="relative overflow-hidden bg-[#070b14] max-h-[350px] lg:max-h-[380px] xl:max-h-[400px]">
                                    <img
                                        src="/dashboard-preview.png"
                                        alt="PulseGuard Monitor Details Preview"
                                        className="w-full h-auto object-top object-cover block"
                                    />
                                    {/* Bottom gradient fade */}
                                    <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#090e1a] via-[#090e1a]/80 to-transparent pointer-events-none"></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ======================================================== */}
                    {/* DEDICATED MOBILE HERO: Tailored specifically for mobile UI*/}
                    {/* ======================================================== */}
                    <div className="block lg:hidden">
                        {/* Mobile Status Beacon */}
                        <div className="flex justify-center mb-4">
                            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 border border-blue-500/25 rounded-full text-xs font-medium text-blue-300 shadow-sm">
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                </span>
                                <span>Live Telemetry • 99.99% Uptime</span>
                            </div>
                        </div>

                        {/* Mobile Headline: Strictly 2 Lines */}
                        <h1 className="text-3xl sm:text-4xl font-extrabold text-white text-center tracking-tight leading-[1.18] mb-3">
                            <span className="block">Monitor your services</span>
                            <span className="block text-blue-500 mt-1">with confidence</span>
                        </h1>

                        <p className="text-[13px] sm:text-sm text-slate-300 text-center mb-6 leading-relaxed max-w-sm mx-auto">
                            <span className="block">Real-time uptime monitoring for your websites & APIs.</span>
                            <span className="block text-slate-400 mt-0.5">Instant alerts before customers notice.</span>
                        </p>

                        {/* Mobile Touch-Optimized CTAs */}
                        <div className="flex flex-col gap-2.5 mb-7">
                            <Link
                                to="/register"
                                className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform text-sm"
                            >
                                <span>Start Monitoring — Free</span>
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                </svg>
                            </Link>
                            <button
                                onClick={() => scrollToSection('how-it-works')}
                                className="w-full py-2.5 bg-slate-900/90 hover:bg-slate-800 text-slate-300 font-medium rounded-xl border border-slate-700/80 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform text-xs"
                            >
                                <span>See How It Works</span>
                            </button>
                        </div>

                        {/* Dedicated Mobile UI Telemetry Card */}
                        <div className="relative rounded-2xl bg-gradient-to-b from-[#0c1427] to-[#080d1a] border border-slate-800/90 p-4 shadow-2xl overflow-hidden">
                            {/* Card Ambient Glow */}
                            <div className="absolute top-0 right-0 w-40 h-40 bg-blue-500/10 rounded-full blur-2xl -z-0"></div>

                            {/* Card Header */}
                            <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 relative z-10">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold text-xs">
                                        YT
                                    </div>
                                    <div className="text-left">
                                        <div className="text-xs font-bold text-white flex items-center gap-1.5">
                                            <span>Youtube Monitor</span>
                                            <span className="px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-400 text-[9px] font-mono uppercase font-semibold">HTTPS</span>
                                        </div>
                                        <div className="text-[10px] text-slate-400 font-mono truncate max-w-[140px]">youtube.com</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-[11px] font-mono text-emerald-400 font-semibold">
                                    <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                    </span>
                                    <span>100% UP</span>
                                </div>
                            </div>

                            {/* Live Metrics Row */}
                            <div className="grid grid-cols-3 gap-2 py-3 border-b border-slate-800/80 relative z-10 text-center">
                                <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800/50">
                                    <div className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold">Status</div>
                                    <div className="text-emerald-400 font-bold text-xs mt-0.5">200 OK</div>
                                </div>
                                <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800/50">
                                    <div className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold">Latency</div>
                                    <div className="text-blue-400 font-bold text-xs mt-0.5">24ms <span className="text-[9px] text-emerald-400 font-normal">↓4ms</span></div>
                                </div>
                                <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800/50">
                                    <div className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold">Uptime</div>
                                    <div className="text-cyan-400 font-bold text-xs mt-0.5">99.99%</div>
                                </div>
                            </div>

                            {/* Mobile Latency Chart */}
                            <div className="py-2.5 relative z-10 text-left">
                                <div className="flex items-center justify-between text-[11px] mb-1">
                                    <span className="text-slate-400 font-medium">Response Time (24h)</span>
                                    <span className="text-cyan-400 font-mono font-semibold text-xs">Avg 24ms</span>
                                </div>
                                <div className="h-16 w-full relative">
                                    <svg className="w-full h-full overflow-visible" viewBox="0 0 300 70" preserveAspectRatio="none">
                                        <defs>
                                            <linearGradient id="mobileChartGrad" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.3" />
                                                <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
                                            </linearGradient>
                                        </defs>
                                        <path
                                            d="M 0 45 Q 35 25, 70 38 T 140 18 T 210 32 T 270 15 T 300 24 L 300 70 L 0 70 Z"
                                            fill="url(#mobileChartGrad)"
                                        />
                                        <path
                                            d="M 0 45 Q 35 25, 70 38 T 140 18 T 210 32 T 270 15 T 300 24"
                                            fill="none"
                                            stroke="#38bdf8"
                                            strokeWidth="2.5"
                                            strokeLinecap="round"
                                        />
                                        <circle cx="300" cy="24" r="3.5" fill="#38bdf8" />
                                        <circle cx="300" cy="24" r="7" fill="#38bdf8" opacity="0.3" className="animate-ping" />
                                    </svg>
                                </div>
                                <div className="flex justify-between text-[9px] font-mono text-slate-500 mt-1">
                                    <span>24h ago</span>
                                    <span>12h ago</span>
                                    <span className="text-cyan-400 font-semibold">Live</span>
                                </div>
                            </div>

                            {/* Recent Checks List for Mobile */}
                            <div className="space-y-1.5 pt-2 border-t border-slate-800/80 relative z-10 text-[11px] text-left">
                                <div className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-slate-900/50 border border-slate-800/40">
                                    <div className="flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                                        <span className="font-mono text-slate-300 text-[10px]">GET /health</span>
                                    </div>
                                    <div className="flex items-center gap-2.5">
                                        <span className="font-mono text-slate-400 text-[10px]">24ms</span>
                                        <span className="text-emerald-400 font-semibold font-mono text-[10px]">200 OK</span>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-slate-900/50 border border-slate-800/40">
                                    <div className="flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                                        <span className="font-mono text-slate-300 text-[10px]">SSL Certificate</span>
                                    </div>
                                    <div className="flex items-center gap-2.5">
                                        <span className="text-cyan-400 font-mono text-[9px]">TLS 1.3</span>
                                        <span className="text-emerald-400 font-semibold font-mono text-[10px]">68d left</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* FEATURES SECTION */}
            <section id="features" className="scroll-mt-16 sm:scroll-mt-20 pt-3 sm:pt-5 lg:pt-6 pb-8 sm:pb-10 lg:pb-12 px-4 sm:px-6 relative">
                <div className="max-w-5xl mx-auto">
                    {/* Header */}
                    <div className="text-center max-w-3xl mx-auto mb-4 sm:mb-6">
                        <div className="inline-flex items-center justify-center px-3 py-1 rounded-full border border-blue-500/30 bg-blue-950/40 text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-blue-400 mb-2 shadow-sm">
                            FEATURES
                        </div>
                        <h2 className="text-lg sm:text-3xl md:text-4xl font-bold text-white tracking-tight sm:whitespace-nowrap">
                            Everything you need to stay ahead
                        </h2>
                        <p className="text-slate-400 text-xs sm:text-sm md:text-base mt-1 sm:mt-1.5 sm:whitespace-nowrap">
                            Simple tools. Powerful insights. Built for developers.
                        </p>
                    </div>

                    {/* 6 Compact Feature Cards Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                        {/* 1. 1-Minute Checks */}
                        <div className="flex items-start gap-3 p-3.5 sm:p-4 rounded-xl bg-[#0c1220]/80 border border-slate-800/80 hover:border-slate-700 hover:bg-[#0f172a] transition-all duration-200 shadow-md shadow-black/20 group">
                            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-blue-600 flex items-center justify-center shrink-0 text-white shadow-sm shadow-blue-600/30">
                                <svg className="w-4.5 h-4.5 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-white font-bold text-sm sm:text-base mb-0.5 group-hover:text-white transition-colors">
                                    1-Minute Checks
                                </h3>
                                <p className="text-slate-400 text-xs leading-relaxed">
                                    Monitor your endpoints every minute from global locations.
                                </p>
                            </div>
                        </div>

                        {/* 2. Instant Alerts */}
                        <div className="flex items-start gap-3 p-3.5 sm:p-4 rounded-xl bg-[#0c1220]/80 border border-slate-800/80 hover:border-slate-700 hover:bg-[#0f172a] transition-all duration-200 shadow-md shadow-black/20 group">
                            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-blue-500 flex items-center justify-center shrink-0 text-white shadow-sm shadow-blue-500/30">
                                <svg className="w-4.5 h-4.5 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-white font-bold text-sm sm:text-base mb-0.5 group-hover:text-white transition-colors">
                                    Instant Alerts
                                </h3>
                                <p className="text-slate-400 text-xs leading-relaxed">
                                    Get notified via Email, Slack, or webhooks when something goes wrong.
                                </p>
                            </div>
                        </div>

                        {/* 3. Performance Insights */}
                        <div className="flex items-start gap-3 p-3.5 sm:p-4 rounded-xl bg-[#0c1220]/80 border border-slate-800/80 hover:border-slate-700 hover:bg-[#0f172a] transition-all duration-200 shadow-md shadow-black/20 group">
                            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-[#10b981] flex items-center justify-center shrink-0 text-white shadow-sm shadow-emerald-600/30">
                                <svg className="w-4.5 h-4.5 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-white font-bold text-sm sm:text-base mb-0.5 group-hover:text-white transition-colors">
                                    Performance Insights
                                </h3>
                                <p className="text-slate-400 text-xs leading-relaxed">
                                    Track response times, uptime history, and trends with charts.
                                </p>
                            </div>
                        </div>

                        {/* 4. SSL Monitoring */}
                        <div className="flex items-start gap-3 p-3.5 sm:p-4 rounded-xl bg-[#0c1220]/80 border border-slate-800/80 hover:border-slate-700 hover:bg-[#0f172a] transition-all duration-200 shadow-md shadow-black/20 group">
                            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-[#f43f5e] flex items-center justify-center shrink-0 text-white shadow-sm shadow-rose-600/30">
                                <svg className="w-4.5 h-4.5 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-white font-bold text-sm sm:text-base mb-0.5 group-hover:text-white transition-colors">
                                    SSL Monitoring
                                </h3>
                                <p className="text-slate-400 text-xs leading-relaxed">
                                    Get alerted before your certificates expire.
                                </p>
                            </div>
                        </div>

                        {/* 5. Global Checks */}
                        <div className="flex items-start gap-3 p-3.5 sm:p-4 rounded-xl bg-[#0c1220]/80 border border-slate-800/80 hover:border-slate-700 hover:bg-[#0f172a] transition-all duration-200 shadow-md shadow-black/20 group">
                            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-[#0ea5e9] flex items-center justify-center shrink-0 text-white shadow-sm shadow-sky-600/30">
                                <svg className="w-4.5 h-4.5 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-white font-bold text-sm sm:text-base mb-0.5 group-hover:text-white transition-colors">
                                    Global Checks
                                </h3>
                                <p className="text-slate-400 text-xs leading-relaxed">
                                    Multiple regions for worldwide coverage and reliability.
                                </p>
                            </div>
                        </div>

                        {/* 6. Multi-Protocol Checks */}
                        <div className="flex items-start gap-3 p-3.5 sm:p-4 rounded-xl bg-[#0c1220]/80 border border-slate-800/80 hover:border-slate-700 hover:bg-[#0f172a] transition-all duration-200 shadow-md shadow-black/20 group">
                            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-cyan-600 flex items-center justify-center shrink-0 text-white shadow-sm shadow-cyan-600/30">
                                <svg className="w-4.5 h-4.5 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-white font-bold text-sm sm:text-base mb-0.5 group-hover:text-white transition-colors">
                                    Multi-Protocol Checks
                                </h3>
                                <p className="text-slate-400 text-xs leading-relaxed">
                                    Monitor HTTP, HTTPS, TCP, UDP, DNS, SMTP, SSL, and PING.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* HOW IT WORKS SECTION */}
            <section id="how-it-works" className="scroll-mt-16 sm:scroll-mt-20 py-8 sm:py-10 lg:py-12 px-4 sm:px-6 relative border-t border-slate-800/40">
                <div className="max-w-5xl mx-auto">
                    {/* Header */}
                    <div className="text-center max-w-2xl mx-auto mb-5 sm:mb-8">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-blue-500/30 bg-blue-950/40 text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-blue-400 mb-2 sm:mb-3 shadow-sm">
                            HOW IT WORKS
                        </div>
                        <h2 className="text-xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight sm:whitespace-nowrap">
                            Get started in 3 simple steps
                        </h2>
                        <p className="text-slate-400 text-xs sm:text-sm md:text-base mt-1.5 sm:mt-2 sm:whitespace-nowrap">
                            From zero to monitoring in under a minute.
                        </p>
                    </div>

                    {/* Ambient Glow */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-3xl h-36 bg-blue-600/10 blur-[110px] pointer-events-none rounded-full"></div>

                    {/* 3 Compact Developer-Grade Showcase Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5 relative z-10">
                        {/* Step 01 */}
                        <div className="group relative flex flex-col justify-between p-4 sm:p-5 rounded-xl bg-gradient-to-b from-[#0c1220]/95 via-[#0a0f1c]/95 to-[#060912]/95 border border-slate-800/80 border-t-2 border-t-blue-500 hover:border-slate-700 hover:border-t-blue-400 transition-all duration-300 hover:-translate-y-1 shadow-lg shadow-black/30 hover:shadow-blue-500/10">
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/25 text-blue-400 font-mono font-bold text-[10px] tracking-wider uppercase">
                                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span>
                                        STEP 01
                                    </span>
                                    <span className="text-2xl sm:text-3xl font-mono font-extrabold text-slate-800 group-hover:text-blue-500/30 transition-colors select-none">
                                        /01
                                    </span>
                                </div>
                                <h3 className="text-white font-bold text-base sm:text-lg mb-1 tracking-tight group-hover:text-blue-400 transition-colors">
                                    Add your service
                                </h3>
                                <p className="text-slate-400 text-xs leading-relaxed mb-3 sm:mb-4">
                                    Enter your website, API, or server endpoint to monitor.
                                </p>
                            </div>

                            {/* Micro-UI: Endpoint URL & Status Bar */}
                            <div className="rounded-lg bg-[#070b14] border border-slate-800/90 p-2.5 shadow-inner">
                                <div className="flex items-center gap-1.5 mb-1.5 pb-1.5 border-b border-slate-800/60">
                                    <div className="flex gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500/80"></span>
                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500/80"></span>
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/80"></span>
                                    </div>
                                    <span className="text-[9px] font-mono text-slate-500 ml-1">monitored-services</span>
                                </div>
                                <div className="space-y-1">
                                    <div className="flex items-center gap-1.5 bg-[#040711] px-2 py-1 rounded border border-slate-800">
                                        <span className="text-[9px] font-bold font-mono px-1 py-0.2 rounded bg-blue-500/20 text-blue-400 shrink-0">WEB</span>
                                        <span className="text-[11px] font-mono text-slate-300 truncate">https://yourwebsite.com</span>
                                        <span className="ml-auto flex items-center gap-1 text-[9px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 shrink-0">
                                            <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse"></span>
                                            200 OK
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1.5 bg-[#040711] px-2 py-1 rounded border border-slate-800">
                                        <span className="text-[9px] font-bold font-mono px-1 py-0.2 rounded bg-cyan-500/20 text-cyan-400 shrink-0">API</span>
                                        <span className="text-[11px] font-mono text-slate-300 truncate">https://api.domain.com</span>
                                        <span className="ml-auto flex items-center gap-1 text-[9px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 shrink-0">
                                            <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse"></span>
                                            200 OK
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between text-[9px] font-mono text-slate-400 mt-2 px-0.5">
                                    <span>Check: <strong className="text-slate-200">Every 60s</strong></span>
                                    <span className="text-blue-400 font-semibold">Global Mesh</span>
                                </div>
                            </div>
                        </div>

                        {/* Step 02 */}
                        <div className="group relative flex flex-col justify-between p-4 sm:p-5 rounded-xl bg-gradient-to-b from-[#0c1220]/95 via-[#0a0f1c]/95 to-[#060912]/95 border border-slate-800/80 border-t-2 border-t-cyan-500 hover:border-slate-700 hover:border-t-cyan-400 transition-all duration-300 hover:-translate-y-1 shadow-lg shadow-black/30 hover:shadow-cyan-500/10">
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/25 text-cyan-400 font-mono font-bold text-[10px] tracking-wider uppercase">
                                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
                                        STEP 02
                                    </span>
                                    <span className="text-2xl sm:text-3xl font-mono font-extrabold text-slate-800 group-hover:text-cyan-500/30 transition-colors select-none">
                                        /02
                                    </span>
                                </div>
                                <h3 className="text-white font-bold text-base sm:text-lg mb-1 tracking-tight group-hover:text-cyan-400 transition-colors">
                                    Set up alerts
                                </h3>
                                <p className="text-slate-400 text-xs leading-relaxed mb-3 sm:mb-4">
                                    Choose how and where your team wants to be notified.
                                </p>
                            </div>

                            {/* Micro-UI: Instant Alert Dispatch Feed */}
                            <div className="rounded-lg bg-[#070b14] border border-slate-800/90 p-2.5 shadow-inner">
                                <div className="flex items-center justify-between mb-1.5 pb-1.5 border-b border-slate-800/60">
                                    <span className="text-[9px] font-mono text-slate-400 flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping"></span>
                                        Instant Dispatch
                                    </span>
                                    <span className="text-[9px] font-mono text-cyan-400 bg-cyan-500/10 px-1 py-0.5 rounded border border-cyan-500/20">
                                        &lt; 500ms
                                    </span>
                                </div>
                                <div className="space-y-1">
                                    <div className="flex items-center justify-between bg-[#040711] px-2 py-1 rounded border border-slate-800">
                                        <div className="flex items-center gap-1.5">
                                            <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                                            <span className="text-[11px] font-mono text-slate-300">#slack-incidents</span>
                                        </div>
                                        <span className="text-[9px] font-mono text-emerald-400 font-semibold">Delivered</span>
                                    </div>
                                    <div className="flex items-center justify-between bg-[#040711] px-2 py-1 rounded border border-slate-800">
                                        <div className="flex items-center gap-1.5">
                                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                                            <span className="text-[11px] font-mono text-slate-300">Email &amp; SMS</span>
                                        </div>
                                        <span className="text-[9px] font-mono text-emerald-400 font-semibold">Sent</span>
                                    </div>
                                    <div className="flex items-center justify-between bg-[#040711] px-2 py-1 rounded border border-slate-800">
                                        <div className="flex items-center gap-1.5">
                                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                                            <span className="text-[11px] font-mono text-slate-300">Custom Webhooks</span>
                                        </div>
                                        <span className="text-[9px] font-mono text-cyan-400 font-semibold">Active</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Step 03 */}
                        <div className="group relative flex flex-col justify-between p-4 sm:p-5 rounded-xl bg-gradient-to-b from-[#0c1220]/95 via-[#0a0f1c]/95 to-[#060912]/95 border border-slate-800/80 border-t-2 border-t-emerald-500 hover:border-slate-700 hover:border-t-emerald-400 transition-all duration-300 hover:-translate-y-1 shadow-lg shadow-black/30 hover:shadow-emerald-500/10">
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 font-mono font-bold text-[10px] tracking-wider uppercase">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                        STEP 03
                                    </span>
                                    <span className="text-2xl sm:text-3xl font-mono font-extrabold text-slate-800 group-hover:text-emerald-500/30 transition-colors select-none">
                                        /03
                                    </span>
                                </div>
                                <h3 className="text-white font-bold text-base sm:text-lg mb-1 tracking-tight group-hover:text-emerald-400 transition-colors">
                                    Stay informed
                                </h3>
                                <p className="text-slate-400 text-xs leading-relaxed mb-3 sm:mb-4">
                                    Track uptime, response times, and get instant notifications.
                                </p>
                            </div>

                            {/* Micro-UI: Live Latency Sparkline & Status */}
                            <div className="rounded-lg bg-[#070b14] border border-slate-800/90 p-2.5 shadow-inner">
                                {/* Top Bar: Feed & Normal Status */}
                                <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-800/60">
                                    <span className="text-[9px] font-mono text-slate-400 flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                        24h Latency Feed
                                    </span>
                                    <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 font-semibold flex items-center gap-1">
                                        <span className="w-1 h-1 rounded-full bg-emerald-400"></span>
                                        Normal
                                    </span>
                                </div>

                                {/* Metric Chips: Uptime & Latency */}
                                <div className="grid grid-cols-2 gap-1.5 mb-2">
                                    <div className="bg-[#040711] px-2 py-1 rounded border border-slate-800">
                                        <span className="text-[8px] font-mono uppercase text-slate-500 block leading-tight">Uptime</span>
                                        <span className="text-xs font-bold font-mono text-emerald-400">99.99%</span>
                                    </div>
                                    <div className="bg-[#040711] px-2 py-1 rounded border border-slate-800 text-right">
                                        <span className="text-[8px] font-mono uppercase text-slate-500 block leading-tight">Latency</span>
                                        <span className="text-xs font-bold font-mono text-cyan-400">32ms <span className="text-[9px] font-normal text-slate-500">avg</span></span>
                                    </div>
                                </div>

                                {/* Latency Sparkline Bars */}
                                <div className="flex items-end gap-1 h-6 bg-[#040711] p-1 rounded border border-slate-800 justify-between">
                                    {[35, 45, 30, 50, 40, 60, 45, 35, 55, 30, 40, 48, 38, 52, 36, 42].map((h, i) => (
                                        <div
                                            key={i}
                                            style={{ height: `${h}%` }}
                                            className={`w-full rounded-sm transition-all duration-300 ${
                                                i === 15 ? 'bg-emerald-400 animate-pulse' : 'bg-emerald-500/70 hover:bg-emerald-400'
                                            }`}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA SECTION (Simple, Modern & Open Layout with Animated Side Elements) */}
            <section className="pt-8 sm:pt-10 lg:pt-12 pb-10 sm:pb-14 lg:pb-16 px-4 sm:px-6 relative overflow-hidden border-t border-slate-800/60">
                {/* Left Animated Ambient Glow */}
                <div className="hidden lg:block absolute left-4 xl:left-12 top-1/2 -translate-y-1/2 w-72 h-72 rounded-full bg-blue-500/10 blur-[100px] pointer-events-none animate-pulse-slow"></div>

                {/* Right Animated Ambient Glow */}
                <div className="hidden lg:block absolute right-4 xl:right-12 top-1/2 -translate-y-1/2 w-72 h-72 rounded-full bg-cyan-500/10 blur-[100px] pointer-events-none animate-pulse-slow"></div>

                <div className="max-w-7xl mx-auto relative flex items-center justify-between gap-6 xl:gap-8">
                    {/* Left Floating Probe Telemetry Card (Desktop Only) */}
                    <div className="hidden lg:block w-56 xl:w-64 shrink-0 animate-float-slow select-none">
                        <div className="p-3.5 rounded-2xl bg-[#0c1220]/80 border border-slate-800/80 backdrop-blur-xl shadow-xl shadow-blue-500/5 -rotate-1 hover:rotate-0 transition-transform">
                            <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-slate-800/60">
                                <div className="flex items-center gap-1.5">
                                    <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                    </span>
                                    <span className="text-xs font-mono font-semibold text-slate-200">Global Probes</span>
                                </div>
                                <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 font-medium">
                                    ● All Online
                                </span>
                            </div>
                            <div className="space-y-1.5 text-[11px] font-mono">
                                <div className="flex items-center justify-between px-2 py-1 rounded bg-[#040711] border border-slate-800/60">
                                    <span className="flex items-center gap-1.5 text-slate-300">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                                        US-East
                                    </span>
                                    <span className="text-emerald-400 font-semibold">18ms</span>
                                </div>
                                <div className="flex items-center justify-between px-2 py-1 rounded bg-[#040711] border border-slate-800/60">
                                    <span className="flex items-center gap-1.5 text-slate-300">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                                        EU-Central
                                    </span>
                                    <span className="text-emerald-400 font-semibold">24ms</span>
                                </div>
                                <div className="flex items-center justify-between px-2 py-1 rounded bg-[#040711] border border-slate-800/60">
                                    <span className="flex items-center gap-1.5 text-slate-300">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                                        AP-South
                                    </span>
                                    <span className="text-emerald-400 font-semibold">31ms</span>
                                </div>
                            </div>
                            <div className="flex items-center justify-between text-[9px] font-mono text-slate-500 mt-2.5 px-0.5">
                                <span>Multi-Region Check</span>
                                <span className="text-blue-400 font-medium">60s Cycle</span>
                            </div>
                        </div>
                    </div>

                    {/* Center CTA Content */}
                    <div className="flex-1 max-w-2xl mx-auto text-center relative z-10 px-2">
                        {/* Eyebrow Pill */}
                        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full border border-blue-500/30 bg-blue-950/40 text-xs font-medium text-blue-300 mb-3.5 sm:mb-4.5 shadow-sm">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                            <span>Start Monitoring Today</span>
                        </div>

                        {/* Headline: Strictly 1 Line */}
                        <h2 className="text-[clamp(19px,5.2vw,28px)] sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight leading-tight mb-3 sm:mb-4 whitespace-nowrap">
                            Ready to eliminate{' '}
                            <span className="text-blue-500">
                                downtime?
                            </span>
                        </h2>

                        {/* Subtitle: Strictly 2 Lines */}
                        <p className="text-slate-400 text-[clamp(11px,2.9vw,15px)] sm:text-base md:text-lg max-w-2xl mx-auto mb-6 sm:mb-7 leading-relaxed font-normal">
                            <span className="block whitespace-nowrap">Join thousands of developers keeping their services online.</span>
                            <span className="block whitespace-nowrap mt-1">Set up your first check in under 60 seconds.</span>
                        </p>

                        {/* Action Button */}
                        <div className="flex items-center justify-center gap-4 mb-6 sm:mb-7">
                            <Link
                                to="/register"
                                className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl shadow-lg shadow-blue-600/25 hover:shadow-blue-500/35 hover:-translate-y-0.5 transition-all duration-200"
                            >
                                <span>Create Free Account</span>
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                </svg>
                            </Link>
                        </div>

                        {/* Simple Modern Trust Badges: Strictly 1 Line on Mobile */}
                        <div className="flex items-center justify-center gap-2 sm:gap-6 md:gap-8 text-[clamp(10px,2.5vw,13px)] sm:text-sm text-slate-400 whitespace-nowrap">
                            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                                <span>Free forever tier</span>
                            </div>
                            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                                <span>No credit card<span className="hidden min-[380px]:inline"> required</span></span>
                            </div>
                            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                                <span>60-second setup</span>
                            </div>
                        </div>
                    </div>

                    {/* Right Floating Alert Stream Card (Desktop Only) */}
                    <div className="hidden lg:block w-56 xl:w-64 shrink-0 animate-float-reverse select-none">
                        <div className="p-3.5 rounded-2xl bg-[#0c1220]/80 border border-slate-800/80 backdrop-blur-xl shadow-xl shadow-cyan-500/5 rotate-1 hover:rotate-0 transition-transform">
                            <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-slate-800/60">
                                <div className="flex items-center gap-1.5">
                                    <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                                    </span>
                                    <span className="text-xs font-mono font-semibold text-slate-200">Alert Dispatch</span>
                                </div>
                                <span className="text-[9px] font-mono text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/20 font-medium">
                                    &lt; 100ms
                                </span>
                            </div>
                            <div className="space-y-1.5 text-[11px] font-mono">
                                <div className="flex items-center justify-between px-2 py-1 rounded bg-[#040711] border border-slate-800/60">
                                    <span className="flex items-center gap-1.5 text-slate-300">
                                        <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                                        #slack-alerts
                                    </span>
                                    <span className="text-emerald-400 font-semibold">Delivered</span>
                                </div>
                                <div className="flex items-center justify-between px-2 py-1 rounded bg-[#040711] border border-slate-800/60">
                                    <span className="flex items-center gap-1.5 text-slate-300">
                                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                                        Email &amp; SMS
                                    </span>
                                    <span className="text-emerald-400 font-semibold">Dispatched</span>
                                </div>
                                <div className="flex items-center justify-between px-2 py-1 rounded bg-[#040711] border border-slate-800/60">
                                    <span className="flex items-center gap-1.5 text-slate-300">
                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                                        Custom Webhook
                                    </span>
                                    <span className="text-cyan-400 font-semibold">Triggered</span>
                                </div>
                            </div>
                            <div className="flex items-center justify-between text-[9px] font-mono text-slate-500 mt-2.5 px-0.5">
                                <span>Incident Dispatch</span>
                                <span className="text-emerald-400 font-medium">Zero Delay</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="py-6 sm:py-10 px-4 sm:px-6 border-t border-slate-800/80 bg-[#06090f]">
                <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-3 text-center sm:text-left">
                        <Logo size="sm" showText={true} textClassName="text-base font-bold text-white tracking-tight" animated={false} />
                        <span className="text-xs text-slate-500 sm:ml-1">Simple, powerful uptime monitoring</span>
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-5 sm:gap-6 text-sm text-slate-400">
                        <Link to="/login" className="hover:text-white transition-colors">Sign In</Link>
                        <Link to="/register" className="hover:text-white transition-colors">Sign Up</Link>
                        <button onClick={() => scrollToSection('features')} className="hover:text-white transition-colors cursor-pointer">Features</button>
                        <button onClick={() => scrollToSection('how-it-works')} className="hover:text-white transition-colors cursor-pointer">How It Works</button>
                    </div>

                    <p className="text-xs text-slate-500 text-center sm:text-right">
                        © {new Date().getFullYear()} PulseGuard. All rights reserved.
                    </p>
                </div>
            </footer>
        </div>
    );
};

export default Landing;
