import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/Logo';

const Register = () => {
    const [formData, setFormData] = useState({ name: '', email: '', password: '' });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const { register } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') navigate('/');
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [navigate]);

    // Auto-dismiss error after 4 seconds
    useEffect(() => {
        if (error) {
            const timer = setTimeout(() => setError(''), 4000);
            return () => clearTimeout(timer);
        }
    }, [error]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        const result = await register(formData);
        if (result.success) {
            navigate('/login', { state: { message: 'Account created successfully! Please log in.' } });
        } else {
            setError(result.error);
        }
        setLoading(false);
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f] px-4 relative">
            {/* Top-Right Close 'X' Button */}
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
                {/* Logo */}
                <div className="flex flex-col items-center justify-center mb-6 sm:mb-8 text-center">
                    <Link to="/" className="inline-block hover:opacity-95 transition-opacity">
                        <Logo size="lg" showText={true} textClassName="text-2xl sm:text-3xl font-extrabold text-white tracking-tight" />
                    </Link>
                    <p className="text-slate-400 text-xs sm:text-sm mt-1 sm:mt-2">Create your account to start monitoring 24/7</p>
                </div>

                {/* Card */}
                <div className="bg-[#12121a] border border-gray-800/50 rounded-xl sm:rounded-2xl p-4 sm:p-6 md:p-8">
                    {error && (
                        <div className="mb-3 sm:mb-4 px-3 py-1.5 sm:px-3.5 sm:py-2 bg-red-500/10 border border-red-500/25 rounded-lg text-red-400 text-xs font-medium flex items-center justify-between gap-2 animate-in fade-in duration-200">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                <span className="whitespace-nowrap truncate text-[11px] sm:text-xs">{error}</span>
                            </div>
                            <button
                                type="button"
                                onClick={() => setError('')}
                                className="text-gray-400 hover:text-white p-0.5 rounded cursor-pointer shrink-0 transition-colors"
                                aria-label="Dismiss error"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-3.5 sm:space-y-5">
                        <div>
                            <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-1 sm:mb-2">Name</label>
                            <input
                                type="text"
                                name="name"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                required
                                autoComplete="name"
                                placeholder="John Doe"
                                className="w-full px-3.5 py-2 sm:px-4 sm:py-3 bg-[#0a0a0f] border border-gray-800 rounded-lg sm:rounded-xl text-white text-xs sm:text-sm placeholder-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                            />
                        </div>

                        <div>
                            <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-1 sm:mb-2">Email</label>
                            <input
                                type="email"
                                name="email"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                required
                                autoComplete="email"
                                placeholder="you@example.com"
                                className="w-full px-3.5 py-2 sm:px-4 sm:py-3 bg-[#0a0a0f] border border-gray-800 rounded-lg sm:rounded-xl text-white text-xs sm:text-sm placeholder-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                            />
                        </div>

                        <div>
                            <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-1 sm:mb-2">Password</label>
                            <div className="relative">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    name="password"
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    required
                                    minLength="8"
                                    autoComplete="new-password"
                                    placeholder="••••••••"
                                    className="w-full px-3.5 py-2 sm:px-4 sm:py-3 bg-[#0a0a0f] border border-gray-800 rounded-lg sm:rounded-xl text-white text-xs sm:text-sm placeholder-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all pr-10 sm:pr-12"
                                />
                                <button type="button" onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors cursor-pointer">
                                    {showPassword ? (
                                        <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                                    ) : (
                                        <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                    )}
                                </button>
                            </div>
                            <p className="mt-1 sm:mt-1.5 text-[10px] sm:text-xs text-gray-500">Minimum 8 characters</p>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-2.5 sm:py-3.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs sm:text-sm font-semibold rounded-lg sm:rounded-xl transition-all duration-200 shadow-md sm:shadow-lg shadow-blue-600/25 hover:shadow-blue-500/35 hover:-translate-y-0.5 disabled:hover:translate-y-0 cursor-pointer"
                        >
                            {loading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <span className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    <span>Creating account...</span>
                                </span>
                            ) : 'Create Account'}
                        </button>
                    </form>

                    <div className="mt-4 sm:mt-6 text-center text-xs sm:text-sm text-gray-500">
                        Already have an account?{' '}
                        <Link to="/login" className="text-blue-500 hover:text-blue-400 font-medium transition-colors">
                            Sign in
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Register;
