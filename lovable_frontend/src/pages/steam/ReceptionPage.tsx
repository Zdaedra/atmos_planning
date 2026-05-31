import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, RefreshCw, Plus, X, ChevronDown, ChevronUp, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
    BookingStatus,
    DayBooking,
    DaySlot,
    ServiceType,
    apiErrorMessage,
    cancelBookingAdmin,
    createWalkin,
    fetchDay,
} from "@/lib/steam";
import { LOCATION_TZ, fmtTime } from "@/lib/tz";
import { BookingDetailsDrawer } from "@/components/steam/BookingDetailsDrawer";

function todayKey(): string {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: LOCATION_TZ, year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(new Date());
    const m: Record<string, string> = {};
    parts.forEach(p => { if (p.type !== "literal") m[p.type] = p.value; });
    return `${m.year}-${m.month}-${m.day}`;
}

function shiftDate(key: string, days: number): string {
    const d = new Date(key + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

function relativeLabel(key: string): string {
    const today = todayKey();
    const tomorrow = shiftDate(today, 1);
    const yesterday = shiftDate(today, -1);
    if (key === today) return "Today";
    if (key === tomorrow) return "Tomorrow";
    if (key === yesterday) return "Yesterday";
    return new Date(key + "T12:00:00Z").toLocaleDateString("en-US", {
        weekday: "long", month: "long", day: "numeric",
    });
}

const STATUS_STYLES: Record<BookingStatus, string> = {
    pending:   "bg-yellow-100 text-yellow-900 border-yellow-300",
    confirmed: "bg-green-100  text-green-900  border-green-300",
    used:      "bg-blue-100   text-blue-900   border-blue-300",
    cancelled: "bg-gray-100   text-gray-500   border-gray-300 line-through",
    expired:   "bg-red-100    text-red-900    border-red-300",
};

function confirmAction(title: string, label: string, onConfirm: () => void) {
    toast.warning(title, {
        duration: 8000,
        action: { label, onClick: onConfirm },
        cancel: { label: "Cancel", onClick: () => {} },
    });
}

export default function ReceptionPage() {
    const [date, setDate] = useState<string>(todayKey());
    const [service, setService] = useState<ServiceType>("steam");
    const [openBookingId, setOpenBookingId] = useState<string | null>(null);
    const [expandedSlotId, setExpandedSlotId] = useState<string | null>(null);
    const [search, setSearch] = useState("");

    const { data, isLoading, isFetching, refetch } = useQuery({
        queryKey: ["steam-day", date, service],
        queryFn: () => fetchDay(date, service),
        refetchInterval: 30_000,
    });

    const slots = data?.slots ?? [];
    const stats = data?.stats[service];

    // Global guest search across all bookings on this day.
    const searchLower = search.trim().toLowerCase();
    const matchingSlots = useMemo(() => {
        if (!searchLower) return slots;
        return slots
            .map((s) => ({
                ...s,
                bookings: s.bookings.filter((b) =>
                    (b.guest_name ?? "").toLowerCase().includes(searchLower) ||
                    b.guest_email.toLowerCase().includes(searchLower) ||
                    b.code.toLowerCase().includes(searchLower),
                ),
            }))
            .filter((s) => s.bookings.length > 0);
    }, [slots, searchLower]);

    return (
        <div className="p-6 max-w-5xl mx-auto">
            {/* Header — date pager + service toggle */}
            <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" aria-label="Previous day"
                        onClick={() => setDate(d => shiftDate(d, -1))}>
                        <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="w-40"
                    />
                    <Button variant="outline" size="icon" aria-label="Next day"
                        onClick={() => setDate(d => shiftDate(d, 1))}>
                        <ChevronRight className="w-4 h-4" />
                    </Button>
                    {date !== todayKey() && (
                        <Button variant="ghost" size="sm" onClick={() => setDate(todayKey())}>Today</Button>
                    )}
                </div>
                <h1 className="text-2xl font-semibold">{relativeLabel(date)}</h1>
            </div>

            {/* Mandatory service tabs — staff always picks one */}
            <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
                <div className="flex gap-1 bg-muted rounded-lg p-1">
                    <button
                        onClick={() => setService("steam")}
                        className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
                            service === "steam" ? "bg-foreground text-background shadow-sm" : "text-foreground/60 hover:text-foreground"
                        }`}
                    >
                        🔥 Steam
                    </button>
                    <button
                        onClick={() => setService("massage")}
                        className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
                            service === "massage" ? "bg-foreground text-background shadow-sm" : "text-foreground/60 hover:text-foreground"
                        }`}
                    >
                        💆 Massage
                    </button>
                </div>
                <div className="flex items-center gap-2 ml-auto">
                    {stats && (
                        <span className="text-xs text-muted-foreground">
                            <strong className="text-foreground">{stats.active_bookings}</strong> bookings · {stats.slots} slots
                        </span>
                    )}
                    <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
                        <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
                    </Button>
                </div>
            </div>

            {/* Search across day's guests */}
            <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search guest by name, email, or code…"
                className="mb-4"
            />

            {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}

            {!isLoading && matchingSlots.length === 0 && (
                <Card className="p-6 text-center text-sm text-muted-foreground">
                    {searchLower ? "No guests match the search." : `No ${service} slots scheduled for ${relativeLabel(date)}.`}
                </Card>
            )}

            <div className="space-y-2">
                {matchingSlots.map((slot) => (
                    <SlotRow
                        key={slot.id}
                        slot={slot}
                        expanded={expandedSlotId === slot.id || !!searchLower}
                        onToggle={() => setExpandedSlotId(expandedSlotId === slot.id ? null : slot.id)}
                        onOpenBooking={(id) => setOpenBookingId(id)}
                    />
                ))}
            </div>

            <BookingDetailsDrawer bookingId={openBookingId} onClose={() => setOpenBookingId(null)} />
        </div>
    );
}

function SlotRow({
    slot, expanded, onToggle, onOpenBooking,
}: {
    slot: DaySlot;
    expanded: boolean;
    onToggle: () => void;
    onOpenBooking: (id: string) => void;
}) {
    const remaining = slot.capacity - slot.booked_count;
    const full = remaining <= 0;
    const visibleBookings = slot.bookings.filter(b => b.status !== "expired" && b.status !== "cancelled");

    return (
        <Card className="overflow-hidden">
            <button
                onClick={onToggle}
                className="w-full flex items-center gap-4 p-4 hover:bg-muted/40 transition text-left"
            >
                <span className="text-xl font-semibold tabular-nums shrink-0">{fmtTime(slot.starts_at)}</span>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm">{slot.booked_count}/{slot.capacity}</span>
                        {full ? (
                            <Badge variant="outline" className="bg-red-100 text-red-900 border-red-300">FULL</Badge>
                        ) : (
                            <span className="text-xs text-muted-foreground">{remaining} {remaining === 1 ? "spot" : "spots"} left</span>
                        )}
                        {slot.status === "closed" && <Badge variant="outline">closed</Badge>}
                        {slot.therapist && <span className="text-xs text-muted-foreground">· {slot.therapist}</span>}
                        {slot.variant && <span className="text-xs text-muted-foreground">· {slot.variant}</span>}
                    </div>
                </div>
                {/* Capacity bar — mini */}
                <div className="w-16 h-1.5 bg-muted rounded overflow-hidden shrink-0">
                    <div
                        className={`h-full ${full ? "bg-red-500" : "bg-foreground/70"}`}
                        style={{ width: `${(slot.booked_count / slot.capacity) * 100}%` }}
                    />
                </div>
                {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                         : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
            </button>

            {expanded && (
                <div className="border-t bg-muted/20 px-4 py-3 space-y-2">
                    {visibleBookings.length === 0 && (
                        <p className="text-xs text-muted-foreground">No bookings yet.</p>
                    )}
                    {visibleBookings.map((b) => (
                        <GuestRow key={b.id} booking={b} onOpenDetails={() => onOpenBooking(b.id)} />
                    ))}
                    {!full && slot.status === "open" && (
                        <WalkinForm slotId={slot.id} disabledMessage={undefined} />
                    )}
                </div>
            )}
        </Card>
    );
}

function GuestRow({ booking, onOpenDetails }: { booking: DayBooking; onOpenDetails: () => void }) {
    const queryClient = useQueryClient();
    const cancelM = useMutation({
        mutationFn: () => cancelBookingAdmin(booking.id),
        onSuccess: () => {
            toast.success(`${booking.guest_name ?? booking.guest_email} cancelled`);
            queryClient.invalidateQueries({ queryKey: ["steam-day"] });
            queryClient.invalidateQueries({ queryKey: ["steam-bookings-admin"] });
            queryClient.invalidateQueries({ queryKey: ["steam-slots-admin"] });
        },
        onError: (e) => toast.error(apiErrorMessage(e, "Cancel failed")),
    });

    const isWalkin = booking.guest_email.endsWith("@local.atmos");

    return (
        <div className="flex items-center gap-2 p-2 bg-background rounded-md border">
            <button onClick={onOpenDetails} className="flex-1 min-w-0 text-left">
                <div className="text-sm font-medium truncate">
                    {booking.guest_name ?? booking.guest_email}
                    {isWalkin && <Badge variant="outline" className="ml-2 text-[10px]">walk-in</Badge>}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                    {!isWalkin && booking.guest_email !== booking.guest_name && booking.guest_email}
                    {booking.guest_email !== booking.guest_name && !isWalkin ? " · " : ""}
                    <code className="font-mono">{booking.code}</code>
                </div>
            </button>
            <span className={`shrink-0 text-xs px-2 py-0.5 rounded border ${STATUS_STYLES[booking.status]}`}>
                {booking.status}
            </span>
            <Button
                variant="ghost"
                size="icon"
                aria-label="Cancel booking"
                title="Cancel"
                disabled={cancelM.isPending}
                onClick={() => confirmAction(
                    `Remove ${booking.guest_name ?? booking.guest_email} from this slot?`,
                    "Remove",
                    () => cancelM.mutate(),
                )}
            >
                <X className="w-4 h-4" />
            </Button>
        </div>
    );
}

function WalkinForm({ slotId, disabledMessage }: { slotId: string; disabledMessage?: string }) {
    const queryClient = useQueryClient();
    const [show, setShow] = useState(false);
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");

    const mut = useMutation({
        mutationFn: () => createWalkin(slotId, name.trim(), email.trim() || undefined),
        onSuccess: () => {
            toast.success(`${name.trim()} added`);
            setName(""); setEmail(""); setShow(false);
            queryClient.invalidateQueries({ queryKey: ["steam-day"] });
            queryClient.invalidateQueries({ queryKey: ["steam-slots-admin"] });
        },
        onError: (e) => toast.error(apiErrorMessage(e, "Walk-in failed")),
    });

    if (disabledMessage) {
        return <p className="text-xs text-muted-foreground italic">{disabledMessage}</p>;
    }

    if (!show) {
        return (
            <Button variant="outline" size="sm" onClick={() => setShow(true)} className="w-full">
                <UserPlus className="w-4 h-4 mr-1" />Add walk-in guest
            </Button>
        );
    }

    return (
        <form
            onSubmit={(e) => { e.preventDefault(); if (name.trim()) mut.mutate(); }}
            className="space-y-2 bg-background rounded-md border p-3"
        >
            <div className="grid grid-cols-2 gap-2">
                <div>
                    <Label className="text-xs">Name *</Label>
                    <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Anya Smirnova"
                        autoFocus
                        required
                    />
                </div>
                <div>
                    <Label className="text-xs">Email (optional)</Label>
                    <Input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="anya@…"
                    />
                </div>
            </div>
            <div className="flex gap-2 justify-end">
                <Button type="button" variant="ghost" size="sm" onClick={() => { setShow(false); setName(""); setEmail(""); }}>
                    Cancel
                </Button>
                <Button type="submit" size="sm" disabled={!name.trim() || mut.isPending}>
                    <Plus className="w-4 h-4 mr-1" />
                    {mut.isPending ? "Adding…" : "Add"}
                </Button>
            </div>
        </form>
    );
}
