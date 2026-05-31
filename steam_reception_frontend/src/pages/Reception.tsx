import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
    ChevronDown, ChevronLeft, ChevronRight, ChevronUp,
    LogOut, Plus, RefreshCw, UserPlus, X,
} from "lucide-react";

import {
    BookingStatus, DayBooking, DaySlot, ServiceType,
    apiErrorMessage, cancelBooking, clearToken, createWalkin,
    fetchDay, fetchSettings,
} from "../lib/api";
import { fmtTime, relativeLabel, shiftDate, todayKey } from "../lib/tz";

const STATUS_STYLES: Record<BookingStatus, string> = {
    pending:   "bg-yellow-100 text-yellow-900",
    confirmed: "bg-green-100  text-green-900",
    used:      "bg-blue-100   text-blue-900",
    cancelled: "bg-gray-100   text-gray-500 line-through",
    expired:   "bg-red-100    text-red-900",
};

export default function Reception() {
    const [date, setDate] = useState(todayKey());
    const [service, setService] = useState<ServiceType>("steam");
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [search, setSearch] = useState("");

    const { data, refetch, isFetching, isLoading } = useQuery({
        queryKey: ["day", date, service],
        queryFn: () => fetchDay(date, service),
        refetchInterval: 30_000,
    });
    const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: fetchSettings, staleTime: 5 * 60_000 });

    const stats = data?.stats[service];

    const searchLower = search.trim().toLowerCase();
    const filteredSlots = useMemo(() => {
        const slots = data?.slots ?? [];
        if (!searchLower) return slots;
        return slots
            .map((s) => ({ ...s, bookings: s.bookings.filter((b) =>
                (b.guest_name ?? "").toLowerCase().includes(searchLower) ||
                b.guest_email.toLowerCase().includes(searchLower) ||
                b.code.toLowerCase().includes(searchLower),
            ) }))
            .filter((s) => s.bookings.length > 0);
    }, [data?.slots, searchLower]);

    return (
        <div className="min-h-screen bg-sand">
            <header className="bg-ink text-bone sticky top-0 z-10">
                <div className="max-w-4xl mx-auto px-5 py-3 flex items-center gap-3">
                    <div>
                        <div className="text-xs text-bone/60 uppercase tracking-widest">{settings?.festival_name ?? "Atmos"}</div>
                        <div className="text-sm font-medium">Reception</div>
                    </div>
                    <button
                        onClick={() => { clearToken(); location.href = "/login"; }}
                        className="ml-auto flex items-center gap-1 text-xs text-bone/70 hover:text-bone"
                    >
                        <LogOut className="w-3 h-3" />Sign out
                    </button>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-5 py-6">
                {/* Date pager */}
                <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                    <h1 className="text-2xl font-semibold">{relativeLabel(date)}</h1>
                    <div className="flex items-center gap-1">
                        <button onClick={() => setDate(d => shiftDate(d, -1))} className="p-2 border border-line rounded-md hover:bg-bone">
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                            className="px-3 py-1.5 border border-line rounded-md bg-bone text-sm" />
                        <button onClick={() => setDate(d => shiftDate(d, 1))} className="p-2 border border-line rounded-md hover:bg-bone">
                            <ChevronRight className="w-4 h-4" />
                        </button>
                        {date !== todayKey() && (
                            <button onClick={() => setDate(todayKey())} className="px-2 text-xs underline text-muted">Today</button>
                        )}
                    </div>
                </div>

                {/* Service tabs */}
                <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
                    <div className="flex gap-1 bg-bone rounded-lg p-1 border border-line">
                        <button
                            onClick={() => setService("steam")}
                            className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
                                service === "steam" ? "bg-ink text-bone" : "text-ink/60 hover:text-ink"
                            }`}
                        >🔥 Steam</button>
                        <button
                            onClick={() => setService("massage")}
                            className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
                                service === "massage" ? "bg-ink text-bone" : "text-ink/60 hover:text-ink"
                            }`}
                        >💆 Massage</button>
                    </div>
                    <div className="flex items-center gap-2 ml-auto">
                        {stats && (
                            <span className="text-xs text-muted">
                                <strong className="text-ink">{stats.active_bookings}</strong> bookings · {stats.slots} slots
                            </span>
                        )}
                        <button onClick={() => refetch()} className="p-2 border border-line rounded-md hover:bg-bone">
                            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
                        </button>
                    </div>
                </div>

                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search guest by name, email, or code…"
                    className="w-full px-4 py-2.5 border border-line rounded-lg bg-bone text-sm mb-4"
                />

                {isLoading && <div className="text-sm text-muted">Loading…</div>}

                {!isLoading && filteredSlots.length === 0 && (
                    <div className="rounded-xl bg-bone border border-line p-8 text-center text-sm text-muted">
                        {searchLower ? "No guests match the search." : `No ${service} slots for ${relativeLabel(date)}.`}
                    </div>
                )}

                <div className="space-y-2">
                    {filteredSlots.map((slot) => (
                        <SlotRow
                            key={slot.id}
                            slot={slot}
                            expanded={expandedId === slot.id || !!searchLower}
                            onToggle={() => setExpandedId(expandedId === slot.id ? null : slot.id)}
                        />
                    ))}
                </div>
            </main>
        </div>
    );
}

function SlotRow({ slot, expanded, onToggle }: { slot: DaySlot; expanded: boolean; onToggle: () => void }) {
    const remaining = slot.capacity - slot.booked_count;
    const full = remaining <= 0;
    const visible = slot.bookings.filter((b) => b.status !== "expired" && b.status !== "cancelled");

    return (
        <div className="bg-bone border border-line rounded-xl overflow-hidden">
            <button
                onClick={onToggle}
                className="w-full flex items-center gap-4 p-4 hover:bg-sand/60 transition text-left"
            >
                <span className="text-xl font-semibold tabular-nums shrink-0">{fmtTime(slot.starts_at)}</span>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap text-sm">
                        <span>{slot.booked_count}/{slot.capacity}</span>
                        {full
                            ? <span className="bg-red-100 text-red-900 px-2 py-0.5 rounded text-xs">FULL</span>
                            : <span className="text-xs text-muted">{remaining} {remaining === 1 ? "spot" : "spots"} left</span>}
                        {slot.therapist && <span className="text-xs text-muted">· {slot.therapist}</span>}
                        {slot.variant && <span className="text-xs text-muted">· {slot.variant}</span>}
                    </div>
                </div>
                <div className="w-16 h-1.5 bg-sand rounded overflow-hidden shrink-0">
                    <div
                        className={`h-full ${full ? "bg-red-500" : "bg-ink/70"}`}
                        style={{ width: `${(slot.booked_count / slot.capacity) * 100}%` }}
                    />
                </div>
                {expanded ? <ChevronUp className="w-4 h-4 text-muted shrink-0" />
                          : <ChevronDown className="w-4 h-4 text-muted shrink-0" />}
            </button>

            {expanded && (
                <div className="border-t border-line bg-sand/40 px-4 py-3 space-y-2">
                    {visible.length === 0 && <p className="text-xs text-muted">No bookings yet.</p>}
                    {visible.map((b) => <GuestRow key={b.id} booking={b} />)}
                    {!full && slot.status === "open" && <WalkinForm slotId={slot.id} />}
                </div>
            )}
        </div>
    );
}

function GuestRow({ booking }: { booking: DayBooking }) {
    const qc = useQueryClient();
    const cancelM = useMutation({
        mutationFn: () => cancelBooking(booking.id),
        onSuccess: () => {
            toast.success(`${booking.guest_name ?? booking.guest_email} cancelled`);
            qc.invalidateQueries({ queryKey: ["day"] });
        },
        onError: (e) => toast.error(apiErrorMessage(e, "Cancel failed")),
    });

    const isWalkin = booking.guest_email.endsWith("@local.atmos");

    const confirmRemove = () => {
        toast.warning(`Remove ${booking.guest_name ?? booking.guest_email}?`, {
            duration: 8000,
            action: { label: "Remove", onClick: () => cancelM.mutate() },
            cancel: { label: "Cancel", onClick: () => {} },
        });
    };

    return (
        <div className="flex items-center gap-2 p-2 bg-bone rounded-md border border-line">
            <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                    {booking.guest_name ?? booking.guest_email}
                    {isWalkin && <span className="ml-2 text-[10px] uppercase tracking-widest text-muted">walk-in</span>}
                </div>
                <div className="text-xs text-muted truncate">
                    {!isWalkin && booking.guest_email !== booking.guest_name && booking.guest_email}
                    {booking.guest_email !== booking.guest_name && !isWalkin ? " · " : ""}
                    <code className="font-mono">{booking.code}</code>
                </div>
            </div>
            <span className={`shrink-0 text-xs px-2 py-0.5 rounded ${STATUS_STYLES[booking.status]}`}>{booking.status}</span>
            <button
                onClick={confirmRemove}
                aria-label="Remove"
                disabled={cancelM.isPending}
                className="p-1.5 text-muted hover:text-red-700"
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    );
}

function WalkinForm({ slotId }: { slotId: string }) {
    const qc = useQueryClient();
    const [show, setShow] = useState(false);
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");

    const mut = useMutation({
        mutationFn: () => createWalkin(slotId, name.trim(), email.trim() || undefined),
        onSuccess: () => {
            toast.success(`${name.trim()} added`);
            setName(""); setEmail(""); setShow(false);
            qc.invalidateQueries({ queryKey: ["day"] });
        },
        onError: (e) => toast.error(apiErrorMessage(e, "Walk-in failed")),
    });

    if (!show) {
        return (
            <button
                onClick={() => setShow(true)}
                className="w-full py-2 border border-dashed border-line rounded-md text-sm text-muted hover:bg-bone hover:text-ink"
            >
                <UserPlus className="w-4 h-4 inline mr-1" />Add walk-in guest
            </button>
        );
    }

    return (
        <form
            onSubmit={(e) => { e.preventDefault(); if (name.trim()) mut.mutate(); }}
            className="space-y-2 bg-bone rounded-md border border-line p-3"
        >
            <div className="grid grid-cols-2 gap-2">
                <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Name *"
                    autoFocus
                    required
                    className="px-3 py-1.5 border border-line rounded-md text-sm bg-bone"
                />
                <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email (optional)"
                    className="px-3 py-1.5 border border-line rounded-md text-sm bg-bone"
                />
            </div>
            <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => { setShow(false); setName(""); setEmail(""); }}
                    className="px-3 py-1.5 text-sm text-muted hover:text-ink">Cancel</button>
                <button type="submit" disabled={!name.trim() || mut.isPending}
                    className="px-4 py-1.5 bg-ink text-bone text-sm rounded-md disabled:opacity-50">
                    <Plus className="w-4 h-4 inline mr-1" />{mut.isPending ? "Adding…" : "Add"}
                </button>
            </div>
        </form>
    );
}
