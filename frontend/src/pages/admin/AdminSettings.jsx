import { useState, useEffect } from 'react';
import { adminAPI } from '../../services/api';
import Toast from '../../components/Toast';

const AdminSettings = () => {
    const [globalAlert, setGlobalAlert] = useState('');
    const [maintenanceMode, setMaintenanceMode] = useState(false);
    const [allowSignups, setAllowSignups] = useState(true);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [showSuccess, setShowSuccess] = useState(false);

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const res = await adminAPI.getSettings();
                if (res.data.success && res.data.data) {
                    setGlobalAlert(res.data.data.globalAlert || '');
                    setMaintenanceMode(res.data.data.maintenanceMode || false);
                    setAllowSignups(res.data.data.allowSignups !== undefined ? res.data.data.allowSignups : true);
                }
            } catch (error) {
                console.error("Failed to fetch settings", error);
            } finally {
                setLoading(false);
            }
        };
        fetchSettings();
    }, []);

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const res = await adminAPI.updateSettings({
                globalAlert,
                maintenanceMode,
                allowSignups
            });
            if (res.data.success) {
                setShowSuccess(true);
                setTimeout(() => setShowSuccess(false), 3000);
            }
        } catch (error) {
            console.error('Error updating settings:', error);
            // Optionally could add error state here too
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div className="text-white">Loading settings...</div>;
    }

    return (
        <div className="max-w-3xl space-y-4 sm:space-y-5 animate-fade-in relative">
            {/* Modern Bottom-Center Success Toast */}
            <Toast message={showSuccess ? 'System settings updated successfully' : ''} type="success" onClose={() => setShowSuccess(false)} />

            <div>
                <h1 className="text-xl sm:text-2xl font-bold text-white mb-0.5">System Configuration</h1>
                <p className="text-slate-400 text-xs sm:text-sm font-medium whitespace-nowrap truncate">
                    <span className="hidden sm:inline">Configure global announcements, access controls, and maintenance state</span>
                    <span className="sm:hidden">Configure announcements & maintenance state</span>
                </p>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
                {/* 1. Global Announcements */}
                <div className="bg-slate-800/40 backdrop-blur-xl border border-slate-700/60 rounded-xl p-4 sm:p-5 shadow-sm space-y-3.5">
                    <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                            <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-sm font-bold text-white">Global Announcements</h2>
                            <p className="text-slate-400 text-[11px]">Broadcast a banner notice to all logged-in users across their dashboard</p>
                        </div>
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <label className="text-xs font-medium text-slate-300">Banner Message</label>
                            {globalAlert && (
                                <button
                                    type="button"
                                    onClick={() => setGlobalAlert('')}
                                    className="text-[11px] text-slate-400 hover:text-red-400 transition-colors cursor-pointer"
                                >
                                    Clear message
                                </button>
                            )}
                        </div>
                        <input
                            type="text"
                            className="w-full bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all"
                            placeholder="e.g., Scheduled maintenance tonight at 10 PM UTC (30 mins expected downtime)"
                            value={globalAlert}
                            onChange={(e) => setGlobalAlert(e.target.value)}
                        />
                    </div>

                    {/* Live Banner Preview */}
                    {globalAlert && (
                        <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-200 flex items-center gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 shrink-0">User Preview</span>
                            <span className="truncate">{globalAlert}</span>
                        </div>
                    )}
                </div>

                {/* 2. Maintenance Mode Card */}
                <div className="bg-slate-800/40 backdrop-blur-xl border border-slate-700/60 rounded-xl p-4 sm:p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0 mt-0.5">
                                <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                            <div>
                                <div className="flex items-center gap-2 mb-0.5">
                                    <h2 className="text-sm font-bold text-white">Maintenance Mode</h2>
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${maintenanceMode ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-slate-700/50 text-slate-400'}`}>
                                        {maintenanceMode ? 'Active (Restricted)' : 'Disabled (Normal)'}
                                    </span>
                                </div>
                                <p className="text-slate-400 text-[11px] leading-relaxed max-w-xl">
                                    When enabled, non-admin user operations are temporarily paused with an HTTP 503 maintenance notice and a warning banner is displayed across the platform. Admins retain full unrestricted access.
                                </p>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={() => setMaintenanceMode(!maintenanceMode)}
                            className={`relative inline-flex h-5 w-10 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-1 focus:ring-blue-500 ${maintenanceMode ? 'bg-amber-500' : 'bg-slate-700'}`}
                            aria-label="Toggle maintenance mode"
                        >
                            <span
                                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${maintenanceMode ? 'translate-x-5' : 'translate-x-0'}`}
                            />
                        </button>
                    </div>
                </div>

                {/* 3. New User Registration Card */}
                <div className="bg-slate-800/40 backdrop-blur-xl border border-slate-700/60 rounded-xl p-4 sm:p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
                                <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                                </svg>
                            </div>
                            <div>
                                <div className="flex items-center gap-2 mb-0.5">
                                    <h2 className="text-sm font-bold text-white">Allow New User Registrations</h2>
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${allowSignups ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
                                        {allowSignups ? 'Open Signups' : 'Signups Disabled'}
                                    </span>
                                </div>
                                <p className="text-slate-400 text-[11px] leading-relaxed max-w-xl">
                                    Controls whether new visitors can create accounts via the public registration page. When turned off, new signups are blocked while all existing users can still log in and use their accounts.
                                </p>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={() => setAllowSignups(!allowSignups)}
                            className={`relative inline-flex h-5 w-10 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-1 focus:ring-blue-500 ${allowSignups ? 'bg-blue-600' : 'bg-slate-700'}`}
                            aria-label="Toggle user registrations"
                        >
                            <span
                                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${allowSignups ? 'translate-x-5' : 'translate-x-0'}`}
                            />
                        </button>
                    </div>
                </div>

                {/* Submit Action */}
                <div className="flex justify-end pt-1">
                    <button
                        type="submit"
                        disabled={saving}
                        className={`w-full sm:w-auto justify-center bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold py-2.5 sm:py-2 px-5 rounded-lg transition-all shadow-sm shadow-blue-500/20 hover:scale-[1.02] cursor-pointer flex items-center gap-1.5 ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        {saving && (
                            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        )}
                        <span>{saving ? 'Saving...' : 'Save Configuration'}</span>
                    </button>
                </div>
            </form>
        </div>
    );
};

export default AdminSettings;
