import React from 'react';
import ReactDOM from 'react-dom';

const ConfirmationModal = ({ isOpen, onClose, onConfirm, title, message, confirmText = 'Confirm', confirmColor = 'indigo' }) => {
    if (!isOpen) return null;

    const colorClasses = {
        indigo: 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500',
        red: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
        emerald: 'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500',
        amber: 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500',
    };

    const modalContent = (
        <div className="fixed inset-0 z-[9999]" aria-labelledby="modal-title" role="dialog" aria-modal="true">
            {/* Backdrop */}
            <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                <div
                    className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
                    aria-hidden="true"
                    onClick={onClose}
                ></div>

                {/* Spacer for centering */}
                <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

                {/* Modal Panel */}
                <div className="inline-block align-bottom bg-slate-800 rounded-2xl text-left overflow-hidden shadow-2xl shadow-black/50 transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full border border-slate-600 relative z-[10000]">
                    <div className="px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                        <div className="sm:flex sm:items-start">
                            <div className={`mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full sm:mx-0 sm:h-10 sm:w-10 ${confirmColor === 'red' ? 'bg-red-500/10' :
                                confirmColor === 'amber' ? 'bg-amber-500/10' :
                                    'bg-indigo-500/10'
                                }`}>
                                <svg className={`h-6 w-6 ${confirmColor === 'red' ? 'text-red-500' :
                                    confirmColor === 'amber' ? 'text-amber-500' :
                                        'text-indigo-500'
                                    }`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                            <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                                <h3 className="text-lg leading-6 font-medium text-white" id="modal-title">
                                    {title}
                                </h3>
                                <div className="mt-2">
                                    <p className="text-sm text-slate-300">
                                        {message}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="bg-slate-800/50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse border-t border-slate-700/50">
                        <button
                            type="button"
                            className={`w-full inline-flex justify-center rounded-lg border border-transparent shadow-sm px-4 py-2 text-base font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 sm:ml-3 sm:w-auto sm:text-sm ${colorClasses[confirmColor] || colorClasses.indigo}`}
                            onClick={onConfirm}
                        >
                            {confirmText}
                        </button>
                        <button
                            type="button"
                            className="mt-3 w-full inline-flex justify-center rounded-lg border border-slate-600 shadow-sm px-4 py-2 bg-slate-700 text-base font-medium text-slate-300 hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                            onClick={onClose}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );

    // Use Portal to render outside the current DOM hierarchy (at body level)
    return ReactDOM.createPortal(modalContent, document.body);
};

export default ConfirmationModal;
