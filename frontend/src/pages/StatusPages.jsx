const StatusPages = () => {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-white">Status Pages</h1>
                <p className="text-gray-500 mt-1">Create public status pages for your services</p>
            </div>

            <div className="bg-[#12121a] border border-gray-800/50 rounded-2xl p-12 text-center">
                <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 rounded-2xl flex items-center justify-center">
                    <span className="text-4xl">📄</span>
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">Status Pages Coming Soon</h3>
                <p className="text-gray-500 max-w-md mx-auto">
                    Create beautiful public status pages to keep your users informed about your service health.
                </p>
                <div className="mt-8 flex flex-wrap justify-center gap-4">
                    <div className="px-4 py-3 bg-gray-800/50 rounded-xl">
                        <p className="text-xs text-gray-500 mb-1">Custom Branding</p>
                        <p className="text-sm text-gray-400">Coming soon</p>
                    </div>
                    <div className="px-4 py-3 bg-gray-800/50 rounded-xl">
                        <p className="text-xs text-gray-500 mb-1">Public URLs</p>
                        <p className="text-sm text-gray-400">Coming soon</p>
                    </div>
                    <div className="px-4 py-3 bg-gray-800/50 rounded-xl">
                        <p className="text-xs text-gray-500 mb-1">Incident Updates</p>
                        <p className="text-sm text-gray-400">Coming soon</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StatusPages;
