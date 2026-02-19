import { useState, useEffect } from 'react';
import { adminAPI } from '../../services/api';

// Format value for display (handles dates, nulls, etc.)
const formatValue = (key, value) => {
    if (value === null || value === undefined) return '—';
    if (key === 'lastRun' && value) {
        const diff = Date.now() - new Date(value).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'Just now';
        if (mins < 60) return `${mins} min ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h ago`;
        return new Date(value).toLocaleDateString();
    }
    return value;
};

const HealthCard = ({ title, status, details, color }) => (
    <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-medium">{title}</h3>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${status === 'Operational' || status === 'Connected' || status === 'Running'
                ? 'bg-emerald-500/10 text-emerald-500'
                : 'bg-red-500/10 text-red-500'
                }`}>
                {status}
            </span>
        </div>
        <div className="space-y-2">
            {Object.entries(details).map(([key, value]) => (
                <div key={key} className="flex justify-between text-sm">
                    <span className="text-slate-400 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                    <span className="text-white font-mono">{formatValue(key, value)}</span>
                </div>
            ))}
        </div>
    </div>
);

const AdminHealth = () => {
    const [healthData, setHealthData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchHealth = async () => {
            try {
                const res = await adminAPI.getSystemHealth();
                if (res.data.success) {
                    setHealthData(res.data.data);
                }
            } catch (error) {
                console.error("Failed to fetch system health", error);
            } finally {
                setLoading(false);
            }
        };

        fetchHealth();
        // Poll every 30 seconds for live health check
        const interval = setInterval(fetchHealth, 30000);
        return () => clearInterval(interval);
    }, []);

    if (loading || !healthData) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="flex items-center gap-3 text-slate-400">
                    <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                    <span className="font-medium">Connecting to infrastructure...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white mb-1">System Health</h1>
                <p className="text-slate-400">Monitor infrastructure performance and status</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <HealthCard title="Database (MongoDB)" status={healthData.database.status} details={healthData.database.details} />
                <HealthCard title="Job Queue (BullMQ)" status={healthData.queue.status} details={healthData.queue.details} />
                <HealthCard title="Worker Nodes" status={healthData.workers.status} details={healthData.workers.details} />
                <HealthCard title="Server Host" status={healthData.system.status} details={healthData.system.details} />
            </div>

            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
                <div className="flex">
                    <div className="flex-shrink-0">
                        <svg className="h-5 w-5 text-amber-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                    </div>
                    <div className="ml-3">
                        <h3 className="text-sm font-medium text-amber-400">Maintenance Mode</h3>
                        <div className="mt-2 text-sm text-amber-200">
                            <p>System is currently running fine. Maintenance scheduled for Sunday at 02:00 UTC.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminHealth;
