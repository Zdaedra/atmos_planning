import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Copy, RefreshCw, Trash2, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  StaffRow,
  apiErrorMessage,
  createStaff,
  deactivateStaff,
  fetchSettings,
  fetchStaff,
  reissueStaff,
} from "@/lib/steam";
import { fmtDateTime } from "@/lib/tz";

function confirmAction(title: string, label: string, onConfirm: () => void) {
  toast.warning(title, {
    duration: 8000,
    action: { label, onClick: onConfirm },
    cancel: { label: "Cancel", onClick: () => {} },
  });
}

function MagicLinkModal({
  staff, onClose,
}: { staff: StaffRow; onClose: () => void }) {
  const url = staff.activation_url;

  const copy = () => {
    if (!url) return;
    navigator.clipboard.writeText(url).then(
      () => toast.success("Link copied"),
      () => toast.error("Copy failed — select and copy manually"),
    );
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Magic link for {staff.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Send this link to {staff.name} on the phone they'll use at the entrance.
            It works only once — tapping it activates a 24-hour scanner session.
          </p>
          <Card className="p-3">
            <code className="text-xs break-all">{url ?? "(no activation token)"}</code>
          </Card>
          <div className="flex gap-2">
            <Button onClick={copy} disabled={!url}><Copy className="w-4 h-4 mr-1" />Copy</Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function StaffPage() {
  const queryClient = useQueryClient();
  const { data: staff = [], isLoading } = useQuery({
    queryKey: ["steam-staff"],
    queryFn: fetchStaff,
  });
  const { data: settings } = useQuery({
    queryKey: ["steam-settings"],
    queryFn: fetchSettings,
  });

  const publicUrlSet = !!settings?.public_url?.trim();

  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [showLinkFor, setShowLinkFor] = useState<StaffRow | null>(null);

  const createM = useMutation({
    mutationFn: () => createStaff(name.trim()),
    onSuccess: (row) => {
      setName("");
      setAddOpen(false);
      setShowLinkFor(row);
      queryClient.invalidateQueries({ queryKey: ["steam-staff"] });
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Create failed")),
  });

  const reissueM = useMutation({
    mutationFn: reissueStaff,
    onSuccess: (row) => {
      toast.success("New activation link generated");
      setShowLinkFor(row);
      queryClient.invalidateQueries({ queryKey: ["steam-staff"] });
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Reissue failed")),
  });

  const deactivateM = useMutation({
    mutationFn: deactivateStaff,
    onSuccess: () => {
      toast.success("Staff deactivated");
      queryClient.invalidateQueries({ queryKey: ["steam-staff"] });
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Deactivate failed")),
  });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">Door staff</h1>
        <Button
          onClick={() => setAddOpen(true)}
          disabled={!publicUrlSet}
          title={publicUrlSet ? undefined : "Set Public guest URL in Settings before adding staff"}
        >
          <Plus className="w-4 h-4 mr-1" />Add staff
        </Button>
      </div>

      {!publicUrlSet && (
        <Card className="p-4 mb-4 border-red-300 bg-red-50">
          <div className="flex gap-3 items-start">
            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
            <div className="text-sm">
              <div className="font-medium text-red-900">Public guest URL is not set.</div>
              <div className="text-red-800 mt-1">
                Magic-link activation URLs are built from <code className="text-xs">settings.public_url</code>. Without it,
                copying a link gives the host a non-tappable URL. Go to <strong>Settings → Email (Resend)</strong> and fill in
                Public guest URL (e.g. <code className="text-xs">https://book.yourdomain.com</code>) before adding staff.
              </div>
            </div>
          </div>
        </Card>
      )}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Session</TableHead>
              <TableHead>Last seen</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>}
            {!isLoading && staff.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No staff yet.</TableCell></TableRow>
            )}
            {staff.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>
                  <Badge variant={s.status === "active" ? "default" : "secondary"}>{s.status}</Badge>
                </TableCell>
                <TableCell>
                  {s.has_active_session
                    ? <Badge variant="default">Active</Badge>
                    : <span className="text-xs text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {fmtDateTime(s.last_seen_at)}
                </TableCell>
                <TableCell className="text-right space-x-1">
                  {s.status === "active" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Reissue activation link"
                      title="Reissue activation link"
                      disabled={reissueM.isPending}
                      onClick={() => reissueM.mutate(s.id)}
                    >
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                  )}
                  {s.status === "active" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Deactivate staff"
                      title="Deactivate (revokes session)"
                      disabled={deactivateM.isPending}
                      onClick={() => confirmAction(
                        `Deactivate ${s.name}? Their active session will be revoked.`,
                        "Deactivate",
                        () => deactivateM.mutate(s.id),
                      )}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add door staff</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Anya" autoFocus />
            </div>
            <p className="text-xs text-muted-foreground">
              The next screen shows a one-time magic link. Send it to the staff member's phone (WhatsApp/copy-paste).
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button disabled={!name.trim() || createM.isPending} onClick={() => createM.mutate()}>
              {createM.isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showLinkFor && <MagicLinkModal staff={showLinkFor} onClose={() => setShowLinkFor(null)} />}
    </div>
  );
}
