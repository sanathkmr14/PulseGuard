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
                {message && (
                    <div className={`mb-6 p-4 rounded-xl text-sm ${message.includes('success')
                        ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                        : 'bg-red-500/10 border border-red-500/30 text-red-400'
                        }`}>
                        {message}
                    </div>
                )}

                <div className="flex items-center gap-4 mb-8">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-2xl font-bold">
                        {user?.name?.[0]?.toUpperCase() || 'U'}
                    </div>
                    <div>
                        <h2 className="text-xl font-semibold text-white">{user?.name}</h2>
                        <p className="text-gray-500">{user?.email}</p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                    <h3 className="text-lg font-semibold text-white">Profile Information</h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">Name</label>
                            <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required
                                className="w-full px-4 py-3 bg-[#0a0a0f] border border-gray-800 rounded-xl text-white focus:border-indigo-500 outline-none transition-all" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">Email</label>
                            <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} required
                                className="w-full px-4 py-3 bg-[#0a0a0f] border border-gray-800 rounded-xl text-white focus:border-indigo-500 outline-none transition-all" />
                        </div>
                    </div>

                    <div className="pt-4 border-t border-gray-800/50">
                        <h4 className="text-sm font-medium text-gray-400 mb-4 uppercase tracking-wider">Change Password & Security</h4>

                        <div className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">Current Password</label>
                                    <div className="relative">
                                        <input type={showCurrentPassword ? "text" : "password"}
                                            value={formData.currentPassword || ''}
                                            onChange={(e) => setFormData({ ...formData, currentPassword: e.target.value })}
                                            placeholder="Required to change email or password"
                                            className="w-full px-4 py-3 bg-[#0a0a0f] border border-gray-800 rounded-xl text-white focus:border-indigo-500 outline-none transition-all placeholder-gray-600 pr-12" />
                                        <button type="button" onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors">
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
                                    <label className="block text-sm font-medium text-gray-400 mb-2">New Password (Optional)</label>
                                    <div className="relative">
                                        <input type={showNewPassword ? "text" : "password"}
                                            value={formData.password || ''}
                                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                            placeholder="Min 6 characters"
                                            className="w-full px-4 py-3 bg-[#0a0a0f] border border-gray-800 rounded-xl text-white focus:border-indigo-500 outline-none transition-all placeholder-gray-600 pr-12" />
                                        <button type="button" onClick={() => setShowNewPassword(!showNewPassword)}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors">
                                            {showNewPassword ? (
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                                            ) : (
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                            )}
                                        </button>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">Confirm New Password</label>
                                    <div className="relative">
                                        <input type={showConfirmPassword ? "text" : "password"}
                                            value={formData.confirmPassword || ''}
                                            onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                                            placeholder="Re-enter new password"
                                            className="w-full px-4 py-3 bg-[#0a0a0f] border border-gray-800 rounded-xl text-white focus:border-indigo-500 outline-none transition-all placeholder-gray-600 pr-12" />
                                        <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors">
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

                    <button type="submit" disabled={saving}
                        className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-xl transition-all">
                        {saving ? (
                            <span className="flex items-center gap-2">
                                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Saving...
                            </span>
                        ) : 'Save Profile'}
                    </button>
                </form>
            </div>

            {/* Danger Zone */}
            <div className="bg-[#12121a] border border-red-500/30 rounded-2xl p-6">
                <h3 className="text-lg font-semibold text-red-400 mb-4">Danger Zone</h3>

                <div className="p-5 bg-red-500/5 border border-red-500/20 rounded-xl">
                    <h4 className="text-white font-medium mb-2">Delete Account</h4>
                    <p className="text-sm text-gray-500 mb-4">
                        Permanently delete your account and all associated data (monitors, incidents, status pages). This action cannot be undone.
                    </p>

                    {!showDeleteConfirm ? (
                        <button onClick={() => setShowDeleteConfirm(true)}
                            className="px-5 py-2.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 font-medium rounded-xl transition-all">
                            Delete Account
                        </button>
                    ) : (
                        <div className="p-5 bg-[#0a0a0f] border border-gray-800 rounded-xl space-y-4">
                            <p className="text-white font-semibold">Are you absolutely sure?</p>

                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">Enter your password to confirm</label>
                                <input type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)}
                                    placeholder="Your password"
                                    className="w-full px-4 py-3 bg-[#12121a] border border-gray-800 rounded-xl text-white placeholder-gray-600 focus:border-red-500 outline-none" />
                            </div>

                            <label className="flex items-center gap-3 cursor-pointer">
                                <input type="checkbox" checked={deleteCheckbox} onChange={(e) => setDeleteCheckbox(e.target.checked)}
                                    className="w-4 h-4 rounded border-gray-600 text-red-500 focus:ring-red-500 bg-gray-800" />
                                <span className="text-sm text-gray-400">I understand this action is irreversible.</span>
                            </label>

                            {deleteError && <p className="text-sm text-red-400">{deleteError}</p>}

                            <div className="flex gap-3">
                                <button onClick={handleDeleteAccount} disabled={!deletePassword || !deleteCheckbox || isDeleting}
                                    className="px-5 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium rounded-xl transition-all">
                                    {isDeleting ? (
                                        <span className="flex items-center gap-2">
                                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            Deleting...
                                        </span>
                                    ) : 'Permanently Delete'}
                                </button>
                                <button onClick={() => { setShowDeleteConfirm(false); setDeletePassword(''); setDeleteCheckbox(false); setDeleteError(''); }}
                                    disabled={isDeleting}
                                    className="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-xl transition-all">
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
