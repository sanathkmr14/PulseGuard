import React, { useState, useEffect } from 'react';

const ConfirmationModal = ({
    isOpen,
    onClose,
    onConfirm,
    title = 'Confirm Action',
    subtitle,
    message,
    confirmText = 'Confirm',
    confirmColor = 'blue',
    iconType,
    itemDetails,
    requireTypeConfirm = false,
    typeConfirmTarget = ''
}) => {
    const [confirmInput, setConfirmInput] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setConfirmInput('');
            setIsSubmitting(false);
        }
    }, [isOpen]);

    // Handle Escape key to dismiss modal if not submitting
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && isOpen && !isSubmitting) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, isSubmitting, onClose]);

    if (!isOpen) return null;

    const isTypeConfirmValid = !requireTypeConfirm || (
        confirmInput.trim().toLowerCase() === typeConfirmTarget?.trim().toLowerCase() ||
        confirmInput.trim().toUpperCase() === 'DELETE'
    );

    const handleConfirm = async () => {
        if (!isTypeConfirmValid || isSubmitting) return;
        try {
            setIsSubmitting(true);
            await onConfirm();
        } catch (error) {
            console.error('Confirmation action failed:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    // Determine badge / icon based on confirmColor and iconType
    const effectiveIconType = iconType || (
        confirmColor === 'red' ? 'delete' :
        confirmColor === 'emerald' ? 'unban' :
        confirmColor === 'blue' ? 'login' :
        'warning'
    );

    const renderHeaderIcon = () => {
        if (effectiveIconType === 'delete') {
            return (
                <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                </div>
            );
        }
        if (effectiveIconType === 'key' || effectiveIconType === 'reset') {
            return (
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                </div>
            );
        }
        if (effectiveIconType === 'ban') {
            return (
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                    </svg>
                </div>
            );
        }
        if (effectiveIconType === 'unban') {
            return (
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
            );
        }
        if (effectiveIconType === 'login') {
            return (
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                    </svg>
                </div>
            );
        }
        return (
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            </div>
        );
    };

    const modalContent = (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
                onClick={!isSubmitting ? onClose : undefined}
            />

            {/* Modal Card */}
            <div className="relative bg-slate-900 border border-slate-700/90 rounded-2xl p-5 sm:p-6 max-w-lg w-full shadow-2xl shadow-black/80 animate-in fade-in zoom-in-95">
                {/* Header */}
                <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3">
                        {renderHeaderIcon()}
                        <div>
                            <h3 className="text-base font-bold text-white font-heading">{title}</h3>
                            {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800/80 transition-colors disabled:opacity-40"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Target Summary Card (User or Monitor) */}
                {itemDetails && (
                    <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 mb-3.5">
                        {itemDetails.type === 'user' ? (
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-blue-500/20 text-blue-400 font-bold flex items-center justify-center text-sm border border-blue-500/30 shrink-0">
                                    {itemDetails.name ? itemDetails.name.charAt(0).toUpperCase() : 'U'}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="font-semibold text-white text-sm truncate">{itemDetails.name}</span>
                                        <div className="flex items-center gap-1.5">
                                            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-semibold uppercase border ${
                                                itemDetails.isBanned
                                                    ? 'bg-red-500/10 text-red-400 border-red-500/20'
                                                    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                            }`}>
                                                {itemDetails.isBanned ? 'Banned' : 'Active'}
                                            </span>
                                            {itemDetails.role && (
                                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded font-semibold uppercase border bg-slate-800 text-slate-300 border-slate-700">
                                                    {itemDetails.role}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between gap-2 mt-0.5">
                                        <p className="text-xs font-mono text-slate-400 truncate">{itemDetails.email}</p>
                                        {itemDetails.monitorCount !== undefined && (
                                            <span className="text-[11px] text-slate-400 font-mono shrink-0">
                                                {itemDetails.monitorCount} monitor{itemDetails.monitorCount === 1 ? '' : 's'}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : itemDetails.type === 'monitor' ? (
                            <div>
                                <div className="flex items-center justify-between gap-2 mb-1">
                                    <span className="font-semibold text-white text-sm truncate">{itemDetails.name}</span>
                                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 uppercase font-semibold">
                                        {itemDetails.monitorType || 'HTTPS'}
                                    </span>
                                </div>
                                <p className="text-xs font-mono text-slate-400 truncate">
                                    {itemDetails.url}{itemDetails.port ? `:${itemDetails.port}` : ''}
                                </p>
                            </div>
                        ) : null}
                    </div>
                )}

                {/* Warning / Notice Alert Box */}
                {message && (
                    <div className={`rounded-xl p-3 text-xs flex items-start gap-2.5 mb-4 leading-relaxed border ${
                        confirmColor === 'red'
                            ? 'bg-red-500/10 border-red-500/20 text-red-300'
                            : confirmColor === 'amber'
                                ? 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                                : confirmColor === 'emerald'
                                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                                    : 'bg-blue-500/10 border-blue-500/20 text-blue-300'
                    }`}>
                        <div className="shrink-0 mt-0.5">
                            {confirmColor === 'red' && (
                                <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            )}
                            {confirmColor === 'amber' && (
                                <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            )}
                            {confirmColor === 'emerald' && (
                                <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            )}
                            {confirmColor === 'blue' && (
                                <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            )}
                        </div>
                        <div className="flex-1">
                            {message}
                        </div>
                    </div>
                )}

                {/* Require Type-Confirmation Input Field */}
                {requireTypeConfirm && (
                    <div className="space-y-1.5 mb-4">
                        <label className="block text-xs text-slate-300">
                            To confirm, type <span className="font-mono font-bold text-red-400 select-all bg-red-950/50 px-1.5 py-0.5 rounded border border-red-500/20">{typeConfirmTarget}</span> or <span className="font-mono font-bold text-red-400">DELETE</span> below:
                        </label>
                        <input
                            type="text"
                            value={confirmInput}
                            onChange={(e) => setConfirmInput(e.target.value)}
                            placeholder={`Type "${typeConfirmTarget}" or "DELETE"`}
                            disabled={isSubmitting}
                            autoFocus
                            className="w-full bg-slate-950 border border-slate-700/80 focus:border-red-500/80 focus:ring-1 focus:ring-red-500/50 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 outline-none transition-all font-mono"
                        />
                    </div>
                )}

                {/* Action Buttons */}
                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800/80">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirm}
                        disabled={!isTypeConfirmValid || isSubmitting}
                        className={`px-4 py-2 disabled:opacity-35 disabled:cursor-not-allowed text-white rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 shadow-sm hover:scale-[1.01] ${
                            confirmColor === 'red'
                                ? 'bg-red-600 hover:bg-red-500 shadow-red-600/20'
                                : confirmColor === 'amber'
                                    ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/20'
                                    : confirmColor === 'emerald'
                                        ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20'
                                        : 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/20'
                        }`}
                    >
                        {isSubmitting ? (
                            <>
                                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                <span>Processing...</span>
                            </>
                        ) : (
                            <>
                                {effectiveIconType === 'delete' && (
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                )}
                                {effectiveIconType === 'ban' && (
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                    </svg>
                                )}
                                {effectiveIconType === 'unban' && (
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                )}
                                {(effectiveIconType === 'key' || effectiveIconType === 'reset') && (
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                                    </svg>
                                )}
                                {effectiveIconType === 'login' && (
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                                    </svg>
                                )}
                                <span>{confirmText}</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );

    return modalContent;
};

export default ConfirmationModal;
