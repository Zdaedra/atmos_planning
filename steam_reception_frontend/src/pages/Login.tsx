import { FormEvent, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { apiErrorMessage, login, setToken } from "../lib/api";

export default function Login() {
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const expired = params.has("expired");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        if (busy || !password.trim()) return;
        setBusy(true);
        setError(null);
        try {
            const { token } = await login(password.trim());
            setToken(token);
            navigate("/", { replace: true });
        } catch (err) {
            setError(apiErrorMessage(err, "Login failed"));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-sand">
            <form
                onSubmit={submit}
                className="max-w-sm w-full bg-bone rounded-2xl border border-line p-8 space-y-4"
            >
                <div className="text-center">
                    <h1 className="text-2xl font-semibold">Reception portal</h1>
                    <p className="text-sm text-muted mt-1">Enter the tablet password to sign in.</p>
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
                    className="w-full px-4 py-2.5 border border-line rounded-lg bg-bone text-base"
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

                <p className="text-xs text-muted text-center pt-2">
                    Stays signed in on this device until the password changes.
                </p>
            </form>
        </div>
    );
}
