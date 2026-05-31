import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pause, Trash2, RefreshCw, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import {
  CreateSlotPayload,
  CreateTemplatePayload,
  DayLimits,
  ServiceType,
  Slot,
  SlotTemplate,
  apiErrorMessage,
  createSlot,
  createTemplate,
  deleteDayOverride,
  deleteSlot,
  deleteTemplate,
  fetchAdminBookings,
  fetchAdminSlots,
  fetchCronStatus,
  fetchTemplates,
  pauseTemplate,
  previewTemplateDates,
  updateSlot,
  updateTemplate,
  upsertDayOverride,
} from "@/lib/steam";
import { LOCATION_TZ, fmtDateLong, fmtDateTime, fmtTime, isoToLocalInput, localInputToIso } from "@/lib/tz";
import { BookingDetailsDrawer } from "@/components/steam/BookingDetailsDrawer";

const ISO_DAYS = [
  { iso: 1, short: "Mon" },
  { iso: 2, short: "Tue" },
  { iso: 3, short: "Wed" },
  { iso: 4, short: "Thu" },
  { iso: 5, short: "Fri" },
  { iso: 6, short: "Sat" },
  { iso: 7, short: "Sun" },
];

function todayIsoInTz(tz: string = LOCATION_TZ): string {
  // YYYY-MM-DD in location tz
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const m: Record<string, string> = {};
  parts.forEach(p => { if (p.type !== "literal") m[p.type] = p.value; });
  return `${m.year}-${m.month}-${m.day}`;
}

function confirmAction(title: string, label: string, onConfirm: () => void) {
  toast.warning(title, {
    duration: 8000,
    action: { label, onClick: onConfirm },
    cancel: { label: "Cancel", onClick: () => {} },
  });
}

// ===========================================================================
// Templates tab
// ===========================================================================

interface TemplateFormState {
  name: string;
  service_type: ServiceType;
  days_of_week: number[];
  start_time: string;
  duration_minutes: number;
  capacity: number;
  starts_on: string;
  repeats_until: string;
  therapist: string;
  room: string;
  variant: string;
}

function emptyTemplate(): TemplateFormState {
  return {
    name: "", service_type: "steam", days_of_week: [], start_time: "18:00",
    duration_minutes: 90, capacity: 8, starts_on: todayIsoInTz(),
    repeats_until: "", therapist: "", room: "", variant: "",
  };
}

function templateToForm(t: SlotTemplate): TemplateFormState {
  return {
    name: t.name ?? "",
    service_type: t.service_type,
    days_of_week: t.days_of_week,
    start_time: t.start_time.slice(0, 5),
    duration_minutes: t.duration_minutes,
    capacity: t.capacity,
    starts_on: t.starts_on,
    repeats_until: t.repeats_until ?? "",
    therapist: t.therapist ?? "",
    room: t.room ?? "",
    variant: t.variant ?? "",
  };
}

function TemplateFormDialog({
  open,
  onOpenChange,
  initial,
  templateId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  initial?: SlotTemplate;
  templateId?: string;
  onCreated?: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<TemplateFormState>(() => initial ? templateToForm(initial) : emptyTemplate());
  const [previewDates, setPreviewDates] = useState<string[] | null>(null);

  // Re-hydrate form when the user re-opens the dialog on a different template
  // (without unmounting). Without this, edit-A → close → edit-B shows A's values.
  useEffect(() => {
    setForm(initial ? templateToForm(initial) : emptyTemplate());
    setPreviewDates(null);
  }, [initial?.id, open]);

  const set = <K extends keyof TemplateFormState>(k: K, v: TemplateFormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const toggleDay = (iso: number) =>
    setForm((f) => ({
      ...f,
      days_of_week: f.days_of_week.includes(iso)
        ? f.days_of_week.filter((d) => d !== iso)
        : [...f.days_of_week, iso].sort(),
    }));

  const payload = (): CreateTemplatePayload => ({
    name: form.name.trim() || null,
    service_type: form.service_type,
    days_of_week: form.days_of_week,
    start_time: `${form.start_time}:00`,
    duration_minutes: form.duration_minutes,
    capacity: form.capacity,
    starts_on: form.starts_on,
    repeats_until: form.repeats_until || null,
    therapist: form.therapist.trim() || null,
    room: form.room.trim() || null,
    variant: form.variant.trim() || null,
  });

  const mutationCreate = useMutation({
    mutationFn: () => createTemplate(payload()),
    onSuccess: () => {
      toast.success("Template created. Slots materialized — switch to Slots tab to view.");
      queryClient.invalidateQueries({ queryKey: ["steam-templates"] });
      queryClient.invalidateQueries({ queryKey: ["steam-slots-admin"] });
      onOpenChange(false);
      onCreated?.();
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Create failed")),
  });

  const mutationUpdate = useMutation({
    mutationFn: () => updateTemplate(templateId!, payload()),
    onSuccess: () => {
      toast.success("Template updated. Existing unbooked slots moved to new time/capacity.");
      queryClient.invalidateQueries({ queryKey: ["steam-templates"] });
      queryClient.invalidateQueries({ queryKey: ["steam-slots-admin"] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Update failed")),
  });

  const mutationPreview = useMutation({
    mutationFn: () =>
      previewTemplateDates({
        days_of_week: form.days_of_week,
        starts_on: form.starts_on,
        repeats_until: form.repeats_until || null,
        limit: 5,
      }),
    onSuccess: (r) => setPreviewDates(r.dates),
    onError: (e) => toast.error(apiErrorMessage(e, "Preview failed")),
  });

  const submit = () => {
    if (form.days_of_week.length === 0) {
      toast.error("Pick at least one weekday");
      return;
    }
    if (templateId) mutationUpdate.mutate();
    else mutationCreate.mutate();
  };

  const busy = mutationCreate.isPending || mutationUpdate.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{templateId ? "Edit template" : "New template"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Name (optional)</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Sunday evenings" />
            </div>
            <div>
              <Label>Service {templateId && <span className="text-xs text-muted-foreground">(can't change after create)</span>}</Label>
              <Select value={form.service_type} onValueChange={(v) => set("service_type", v as ServiceType)} disabled={!!templateId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="steam">Steam</SelectItem>
                  <SelectItem value="massage">Massage</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Days of week</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {ISO_DAYS.map((d) => {
                const active = form.days_of_week.includes(d.iso);
                return (
                  <button
                    key={d.iso}
                    type="button"
                    onClick={() => toggleDay(d.iso)}
                    aria-pressed={active}
                    aria-label={`Toggle ${d.short}`}
                    className={`px-3 py-1 rounded-md text-xs border focus:outline-none focus:ring-2 focus:ring-primary ${active ? "bg-primary text-primary-foreground border-primary" : "border-border text-foreground hover:bg-accent"}`}
                  >
                    {d.short}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Start time</Label>
              <Input type="time" value={form.start_time} onChange={(e) => set("start_time", e.target.value)} />
              <p className="text-xs text-muted-foreground mt-1">Bali time</p>
            </div>
            <div>
              <Label>Duration (min)</Label>
              <Input type="number" value={form.duration_minutes} onChange={(e) => set("duration_minutes", parseInt(e.target.value || "0", 10))} />
            </div>
            <div>
              <Label>Capacity</Label>
              <Input type="number" value={form.capacity} onChange={(e) => set("capacity", parseInt(e.target.value || "0", 10))} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Start date</Label>
              <Input type="date" value={form.starts_on} onChange={(e) => set("starts_on", e.target.value)} />
            </div>
            <div>
              <Label>End date (optional)</Label>
              <Input type="date" value={form.repeats_until} onChange={(e) => set("repeats_until", e.target.value)} placeholder="No end" />
            </div>
          </div>

          {form.service_type === "massage" && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Therapist</Label>
                <Input value={form.therapist} onChange={(e) => set("therapist", e.target.value)} placeholder="Anya" />
              </div>
              <div>
                <Label>Room</Label>
                <Input value={form.room} onChange={(e) => set("room", e.target.value)} placeholder="Room 2" />
              </div>
              <div>
                <Label>Variant</Label>
                <Input value={form.variant} onChange={(e) => set("variant", e.target.value)} placeholder="Deep tissue" />
              </div>
            </div>
          )}

          <div className="flex gap-2 items-center">
            <Button type="button" variant="outline" size="sm" onClick={() => mutationPreview.mutate()} disabled={form.days_of_week.length === 0}>
              Preview first 5 dates
            </Button>
            {previewDates && (
              <div className="text-xs text-muted-foreground">{previewDates.join(" · ")}</div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Saving…" : templateId ? "Save changes" : "Create + materialize"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TemplatesTab({ onTemplateCreated }: { onTemplateCreated: () => void }) {
  const queryClient = useQueryClient();
  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["steam-templates"],
    queryFn: fetchTemplates,
  });

  const [newOpen, setNewOpen] = useState(false);
  const [editTpl, setEditTpl] = useState<SlotTemplate | null>(null);

  const pauseM = useMutation({
    mutationFn: pauseTemplate,
    onSuccess: () => {
      toast.success("Template paused. Future unbooked slots removed; booked slots remain.");
      queryClient.invalidateQueries({ queryKey: ["steam-templates"] });
      queryClient.invalidateQueries({ queryKey: ["steam-slots-admin"] });
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Pause failed")),
  });

  const deleteM = useMutation({
    mutationFn: deleteTemplate,
    onSuccess: () => {
      toast.success("Template deleted");
      queryClient.invalidateQueries({ queryKey: ["steam-templates"] });
      queryClient.invalidateQueries({ queryKey: ["steam-slots-admin"] });
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Delete failed")),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setNewOpen(true)}><Plus className="w-4 h-4 mr-1" />Add template</Button>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {!isLoading && templates.length === 0 && (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          No templates yet. Create one to set up recurring sessions.
        </Card>
      )}

      <div className="space-y-2">
        {templates.map((t) => (
          <Card key={t.id} className="p-4 flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium truncate">{t.name || "(unnamed)"}</span>
                <Badge variant={t.service_type === "steam" ? "default" : "secondary"}>{t.service_type}</Badge>
                <Badge variant={t.status === "active" ? "default" : "outline"}>{t.status}</Badge>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {t.days_of_week.map(d => ISO_DAYS[d - 1]?.short).join(", ")} · {t.start_time.slice(0, 5)} · {t.duration_minutes} min · cap {t.capacity}
                {t.repeats_until ? ` · until ${t.repeats_until}` : " · no end"}
                {t.therapist ? ` · ${t.therapist}` : ""}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" aria-label="Edit template" title="Edit template" onClick={() => setEditTpl(t)}>
                <Pencil className="w-4 h-4" />
              </Button>
              {t.status === "active" && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Pause template"
                  title="Pause template"
                  disabled={pauseM.isPending}
                  onClick={() => confirmAction(
                    `Pause "${t.name || "(unnamed)"}"? Future unbooked slots will be removed.`,
                    "Pause",
                    () => pauseM.mutate(t.id),
                  )}
                >
                  <Pause className="w-4 h-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                aria-label="Delete template"
                title="Delete template"
                disabled={deleteM.isPending}
                onClick={() => confirmAction(
                  `Delete template "${t.name || "(unnamed)"}"? Only possible if it never had bookings — otherwise pause instead.`,
                  "Delete",
                  () => deleteM.mutate(t.id),
                )}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {newOpen && (
        <TemplateFormDialog
          key="new"
          open={newOpen}
          onOpenChange={setNewOpen}
          onCreated={onTemplateCreated}
        />
      )}
      {editTpl && (
        <TemplateFormDialog
          key={editTpl.id}
          open={!!editTpl}
          onOpenChange={(o) => { if (!o) setEditTpl(null); }}
          initial={editTpl}
          templateId={editTpl.id}
        />
      )}
    </div>
  );
}

// ===========================================================================
// Slots tab
// ===========================================================================

function slotColor(s: Slot): string {
  if (s.status === "closed") return "bg-red-500/15 border-red-500/30 line-through";
  if (s.is_override) return "bg-orange-500/15 border-orange-500/30";
  if (s.template_id) return "bg-blue-500/15 border-blue-500/30";
  return "bg-muted/40 border-border";
}

function SlotEditDialog({
  slot, open, onOpenChange, onOpenBooking,
}: {
  slot: Slot;
  open: boolean;
  onOpenChange: (b: boolean) => void;
  onOpenBooking: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const [capacity, setCapacity] = useState(slot.capacity);
  const [startsAt, setStartsAt] = useState(isoToLocalInput(slot.starts_at));
  const [endsAt, setEndsAt] = useState(isoToLocalInput(slot.ends_at));
  const [status, setStatus] = useState(slot.status);

  // Bookings on this slot — only fetched when there's actually capacity used.
  // Drives the "who's coming" question managers ask before every session.
  const { data: bookingsData } = useQuery({
    queryKey: ["steam-bookings-admin-by-slot", slot.id],
    queryFn: () => fetchAdminBookings({ slot_id: slot.id, limit: 200 }),
    enabled: slot.booked_count > 0,
  });
  const bookings = bookingsData?.items ?? [];

  const mut = useMutation({
    mutationFn: () => updateSlot(slot.id, {
      capacity,
      starts_at: localInputToIso(startsAt),
      ends_at: localInputToIso(endsAt),
      status,
    }),
    onSuccess: () => {
      toast.success("Slot updated");
      queryClient.invalidateQueries({ queryKey: ["steam-slots-admin"] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Update failed")),
  });

  const delMut = useMutation({
    mutationFn: () => deleteSlot(slot.id),
    onSuccess: () => {
      toast.success(slot.template_id ? "Slot closed (tombstoned)" : "Slot deleted");
      queryClient.invalidateQueries({ queryKey: ["steam-slots-admin"] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Delete failed")),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit slot</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div><Badge variant="secondary">{slot.service_type}</Badge> · {slot.booked_count}/{slot.capacity} booked</div>
          {slot.template_id && <div className="text-xs text-muted-foreground">From template. Editing pins this slot (is_override=true) so future re-materialization leaves it alone.</div>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Starts at <span className="text-xs text-muted-foreground">(Bali time)</span></Label>
              <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </div>
            <div>
              <Label>Ends at</Label>
              <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Capacity</Label>
              <Input type="number" value={capacity} onChange={(e) => setCapacity(parseInt(e.target.value || "0", 10))} />
              {capacity < slot.booked_count && (
                <p className="text-xs text-red-600 mt-1">Can't go below {slot.booked_count} (currently booked)</p>
              )}
            </div>
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as Slot["status"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="closed">Closed (tombstone)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {slot.booked_count > 0 && (
            <div className="border-t pt-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Bookings on this slot ({bookings.length || slot.booked_count})
              </div>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {!bookingsData && <div className="text-xs text-muted-foreground">Loading…</div>}
                {bookings.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => onOpenBooking(b.id)}
                    className="w-full text-left text-xs flex items-center justify-between p-2 rounded hover:bg-accent focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <span className="font-mono">{b.code}</span>
                    <span className="text-muted-foreground flex-1 ml-2 truncate">{b.guest_email}</span>
                    <span className="ml-2 text-xs">{b.status}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="destructive" disabled={delMut.isPending} onClick={() => confirmAction(
            "Delete / close this slot? Bookings (if any) must be cancelled first.",
            "Delete",
            () => delMut.mutate(),
          )}>Delete</Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || capacity < slot.booked_count}>
            {mut.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StandaloneSlotDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (b: boolean) => void }) {
  const queryClient = useQueryClient();
  const nowLocal = isoToLocalInput(new Date().toISOString());
  const oneHourLocal = isoToLocalInput(new Date(Date.now() + 60 * 60 * 1000).toISOString());
  const [serviceType, setServiceType] = useState<ServiceType>("steam");
  const [startsAt, setStartsAt] = useState(nowLocal);
  const [endsAt, setEndsAt] = useState(oneHourLocal);
  const [capacity, setCapacity] = useState(1);
  const [therapist, setTherapist] = useState("");
  const [room, setRoom] = useState("");
  const [variant, setVariant] = useState("");

  const mut = useMutation({
    mutationFn: () => createSlot({
      service_type: serviceType,
      starts_at: localInputToIso(startsAt),
      ends_at: localInputToIso(endsAt),
      capacity,
      therapist: therapist.trim() || null,
      room: room.trim() || null,
      variant: variant.trim() || null,
    } as CreateSlotPayload),
    onSuccess: () => {
      toast.success("One-time slot created");
      queryClient.invalidateQueries({ queryKey: ["steam-slots-admin"] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Create failed")),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>One-time slot</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Service</Label>
              <Select value={serviceType} onValueChange={(v) => setServiceType(v as ServiceType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="steam">Steam</SelectItem>
                  <SelectItem value="massage">Massage</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Capacity</Label>
              <Input type="number" value={capacity} onChange={(e) => setCapacity(parseInt(e.target.value || "0", 10))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Starts at <span className="text-xs text-muted-foreground">(Bali time)</span></Label>
              <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </div>
            <div>
              <Label>Ends at</Label>
              <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </div>
          </div>
          {serviceType === "massage" && (
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Therapist</Label><Input value={therapist} onChange={(e) => setTherapist(e.target.value)} /></div>
              <div><Label>Room</Label><Input value={room} onChange={(e) => setRoom(e.target.value)} /></div>
              <div><Label>Variant</Label><Input value={variant} onChange={(e) => setVariant(e.target.value)} /></div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>{mut.isPending ? "Creating…" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SlotsTab() {
  const [serviceFilter, setServiceFilter] = useState<"all" | ServiceType>("all");
  const [newSlotOpen, setNewSlotOpen] = useState(false);
  const [editSlot, setEditSlot] = useState<Slot | null>(null);
  const [openBookingId, setOpenBookingId] = useState<string | null>(null);

  const { data: slots = [], isLoading, refetch } = useQuery({
    queryKey: ["steam-slots-admin", serviceFilter],
    queryFn: () => fetchAdminSlots(serviceFilter === "all" ? {} : { service: serviceFilter }),
  });

  // Group by day (Bali tz)
  const groups: Record<string, Slot[]> = {};
  slots.forEach((s) => {
    const day = fmtDateLong(s.starts_at);
    (groups[day] ||= []).push(s);
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center">
        <Select value={serviceFilter} onValueChange={(v) => setServiceFilter(v as "all" | ServiceType)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All services</SelectItem>
            <SelectItem value="steam">Steam</SelectItem>
            <SelectItem value="massage">Massage</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" aria-label="Refresh" onClick={() => refetch()}><RefreshCw className="w-4 h-4" /></Button>
        <div className="flex-1" />
        <Button onClick={() => setNewSlotOpen(true)}><Plus className="w-4 h-4 mr-1" />One-time slot</Button>
      </div>

      <div className="flex gap-3 text-xs text-muted-foreground flex-wrap">
        <span><span className="inline-block w-3 h-3 rounded-sm align-middle bg-blue-500/30 border border-blue-500/40 mr-1" />From template</span>
        <span><span className="inline-block w-3 h-3 rounded-sm align-middle bg-orange-500/30 border border-orange-500/40 mr-1" />Override</span>
        <span><span className="inline-block w-3 h-3 rounded-sm align-middle bg-muted border mr-1" />Standalone</span>
        <span><span className="inline-block w-3 h-3 rounded-sm align-middle bg-red-500/30 border border-red-500/40 mr-1" />Closed</span>
        <span className="ml-auto text-muted-foreground">Times in {LOCATION_TZ}</span>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}

      {!isLoading && slots.length === 0 && (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          No slots in this window. Create a template (auto-materializes slots) or add a one-time slot.
        </Card>
      )}

      {Object.entries(groups).map(([day, daySlots]) => (
        <div key={day}>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{day}</div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {daySlots.map((s) => (
              <button
                key={s.id}
                onClick={() => setEditSlot(s)}
                aria-label={`Edit slot at ${fmtTime(s.starts_at)}`}
                className={`text-left p-3 rounded-lg border focus:outline-none focus:ring-2 focus:ring-primary hover:opacity-90 transition ${slotColor(s)}`}
              >
                <div className="flex justify-between items-center">
                  <span className="font-medium">{fmtTime(s.starts_at)}</span>
                  <Badge variant="outline">{s.service_type}</Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {s.booked_count}/{s.capacity} booked
                  {s.therapist ? ` · ${s.therapist}` : ""}
                  {s.variant ? ` · ${s.variant}` : ""}
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}

      {newSlotOpen && <StandaloneSlotDialog open={newSlotOpen} onOpenChange={setNewSlotOpen} />}
      {editSlot && (
        <SlotEditDialog
          key={editSlot.id}
          slot={editSlot}
          open={!!editSlot}
          onOpenChange={(o) => { if (!o) setEditSlot(null); }}
          onOpenBooking={(id) => setOpenBookingId(id)}
        />
      )}
      <BookingDetailsDrawer bookingId={openBookingId} onClose={() => setOpenBookingId(null)} />
    </div>
  );
}

function CronStatusChip() {
  const { data } = useQuery({
    queryKey: ["steam-cron-status"],
    queryFn: fetchCronStatus,
    refetchInterval: 60_000, // refresh every minute
  });

  if (!data) return null;
  const mat = data.materialize;
  const exp = data.expire;

  return (
    <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
      <span>
        <strong className="text-foreground">Last materialize:</strong>{" "}
        {mat?.at
          ? <>
              {fmtDateTime(mat.at)}
              {typeof mat.properties?.created === "number" && (
                <> · {mat.properties.created as number} new</>
              )}
            </>
          : <span className="text-yellow-700">never run yet</span>}
      </span>
      <span>
        <strong className="text-foreground">Last expire check:</strong>{" "}
        {exp?.at
          ? <>
              {fmtDateTime(exp.at)}
              {(exp.properties?.pending_expired || exp.properties?.confirmed_expired) ? (
                <> · {Number(exp.properties?.pending_expired ?? 0) + Number(exp.properties?.confirmed_expired ?? 0)} expired</>
              ) : null}
            </>
          : <span className="text-yellow-700">never run yet</span>}
      </span>
    </div>
  );
}

// ===========================================================================
// Calendar tab — Google-Calendar-style month view + click-to-add-session
// ===========================================================================

interface AddSessionForm {
  service_type: ServiceType;
  start_time: string;          // HH:MM
  duration_minutes: number;
  capacity: number;
  therapist: string;
  room: string;
  variant: string;
  recurrence: "once" | "daily" | "weekdays" | "weekly";
  weekdays: number[];          // for "weekly"
  until: string;               // YYYY-MM-DD, optional
}

function defaultSessionForm(date: Date): AddSessionForm {
  return {
    service_type: "steam",
    start_time: "18:00",
    duration_minutes: 60,
    capacity: 6,
    therapist: "",
    room: "",
    variant: "",
    recurrence: "once",
    weekdays: [date.getDay() === 0 ? 7 : date.getDay()],  // ISO weekday from JS day
    until: "",
  };
}

function localDateKey(d: Date): string {
  // YYYY-MM-DD in local calendar (Bali) — what react-day-picker gives us.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function AddSessionDialog({
  open,
  onOpenChange,
  date,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  date: Date | null;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<AddSessionForm>(() => defaultSessionForm(date ?? new Date()));

  useEffect(() => {
    if (date) setForm(defaultSessionForm(date));
  }, [date?.toISOString()]);

  const set = <K extends keyof AddSessionForm>(k: K, v: AddSessionForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const toggleWd = (iso: number) =>
    setForm((f) => ({
      ...f,
      weekdays: f.weekdays.includes(iso)
        ? f.weekdays.filter((d) => d !== iso)
        : [...f.weekdays, iso].sort(),
    }));

  const mut = useMutation({
    mutationFn: async () => {
      if (!date) throw new Error("No date selected");
      const dateKey = localDateKey(date);

      if (form.recurrence === "once") {
        // Build a starts_at/ends_at in Bali tz from date + start_time.
        const startsAt = localInputToIso(`${dateKey}T${form.start_time}`);
        const endsAtDate = new Date(new Date(startsAt).getTime() + form.duration_minutes * 60_000);
        const payload: CreateSlotPayload = {
          service_type: form.service_type,
          starts_at: startsAt,
          ends_at: endsAtDate.toISOString(),
          capacity: form.capacity,
          therapist: form.therapist.trim() || null,
          room: form.room.trim() || null,
          variant: form.variant.trim() || null,
        };
        return createSlot(payload);
      }

      // Recurring → create template
      const days =
        form.recurrence === "daily"   ? [1, 2, 3, 4, 5, 6, 7] :
        form.recurrence === "weekdays"? [1, 2, 3, 4, 5] :
        form.weekdays;

      const tplPayload: CreateTemplatePayload = {
        name: null,
        service_type: form.service_type,
        days_of_week: days,
        start_time: `${form.start_time}:00`,
        duration_minutes: form.duration_minutes,
        capacity: form.capacity,
        starts_on: dateKey,
        repeats_until: form.until || null,
        therapist: form.therapist.trim() || null,
        room: form.room.trim() || null,
        variant: form.variant.trim() || null,
      };
      return createTemplate(tplPayload);
    },
    onSuccess: () => {
      toast.success(form.recurrence === "once" ? "Session added" : "Recurring sessions created");
      queryClient.invalidateQueries({ queryKey: ["steam-slots-admin"] });
      queryClient.invalidateQueries({ queryKey: ["steam-templates"] });
      queryClient.invalidateQueries({ queryKey: ["steam-day"] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Failed to create")),
  });

  const submit = () => {
    if (form.recurrence === "weekly" && form.weekdays.length === 0) {
      toast.error("Pick at least one weekday");
      return;
    }
    mut.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            New session — {date?.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label>Time</Label>
              <Input type="time" value={form.start_time} onChange={(e) => set("start_time", e.target.value)} />
              <p className="text-xs text-muted-foreground mt-1">Bali</p>
            </div>
            <div>
              <Label>Duration (min)</Label>
              <Input type="number" value={form.duration_minutes} onChange={(e) => set("duration_minutes", parseInt(e.target.value || "0", 10))} />
            </div>
            <div>
              <Label>Capacity</Label>
              <Input type="number" value={form.capacity} onChange={(e) => set("capacity", parseInt(e.target.value || "0", 10))} />
            </div>
          </div>

          <div>
            <Label>Service</Label>
            <Select value={form.service_type} onValueChange={(v) => set("service_type", v as ServiceType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="steam">Steam</SelectItem>
                <SelectItem value="massage">Massage</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.service_type === "massage" && (
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label>Therapist</Label>
                <Input value={form.therapist} onChange={(e) => set("therapist", e.target.value)} />
              </div>
              <div>
                <Label>Room</Label>
                <Input value={form.room} onChange={(e) => set("room", e.target.value)} />
              </div>
              <div>
                <Label>Variant</Label>
                <Input value={form.variant} onChange={(e) => set("variant", e.target.value)} />
              </div>
            </div>
          )}

          <div className="border-t pt-3">
            <Label>Repeat</Label>
            <div className="space-y-1 mt-1">
              {[
                { v: "once", l: "One-time (just this date)" },
                { v: "daily", l: "Every day" },
                { v: "weekdays", l: "Every weekday (Mon–Fri)" },
                { v: "weekly", l: "Specific weekdays" },
              ].map((opt) => (
                <label key={opt.v} className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="radio"
                    name="recurrence"
                    checked={form.recurrence === opt.v}
                    onChange={() => set("recurrence", opt.v as AddSessionForm["recurrence"])}
                  />
                  {opt.l}
                </label>
              ))}
            </div>
          </div>

          {form.recurrence === "weekly" && (
            <div>
              <Label className="text-xs">On these weekdays</Label>
              <div className="flex flex-wrap gap-1 mt-1">
                {ISO_DAYS.map((d) => {
                  const active = form.weekdays.includes(d.iso);
                  return (
                    <button
                      key={d.iso}
                      type="button"
                      onClick={() => toggleWd(d.iso)}
                      className={`px-3 py-1 rounded text-xs border ${active ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}
                    >
                      {d.short}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {form.recurrence !== "once" && (
            <div>
              <Label>Until (optional)</Label>
              <Input type="date" value={form.until} onChange={(e) => set("until", e.target.value)} />
              <p className="text-xs text-muted-foreground mt-1">Leave empty for no end</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={mut.isPending}>
            {mut.isPending ? "Creating…" : form.recurrence === "once" ? "Add session" : "Add recurring"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Per-guest booking-limit override for a single day.
 *
 * The user can lift or lower the steam/massage limit for *this date only*
 * (e.g. festival day → 4 sessions; quiet day → 1). Empty = revert to the
 * global default in Settings. Saved values flow into the guest UI banner
 * via /steam/settings/public (for today) and gate the booking transaction
 * on POST /steam/bookings for the slot's Bali date.
 */
function DayLimitsCard({ dateKey, limits }: { dateKey: string; limits: DayLimits }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [steamVal, setSteamVal] = useState<string>(limits.steam.override?.toString() ?? "");
  const [massageVal, setMassageVal] = useState<string>(limits.massage.override?.toString() ?? "");

  // Reset local form state whenever the day or backend values change.
  useEffect(() => {
    setSteamVal(limits.steam.override?.toString() ?? "");
    setMassageVal(limits.massage.override?.toString() ?? "");
  }, [limits.steam.override, limits.massage.override, dateKey]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["steam-day", dateKey] });

  const saveM = useMutation({
    mutationFn: () => {
      const parse = (s: string) => {
        const t = s.trim();
        if (!t) return null;
        const n = parseInt(t, 10);
        return Number.isFinite(n) && n > 0 ? n : null;
      };
      return upsertDayOverride(dateKey, {
        max_steam_per_guest:   parse(steamVal),
        max_massage_per_guest: parse(massageVal),
      });
    },
    onSuccess: () => {
      toast.success("Day limit saved");
      setEditing(false);
      invalidate();
      qc.invalidateQueries({ queryKey: ["public-settings"] });
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Save failed")),
  });

  const clearM = useMutation({
    mutationFn: () => deleteDayOverride(dateKey),
    onSuccess: () => {
      toast.success("Back to default for this day");
      setEditing(false);
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Clear failed")),
  });

  const hasOverride = limits.steam.override !== null || limits.massage.override !== null;

  if (!editing) {
    return (
      <Card className="p-3 mb-3 flex items-center gap-3 flex-wrap">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Per-guest limit</div>
        <LimitChip label="Steam" info={limits.steam} />
        <LimitChip label="Massage" info={limits.massage} />
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setEditing(true)}>
          <Pencil className="w-3.5 h-3.5 mr-1" />Edit
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-3 mb-3 space-y-3">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">
        Per-guest limit · this day only
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Steam <span className="text-muted-foreground">(default {limits.steam.default})</span></Label>
          <Input
            type="number" min={1} max={20}
            value={steamVal}
            onChange={(e) => setSteamVal(e.target.value)}
            placeholder={`${limits.steam.default}`}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs">Massage <span className="text-muted-foreground">(default {limits.massage.default})</span></Label>
          <Input
            type="number" min={1} max={50}
            value={massageVal}
            onChange={(e) => setMassageVal(e.target.value)}
            placeholder={`${limits.massage.default}`}
            className="mt-1"
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Leave empty to use the global default. Lifts/lowers the per-guest cap for this Bali date only;
        the guest UI banner reflects this immediately if it's today.
      </p>
      <div className="flex gap-2 justify-end">
        {hasOverride && (
          <Button size="sm" variant="ghost" onClick={() => clearM.mutate()} disabled={clearM.isPending}>
            Reset to default
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
        <Button size="sm" onClick={() => saveM.mutate()} disabled={saveM.isPending}>
          {saveM.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </Card>
  );
}

function LimitChip({ label, info }: { label: string; info: { effective: number; default: number; override: number | null } }) {
  const isOverridden = info.override !== null && info.override !== info.default;
  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{info.effective}</span>
      {isOverridden && (
        <Badge variant="secondary" className="text-[10px] uppercase tracking-widest">
          override
        </Badge>
      )}
    </span>
  );
}

function DayInlinePane({
  date,
  service,
  onAddSession,
  onOpenBooking,
  onEditSlot,
}: {
  date: Date;
  service?: "steam" | "massage";
  onAddSession: () => void;
  onOpenBooking: (id: string) => void;
  onEditSlot: (s: Slot) => void;
}) {
  const dateKey = localDateKey(date);

  const { data, isLoading } = useQuery({
    queryKey: ["steam-day", dateKey, service],
    queryFn: async () => {
      const { fetchDay } = await import("@/lib/steam");
      return fetchDay(dateKey, service);
    },
  });

  const baliToday = todayIsoInTz();
  const isToday = dateKey === baliToday;

  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold">
            {date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            {isToday && <span className="ml-2 text-xs font-normal text-green-700">· Today (Bali)</span>}
          </h3>
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground mt-0.5">
            All times in Bali (Asia/Makassar)
          </p>
        </div>
        <Button onClick={onAddSession} size="sm">
          <Plus className="w-4 h-4 mr-1" />Add session
        </Button>
      </div>

      {data?.limits && <DayLimitsCard dateKey={dateKey} limits={data.limits} />}

      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}

      {data && data.slots.length === 0 && (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          No sessions for this day.
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {data?.slots.map((slot) => (
          <Card key={slot.id} className="p-3">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="font-medium tabular-nums">{fmtTime(slot.starts_at)}</span>
              <Badge variant={slot.service_type === "steam" ? "default" : "secondary"}>{slot.service_type}</Badge>
              <span className="text-xs text-muted-foreground ml-auto">{slot.booked_count}/{slot.capacity}</span>
              {slot.status === "closed" && <Badge variant="outline">closed</Badge>}
            </div>
            {(slot.therapist || slot.variant) && (
              <div className="text-xs text-muted-foreground mb-2">
                {slot.therapist}{slot.therapist && slot.variant ? " · " : ""}{slot.variant}
              </div>
            )}
            {slot.bookings.length > 0 && (
              <div className="space-y-1 mt-2 border-t pt-2">
                {slot.bookings.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => onOpenBooking(b.id)}
                    className="w-full text-left text-xs flex items-center justify-between gap-2 p-1 hover:bg-muted/50 rounded"
                  >
                    <span className="truncate flex-1">{b.guest_name ?? b.guest_email}</span>
                    <code className="text-xs font-mono text-muted-foreground">{b.code}</code>
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => onEditSlot({
                ...slot,
                template_id: slot.template_id,
                is_override: slot.is_override,
                created_at: slot.starts_at,
                updated_at: slot.starts_at,
              } as unknown as Slot)}
              className="text-xs text-muted-foreground hover:text-foreground mt-2 underline"
            >
              Edit slot
            </button>
          </Card>
        ))}
      </div>
    </div>
  );
}

// Date whose browser-local Y/M/D matches the Bali wall-clock date right now.
// `localDateKey(d)` reads d.getFullYear/Month/Date, so this is what makes the
// admin calendar default to Bali "today" — not the admin's laptop "today",
// which may differ by up to a day. Without this, a manager in (e.g.) Mexico
// sees their tomorrow highlighted and adds a slot that's already in the past
// on the Bali server.
function baliTodayAsLocalDate(): Date {
  const key = todayIsoInTz();
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function CalendarTab() {
  const [selected, setSelected] = useState<Date>(() => baliTodayAsLocalDate());
  const [serviceFilter, setServiceFilter] = useState<"steam" | "massage">("steam");
  const [addOpen, setAddOpen] = useState(false);
  const [openBookingId, setOpenBookingId] = useState<string | null>(null);
  const [editSlotState, setEditSlotState] = useState<Slot | null>(null);

  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const to = new Date(now.getFullYear(), now.getMonth() + 3, 1).toISOString();

  const { data: slots = [] } = useQuery({
    queryKey: ["steam-slots-admin", "calendar", from, to, serviceFilter],
    queryFn: () => fetchAdminSlots({ from, to, service: serviceFilter }),
  });

  const slotCounts: Record<string, number> = {};
  slots.forEach((s) => {
    if (s.status !== "open") return;
    const key = new Intl.DateTimeFormat("en-CA", {
      timeZone: LOCATION_TZ, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date(s.starts_at));
    slotCounts[key] = (slotCounts[key] ?? 0) + 1;
  });

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <Button
          size="sm"
          variant={serviceFilter === "steam" ? "default" : "outline"}
          onClick={() => setServiceFilter("steam")}
        >Steam</Button>
        <Button
          size="sm"
          variant={serviceFilter === "massage" ? "default" : "outline"}
          onClick={() => setServiceFilter("massage")}
        >Massage</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-6">
        <div className="flex flex-col items-center">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(d) => { if (d) setSelected(d); }}
            taskCounts={slotCounts}
            weekStartsOn={1}
          />
        </div>
        <div className="border-l lg:pl-6 lg:border-l-border">
          <DayInlinePane
            key={`${localDateKey(selected)}-${serviceFilter}`}
            date={selected}
            service={serviceFilter}
            onAddSession={() => setAddOpen(true)}
            onOpenBooking={(id) => setOpenBookingId(id)}
            onEditSlot={(s) => setEditSlotState(s)}
          />
        </div>
      </div>

      <AddSessionDialog open={addOpen} onOpenChange={setAddOpen} date={selected} />
      <BookingDetailsDrawer bookingId={openBookingId} onClose={() => setOpenBookingId(null)} />
      {editSlotState && (
        <SlotEditDialog
          key={editSlotState.id}
          slot={editSlotState}
          open={!!editSlotState}
          onOpenChange={(o) => { if (!o) setEditSlotState(null); }}
          onOpenBooking={(id) => setOpenBookingId(id)}
        />
      )}
    </div>
  );
}

export default function SchedulePage() {
  // Controlled tabs so we can jump to Slots after a successful template create.
  const [activeTab, setActiveTab] = useState<"calendar" | "templates" | "slots">("calendar");
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-baseline justify-between mb-2">
        <h1 className="text-2xl font-semibold">Schedule</h1>
      </div>
      <div className="mb-6"><CronStatusChip /></div>
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "calendar" | "templates" | "slots")}>
        <TabsList>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="slots">Slots</TabsTrigger>
        </TabsList>
        <TabsContent value="calendar" className="mt-4"><CalendarTab /></TabsContent>
        <TabsContent value="templates" className="mt-4">
          <TemplatesTab onTemplateCreated={() => setActiveTab("slots")} />
        </TabsContent>
        <TabsContent value="slots" className="mt-4"><SlotsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
