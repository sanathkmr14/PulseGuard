import { Link } from 'react-router-dom';

const Landing = () => {
    return (
        <div className="min-h-screen bg-[#0a0a0f]">
            {/* Navigation */}
            <nav className="border-b border-gray-800/50">
                <div className="max-w-6xl mx-auto px-6 py-5">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
                                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 12h4l3-9 4 18 3-9h4" />
                                </svg>
                            </div>
                            <span className="text-lg font-bold text-white">PulseGuard</span>
                        </div>
                        <div className="flex items-center gap-4">
                            <Link to="/login" className="text-sm text-gray-400 hover:text-white transition-colors">
                                Sign In
                            </Link>
                            <Link to="/register" className="text-sm px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg transition-colors">
                                Get Started
                            </Link>
                        </div>
                    </div>
                </div>
            </nav>

            {/* Hero */}
            <section className="pt-28 pb-24 px-6">
                <div className="max-w-3xl mx-auto text-center">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-xs text-indigo-400 mb-8">
                        <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full"></span>
                        Trusted by developers worldwide
                    </div>
                    <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6">
                        Monitor your services
                        <br />
                        <span className="text-indigo-400">with confidence</span>
                    </h1>
                    <p className="text-lg text-gray-400 mb-10 max-w-lg mx-auto leading-relaxed">
                        Real-time uptime monitoring for your websites and APIs. Get instant alerts when things go wrong.
                    </p>
                    <Link to="/register" className="inline-block px-8 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl transition-all hover:shadow-lg hover:shadow-indigo-500/20">
                        Start Monitoring — Free
                    </Link>
                </div>
            </section>

            {/* Features */}
            <section className="py-24 px-6">
                <div className="max-w-5xl mx-auto">
                    <div className="text-center mb-16">
                        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">Everything you need</h2>
                        <p className="text-gray-500">Simple, powerful monitoring tools</p>
                    </div>
                    <div className="flex flex-wrap justify-center gap-6">
                        {[
                            {
                                icon: (
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                ),
                                title: '1-Minute Checks',
                                desc: 'Monitor endpoints every minute from global locations.'
                            },
                            {
                                icon: (
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                    </svg>
                                ),
                                title: 'Instant Alerts',
                                desc: 'Email, Slack, SMS, or webhook notifications.'
                            },
                            {
                                icon: (
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                    </svg>
                                ),
                                title: 'Performance Insights',
                                desc: 'Response times, uptime history, and trends.'
                            },
                            {
                                icon: (
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                    </svg>
                                ),
                                title: 'SSL Monitoring',
                                desc: 'Alerts before certificates expire.'
                            },
                            {
                                icon: (
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                ),
                                title: 'Global Checks',
                                desc: 'Multiple regions for worldwide coverage.'
                            },

                        ].map((item, i) => (
                            <div key={i} className="w-full md:w-[calc(33.333%-16px)] p-6 bg-gray-900/50 border border-gray-800/50 rounded-2xl hover:border-gray-700/50 transition-colors">
                                <div className="w-11 h-11 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-400 mb-4">
                                    {item.icon}
                                </div>
                                <h3 className="text-white font-semibold mb-2">{item.title}</h3>
                                <p className="text-sm text-gray-500 leading-relaxed">{item.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Stats */}
            <section className="py-20 px-6 border-t border-gray-800/50">
                <div className="max-w-4xl mx-auto">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
                        {[
                            { value: '99.99%', label: 'Uptime' },
                            { value: '50ms', label: 'Avg Response' },
                            { value: '10K+', label: 'Users' },
                            { value: '1M+', label: 'Daily Checks' },
                        ].map((stat, i) => (
                            <div key={i}>
                                <div className="text-3xl font-bold text-white mb-1">{stat.value}</div>
                                <div className="text-sm text-gray-500">{stat.label}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA */}
            <section className="py-24 px-6">
                <div className="max-w-2xl mx-auto text-center">
                    <h2 className="text-3xl font-bold text-white mb-4">Ready to get started?</h2>
                    <p className="text-gray-500 mb-8">No credit card required. Start monitoring in seconds.</p>
                    <Link to="/register" className="inline-block px-8 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl transition-all hover:shadow-lg hover:shadow-indigo-500/20">
                        Create Free Account
                    </Link>
                </div>
            </section>

            {/* Footer */}
            <footer className="py-8 px-6 border-t border-gray-800/50">
                <div className="max-w-6xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
                            <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 12h4l3-9 4 18 3-9h4" />
                            </svg>
                        </div>
                        <span className="text-sm text-gray-400">PulseGuard</span>
                    </div>
                    <p className="text-xs text-gray-600">© {new Date().getFullYear()} PulseGuard</p>
                </div>
            </footer>
        </div>
    );
};

export default Landing;
