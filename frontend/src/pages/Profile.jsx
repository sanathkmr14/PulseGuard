import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../services/api';

const Profile = () => {
    const { user, updateProfile, logout } = useAuth();
    const [formData, setFormData] = useState({ name: '', email: '' });
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deletePassword, setDeletePassword] = useState('');
    const [deleteCheckbox, setDeleteCheckbox] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState('');

    // Password visibility states
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [showDeletePassword, setShowDeletePassword] = useState(false);

    useEffect(() => {
        if (user) setFormData({ name: user.name || '', email: user.email || '' });
    }, [user]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setMessage('');

        if (formData.password && formData.password !== formData.confirmPassword) {
            setMessage('New passwords do not match');
            setSaving(false);
            return;
        }

        const result = await updateProfile(formData);
        // Check if password was changed
        const isPasswordChange = !!formData.password;

        if (result.success) {
            if (isPasswordChange) {
                setMessage('Password updated successfully! Logging you out...');
                setTimeout(() => {
                    logout();
                    window.location.href = '/login';
                }, 1500);
            } else {
                setMessage('Profile updated successfully!');
                // Clear sensitive fields on success
                setFormData(prev => ({ ...prev, currentPassword: '', password: '', confirmPassword: '' }));
                setTimeout(() => setMessage(''), 3000);
            }
        } else {
            setMessage(result.error || 'Failed to update profile');
        }

        setSaving(false);
    };

    const handleDeleteAccount = async () => {
        if (!deletePassword || !deleteCheckbox) return;
        setIsDeleting(true);
        setDeleteError('');
        try {
            await authAPI.deleteAccount(deletePassword);
            logout();
            window.location.href = '/login';
        } catch (err) {
            setDeleteError(err.response?.data?.message || 'Failed to delete account. Please check your password.');
            setIsDeleting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-white">Profile</h1>
                <p className="text-gray-500 mt-1">Manage your personal information and account settings</p>
            </div>

            {/* Profile Card */}
            <div className="bg-[#12121a] border border-gray-800/50 rounded-2xl p-6">
                <div className="flex items-center gap-4 mb-8">
                    <div className="w-16 h-16 rounded-2xl bg-blue-600 border border-blue-500/40 flex items-center justify-center text-white text-2xl font-bold shadow-lg shadow-blue-600/25">
                        {user?.name?.[0]?.toUpperCase() || 'U'}
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-xl font-semibold text-white font-heading">{user?.name}</h2>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-500/15 text-blue-400 border border-blue-500/30">
                                {user?.role || 'User'}
                            </span>
                        </div>
                        <p className="text-gray-400 text-xs sm:text-sm font-mono mt-0.5">{user?.email}</p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="pb-2 border-b border-gray-800/60">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-gray-200 font-heading">Profile Information</h3>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-400 mb-2">Full Name</label>
                            <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required
                                className="w-full px-4 py-3 bg-[#0a0a0f] border border-gray-800 rounded-xl text-white text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-400 mb-2">Email Address</label>
                            <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} required
                                className="w-full px-4 py-3 bg-[#0a0a0f] border border-gray-800 rounded-xl text-white text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all" />
                        </div>
                    </div>

                    <div className="pt-4 border-t border-gray-800/50">
                        <div className="mb-4">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-200 font-heading">Change Password & Security</h4>
                        </div>

                        <div className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-400 mb-2">Current Password</label>
                                    <div className="relative">
                                        <input type={showCurrentPassword ? "text" : "password"}
                                            value={formData.currentPassword || ''}
                                            onChange={(e) => setFormData({ ...formData, currentPassword: e.target.value })}
                                            placeholder="Required to change email or password"
                                            className="w-full px-4 py-3 bg-[#0a0a0f] border border-gray-800 rounded-xl text-white text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all placeholder-gray-600 pr-12" />
                                        <button type="button" onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors cursor-pointer">
                                            {showCurrentPassword ? (
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                                            ) : (
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-400 mb-2">New Password (Optional)</label>
                                    <div className="relative">
                                        <input type={showNewPassword ? "text" : "password"}
                                            value={formData.password || ''}
                                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                            placeholder="Min 8 characters"
                                            className="w-full px-4 py-3 bg-[#0a0a0f] border border-gray-800 rounded-xl text-white text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all placeholder-gray-600 pr-12" />
                                        <button type="button" onClick={() => setShowNewPassword(!showNewPassword)}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors cursor-pointer">
                                            {showNewPassword ? (
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                                            ) : (
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                            )}
                                        </button>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-400 mb-2">Confirm New Password</label>
                                    <div className="relative">
                                        <input type={showConfirmPassword ? "text" : "password"}
                                            value={formData.confirmPassword || ''}
                                            onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                                            placeholder="Re-enter new password"
                                            className="w-full px-4 py-3 bg-[#0a0a0f] border border-gray-800 rounded-xl text-white text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all placeholder-gray-600 pr-12" />
                                        <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors cursor-pointer">
                                            {showConfirmPassword ? (
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                                            ) : (
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
                        <button type="submit" disabled={saving}
                            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-sm shadow-blue-500/20 hover:scale-[1.02] transition-all cursor-pointer flex items-center justify-center gap-1.5 shrink-0">
                            {saving ? (
                                <span className="flex items-center gap-1.5">
                                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Saving Profile...
                                </span>
                            ) : (
                                <>
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>Save Profile Changes</span>
                                </>
                            )}
                        </button>

                        {message && (
                            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold animate-in fade-in duration-200 ${
                                message.includes('success')
                                    ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                                    : 'bg-red-500/15 border border-red-500/30 text-red-400'
                            }`}>
                                <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    {message.includes('success') ? (
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                    ) : (
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    )}
                                </svg>
                                <span>{message}</span>
                            </div>
                        )}
                    </div>
                </form>
            </div>

            {/* Danger Zone */}
            <div className="bg-[#12121a]/95 backdrop-blur-md border border-red-500/20 rounded-2xl overflow-hidden shadow-sm hover:border-red-500/30 transition-all">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-red-500/15 bg-red-500/[0.02]">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 shrink-0">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-red-400 font-heading">
                                Danger Zone
                            </h3>
                            <p className="text-[11px] text-gray-500">Irreversible account deletion and data purge</p>
                        </div>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider bg-red-500/10 text-red-400 border border-red-500/20">
                        High Risk
                    </span>
                </div>

                {/* Body */}
                <div className="p-5 sm:p-6">
                    {!showDeleteConfirm ? (
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="min-w-0 flex-1">
                                <h4 className="text-sm font-bold text-white font-heading">Delete Account</h4>
                                <p className="text-xs text-gray-400 whitespace-nowrap overflow-hidden text-ellipsis mt-0.5">
                                    Permanently wipe your account profile, all configured monitors, historical telemetry checks, and incident logs. This action cannot be undone.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowDeleteConfirm(true)}
                                className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/30 hover:border-red-500/50 rounded-lg text-xs font-semibold transition-all duration-200 flex items-center gap-1.5 shrink-0 self-start sm:self-center cursor-pointer shadow-sm shadow-red-500/5"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                <span>Delete Account</span>
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-4 animate-in fade-in duration-200">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs">
                                <span className="flex items-center gap-1.5 font-bold text-red-400">
                                    <svg className="w-4 h-4 shrink-0 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                    Authorize Account Deletion
                                </span>
                                <span className="text-gray-600 hidden sm:inline">•</span>
                                <span className="text-gray-400">Enter your password below to confirm permanent wipe.</span>
                            </div>

                            <div className="space-y-1.5">
                                <label className="block text-xs font-semibold text-gray-300">
                                    Account Password
                                </label>
                                <div className="relative max-w-md">
                                    <input
                                        type={showDeletePassword ? "text" : "password"}
                                        value={deletePassword}
                                        onChange={(e) => setDeletePassword(e.target.value)}
                                        placeholder="Enter your current password"
                                        className="w-full px-3.5 py-2.5 bg-[#0a0a0f] border border-gray-800 rounded-lg text-white text-xs placeholder-gray-600 focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none transition-all pr-10"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowDeletePassword(!showDeletePassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors cursor-pointer"
                                    >
                                        {showDeletePassword ? (
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                                        ) : (
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                        )}
                                    </button>
                                </div>
                            </div>

                            <label className="flex items-center gap-2.5 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={deleteCheckbox}
                                    onChange={(e) => setDeleteCheckbox(e.target.checked)}
                                    className="w-4 h-4 rounded border-gray-700 text-red-600 focus:ring-red-500 bg-[#0a0a0f] accent-red-600 cursor-pointer"
                                />
                                <span className="text-xs text-gray-400">
                                    I understand that this action is permanent and cannot be undone.
                                </span>
                            </label>

                            {deleteError && (
                                <p className="text-xs text-red-400 font-medium">{deleteError}</p>
                            )}

                            <div className="flex items-center gap-2.5 pt-2 border-t border-gray-800/60">
                                <button
                                    type="button"
                                    onClick={handleDeleteAccount}
                                    disabled={!deletePassword || !deleteCheckbox || isDeleting}
                                    className="px-4 py-2 bg-red-600 hover:bg-red-500 active:bg-red-700 disabled:opacity-40 disabled:hover:bg-red-600 text-white text-xs font-semibold rounded-lg shadow-sm shadow-red-600/20 transition-all flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed shrink-0"
                                >
                                    {isDeleting ? (
                                        <span className="flex items-center gap-1.5">
                                            <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            Deleting Account...
                                        </span>
                                    ) : (
                                        <>
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                            <span>Permanently Delete</span>
                                        </>
                                    )}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowDeleteConfirm(false);
                                        setDeletePassword('');
                                        setDeleteCheckbox(false);
                                        setDeleteError('');
                                        setShowDeletePassword(false);
                                    }}
                                    disabled={isDeleting}
                                    className="px-4 py-2 bg-gray-800/80 hover:bg-gray-800 text-gray-300 hover:text-white rounded-lg text-xs font-medium border border-gray-700/50 transition-colors cursor-pointer shrink-0"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Profile;
