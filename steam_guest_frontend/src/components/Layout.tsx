import { ReactNode } from "react";

import atmosLogo from "@/assets/atmos-logo.png";

/**
 * Two-section layout used by the public pages:
 *   - matte-black hero with the Atmos wordmark and a subtle steam-vapor halo
 *   - cream content area with paper grain
 */
export default function Layout({ children, subtitle }: { children: ReactNode; subtitle?: string }) {
    return (
        <div className="min-h-screen bg-sand-50 grain">
            <Hero subtitle={subtitle} />
            <div className="relative max-w-xl mx-auto px-5 pt-8 pb-32">
                {children}
            </div>
        </div>
    );
}

function Hero({ subtitle }: { subtitle?: string }) {
    return (
        <header className="relative bg-ink text-bone overflow-hidden">
            {/* Vapor halo above the wordmark — a soft white radial that fades into
                the matte-black background so the top of the page looks like steam
                lifting off a black bath. Pure CSS, no animation libs. */}
            <div aria-hidden className="atmos-vapor" />
            <div aria-hidden className="atmos-vapor atmos-vapor--drift" />

            <div className="relative max-w-xl mx-auto px-5 pt-12 pb-10 flex flex-col items-center">
                {/* Transparent PNG of just the ATMOS wordmark — generated from the
                    original JPG by punching the black background to alpha=0. No
                    mix-blend-mode needed; the glyph sits cleanly on whatever the
                    header bg is. */}
                <img
                    src={atmosLogo}
                    alt="ATMOS"
                    className="w-48 h-auto -my-6 object-contain"
                />
                <p className="text-bone/55 text-[10px] uppercase tracking-atmos mt-2">Steam Club</p>
                {subtitle && (
                    <p className="text-bone/60 text-xs uppercase tracking-widest mt-2">{subtitle}</p>
                )}
            </div>

            <style>{`
                .atmos-vapor {
                    position: absolute;
                    left: 50%;
                    top: -60px;
                    width: 460px;
                    height: 220px;
                    transform: translateX(-50%);
                    pointer-events: none;
                    background:
                        radial-gradient(ellipse 60% 50% at 50% 60%,
                            rgba(255, 255, 255, 0.22) 0%,
                            rgba(255, 255, 255, 0.10) 30%,
                            rgba(255, 255, 255, 0.03) 55%,
                            rgba(255, 255, 255, 0) 75%);
                    filter: blur(14px);
                    animation: vapor-pulse 11s ease-in-out infinite;
                }
                .atmos-vapor--drift {
                    top: -40px;
                    width: 320px;
                    height: 160px;
                    background:
                        radial-gradient(ellipse 60% 50% at 50% 60%,
                            rgba(255, 255, 255, 0.16) 0%,
                            rgba(255, 255, 255, 0.05) 40%,
                            rgba(255, 255, 255, 0) 75%);
                    animation: vapor-drift 14s ease-in-out infinite;
                }
                @keyframes vapor-pulse {
                    0%, 100% { transform: translateX(-50%) translateY(0)    scale(1);    opacity: 1; }
                    50%      { transform: translateX(-50%) translateY(-10px) scale(1.06); opacity: 0.85; }
                }
                @keyframes vapor-drift {
                    0%, 100% { transform: translateX(-50%) translateX(-30px) translateY(0); }
                    50%      { transform: translateX(-50%) translateX(30px)  translateY(-8px); }
                }
                @media (prefers-reduced-motion: reduce) {
                    .atmos-vapor, .atmos-vapor--drift { animation: none; }
                }
            `}</style>
        </header>
    );
}
