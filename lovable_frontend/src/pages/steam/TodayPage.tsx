import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, RefreshCw, Flame, HandHeart, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BookingStatus, DaySlot, ServiceType, fetchDay } from "@/lib/steam";
import { LOCATION_TZ, fmtTime } from "@/lib/tz";
import { BookingDetailsDrawer } from "@/components/steam/BookingDetailsDrawer";

/** YYYY-MM-DD in Bali tz */
function todayKey(): string {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: LOCATION_TZ, year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(new Date());
    const m: Record<string, string> = {};
    parts.forEach(p => { if (p.type !== "literal") m[p.type] = p.value; });
    return `${m.year}-${m.month}-${m.day}`;
}

function shiftDate(key: string, days: number): string {
    const d = new Date(key + "T12:00:00Z"); // mid-day UTC to avoid TZ edges
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

export default function TodayPage() {
    const [date, setDate] = useState<string>(todayKey());
    const [service, setService] = useState<"all" | ServiceType>("all");
    const [openBookingId, setOpenBookingId] = useState<string | null>(null);

    const { data, isLoading, isFetching, refetch } = useQuery({
        queryKey: ["steam-day", date, service],
        queryFn: () => fetchDay(date, service === "all" ? undefined : service),
        refetchInterval: 30_000,
    });

    const now = new Date();
    const twoHours = 2 * 60 * 60 * 1000;

    const totalActive = useMemo(() => {
        if (!data) return 0;
        return data.stats.steam.active_bookings + data.stats.massage.active_bookings;
    }, [data]);

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-2 gap-2">
                <h1 className="text-2xl font-semibold">{relativeLabel(date)}</h1>
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
            </div>
            <p className="text-xs text-muted-foreground mb-4">Times in {LOCATION_TZ}</p>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3 mb-4">
                <StatCard
                    icon={<Flame className="w-4 h-4" />}
                    label="Steam"
                    slots={data?.stats.steam.slots ?? 0}
                    bookings={data?.stats.steam.active_bookings ?? 0}
                />
                <StatCard
                    icon={<HandHeart className="w-4 h-4" />}
                    label="Massage"
                    slots={data?.stats.massage.slots ?? 0}
                    bookings={data?.stats.massage.active_bookings ?? 0}
                />
                <StatCard
                    icon={<Users className="w-4 h-4" />}
                    label="Total guests"
                    slots={(data?.stats.steam.slots ?? 0) + (data?.stats.massage.slots ?? 0)}
                    bookings={totalActive}
                    primary
                />
            </div>

            <div className="flex items-center gap-2 mb-4">
                <Select value={service} onValueChange={(v) => setService(v as "all" | ServiceType)}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All services</SelectItem>
                        <SelectItem value="steam">Steam</SelectItem>
                        <SelectItem value="massage">Massage</SelectItem>
                    </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
                    <RefreshCw className={`w-4 h-4 mr-1 ${isFetching ? "animate-spin" : ""}`} />
                    Refresh
                </Button>
                <span className="text-xs text-muted-foreground ml-auto">Auto-refresh 30s</span>
            </div>

            {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}

            {data && data.slots.length === 0 && (
                <Card className="p-6 text-center text-sm text-muted-foreground">
                    No slots scheduled for {relativeLabel(date)}.
                </Card>
            )}

            <div className="space-y-3">
                {data?.slots.map((slot) => {
                    const startsMs = new Date(slot.starts_at).getTime();
                    const isPast = startsMs < now.getTime();
                    const isUpcoming = !isPast && startsMs - now.getTime() < twoHours;
                    return (
                        <SlotCard
                            key={slot.id}
                            slot={slot}
                            isPast={isPast}
                            isUpcoming={isUpcoming}
                            onOpenBooking={(id) => setOpenBookingId(id)}
                        />
                    );
                })}
            </div>

            <BookingDetailsDrawer bookingId={openBookingId} onClose={() => setOpenBookingId(null)} />
        </div>
    );
}

function StatCard({
    icon, label, slots, bookings, primary = false,
}: { icon: React.ReactNode; label: string; slots: number; bookings: number; primary?: boolean }) {
    return (
        <Card className={`p-4 ${primary ? "bg-foreground text-background" : ""}`}>
            <div className={`flex items-center gap-2 text-xs uppercase tracking-wide ${primary ? "text-background/70" : "text-muted-foreground"}`}>
                {icon}{label}
            </div>
            <div className="mt-2 flex items-baseline gap-3">
                <span className="text-3xl font-semibold tabular-nums">{bookings}</span>
                <span className={`text-xs ${primary ? "text-background/70" : "text-muted-foreground"}`}>
                    bookings · {slots} slots
                </span>
            </div>
        </Card>
    );
}

function SlotCard({
    slot, isPast, isUpcoming, onOpenBooking,
}: {
    slot: DaySlot;
    isPast: boolean;
    isUpcoming: boolean;
    onOpenBooking: (id: string) => void;
}) {
    const remaining = slot.capacity - slot.booked_count;
    const full = remaining <= 0;
    const visibleBookings = slot.bookings.filter(b => b.status !== "expired");

    return (
        <Card className={`p-4 ${isUpcoming ? "ring-2 ring-amber-400/60" : ""} ${isPast ? "opacity-60" : ""}`}>
            <div className="flex items-baseline gap-3 mb-2 flex-wrap">
                <span className="text-xl font-semibold tabular-nums">{fmtTime(slot.starts_at)}</span>
                <Badge variant={slot.service_type === "steam" ? "default" : "secondary"}>
                    {slot.service_type}
                </Badge>
                <span className="text-sm text-muted-foreground">
                    {slot.booked_count}/{slot.capacity} {full ? "· FULL" : `· ${remaining} left`}
                </span>
                {slot.status === "closed" && <Badge variant="outline" className="bg-red-100 text-red-900 border-red-300">closed</Badge>}
                {slot.is_override && <Badge variant="outline">override</Badge>}
                {isUpcoming && <Badge className="bg-amber-100 text-amber-900 border-amber-300">starts soon</Badge>}
                {slot.therapist && <span className="text-xs text-muted-foreground">· {slot.therapist}</span>}
                {slot.room && <span className="text-xs text-muted-foreground">· {slot.room}</span>}
                {slot.variant && <span className="text-xs text-muted-foreground">· {slot.variant}</span>}
            </div>

            {/* Capacity progress bar */}
            <div className="h-1.5 bg-muted rounded mb-3 overflow-hidden">
                <div
                    className={`h-full ${full ? "bg-red-500" : "bg-foreground/70"}`}
                    style={{ width: `${(slot.booked_count / slot.capacity) * 100}%` }}
                />
            </div>

            {visibleBookings.length === 0 ? (
                <div className="text-xs text-muted-foreground">No bookings yet.</div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                    {visibleBookings.map((b) => (
                        <button
                            key={b.id}
                            onClick={() => onOpenBooking(b.id)}
                            className="text-left flex items-center justify-between gap-2 p-2 rounded hover:bg-muted/60 focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                            <div className="min-w-0 flex-1">
                                <div className="text-sm truncate">{b.guest_name ?? b.guest_email}</div>
                                <div className="text-xs text-muted-foreground truncate">
                                    {b.guest_name ? b.guest_email : ""}
                                </div>
                            </div>
                            <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded border ${STATUS_STYLES[b.status]}`}>
                                {b.status}
                            </span>
                            <code className="shrink-0 text-xs font-mono text-muted-foreground">{b.code}</code>
                        </button>
                    ))}
                </div>
            )}
        </Card>
    );
}
