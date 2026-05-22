import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Save, Mail, MailX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { SteamSettings, apiErrorMessage, fetchSettings, updateSettings } from "@/lib/steam";

const NUMERIC: (keyof SteamSettings)[] = [
  "max_bookings_per_guest",
  "max_massage_bookings_per_guest",
  "booking_window_minutes",
  "qr_valid_before_slot_minutes",
  "materialization_horizon_weeks",
];

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useQuery({
    queryKey: ["steam-settings"],
    queryFn: fetchSettings,
  });

  const [form, setForm] = useState<Partial<SteamSettings>>({});

  // Hydrate form when settings load (only if user hasn't started editing)
  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  const saveM = useMutation({
    mutationFn: () => {
      const payload: any = { ...form };
      // strip read-only
      delete payload.updated_at;
      // null-out empty strings for nullable text fields
      ["resend_from_email", "resend_reply_to", "public_url"].forEach((k) => {
        if (payload[k] === "") payload[k] = null;
      });
      // numbers
      NUMERIC.forEach((k) => {
        if (payload[k] !== undefined && payload[k] !== null && typeof payload[k] === "string") {
          payload[k] = parseInt(payload[k] as any, 10);
        }
      });
      return updateSettings(payload);
    },
    onSuccess: () => {
      toast.success("Settings saved");
      queryClient.invalidateQueries({ queryKey: ["steam-settings"] });
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Save failed")),
  });

  const set = <K extends keyof SteamSettings>(k: K, v: SteamSettings[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  if (isLoading || !settings) return <div className="p-6">Loading…</div>;

  const num = (k: keyof SteamSettings) => (form[k] as number | undefined) ?? "";
  const str = (k: keyof SteamSettings) => (form[k] as string | null | undefined) ?? "";

  const emailActive = !!(settings.resend_from_email && settings.resend_from_email.trim());

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Settings</h1>

      <Card className={`p-4 mb-4 ${emailActive ? "border-green-300 bg-green-50" : "border-yellow-300 bg-yellow-50"}`}>
        <div className="flex gap-3 items-start">
          {emailActive
            ? <Mail className="w-5 h-5 text-green-700 mt-0.5" />
            : <MailX className="w-5 h-5 text-yellow-700 mt-0.5" />}
          <div className="text-sm">
            <div className={`font-medium ${emailActive ? "text-green-900" : "text-yellow-900"}`}>
              Email channel: {emailActive ? "active" : "inactive"}
            </div>
            <div className={emailActive ? "text-green-800" : "text-yellow-800"}>
              {emailActive
                ? <>Bookings start as <code className="text-xs">pending</code>, then flip to <code className="text-xs">confirmed</code> when Resend's delivery webhook arrives (or after the booking window times out).</>
                : <>From-email is empty, so bookings go straight to <code className="text-xs">confirmed</code> without any email. Set From-email below once the Resend domain is verified.</>
              }
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-6">
        <div>
          <h2 className="font-medium mb-3">Branding</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Festival name</Label>
              <Input value={str("festival_name")} onChange={(e) => set("festival_name", e.target.value)} />
            </div>
            <div>
              <Label>Location name</Label>
              <Input value={str("location_name")} onChange={(e) => set("location_name", e.target.value)} />
            </div>
          </div>
        </div>

        <Separator />

        <div>
          <h2 className="font-medium mb-3">Limits & timing</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Max steam bookings per guest</Label>
              <Input type="number" value={num("max_bookings_per_guest")} onChange={(e) => set("max_bookings_per_guest", parseInt(e.target.value || "0", 10) as any)} />
            </div>
            <div>
              <Label>Max massage bookings per guest</Label>
              <Input type="number" value={num("max_massage_bookings_per_guest")} onChange={(e) => set("max_massage_bookings_per_guest", parseInt(e.target.value || "0", 10) as any)} />
            </div>
            <div>
              <Label>Booking window (min)</Label>
              <Input type="number" value={num("booking_window_minutes")} onChange={(e) => set("booking_window_minutes", parseInt(e.target.value || "0", 10) as any)} />
              <p className="text-xs text-muted-foreground mt-1">Pending → expired after this many minutes if no email delivery webhook arrives.</p>
            </div>
            <div>
              <Label>QR valid before slot (min)</Label>
              <Input type="number" value={num("qr_valid_before_slot_minutes")} onChange={(e) => set("qr_valid_before_slot_minutes", parseInt(e.target.value || "0", 10) as any)} />
              <p className="text-xs text-muted-foreground mt-1">Entry opens this many minutes before slot starts.</p>
            </div>
            <div>
              <Label>Materialization horizon (weeks)</Label>
              <Input type="number" value={num("materialization_horizon_weeks")} onChange={(e) => set("materialization_horizon_weeks", parseInt(e.target.value || "0", 10) as any)} />
              <p className="text-xs text-muted-foreground mt-1">How far ahead the daily tick pre-creates slots from templates.</p>
            </div>
          </div>
        </div>

        <Separator />

        <div>
          <h2 className="font-medium mb-3">Email (Resend)</h2>
          <p className="text-xs text-muted-foreground mb-3">
            Leave From-email empty to disable the email channel — bookings will go straight to <code>confirmed</code> without any email. Set it once the domain is verified in Resend dashboard.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>From email</Label>
              <Input value={str("resend_from_email")} onChange={(e) => set("resend_from_email", e.target.value)} placeholder="steam@yourdomain.com" />
            </div>
            <div>
              <Label>Reply-to</Label>
              <Input value={str("resend_reply_to")} onChange={(e) => set("resend_reply_to", e.target.value)} placeholder="manager@yourdomain.com" />
            </div>
            <div className="col-span-2">
              <Label>Public guest URL (base for links in email)</Label>
              <Input value={str("public_url")} onChange={(e) => set("public_url", e.target.value)} placeholder="https://book.yourdomain.com" />
              <p className="text-xs text-muted-foreground mt-1">Cancel-links and staff magic-link URLs are built from this prefix.</p>
            </div>
          </div>
        </div>

        <Separator />

        <div className="flex justify-end">
          <Button onClick={() => saveM.mutate()} disabled={saveM.isPending}>
            <Save className="w-4 h-4 mr-1" />Save changes
          </Button>
        </div>
      </Card>
    </div>
  );
}
