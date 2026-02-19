import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authAPI } from '../services/api';

const ResetPassword = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const token = searchParams.get('token');
    const [formData, setFormData] = useState({ password: '', confirmPassword: '' });
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!token) {
            setStatus({ type: 'error', message: 'Reset token is missing. Please use the link from your email.' });
        }
    }, [token]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setStatus(null);
        if (!token) {
            setStatus({ type: 'error', message: 'Reset token not found. Request a new link.' });
            return;
        }
        if (formData.password.length < 6) {
            setStatus({ type: 'error', message: 'Password must be at least 6 characters long.' });
            return;
        }
        if (formData.password !== formData.confirmPassword) {
            setStatus({ type: 'error', message: 'Passwords do not match.' });
            return;
        }
        setLoading(true);
        try {
            const response = await authAPI.resetPassword({ token, password: formData.password });
            setStatus({ type: 'success', message: response.data.message });
            setTimeout(() => navigate('/login'), 2000);
        } catch (error) {
            setStatus({ type: 'error', message: error.response?.data?.message || 'Unable to reset password.' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f] px-4">
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent mb-2">
                        Reset password
                    </h1>
                    <p className="text-gray-500">Choose a new password to secure your account</p>
                </div>

                <div className="bg-[#12121a] border border-gray-800/50 rounded-2xl p-8">
                    {status && (
                        <div className={`mb-6 p-4 rounded-xl text-sm ${
                            status.type === 'success' 
                                ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' 
                                : 'bg-red-500/10 border border-red-500/30 text-red-400'
                        }`}>
                            {status.message}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">New password</label>
                            <input
                                type="password"
                                name="password"
                                value={formData.password}
                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                placeholder="••••••••"
                                required
                                className="w-full px-4 py-3 bg-[#0a0a0f] border border-gray-800 rounded-xl text-white placeholder-gray-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">Confirm password</label>
                            <input
                                type="password"
                                name="confirmPassword"
                                value={formData.confirmPassword}
                                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                                placeholder="••••••••"
                                required
                                className="w-full px-4 py-3 bg-[#0a0a0f] border border-gray-800 rounded-xl text-white placeholder-gray-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 text-white font-semibold rounded-xl transition-all shadow-lg shadow-indigo-600/20"
                        >
                            {loading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Resetting...
                                </span>
                            ) : 'Reset password'}
                        </button>
                    </form>

                    <div className="mt-6 text-center text-gray-500">
                        Changed your mind?{' '}
                        <Link to="/login" className="text-indigo-400 hover:text-indigo-300 font-medium">
                            Back to sign in
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ResetPassword;
