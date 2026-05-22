import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, X as XIcon, Mail } from "lucide-react";

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
    BookingStatus,
    apiErrorMessage,
    cancelBookingAdmin,
    fetchBookingDetail,
    fetchSettings,
} from "@/lib/steam";
import { fmtDateTime } from "@/lib/tz";

const STATUS_STYLES: Record<BookingStatus, string> = {
    pending:   "bg-yellow-100 text-yellow-900 border-yellow-300",
    confirmed: "bg-green-100  text-green-900  border-green-300",
    used:      "bg-blue-100   text-blue-900   border-blue-300",
    cancelled: "bg-gray-100   text-gray-700   border-gray-300",
    expired:   "bg-red-100    text-red-900    border-red-300",
};

const EVENT_LABELS: Record<string, string> = {
    booking_created: "Booking created",
    booking_failed: "Booking attempt failed",
    email_sent: "Email sent",
    email_delivered: "Email delivered",
    email_bounced: "Email bounced",
    email_complained: "Email marked as spam",
    booking_cancelled_by_guest: "Cancelled by guest",
    booking_cancelled_by_admin: "Cancelled by admin",
    qr_scan_success: "QR scan ✓ checked in",
    qr_scan_rejected: "QR scan ✗ rejected",
};

const QR_BASE = "https://api.trypranaextract.com/steam/qr";

function confirmAction(title: string, label: string, onConfirm: () => void) {
    toast.warning(title, {
        duration: 8000,
        action: { label, onClick: onConfirm },
        cancel: { label: "Cancel", onClick: () => {} },
    });
}

export function BookingDetailsDrawer({
    bookingId,
    onClose,
}: {
    bookingId: string | null;
    onClose: () => void;
}) {
    const queryClient = useQueryClient();
    const open = !!bookingId;

    const { data, isLoading } = useQuery({
        queryKey: ["steam-booking-detail", bookingId],
        queryFn: () => fetchBookingDetail(bookingId!),
        enabled: !!bookingId,
    });
    const { data: settings } = useQuery({
        queryKey: ["steam-settings"],
        queryFn: fetchSettings,
    });

    const cancelM = useMutation({
        mutationFn: cancelBookingAdmin,
        onSuccess: () => {
            toast.success("Booking cancelled");
            queryClient.invalidateQueries({ queryKey: ["steam-bookings-admin"] });
            queryClient.invalidateQueries({ queryKey: ["steam-booking-detail"] });
            queryClient.invalidateQueries({ queryKey: ["steam-slots-admin"] });
        },
        onError: (e) => toast.error(apiErrorMessage(e, "Cancel failed")),
    });

    const b = data?.booking;
    const slot = data?.slot;
    const events = data?.events ?? [];

    const cancelUrl = b && settings?.public_url
        ? `${settings.public_url.replace(/\/$/, "")}/cancel/${b.cancel_token}`
        : null;

    const copy = async (text: string, label: string) => {
        try {
            await navigator.clipboard.writeText(text);
            toast.success(`${label} copied`);
        } catch {
            toast.error("Copy failed");
        }
    };

    return (
        <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
            <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
                <SheetHeader>
                    <SheetTitle>Booking details</SheetTitle>
                    <SheetDescription>{b?.code ?? bookingId}</SheetDescription>
                </SheetHeader>

                {isLoading && <div className="mt-6 text-sm text-muted-foreground">Loading…</div>}

                {b && (
                    <div className="mt-6 space-y-5">
                        <div className="flex items-center gap-2">
                            <span className={`inline-block text-xs px-2 py-0.5 rounded-md border ${STATUS_STYLES[b.status]}`}>{b.status}</span>
                            <Badge variant="secondary">{b.service_type}</Badge>
                            <code className="font-mono text-xs">{b.code}</code>
                        </div>

                        {/* QR — only meaningful when the guest can actually use it. Show
                            for confirmed (and pending — same token will work after delivery).
                            For used/cancelled/expired we hide it. */}
                        {(b.status === "confirmed" || b.status === "pending") && (
                            <div className="flex justify-center bg-white p-4 rounded-lg border">
                                <img
                                    src={`${QR_BASE}/${b.qr_token}.png`}
                                    alt={`QR for booking ${b.code}`}
                                    className="w-48 h-48"
                                />
                            </div>
                        )}

                        <div className="space-y-1 text-sm">
                            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Slot</div>
                            {slot ? (
                                <>
                                    <div>{fmtDateTime(slot.starts_at)} → {fmtDateTime(slot.ends_at)}</div>
                                    <div className="text-muted-foreground text-xs">
                                        {slot.booked_count}/{slot.capacity} booked
                                        {slot.therapist ? ` · ${slot.therapist}` : ""}
                                        {slot.room ? ` · ${slot.room}` : ""}
                                        {slot.variant ? ` · ${slot.variant}` : ""}
                                    </div>
                                </>
                            ) : <div className="text-muted-foreground">Slot missing (data integrity issue)</div>}
                        </div>

                        <Separator />

                        <div className="space-y-1 text-sm">
                            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Guest</div>
                            <div>{b.guest_name ?? <span className="text-muted-foreground">no name</span>}</div>
                            <div className="text-muted-foreground">{b.guest_email}</div>
                            {b.device_fingerprint && (
                                <div className="text-xs text-muted-foreground font-mono">fp: {b.device_fingerprint.slice(0, 20)}…</div>
                            )}
                        </div>

                        <Separator />

                        <div className="space-y-2 text-sm">
                            <div className="text-xs uppercase tracking-wide text-muted-foreground">Timeline</div>
                            <Timeline
                                createdAt={b.created_at}
                                confirmedAt={b.confirmed_at}
                                cancelledAt={b.cancelled_at}
                                enteredAt={b.entered_at}
                                events={events}
                            />
                        </div>

                        <Separator />

                        <div className="space-y-2">
                            <div className="text-xs uppercase tracking-wide text-muted-foreground">Actions</div>
                            {(b.status === "pending" || b.status === "confirmed") && (
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    disabled={cancelM.isPending}
                                    onClick={() => confirmAction(`Cancel booking ${b.code}? Guest gets a cancellation email if Resend is configured.`, "Cancel", () => cancelM.mutate(b.id))}
                                >
                                    <XIcon className="w-4 h-4 mr-1" />Cancel booking
                                </Button>
                            )}
                            {cancelUrl && (
                                <Button variant="outline" size="sm" onClick={() => copy(cancelUrl, "Cancel link")}>
                                    <Copy className="w-4 h-4 mr-1" />Copy guest's cancel link
                                </Button>
                            )}
                            <Button variant="outline" size="sm" onClick={() => copy(`${QR_BASE}/${b.qr_token}.png`, "QR URL")}>
                                <Mail className="w-4 h-4 mr-1" />Copy QR image URL
                            </Button>
                        </div>
                    </div>
                )}
            </SheetContent>
        </Sheet>
    );
}

function Timeline({
    createdAt, confirmedAt, cancelledAt, enteredAt, events,
}: {
    createdAt: string;
    confirmedAt: string | null;
    cancelledAt: string | null;
    enteredAt: string | null;
    events: Array<{ event_type: string; properties: Record<string, unknown>; created_at: string | null }>;
}) {
    // Merge booking timestamps with event log into a single sorted timeline.
    type Row = { at: string; label: string; sub?: string };
    const rows: Row[] = [];

    if (createdAt) rows.push({ at: createdAt, label: "Created" });
    if (confirmedAt) rows.push({ at: confirmedAt, label: "Confirmed" });
    if (enteredAt) rows.push({ at: enteredAt, label: "Checked in" });
    if (cancelledAt) rows.push({ at: cancelledAt, label: "Cancelled" });
    events.forEach((e) => {
        if (!e.created_at) return;
        const label = EVENT_LABELS[e.event_type] ?? e.event_type;
        const reason = e.properties?.reason;
        rows.push({
            at: e.created_at,
            label,
            sub: reason ? `reason: ${reason}` : undefined,
        });
    });

    rows.sort((a, b) => a.at.localeCompare(b.at));

    if (rows.length === 0) {
        return <div className="text-xs text-muted-foreground">No events yet.</div>;
    }

    return (
        <ol className="space-y-2">
            {rows.map((r, i) => (
                <li key={i} className="text-xs flex gap-3">
                    <span className="text-muted-foreground tabular-nums w-32 shrink-0">{fmtDateTime(r.at)}</span>
                    <span>
                        {r.label}
                        {r.sub && <span className="text-muted-foreground"> · {r.sub}</span>}
                    </span>
                </li>
            ))}
        </ol>
    );
}
