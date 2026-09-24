import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Logo from '../components/Logo';
import { authAPI } from '../services/api';

const ForgotPassword = () => {
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') navigate('/');
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [navigate]);

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
        <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f] px-4 relative">
            {/* Top-Right Page Close 'X' Button */}
            <Link
                to="/"
                className="fixed top-4 right-4 sm:top-6 sm:right-6 p-2.5 rounded-full bg-slate-900/80 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 hover:border-slate-700 transition-all duration-200 z-50 flex items-center justify-center shadow-lg group cursor-pointer"
                title="Close and return to home"
                aria-label="Close"
            >
                <svg className="w-5 h-5 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </Link>

            <div className="w-full max-w-md">
                <div className="flex flex-col items-center justify-center mb-8 text-center">
                    <Link to="/" className="inline-block hover:opacity-95 transition-opacity mb-4">
                        <Logo size="lg" showText={true} textClassName="text-2xl font-bold text-white tracking-tight" />
                    </Link>
                    <h1 className="text-2xl font-bold text-white mb-2">
                        Forgot <span className="text-blue-500">password?</span>
                    </h1>
                    <p className="text-slate-400 text-sm">Enter your email and we'll send you a reset link</p>
                </div>

                <div className="bg-[#12121a] border border-gray-800/50 rounded-2xl p-8 relative">

                    {status && (
                        <div className={`mb-4 px-3.5 py-2 rounded-lg text-xs font-medium flex items-center gap-2 ${
                            status.type === 'success' 
                                ? 'bg-emerald-500/10 border border-emerald-500/25 text-emerald-400' 
                                : 'bg-red-500/10 border border-red-500/25 text-red-400'
                        }`}>
                            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                {status.type === 'success' ? (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                ) : (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                )}
                            </svg>
                            <span>{status.message}</span>
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
                                className="w-full px-4 py-3 bg-[#0a0a0f] border border-gray-800 rounded-xl text-white placeholder-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-blue-600/25 hover:shadow-blue-500/35 hover:-translate-y-0.5 disabled:hover:translate-y-0"
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
                        <Link to="/login" className="text-blue-500 hover:text-blue-400 font-medium transition-colors">
                            Back to sign in
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ForgotPassword;
