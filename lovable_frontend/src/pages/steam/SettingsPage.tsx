import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Save, Mail, MailX, KeyRound, CheckCircle2, XCircle } from "lucide-react";

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
  // Password fields are write-only — never hydrated from server. Empty = "leave
  // alone"; non-empty = set to this; explicit "(clear)" toggle = send empty string.
  const [receptionPw, setReceptionPw] = useState("");
  const [scannerPw, setScannerPw] = useState("");
  const [clearReceptionPw, setClearReceptionPw] = useState(false);
  const [clearScannerPw, setClearScannerPw] = useState(false);

  // Hydrate form when settings load (only if user hasn't started editing)
  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  const saveM = useMutation({
    mutationFn: () => {
      const payload: any = { ...form };
      // strip read-only / display-only fields
      delete payload.updated_at;
      delete payload.reception_password_set;
      delete payload.scanner_password_set;
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
      // Passwords — three states:
      //   "clear" toggle on   → send "" (server clears the hash)
      //   non-empty input     → send the plaintext (server hashes)
      //   neither             → omit (server leaves alone)
      if (clearReceptionPw) payload.reception_password = "";
      else if (receptionPw.trim()) payload.reception_password = receptionPw.trim();
      if (clearScannerPw) payload.scanner_password = "";
      else if (scannerPw.trim()) payload.scanner_password = scannerPw.trim();
      return updateSettings(payload);
    },
    onSuccess: () => {
      toast.success("Settings saved");
      setReceptionPw(""); setScannerPw("");
      setClearReceptionPw(false); setClearScannerPw(false);
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
          <h2 className="font-medium mb-1">Timing</h2>
          <p className="text-xs text-muted-foreground mb-3">
            Per-guest booking limits live on <strong>Schedule → Calendar → day pane</strong>
            (per-date override). Slot capacity lives on the slot/template itself.
          </p>
          <div className="grid grid-cols-2 gap-3">
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

        <div>
          <h2 className="font-medium mb-1 flex items-center gap-2">
            <KeyRound className="w-4 h-4" />Tablet passwords
          </h2>
          <p className="text-xs text-muted-foreground mb-3">
            One shared password per role unlocks the tablet SPA forever. Set it once per deploy,
            tablets enter it once. Changing the password makes every tablet on that role re-enter it
            on next request.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <PasswordField
              label="Reception password"
              isSet={!!settings.reception_password_set}
              value={receptionPw}
              onChange={setReceptionPw}
              clear={clearReceptionPw}
              onClearToggle={setClearReceptionPw}
              urlHint="reception.atmos-steam.com"
            />
            <PasswordField
              label="Scanner password"
              isSet={!!settings.scanner_password_set}
              value={scannerPw}
              onChange={setScannerPw}
              clear={clearScannerPw}
              onClearToggle={setClearScannerPw}
              urlHint="book.atmos-steam.com/staff"
            />
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

function PasswordField({
  label, isSet, value, onChange, clear, onClearToggle, urlHint,
}: {
  label: string;
  isSet: boolean;
  value: string;
  onChange: (v: string) => void;
  clear: boolean;
  onClearToggle: (v: boolean) => void;
  urlHint: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1">
        <Label>{label}</Label>
        <span className={`inline-flex items-center gap-1 text-[11px] uppercase tracking-widest ${
          isSet ? "text-green-700" : "text-yellow-700"
        }`}>
          {isSet ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
          {isSet ? "Set" : "Not set"}
        </span>
      </div>
      <Input
        type="password"
        autoComplete="new-password"
        value={clear ? "" : value}
        disabled={clear}
        onChange={(e) => onChange(e.target.value)}
        placeholder={isSet ? "Enter a new password to replace" : "Pick a password"}
      />
      <p className="text-xs text-muted-foreground mt-1">URL: {urlHint}</p>
      {isSet && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground mt-2 cursor-pointer">
          <input
            type="checkbox"
            checked={clear}
            onChange={(e) => onClearToggle(e.target.checked)}
          />
          Clear password (disables this SPA until a new one is set)
        </label>
      )}
    </div>
  );
}
