import React, { useState } from 'react';

/**
 * Reusable Numbered Pagination Component
 * Displays page info, Previous/Next buttons, numbered page buttons with smart ellipsis,
 * and an optional quick-jump input for large page counts.
 */
const Pagination = ({
    currentPage = 1,
    totalPages = 1,
    onPageChange,
    totalItems,
    itemName = 'items',
    showJump = true,
    hideOnSinglePage = true,
    showInfo = true,
    compact = false,
    card = false,
    className = ''
}) => {
    const [jumpPage, setJumpPage] = useState('');

    if (!totalPages || totalPages < 1) return null;
    if (hideOnSinglePage && totalPages <= 1) return null;
    if (totalItems !== undefined && totalItems === 0) return null;

    // Generate page numbers with smart ellipsis
    const getPageNumbers = () => {
        if (compact) {
            // In compact mode, show at most 5 items total
            if (totalPages <= 5) {
                return Array.from({ length: totalPages }, (_, i) => i + 1);
            }
            if (currentPage <= 3) {
                return [1, 2, 3, '...', totalPages];
            }
            if (currentPage >= totalPages - 2) {
                return [1, '...', totalPages - 2, totalPages - 1, totalPages];
            }
            return [1, '...', currentPage, '...', totalPages];
        }

        if (totalPages <= 7) {
            return Array.from({ length: totalPages }, (_, i) => i + 1);
        }

        if (currentPage <= 4) {
            return [1, 2, 3, 4, 5, '...', totalPages];
        }

        if (currentPage >= totalPages - 3) {
            return [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
        }

        return [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
    };

    const handleJumpSubmit = (e) => {
        e.preventDefault();
        const pageNum = parseInt(jumpPage, 10);
        if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages && pageNum !== currentPage) {
            onPageChange(pageNum);
            setJumpPage('');
        }
    };

    const pages = getPageNumbers();

    const containerClasses = card
        ? `bg-[#12121a]/90 backdrop-blur-md border border-gray-800/80 rounded-xl ${compact ? 'p-2.5 sm:p-3 text-[11px]' : 'p-3 sm:px-4 sm:py-3 text-xs'} shadow-sm flex flex-col ${compact ? 'gap-2' : 'md:flex-row gap-4'} items-center ${showInfo ? 'justify-between' : 'justify-center'} ${className}`
        : `flex flex-col ${compact ? 'gap-2 p-2.5 sm:p-3 text-[11px]' : 'md:flex-row gap-4 p-4 sm:p-5 text-xs'} items-center ${showInfo ? 'justify-between' : 'justify-center'} border-t border-gray-800/40 ${className}`;

    return (
        <div className={containerClasses}>
            {/* Info Text */}
            {showInfo && (
                <div className={`text-gray-400 font-mono text-center ${compact ? 'text-[11px]' : 'md:text-left text-xs'} whitespace-nowrap`}>
                    Page <span className="font-semibold text-white">{currentPage}</span> of{' '}
                    <span className="font-semibold text-white">{totalPages}</span>
                    {totalItems !== undefined && totalItems !== null && (
                        <span className="text-gray-500 ml-1.5">
                            ({totalItems.toLocaleString()} total {totalItems === 1 ? (itemName.endsWith('s') ? itemName.slice(0, -1) : itemName) : itemName})
                        </span>
                    )}
                </div>
            )}

            {/* Controls */}
            <div className={`flex flex-nowrap items-center justify-center shrink-0 max-w-full overflow-x-auto no-scrollbar py-0.5 ${compact ? 'gap-1' : 'gap-1 sm:gap-1.5'}`}>
                {/* Previous Button */}
                <button
                    onClick={() => onPageChange(Math.max(currentPage - 1, 1))}
                    disabled={currentPage === 1}
                    className={`${compact ? 'px-2 h-7 text-[11px]' : 'px-2 sm:px-3 h-7 sm:h-8 text-xs'} flex items-center gap-1 rounded-lg font-medium bg-[#12121a] hover:bg-gray-800 text-gray-300 hover:text-white border border-gray-800 hover:border-gray-700 transition-colors disabled:opacity-30 disabled:pointer-events-none shrink-0`}
                    title="Previous page"
                >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    {!compact && <span className="hidden sm:inline">Previous</span>}
                </button>

                {/* Page Number Buttons */}
                <div className="flex items-center gap-1 shrink-0">
                    {pages.map((p, idx) => {
                        if (p === '...') {
                            return (
                                <span
                                    key={`ellipsis-${idx}`}
                                    className={`${compact ? 'w-5 h-7 text-[11px]' : 'w-5 sm:w-6 h-7 sm:h-8 text-xs'} flex items-center justify-center text-gray-500 select-none font-mono shrink-0`}
                                >
                                    …
                                </span>
                            );
                        }

                        const isActive = p === currentPage;
                        return (
                            <button
                                key={p}
                                onClick={() => onPageChange(p)}
                                className={`${compact ? 'min-w-[28px] h-7 px-1 text-[11px]' : 'min-w-[28px] sm:min-w-[32px] h-7 sm:h-8 px-1.5 sm:px-2 text-[11px] sm:text-xs'} flex items-center justify-center rounded-lg transition-all shrink-0 ${
                                    isActive
                                        ? 'bg-blue-600 text-white font-bold shadow-sm shadow-blue-500/25 border border-blue-500'
                                        : 'bg-[#12121a] hover:bg-gray-800 text-gray-300 hover:text-white font-medium border border-gray-800 hover:border-gray-700'
                                }`}
                                aria-current={isActive ? 'page' : undefined}
                            >
                                {p}
                            </button>
                        );
                    })}
                </div>

                {/* Next Button */}
                <button
                    onClick={() => onPageChange(Math.min(currentPage + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className={`${compact ? 'px-2 h-7 text-[11px]' : 'px-2 sm:px-3 h-7 sm:h-8 text-xs'} flex items-center gap-1 rounded-lg font-medium bg-[#12121a] hover:bg-gray-800 text-gray-300 hover:text-white border border-gray-800 hover:border-gray-700 transition-colors disabled:opacity-30 disabled:pointer-events-none shrink-0`}
                    title="Next page"
                >
                    {!compact && <span className="hidden sm:inline">Next</span>}
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                </button>

                {/* Quick Jump Input (shown when pages > 7) */}
                {showJump && totalPages > 7 && (
                    <form onSubmit={handleJumpSubmit} className={`hidden sm:flex items-center gap-1.5 ml-2 pl-2 border-l border-gray-800/80`}>
                        <span className={`${compact ? 'text-[10px]' : 'text-[11px]'} text-gray-500`}>Go to:</span>
                        <input
                            type="number"
                            min="1"
                            max={totalPages}
                            value={jumpPage}
                            onChange={(e) => setJumpPage(e.target.value)}
                            placeholder={currentPage.toString()}
                            className={`${compact ? 'w-12 h-7 text-[11px]' : 'w-14 h-8 text-xs'} px-1.5 bg-[#0a0a0f] border border-gray-800 rounded-lg text-center text-white focus:border-blue-500 outline-none transition-colors`}
                        />
                        <button
                            type="submit"
                            disabled={!jumpPage}
                            className={`${compact ? 'px-1.5 h-7 text-[11px]' : 'px-2 h-8 text-xs'} bg-gray-800/80 hover:bg-gray-700 disabled:opacity-30 text-gray-300 hover:text-white rounded-lg font-medium border border-gray-700/60 transition-colors`}
                        >
                            Go
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
};

export default Pagination;
