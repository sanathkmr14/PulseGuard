import { useState, useEffect } from 'react';
import { adminAPI } from '../../services/api';

const AdminMonitorEditModal = ({ isOpen, onClose, monitor, onSuccess }) => {
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        type: 'HTTPS',
        url: '',
        interval: 5,
        timeout: 30000,
        degradedThresholdMs: 2000,
        sslExpiryThresholdDays: 30
    });
    const [showAdvanced, setShowAdvanced] = useState(false);

    useEffect(() => {
        if (monitor && isOpen) {
            setFormData({
                name: monitor.name || '',
                type: monitor.type || 'HTTPS',
                url: monitor.url || '',
                interval: monitor.interval || 5,
                timeout: monitor.timeout || 30000,
                degradedThresholdMs: monitor.degradedThresholdMs || 2000,
                sslExpiryThresholdDays: monitor.sslExpiryThresholdDays || 30
            });
            setError(null);
            setShowAdvanced(false);
        }
    }, [monitor, isOpen]);

    if (!isOpen || !monitor) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        try {
            await adminAPI.updateMonitor(monitor._id, formData);
            if (onSuccess) onSuccess();
            onClose();
        } catch (err) {
            console.error('Submit error:', err);
            setError(err.response?.data?.message || 'Failed to update monitor');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

            {/* Modal */}
            <div className="relative bg-[#12121a] border border-gray-800/50 rounded-2xl p-6 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-semibold text-white">Edit Monitor (Admin)</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {error && (
                    <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 text-red-400 rounded-lg text-sm">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1.5">Name</label>
                            <input type="text" placeholder="My Website" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })}
                                className="w-full px-4 py-3 bg-[#0a0a0f] border border-gray-800 rounded-xl text-white placeholder-gray-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1.5">Type</label>
                            <select value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })}
                                className="w-full px-4 py-3 bg-[#0a0a0f] border border-gray-800 rounded-xl text-white focus:border-indigo-500 outline-none">
                                {['HTTP', 'HTTPS', 'TCP', 'UDP', 'DNS', 'SMTP', 'SSL', 'PING'].map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        <div className="sm:col-span-2">
                            <label className="block text-sm font-medium text-gray-400 mb-1.5">URL or Hostname</label>
                            <input type="text" placeholder="https://example.com" required value={formData.url} onChange={e => setFormData({ ...formData, url: e.target.value })}
                                className="w-full px-4 py-3 bg-[#0a0a0f] border border-gray-800 rounded-xl text-white placeholder-gray-600 focus:border-indigo-500 outline-none" />
                        </div>
                        <div className="sm:col-span-2">
                            <label className="block text-sm font-medium text-gray-400 mb-1.5">Check Interval (minutes)</label>
                            <input type="number" placeholder="5" min="1" value={formData.interval} onChange={e => setFormData({ ...formData, interval: +e.target.value })}
                                className="w-full px-4 py-3 bg-[#0a0a0f] border border-gray-800 rounded-xl text-white focus:border-indigo-500 outline-none" />
                        </div>
                    </div>

                    <button type="button" onClick={() => setShowAdvanced(!showAdvanced)}
                        className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors mt-4">
                        <svg className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        Advanced Settings
                    </button>

                    {showAdvanced && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-gray-800/50">
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1.5">Timeout (ms)</label>
                                <input type="number" placeholder="30000" min="1000" value={formData.timeout} onChange={e => setFormData({ ...formData, timeout: +e.target.value })}
                                    className="w-full px-4 py-3 bg-[#0a0a0f] border border-gray-800 rounded-xl text-white focus:border-indigo-500 outline-none" />
                                <p className="text-xs text-gray-600 mt-1">Max wait time before marking as down</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1.5">Degraded Threshold (ms)</label>
                                <input type="number" placeholder="2000" min="0" value={formData.degradedThresholdMs} onChange={e => setFormData({ ...formData, degradedThresholdMs: +e.target.value })}
                                    className="w-full px-4 py-3 bg-[#0a0a0f] border border-gray-800 rounded-xl text-white focus:border-indigo-500 outline-none" />
                                <p className="text-xs text-gray-600 mt-1">Response time above this = degraded status</p>
                            </div>
                            {(formData.type === 'SSL' || formData.type === 'HTTPS') && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1.5">SSL Expiry Alert (days)</label>
                                    <input type="number" placeholder="30" min="1" max="365" value={formData.sslExpiryThresholdDays} onChange={e => setFormData({ ...formData, sslExpiryThresholdDays: +e.target.value })}
                                        className="w-full px-4 py-3 bg-[#0a0a0f] border border-gray-800 rounded-xl text-white focus:border-indigo-500 outline-none" />
                                </div>
                            )}
                        </div>
                    )}

                    <div className="flex gap-3 pt-4 border-t border-gray-800/50 mt-6">
                        <button type="button" onClick={onClose} disabled={saving}
                            className="flex-1 px-4 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50">
                            Cancel
                        </button>
                        <button type="submit" disabled={saving}
                            className="flex-1 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                            {saving ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Updating...
                                </>
                            ) : 'Update Monitor'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AdminMonitorEditModal;
