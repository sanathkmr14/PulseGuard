import React from 'react';

/**
 * PulseGuard Brand Logo Component
 * Combines an aerodynamic protective shield crest with an illuminated ECG telemetry pulse wave.
 */
export default function Logo({
    size = 'md',
    showText = false,
    textClassName = 'text-xl font-bold text-white tracking-tight',
    subtitle = null,
    className = '',
    animated = true,
}) {
    // Determine dimensions
    const sizeMap = {
        xs: 24,
        sm: 32,
        md: 40,
        lg: 48,
        xl: 56,
        '2xl': 68,
    };

    const px = typeof size === 'number' ? size : sizeMap[size] || 40;

    return (
        <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
            {/* Vector Brand Emblem */}
            <div 
                className="relative flex items-center justify-center shrink-0 transition-transform duration-300 hover:scale-105"
                style={{ width: px, height: px }}
            >
                <svg
                    viewBox="0 0 128 128"
                    width={px}
                    height={px}
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-full h-full drop-shadow-md"
                >
                    <defs>
                        {/* Shield Deep Slate-Navy Gradient */}
                        <linearGradient id="shieldFillGrad" x1="64" y1="8" x2="64" y2="120" gradientUnits="userSpaceOnUse">
                            <stop offset="0%" stopColor="#0d2347" />
                            <stop offset="50%" stopColor="#08142c" />
                            <stop offset="100%" stopColor="#040816" />
                        </linearGradient>

                        {/* Outer Precision Cyber-Border */}
                        <linearGradient id="shieldBorderGrad" x1="16" y1="10" x2="112" y2="118" gradientUnits="userSpaceOnUse">
                            <stop offset="0%" stopColor="#38bdf8" />
                            <stop offset="50%" stopColor="#2563eb" />
                            <stop offset="100%" stopColor="#0284c7" />
                        </linearGradient>

                        {/* Telemetry Wave Gradient */}
                        <linearGradient id="waveGrad" x1="26" y1="64" x2="102" y2="64" gradientUnits="userSpaceOnUse">
                            <stop offset="0%" stopColor="#38bdf8" />
                            <stop offset="35%" stopColor="#ffffff" />
                            <stop offset="70%" stopColor="#67e8f9" />
                            <stop offset="100%" stopColor="#38bdf8" />
                        </linearGradient>

                        {/* Neon Glow Filter */}
                        <filter id="vectorGlow" x="-10%" y="-10%" width="130%" height="130%">
                            <feGaussianBlur stdDeviation="2.5" result="blur" />
                            <feMerge>
                                <feMergeNode in="blur" />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>
                    </defs>

                    {/* Shield Contour */}
                    <path
                        d="M64 10 C90 10 106 18 108 42 C108 72 86 98 64 118 C42 98 20 72 20 42 C22 18 38 10 64 10 Z"
                        fill="url(#shieldFillGrad)"
                        stroke="url(#shieldBorderGrad)"
                        strokeWidth="5"
                        strokeLinejoin="round"
                    />

                    {/* Inner Highlight Geometry */}
                    <path
                        d="M64 19 C84 19 97 25 99 44 C99 68 81 89 64 104 C47 89 29 68 29 44 C31 25 44 19 64 19 Z"
                        fill="none"
                        stroke="#38bdf8"
                        strokeWidth="1.2"
                        strokeOpacity="0.3"
                    />

                    {/* Base Arrow Track (Subtle circuit line always visible) */}
                    <path
                        d="M30 64 H44 L51 49 L60 84 L69 32 L78 72 L85 64 H98"
                        fill="none"
                        stroke="#38bdf8"
                        strokeWidth="5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeOpacity="0.25"
                    />

                    {/* Animated Flowing Pulse Wave (flows through the arrow peaks) */}
                    {animated ? (
                        <>
                            {/* Ambient Flow Glow */}
                            <path
                                d="M30 64 H44 L51 49 L60 84 L69 32 L78 72 L85 64 H98"
                                fill="none"
                                stroke="#38bdf8"
                                strokeWidth="8.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                pathLength="100"
                                strokeDasharray="26 74"
                                className="pg-arrow-flow"
                                filter="url(#vectorGlow)"
                                opacity="0.6"
                            >
                                <animate
                                    attributeName="stroke-dashoffset"
                                    from="0"
                                    to="-100"
                                    dur="1.8s"
                                    repeatCount="indefinite"
                                />
                            </path>

                            {/* Core Laser Stream */}
                            <path
                                d="M30 64 H44 L51 49 L60 84 L69 32 L78 72 L85 64 H98"
                                fill="none"
                                stroke="url(#waveGrad)"
                                strokeWidth="5.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                pathLength="100"
                                strokeDasharray="22 78"
                                className="pg-arrow-flow"
                                filter="url(#vectorGlow)"
                            >
                                <animate
                                    attributeName="stroke-dashoffset"
                                    from="0"
                                    to="-100"
                                    dur="1.8s"
                                    repeatCount="indefinite"
                                />
                            </path>
                        </>
                    ) : (
                        <path
                            d="M30 64 H44 L51 49 L60 84 L69 32 L78 72 L85 64 H98"
                            fill="none"
                            stroke="url(#waveGrad)"
                            strokeWidth="5.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            filter="url(#vectorGlow)"
                        />
                    )}

                    <style>{`
                        @keyframes pgArrowFlow {
                            0% {
                                stroke-dashoffset: 0;
                            }
                            100% {
                                stroke-dashoffset: -100;
                            }
                        }
                        .pg-arrow-flow {
                            animation: pgArrowFlow 1.8s linear infinite;
                        }
                    `}</style>
                </svg>
            </div>

            {/* Optional Typography */}
            {showText && (
                <div className="flex items-baseline">
                    <span className={textClassName}>
                        Pulse<span className="text-blue-500">Guard</span>
                    </span>
                    {subtitle && (
                        <span className="ml-1.5 text-xs font-semibold px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            {subtitle}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}
