import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueries, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Flame, HandHeart, RefreshCw, X } from "lucide-react";

import Layout from "@/components/Layout";
import {
    BookingByCode,
    PublicSlot,
    ServiceType,
    apiErrorMessage,
    createBooking,
    fetchBookingByCode,
    fetchPublicSettings,
    fetchSlots,
    forgetMyBookings,
    getMyBookings,
    rememberMyBookings,
    resendBookingsEmail,
} from "@/lib/api";
import { getFingerprint } from "@/lib/fingerprint";
import { LOCATION_TZ, fmtDayHeader, fmtTime, groupByDay } from "@/lib/tz";

/** YYYY-MM-DD in Bali tz — matches backend's per-day grouping. */
function baliDayKey(iso: string): string {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: LOCATION_TZ, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date(iso));
}

export default function Landing() {
    const navigate = useNavigate();
    const [serviceTab, setServiceTab] = useState<ServiceType>("steam");
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [email, setEmail] = useState("");
    const [name, setName] = useState("");
    const [stage, setStage] = useState<"pick" | "email">("pick");
    const [fp, setFp] = useState<string | null>(null);

    useEffect(() => { getFingerprint().then(setFp); }, []);

    const { data: slots = [], isLoading, refetch, isFetching } = useQuery({
        queryKey: ["public-slots", serviceTab],
        queryFn: () => fetchSlots(serviceTab),
        refetchInterval: 30_000,
    });
    const { data: settings } = useQuery({
        queryKey: ["public-settings"],
        queryFn: fetchPublicSettings,
        staleTime: 5 * 60_000,
    });

    const limitPerDay = serviceTab === "steam"
        ? (settings?.max_steam_per_day ?? 0)
        : (settings?.max_massage_per_day ?? 0);

    const groups = useMemo(() => groupByDay(slots), [slots]);

    // Count how many of the selected slots fall on each day — enforces per-day limit
    // locally before we even hit the server.
    const selectedByDay: Record<string, number> = useMemo(() => {
        const acc: Record<string, number> = {};
        slots.forEach((s) => {
            if (!selected.has(s.id)) return;
            const k = baliDayKey(s.starts_at);
            acc[k] = (acc[k] ?? 0) + 1;
        });
        return acc;
    }, [selected, slots]);

    const toggle = (slot: PublicSlot) => {
        if (slot.booked_count >= slot.capacity) return;
        setSelected((cur) => {
            const next = new Set(cur);
            if (next.has(slot.id)) {
                next.delete(slot.id);
                return next;
            }
            // Per-day limit check — would the server reject this anyway?
            if (limitPerDay > 0) {
                const k = baliDayKey(slot.starts_at);
                const wouldBe = (selectedByDay[k] ?? 0) + 1;
                if (wouldBe > limitPerDay) {
                    const svc = serviceTab === "steam" ? "steam" : "massage";
                    toast.error(
                        limitPerDay === 1
                            ? `That's our one ${svc} session per guest, per day — please pick just one.`
                            : `We can host you for up to ${limitPerDay} ${svc} sessions today. Please choose a different time slot.`,
                    );
                    return next;
                }
            }
            next.add(slot.id);
            return next;
        });
    };

    const create = useMutation({
        mutationFn: () => createBooking({
            slot_ids: Array.from(selected),
            email: email.trim(),
            name: name.trim() || undefined,
            fingerprint: fp,
        }),
        onSuccess: (r) => {
            const first = r.bookings[0];
            if (first) {
                rememberMyBookings(email.trim(), r.bookings.map((b) => b.code));
                navigate(`/success/${encodeURIComponent(first.code)}`);
            } else {
                toast.error("Booking created but no code returned");
            }
        },
        onError: (e) => toast.error(apiErrorMessage(e, "We couldn't book that — please try again.")),
    });

    const resend = useMutation({
        mutationFn: () => resendBookingsEmail(email.trim()),
        onSuccess: () => toast.success("Email sent. Check your inbox."),
        onError: (e) => toast.error(apiErrorMessage(e, "Couldn't send")),
    });

    const canContinue = selected.size > 0;
    const canConfirm = email.trim().length > 3 && email.includes("@");

    // -----------------------------------------------------------------------
    // Stage 2 — email form (after slots picked)
    // -----------------------------------------------------------------------
    if (stage === "email") {
        return (
            <Layout subtitle="Confirm booking">
                <button onClick={() => setStage("pick")} className="text-sm text-ink/60 mb-6 hover:text-ink">
                    ← Back to slots
                </button>
                <h2 className="text-3xl font-display mb-1">One last step</h2>
                <p className="text-ink/60 mb-8">We'll send your QR here.</p>

                <div className="space-y-4">
                    <Field label="Your name (optional)">
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Anya"
                            className="atmos-input"
                        />
                    </Field>
                    <Field label="Email">
                        <input
                            type="email"
                            inputMode="email"
                            autoComplete="email"
                            autoFocus
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            className="atmos-input"
                        />
                    </Field>
                </div>

                <p className="text-sm text-ink/60 mt-8">
                    Booking <strong className="text-ink">{selected.size}</strong> {selected.size === 1 ? "session" : "sessions"}.
                </p>
                <p className="text-sm text-ink/60 mt-2">
                    Already have a booking?{" "}
                    <button
                        onClick={() => resend.mutate()}
                        disabled={!canConfirm || resend.isPending}
                        className="underline disabled:opacity-50 hover:text-ink"
                    >
                        Resend my QR
                    </button>
                </p>

                <StickyCTA>
                    <button
                        onClick={() => create.mutate()}
                        disabled={!canConfirm || create.isPending}
                        className="atmos-btn-primary"
                    >
                        {create.isPending ? "Booking your spot…" : "Confirm booking"}
                    </button>
                </StickyCTA>

                <style>{`
                    .atmos-input {
                        width: 100%;
                        padding: 14px 16px;
                        border-radius: 14px;
                        border: 1px solid rgba(20, 16, 10, 0.12);
                        background: #fdfbf6;
                        color: #0e0e0e;
                        font-size: 16px;
                        outline: none;
                        transition: all 0.15s;
                    }
                    .atmos-input:focus {
                        border-color: #0e0e0e;
                        box-shadow: 0 0 0 3px rgba(20, 16, 10, 0.06);
                    }
                `}</style>
            </Layout>
        );
    }

    // -----------------------------------------------------------------------
    // Stage 1 — slot picker
    // -----------------------------------------------------------------------
    return (
        <Layout subtitle="Book today's session">
            <MyBookingsBanner />

            <div className="flex items-center gap-2 mb-4">
                <ServiceTab
                    active={serviceTab === "steam"}
                    onClick={() => { setServiceTab("steam"); setSelected(new Set()); }}
                    icon={<Flame className="w-4 h-4" />}
                    label="Steam"
                />
                <ServiceTab
                    active={serviceTab === "massage"}
                    onClick={() => { setServiceTab("massage"); setSelected(new Set()); }}
                    icon={<HandHeart className="w-4 h-4" />}
                    label="Massage"
                />
                <button
                    onClick={() => refetch()}
                    aria-label="Refresh"
                    className="ml-auto p-2 text-ink/40 hover:text-ink"
                >
                    <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
                </button>
            </div>

            {limitPerDay > 0 && (
                <div className="text-xs text-ink/60 mb-8 px-1 leading-relaxed">
                    {limitPerDay === 1
                        ? <>We host one {serviceTab} session per guest each day — pick the time that suits you.</>
                        : <>Based on today's flow, you can book up to <span className="font-medium text-ink">{limitPerDay}</span> individual {serviceTab} {serviceTab === "steam" ? "sessions" : "treatments"}.</>}
                </div>
            )}

            {isLoading && <div className="text-ink/50 text-sm">Loading today's schedule…</div>}
            {!isLoading && slots.length === 0 && (
                <div className="rounded-2xl bg-bone border border-ink/10 p-8 text-center text-ink/60 shadow-card">
                    <p className="text-sm">
                        No more {serviceTab} sessions today.
                    </p>
                    <p className="text-xs mt-1 text-ink/40">
                        We'd love to see you tomorrow — bookings open daily.
                    </p>
                </div>
            )}

            <div className="space-y-8">
                {groups.map(([dayKey, daySlots]) => {
                    const sample = daySlots[0];
                    const selectedThisDay = selectedByDay[dayKey] ?? 0;
                    const remainingThisDay = limitPerDay > 0 ? Math.max(0, limitPerDay - selectedThisDay) : null;
                    return (
                        <div key={dayKey}>
                            <div className="flex items-center gap-3 mb-3">
                                <h3 className="font-display text-xl">{fmtDayHeader(sample.starts_at)}</h3>
                                <div className="flex-1 h-px bg-ink/10" />
                                {selectedThisDay > 0 && (
                                    <span className="text-[11px] uppercase tracking-widest text-ink/60">
                                        {selectedThisDay} / {limitPerDay}
                                    </span>
                                )}
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {daySlots.map((s) => {
                                    const isSelected = selected.has(s.id);
                                    const dayFull = remainingThisDay === 0 && !isSelected;
                                    return (
                                        <SlotCard
                                            key={s.id}
                                            slot={s}
                                            selected={isSelected}
                                            dayFull={dayFull}
                                            onClick={() => toggle(s)}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>

            {canContinue && (
                <StickyCTA>
                    <button
                        onClick={() => setStage("email")}
                        className="atmos-btn-primary"
                    >
                        Continue · {selected.size} {selected.size === 1 ? "session" : "sessions"}
                    </button>
                </StickyCTA>
            )}
        </Layout>
    );
}

function ServiceTab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
    return (
        <button
            onClick={onClick}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-all ${
                active
                    ? "bg-ink text-bone shadow-card"
                    : "bg-bone text-ink/70 border border-ink/10 hover:border-ink/30"
            }`}
        >
            {icon}{label}
        </button>
    );
}

function SlotCard({
    slot, selected, dayFull, onClick,
}: { slot: PublicSlot; selected: boolean; dayFull?: boolean; onClick: () => void }) {
    const left = slot.capacity - slot.booked_count;
    const full = left <= 0;
    const lastOne = left === 1;
    const disabled = full || dayFull;

    return (
        <button
            onClick={onClick}
            disabled={disabled}
            aria-pressed={selected}
            title={dayFull ? "Daily limit reached for this day" : undefined}
            className={`group relative text-left p-4 rounded-2xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ink/40 ${
                disabled ?
                    "bg-bone/40 border border-ink/5 text-ink/30 cursor-not-allowed" :
                selected ?
                    "bg-ink text-bone shadow-lift translate-y-[-2px]" :
                    "bg-bone border border-ink/10 hover:border-ink/40 hover:shadow-card hover:translate-y-[-1px]"
            }`}
        >
            <div className={`font-display text-2xl leading-none mb-1 ${selected ? "text-bone" : "text-ink"}`}>
                {fmtTime(slot.starts_at)}
            </div>
            <div className={`text-[11px] uppercase tracking-widest ${
                disabled ? "text-ink/30" :
                lastOne ? (selected ? "text-bone/90" : "text-wood-600") :
                (selected ? "text-bone/70" : "text-ink/50")
            }`}>
                {full ? "Full" :
                 dayFull ? "Day limit" :
                 lastOne ? "Last spot" :
                 `${left} ${left === 1 ? "spot" : "spots"} left`}
            </div>
            {(slot.variant || slot.therapist) && (
                <div className={`text-[11px] mt-2 truncate ${selected ? "text-bone/70" : "text-ink/50"}`}>
                    {slot.variant}{slot.variant && slot.therapist ? " · " : ""}{slot.therapist}
                </div>
            )}
        </button>
    );
}

function StickyCTA({ children }: { children: React.ReactNode }) {
    return (
        <div className="fixed bottom-0 inset-x-0 z-10 bg-gradient-to-t from-sand-50 via-sand-50 to-sand-50/0 pt-8 pb-4">
            <div className="max-w-xl mx-auto px-5">
                {children}
            </div>
            <style>{`
                .atmos-btn-primary {
                    width: 100%;
                    padding: 16px 24px;
                    border-radius: 16px;
                    background: #0e0e0e;
                    color: #fdfbf6;
                    font-weight: 500;
                    font-size: 15px;
                    letter-spacing: 0.02em;
                    transition: all 0.15s;
                    box-shadow: 0 4px 8px rgba(20, 16, 10, 0.12), 0 12px 32px -8px rgba(20, 16, 10, 0.2);
                }
                .atmos-btn-primary:hover:not(:disabled) { background: #1f1d1a; transform: translateY(-1px); }
                .atmos-btn-primary:disabled { opacity: 0.5; }
            `}</style>
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <label className="block text-xs uppercase tracking-widest text-ink/50 mb-2">{label}</label>
            {children}
        </div>
    );
}

/**
 * Banner shown above the slot picker if the guest has any active bookings on
 * this device. Fetches each saved code in parallel; renders a compact list
 * with tap-to-open-QR links to /success/{code}. Stale codes (cancelled, used,
 * expired, or in the past) are pruned from localStorage on this render — keeps
 * the banner from gradually filling with garbage.
 */
function MyBookingsBanner() {
    const navigate = useNavigate();
    const saved = useMemo(() => getMyBookings(), []);
    const codes = saved?.codes ?? [];

    const results = useQueries({
        queries: codes.map((code) => ({
            queryKey: ["my-booking", code],
            queryFn: () => fetchBookingByCode(code),
            staleTime: 30_000,
            retry: false,
        })),
    });

    const active = useMemo(() => {
        const now = Date.now();
        return results
            .map((r, i) => ({ code: codes[i], data: r.data }))
            .filter((r): r is { code: string; data: BookingByCode } => !!r.data)
            // active = not cancelled/expired, AND not already over
            .filter((r) => r.data.status !== "cancelled" && r.data.status !== "expired")
            .filter((r) => new Date(r.data.slot_ends_at).getTime() > now)
            .sort((a, b) =>
                new Date(a.data.slot_starts_at).getTime() - new Date(b.data.slot_starts_at).getTime(),
            );
    }, [results, codes]);

    // Prune codes no longer active from localStorage (only after fetches resolve
    // — don't drop on transient network errors).
    useEffect(() => {
        if (!saved || codes.length === 0) return;
        const allLoaded = results.every((r) => r.isSuccess || r.isError);
        if (!allLoaded) return;
        const keep = active.map((a) => a.code);
        if (keep.length === codes.length) return;
        if (keep.length === 0) {
            // Keep email memory; just clear codes — the email is still useful for resend.
            localStorage.setItem("atmos_my_bookings", JSON.stringify({ email: saved.email, codes: [] }));
        } else {
            localStorage.setItem("atmos_my_bookings", JSON.stringify({ email: saved.email, codes: keep }));
        }
    }, [results, codes, active, saved]);

    if (!saved || active.length === 0) return null;

    return (
        <div className="mb-6 rounded-2xl border border-ink/10 bg-bone shadow-card overflow-hidden">
            <div className="flex items-center px-4 pt-3 pb-2">
                <div className="text-[10px] uppercase tracking-atmos text-ink/50">Your bookings</div>
                <button
                    onClick={() => { forgetMyBookings(); location.reload(); }}
                    aria-label="Forget me on this device"
                    title="Forget me on this device"
                    className="ml-auto text-ink/30 hover:text-ink"
                >
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>
            <ul className="divide-y divide-ink/5">
                {active.map(({ code, data }) => {
                    const isSteam = data.service_type === "steam";
                    return (
                        <li key={code}>
                            <button
                                onClick={() => navigate(`/success/${encodeURIComponent(code)}`)}
                                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-sand-50/60"
                            >
                                {isSteam
                                    ? <Flame className="w-4 h-4 shrink-0 text-ink/60" />
                                    : <HandHeart className="w-4 h-4 shrink-0 text-ink/60" />}
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium truncate">
                                        {fmtTime(data.slot_starts_at)}
                                        <span className="text-ink/40 font-normal ml-2">{data.service_type}</span>
                                    </div>
                                    <div className="text-[11px] text-ink/45 font-mono">{code}</div>
                                </div>
                                <span className="text-[10px] uppercase tracking-widest text-ink/40">View QR →</span>
                            </button>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
