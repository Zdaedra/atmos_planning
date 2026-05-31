import { FormEvent, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { apiErrorMessage, getScannerToken, scannerLogin, setScannerToken } from "@/lib/api";

/**
 * Door-scanner login screen at /staff.
 *
 * Magic-link activation is gone — we use shared-password auth now. The admin
 * sets one password in Settings; the tablet enters it once and lives in
 * localStorage indefinitely. Admin changing the password makes the tablet
 * re-prompt one time, no link-shuffling needed.
 *
 * File still named Activate.tsx because the route registration in App.tsx
 * points here and renaming the file forces churn through the build pipeline.
 */
export default function StaffLogin() {
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const expired = params.has("expired");

    if (getScannerToken() && !expired) {
        return <Navigate to="/staff/scan" replace />;
    }

    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        if (busy || !password.trim()) return;
        setBusy(true);
        setError(null);
        try {
            const { token } = await scannerLogin(password.trim());
            setScannerToken(token);
            navigate("/staff/scan", { replace: true });
        } catch (err) {
            setError(apiErrorMessage(err, "Login failed"));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-ink">
            <form
                onSubmit={submit}
                className="max-w-sm w-full bg-bone rounded-2xl border border-ink/10 p-8 space-y-4"
            >
                <div className="text-center">
                    <h1 className="text-2xl font-semibold">Door scanner</h1>
                    <p className="text-sm text-ink/60 mt-1">Enter the tablet password to sign in.</p>
                </div>

                {expired && (
                    <div className="bg-yellow-50 border border-yellow-200 text-yellow-900 rounded-lg p-3 text-xs">
                        The password changed. Please enter the new one.
                    </div>
                )}

                <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    autoFocus
                    autoComplete="current-password"
                    className="w-full px-4 py-2.5 border border-ink/10 rounded-lg bg-bone text-base"
                />

                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-900 rounded-lg p-3 text-xs">
                        {error}
                    </div>
                )}

                <button
                    type="submit"
                    disabled={busy || !password.trim()}
                    className="w-full bg-ink text-bone py-3 rounded-lg font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                >
                    {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                    {busy ? "Signing in…" : "Sign in"}
                </button>

                <p className="text-xs text-ink/50 text-center pt-2">
                    Stays signed in on this device until the password changes.
                </p>
            </form>
        </div>
    );
}
