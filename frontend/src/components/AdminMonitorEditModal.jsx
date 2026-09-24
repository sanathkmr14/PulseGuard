import { useState, useEffect } from 'react';
import { adminAPI } from '../services/api';

const AdminMonitorEditModal = ({ isOpen, onClose, monitor, onSuccess }) => {
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        type: 'HTTPS',
        url: '',
        port: '',
        alertThreshold: 2,
        headers: '',
        interval: 5,
        timeout: 30000,
        degradedThresholdMs: 2000,
        sslExpiryThresholdDays: 14
    });
    const [showAdvanced, setShowAdvanced] = useState(false);

    useEffect(() => {
        if (monitor && isOpen) {
            setFormData({
                name: monitor.name || '',
                type: monitor.type || 'HTTPS',
                url: monitor.url || '',
                port: monitor.port ?? '',
                alertThreshold: monitor.alertThreshold ?? 2,
                headers: monitor.headers ? JSON.stringify(monitor.headers instanceof Map ? Object.fromEntries(monitor.headers) : monitor.headers, null, 2) : '',
                interval: monitor.interval || 5,
                timeout: monitor.timeout || 30000,
                degradedThresholdMs: monitor.degradedThresholdMs || 2000,
                sslExpiryThresholdDays: monitor.sslExpiryThresholdDays || 14
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
            const payload = { ...formData };
            if (payload.port === '' || payload.port === null) delete payload.port;
            else payload.port = Number(payload.port);
            if (payload.alertThreshold !== undefined && payload.alertThreshold !== '') payload.alertThreshold = Number(payload.alertThreshold);
            if (typeof payload.headers === 'string') {
                const h = payload.headers.trim();
                if (!h) delete payload.headers;
                else {
                    try {
                        payload.headers = JSON.parse(h);
                    } catch {
                        setError('Headers must be valid JSON (e.g. {"Authorization":"Bearer x"})');
                        setSaving(false);
                        return;
                    }
                }
            }
            await adminAPI.updateMonitor(monitor._id, payload);
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
            <div className="relative bg-slate-900 border border-slate-700/80 rounded-xl p-4 sm:p-5 w-full max-w-xl shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
                <div className="flex justify-between items-center mb-4 pb-2.5 border-b border-slate-800">
                    <h3 className="text-base font-bold text-white">Edit Monitor (Admin)</h3>
                    <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded-md hover:bg-slate-800 transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {error && (
                    <div className="mb-3 p-2.5 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-xs">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-3.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-slate-400 mb-1">Name</label>
                            <input type="text" placeholder="My Website" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })}
                                className="w-full px-3 py-1.5 bg-slate-950/60 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-400 mb-1">Type</label>
                            <select value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })}
                                className="w-full px-3 py-1.5 bg-slate-950/60 border border-slate-700 rounded-lg text-xs text-white focus:border-blue-500 outline-none cursor-pointer">
                                {['HTTP', 'HTTPS', 'TCP', 'UDP', 'DNS', 'SMTP', 'SSL', 'PING'].map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        <div className="sm:col-span-2">
                            <label className="block text-xs font-medium text-slate-400 mb-1">URL or Hostname</label>
                            <input type="text" placeholder="https://example.com" required value={formData.url} onChange={e => setFormData({ ...formData, url: e.target.value })}
                                className="w-full px-3 py-1.5 bg-slate-950/60 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:border-blue-500 outline-none font-mono" />
                        </div>
                        <div className="sm:col-span-2">
                            <label className="block text-xs font-medium text-slate-400 mb-1">Check Interval (minutes)</label>
                            <input type="number" placeholder="5" min="1" value={formData.interval} onChange={e => setFormData({ ...formData, interval: +e.target.value })}
                                className="w-full px-3 py-1.5 bg-slate-950/60 border border-slate-700 rounded-lg text-xs text-white focus:border-blue-500 outline-none" />
                        </div>
                    </div>

                    <button type="button" onClick={() => setShowAdvanced(!showAdvanced)}
                        className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white transition-colors mt-2">
                        <svg className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        Advanced Settings
                    </button>

                    {showAdvanced && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800">
                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1">Port</label>
                                <input type="number" placeholder="e.g. 443" min="1" max="65535" value={formData.port ?? ''} onChange={e => setFormData({ ...formData, port: e.target.value === '' ? '' : +e.target.value })}
                                    className="w-full px-3 py-1.5 bg-slate-950/60 border border-slate-700 rounded-lg text-xs text-white focus:border-blue-500 outline-none font-mono" />
                                <p className="text-[11px] text-slate-500 mt-0.5">Required for TCP/UDP/SMTP</p>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1">Alert Threshold</label>
                                <input type="number" placeholder="2" min="1" max="20" value={formData.alertThreshold ?? 2} onChange={e => setFormData({ ...formData, alertThreshold: +e.target.value })}
                                    className="w-full px-3 py-1.5 bg-slate-950/60 border border-slate-700 rounded-lg text-xs text-white focus:border-blue-500 outline-none" />
                                <p className="text-[11px] text-slate-500 mt-0.5">Failures before alert</p>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1">Timeout (ms)</label>
                                <input type="number" placeholder="30000" min="1000" value={formData.timeout} onChange={e => setFormData({ ...formData, timeout: +e.target.value })}
                                    className="w-full px-3 py-1.5 bg-slate-950/60 border border-slate-700 rounded-lg text-xs text-white focus:border-blue-500 outline-none" />
                                <p className="text-[11px] text-slate-500 mt-0.5">Max wait time before marking as down</p>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1">Degraded Threshold (ms)</label>
                                <input type="number" placeholder="2000" min="0" value={formData.degradedThresholdMs} onChange={e => setFormData({ ...formData, degradedThresholdMs: +e.target.value })}
                                    className="w-full px-3 py-1.5 bg-slate-950/60 border border-slate-700 rounded-lg text-xs text-white focus:border-blue-500 outline-none" />
                                <p className="text-[11px] text-slate-500 mt-0.5">Response time above this = degraded</p>
                            </div>
                            {(formData.type === 'SSL' || formData.type === 'HTTPS') && (
                                <div className="sm:col-span-2">
                                    <label className="block text-xs font-medium text-slate-400 mb-1">SSL Expiry Alert (days)</label>
                                    <input type="number" placeholder="14" min="1" max="365" value={formData.sslExpiryThresholdDays} onChange={e => setFormData({ ...formData, sslExpiryThresholdDays: +e.target.value })}
                                        className="w-full px-3 py-1.5 bg-slate-950/60 border border-slate-700 rounded-lg text-xs text-white focus:border-blue-500 outline-none" />
                                </div>
                            )}
                        </div>
                    )}

                    <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800 mt-4">
                        <button type="button" onClick={onClose} disabled={saving}
                            className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition-colors border border-slate-700/60 disabled:opacity-50">
                            Cancel
                        </button>
                        <button type="submit" disabled={saving}
                            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg transition-all shadow-sm shadow-blue-500/20 disabled:opacity-50 flex items-center justify-center gap-1.5">
                            {saving ? (
                                <>
                                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
