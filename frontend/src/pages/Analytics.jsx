const Analytics = () => {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-white">Analytics</h1>
                <p className="text-gray-500 mt-1">Detailed analytics and performance insights</p>
            </div>

            <div className="bg-[#12121a] border border-gray-800/50 rounded-2xl p-12 text-center">
                <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 rounded-2xl flex items-center justify-center">
                    <span className="text-4xl">📊</span>
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">Analytics Coming Soon</h3>
                <p className="text-gray-500 max-w-md mx-auto">
                    Advanced analytics and reporting features will be available here. Track trends, compare performance, and get insights.
                </p>
                <div className="mt-8 flex flex-wrap justify-center gap-4">
                    <div className="px-4 py-3 bg-gray-800/50 rounded-xl">
                        <p className="text-xs text-gray-500 mb-1">Response Trends</p>
                        <p className="text-sm text-gray-400">Coming soon</p>
                    </div>
                    <div className="px-4 py-3 bg-gray-800/50 rounded-xl">
                        <p className="text-xs text-gray-500 mb-1">Uptime Reports</p>
                        <p className="text-sm text-gray-400">Coming soon</p>
                    </div>
                    <div className="px-4 py-3 bg-gray-800/50 rounded-xl">
                        <p className="text-xs text-gray-500 mb-1">Incident Analysis</p>
                        <p className="text-sm text-gray-400">Coming soon</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Analytics;
