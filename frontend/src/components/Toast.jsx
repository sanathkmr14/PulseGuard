import React from 'react';

/**
 * Clean any accidental leading emoji or symbols so messages stay professional
 */
const cleanMessage = (msg) => {
    if (!msg || typeof msg !== 'string') return '';
    return msg
        .replace(/^[\s\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}\u{1F600}-\u{1F64F}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}\u{2702}-\u{27B0}\u{24C2}-\u{1F251}]+/gu, '')
        .trim();
};

const Toast = ({ notification, onClose, error, onErrorClose, message, type }) => {
    // Standardize input format
    const activeNotification = notification?.message
        ? notification
        : message
            ? {
                type: type || (message.toLowerCase().includes('fail') || message.toLowerCase().includes('error') ? 'error' : 'success'),
                message
            }
            : null;

    if (!activeNotification && !error) return null;

    return (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-auto flex flex-col items-center gap-2 max-w-md w-auto px-4 select-none">
            {activeNotification && (
                <div
                    className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border shadow-2xl backdrop-blur-xl transition-all duration-200 animate-slide-up-fade ${
                        activeNotification.type === 'success'
                            ? 'bg-[#0c1017]/95 border-emerald-500/30 text-gray-100 shadow-emerald-950/40'
                            : 'bg-[#0c1017]/95 border-rose-500/30 text-gray-100 shadow-rose-950/40'
                    }`}
                >
                    {activeNotification.type === 'success' ? (
                        <div className="w-5 h-5 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0 text-emerald-400 shadow-sm shadow-emerald-500/20">
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                        </div>
                    ) : (
                        <div className="w-5 h-5 rounded-full bg-rose-500/15 border border-rose-500/30 flex items-center justify-center shrink-0 text-rose-400 shadow-sm shadow-rose-500/20">
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="8" x2="12" y2="12" />
                                <line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                        </div>
                    )}
                    <span className="text-xs sm:text-sm font-medium tracking-wide">
                        {cleanMessage(activeNotification.message)}
                    </span>
                    {onClose && (
                        <button
                            type="button"
                            onClick={onClose}
                            className="ml-1 p-1 text-gray-400 hover:text-white rounded-md hover:bg-white/10 transition-colors cursor-pointer"
                            title="Dismiss"
                        >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                    )}
                </div>
            )}

            {error && (
                <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-rose-500/30 bg-[#0c1017]/95 text-gray-100 shadow-2xl shadow-rose-950/40 backdrop-blur-xl transition-all duration-200 animate-slide-up-fade">
                    <div className="w-5 h-5 rounded-full bg-rose-500/15 border border-rose-500/30 flex items-center justify-center shrink-0 text-rose-400 shadow-sm shadow-rose-500/20">
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                    </div>
                    <span className="text-xs sm:text-sm font-medium tracking-wide">
                        {cleanMessage(error)}
                    </span>
                    {onErrorClose && (
                        <button
                            type="button"
                            onClick={onErrorClose}
                            className="ml-1 p-1 text-gray-400 hover:text-white rounded-md hover:bg-white/10 transition-colors cursor-pointer"
                            title="Dismiss"
                        >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

export default Toast;
