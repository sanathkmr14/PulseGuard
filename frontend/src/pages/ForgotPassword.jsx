import { useState } from 'react';
import { Link } from 'react-router-dom';
import { authAPI } from '../services/api';

const ForgotPassword = () => {
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setStatus(null);
        if (!email) {
            setStatus({ type: 'error', message: 'Please enter your email address.' });
            return;
        }
        setLoading(true);
        try {
            const response = await authAPI.forgotPassword({ email });
            const ok = response.data && response.data.success !== false;
            setStatus({ type: ok ? 'success' : 'error', message: response.data.message });
        } catch (error) {
            setStatus({ type: 'error', message: error.response?.data?.message || 'Unable to send reset instructions.' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f] px-4">
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent mb-2">
                        Forgot password?
                    </h1>
                    <p className="text-gray-500">Enter your email and we'll send you a reset link</p>
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
                            <label className="block text-sm font-medium text-gray-300 mb-2">Email</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                placeholder="you@example.com"
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
                                    Sending...
                                </span>
                            ) : 'Send reset link'}
                        </button>
                    </form>

                    <div className="mt-6 text-center text-gray-500">
                        Remembered it?{' '}
                        <Link to="/login" className="text-indigo-400 hover:text-indigo-300 font-medium">
                            Back to sign in
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ForgotPassword;
