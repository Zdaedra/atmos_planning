import { useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { Scanner } from "@yudiel/react-qr-scanner";
import { Camera, CheckCircle2, XCircle, Clock, AlertTriangle, LogOut } from "lucide-react";

import { VerifyResult, apiErrorMessage, clearScannerToken, getScannerToken, verifyQr } from "@/lib/api";
import { fmtDateTime, fmtTime } from "@/lib/tz";

interface RecentScan {
    at: number;
    code: string;
    result: VerifyResult["result"];
}

export default function StaffScan() {
    const token = getScannerToken();
    if (!token) return <Navigate to="/staff" replace />;

    const [overlay, setOverlay] = useState<VerifyResult | null>(null);
    const [manualCode, setManualCode] = useState("");
    const [recent, setRecent] = useState<RecentScan[]>([]);
    // Prevent double-scans of the same QR within 3s (Scanner fires rapidly).
    const lastScanRef = useRef<{ token: string; at: number } | null>(null);

    const dismiss = () => setOverlay(null);

    const handleQr = async (qrToken: string) => {
        const now = Date.now();
        if (lastScanRef.current && lastScanRef.current.token === qrToken && now - lastScanRef.current.at < 3000) {
            return; // de-dupe burst
        }
        lastScanRef.current = { token: qrToken, at: now };
        try {
            const r = await verifyQr(qrToken);
            setOverlay(r);
            const entry: RecentScan = { at: now, code: r.code ?? qrToken.slice(0, 8), result: r.result };
            setRecent((cur) => [entry, ...cur].slice(0, 10));
            // Auto-close on valid after 3s; rejections stay until manual dismiss.
            if (r.result === "valid") setTimeout(dismiss, 3000);
        } catch (e) {
            setOverlay({ result: "not_found" });
            const entry: RecentScan = { at: now, code: "—", result: "not_found" };
            setRecent((cur) => [entry, ...cur].slice(0, 10));
            console.error("verify failed:", apiErrorMessage(e));
        }
    };

    const handleManual = (e: React.FormEvent) => {
        e.preventDefault();
        const v = manualCode.trim();
        if (!v) return;
        // Manual entry usually means the booking code (ATM-XXXXX), not qr_token.
        // We don't have a code→qr_token API yet, so we treat it as qr_token (uuid).
        // Could be extended later with a /staff/lookup-by-code endpoint.
        handleQr(v);
        setManualCode("");
    };

    return (
        <div className="min-h-screen bg-ink text-white">
            <header className="px-4 py-3 flex items-center justify-between border-b border-white/10">
                <div className="text-sm">Atmos Steam · Scanner</div>
                <button
                    onClick={() => { clearScannerToken(); location.href = "/staff"; }}
                    className="flex items-center gap-1 text-xs text-white/70 hover:text-white"
                >
                    <LogOut className="w-3 h-3" />Sign out
                </button>
            </header>

            <div className="aspect-square max-w-md mx-auto mt-4 rounded-xl overflow-hidden bg-black relative">
                <Scanner
                    onScan={(detected) => {
                        const v = detected?.[0]?.rawValue;
                        if (v) handleQr(v);
                    }}
                    onError={(err) => console.warn("scanner error:", err)}
                    styles={{ container: { width: "100%", height: "100%" } }}
                    constraints={{ facingMode: "environment" }}
                />
                <div className="absolute top-2 left-2 right-2 text-center text-xs text-white/60 flex items-center justify-center gap-1">
                    <Camera className="w-3 h-3" />Point camera at the guest's QR
                </div>
            </div>

            <form onSubmit={handleManual} className="max-w-md mx-auto mt-4 px-4 flex gap-2">
                <input
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    placeholder="Or enter code/token manually"
                    className="flex-1 px-3 py-2 rounded bg-white/5 border border-white/10 text-sm focus:outline-none focus:ring-1 focus:ring-white/30"
                />
                <button type="submit" className="px-4 py-2 rounded bg-white/10 text-sm">Check</button>
            </form>

            <div className="max-w-md mx-auto mt-6 px-4 pb-8">
                <div className="text-xs uppercase tracking-wide text-white/40 mb-2">Recent</div>
                {recent.length === 0 && <div className="text-xs text-white/30">No scans yet.</div>}
                <div className="space-y-1">
                    {recent.map((r, i) => (
                        <div key={i} className="text-xs flex justify-between text-white/70">
                            <span>{new Date(r.at).toLocaleTimeString()}</span>
                            <span className="font-mono">{r.code}</span>
                            <span className={r.result === "valid" ? "text-green-400" : "text-red-400"}>
                                {r.result === "valid" ? "✓ Verified" : `✗ ${r.result}`}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {overlay && <ResultOverlay r={overlay} onDismiss={dismiss} />}
        </div>
    );
}

function ResultOverlay({ r, onDismiss }: { r: VerifyResult; onDismiss: () => void }) {
    const palette = {
        valid:        "bg-green-700 text-white",
        wrong_time:   r.reason === "too_late" ? "bg-red-700 text-white" : "bg-yellow-600 text-white",
        already_used: "bg-orange-600 text-white",
        cancelled:    "bg-red-700 text-white",
        expired:      "bg-red-700 text-white",
        not_found:    "bg-red-700 text-white",
    }[r.result];

    let title = "Welcome";
    let subtitle = "";
    let Icon = CheckCircle2;

    if (r.result === "valid") {
        title = "✓ Welcome";
        subtitle = r.slot_starts_at ? `${fmtTime(r.slot_starts_at)}${r.therapist ? ` · ${r.therapist}` : ""}` : "";
    } else if (r.result === "wrong_time" && r.reason === "too_late") {
        Icon = XCircle;
        title = "Too late";
        subtitle = r.slot_starts_at ? `Session started at ${fmtTime(r.slot_starts_at)}` : "";
    } else if (r.result === "wrong_time" && r.reason === "too_early") {
        Icon = Clock;
        title = "Too early";
        subtitle = r.entry_opens_at ? `Entry opens at ${fmtTime(r.entry_opens_at)}` : "";
    } else if (r.result === "already_used") {
        Icon = AlertTriangle;
        title = "Already checked in";
        subtitle = r.entered_at ? `at ${fmtDateTime(r.entered_at)}` : "";
    } else if (r.result === "cancelled") {
        Icon = XCircle;
        title = "Booking cancelled";
    } else if (r.result === "expired") {
        Icon = XCircle;
        title = "Booking expired";
    } else if (r.result === "not_found") {
        Icon = XCircle;
        title = "Invalid QR";
        subtitle = "Booking not found";
    }

    return (
        <div
            onClick={onDismiss}
            className={`fixed inset-0 z-50 flex flex-col items-center justify-center text-center px-6 cursor-pointer ${palette}`}
        >
            <Icon className="w-20 h-20 mb-4" />
            <div className="text-3xl font-semibold">{title}</div>
            {subtitle && <div className="mt-2 text-lg opacity-90">{subtitle}</div>}
            {r.code && r.result !== "not_found" && (
                <div className="mt-3 font-mono text-base opacity-80">{r.code}</div>
            )}
            <div className="absolute bottom-8 inset-x-0 text-sm opacity-75">Tap to scan next</div>
        </div>
    );
}
