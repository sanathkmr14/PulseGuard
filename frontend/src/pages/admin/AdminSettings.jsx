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
        <div className="max-w-4xl space-y-6 relative">
            {/* Modern Bottom-Center Success Toast */}
            <Toast message={showSuccess ? 'System settings updated successfully' : ''} type="success" onClose={() => setShowSuccess(false)} />


            <div>
                <h1 className="text-2xl font-bold text-white mb-1">System Configuration</h1>
                <p className="text-slate-400">Manage global settings</p>
            </div>

            <form onSubmit={handleSave} className="space-y-8">
                {/* Global Alert Section */}
                <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
                    <h2 className="text-lg font-medium text-white mb-4">Global Announcements</h2>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Banner Message</label>
                            <input
                                type="text"
                                className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="e.g., Scheduled maintenance at 10 PM UTC"
                                value={globalAlert}
                                onChange={(e) => setGlobalAlert(e.target.value)}
                            />
                            <p className="mt-1 text-xs text-slate-500">This message will be visible to all logged-in users.</p>
                        </div>

                        <div className="flex items-center">
                            <button
                                type="button"
                                onClick={() => setMaintenanceMode(!maintenanceMode)}
                                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${maintenanceMode ? 'bg-blue-600' : 'bg-slate-700'
                                    }`}
                            >
                                <span
                                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${maintenanceMode ? 'translate-x-5' : 'translate-x-0'
                                        }`}
                                />
                            </button>
                            <span className="ml-3 text-sm font-medium text-slate-300">Enable Maintenance Mode</span>
                        </div>

                        <div className="flex items-center">
                            <button
                                type="button"
                                onClick={() => setAllowSignups(!allowSignups)}
                                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${allowSignups ? 'bg-blue-600' : 'bg-slate-700'
                                    }`}
                            >
                                <span
                                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${allowSignups ? 'translate-x-5' : 'translate-x-0'
                                        }`}
                                />
                            </button>
                            <span className="ml-3 text-sm font-medium text-slate-300">Allow New User Registrations</span>
                        </div>
                    </div>
                </div>

                <div className="flex justify-end">
                    <button
                        type="submit"
                        disabled={saving}
                        className={`bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold py-2 px-5 rounded-lg transition-all shadow-sm shadow-blue-500/20 hover:scale-[1.02] cursor-pointer ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        {saving ? 'Saving...' : 'Save Configuration'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default AdminSettings;
