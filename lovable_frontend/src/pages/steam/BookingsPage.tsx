import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, X, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  BookingRow,
  BookingStatus,
  ServiceType,
  apiErrorMessage,
  cancelBookingAdmin,
  downloadBookingsCsv,
  fetchAdminBookings,
} from "@/lib/steam";
import { fmtDateTime } from "@/lib/tz";
import { BookingDetailsDrawer } from "@/components/steam/BookingDetailsDrawer";

// Light-mode palette (admin SPA doesn't toggle dark on content area). Each status
// gets distinguishable background + foreground that stay readable on bg-card.
const STATUS_STYLES: Record<BookingStatus, string> = {
  pending:   "bg-yellow-100 text-yellow-900 border-yellow-300",
  confirmed: "bg-green-100  text-green-900  border-green-300",
  used:      "bg-blue-100   text-blue-900   border-blue-300",
  cancelled: "bg-gray-100   text-gray-700   border-gray-300",
  expired:   "bg-red-100    text-red-900    border-red-300",
};

function StatusBadge({ s }: { s: BookingStatus }) {
  return <span className={`inline-block text-xs px-2 py-0.5 rounded-md border ${STATUS_STYLES[s]}`}>{s}</span>;
}

function confirmAction(title: string, label: string, onConfirm: () => void) {
  toast.warning(title, {
    duration: 8000,
    action: { label, onClick: onConfirm },
    cancel: { label: "Cancel", onClick: () => {} },
  });
}

export default function BookingsPage() {
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<string>("all");
  const [service, setService] = useState<"all" | ServiceType>("all");
  const [email, setEmail] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const limit = 50;

  const filters = {
    status: status === "all" ? undefined : status,
    service: service === "all" ? undefined : service,
    email: email.trim() || undefined,
    from: from || undefined,
    to: to || undefined,
    limit,
    offset: page * limit,
  };

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["steam-bookings-admin", filters],
    queryFn: () => fetchAdminBookings(filters),
  });

  const cancelM = useMutation({
    mutationFn: cancelBookingAdmin,
    onSuccess: () => {
      toast.success("Booking cancelled (cancellation email queued if Resend configured)");
      queryClient.invalidateQueries({ queryKey: ["steam-bookings-admin"] });
      queryClient.invalidateQueries({ queryKey: ["steam-slots-admin"] });
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Cancel failed")),
  });

  const items = data?.items ?? [];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Bookings</h1>

      <Card className="p-4 mb-4 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Status</label>
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(0); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="pending,confirmed,used">Active</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="used">Used</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Service</label>
            <Select value={service} onValueChange={(v) => { setService(v as "all" | ServiceType); setPage(0); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="steam">Steam</SelectItem>
                <SelectItem value="massage">Massage</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Email contains</label>
            <Input value={email} onChange={(e) => { setEmail(e.target.value); setPage(0); }} placeholder="guest@…" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">From</label>
            <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">To</label>
            <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(0); }} />
          </div>
        </div>
        <div className="flex justify-end gap-2 items-center">
          <span className="text-xs text-muted-foreground mr-auto">Export pulls all rows matching the current filters, not just this page.</span>
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="w-4 h-4 mr-1" />Refresh</Button>
          <Button variant="outline" size="sm" onClick={() => downloadBookingsCsv(filters)}>
            <Download className="w-4 h-4 mr-1" />Export CSV
          </Button>
        </div>
      </Card>

      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Service</TableHead>
              <TableHead>Slot</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
            )}
            {!isLoading && items.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No bookings match.</TableCell></TableRow>
            )}
            {items.map((b: BookingRow) => (
              <TableRow
                key={b.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => setOpenId(b.id)}
              >
                <TableCell className="font-mono text-xs">{b.code}</TableCell>
                <TableCell><Badge variant="secondary">{b.service_type}</Badge></TableCell>
                <TableCell className="text-xs">{fmtDateTime(b.slot_starts_at)}</TableCell>
                <TableCell className="text-xs">{b.guest_email}</TableCell>
                <TableCell><StatusBadge s={b.status} /></TableCell>
                <TableCell className="text-xs">{fmtDateTime(b.created_at)}</TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  {(b.status === "pending" || b.status === "confirmed") && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Cancel booking"
                      title="Cancel booking"
                      disabled={cancelM.isPending}
                      onClick={() => confirmAction(`Cancel booking ${b.code}?`, "Cancel booking", () => cancelM.mutate(b.id))}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <div className="flex justify-between mt-4 text-sm">
        <span className="text-muted-foreground">
          {data ? `Showing ${data.offset + 1}–${data.offset + items.length}` : ""}
        </span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>Prev</Button>
          <Button variant="outline" size="sm" disabled={!data?.has_next} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      </div>

      <BookingDetailsDrawer bookingId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
