/**
 * Steam booking module — admin API wrappers.
 *
 * Endpoints live under /steam/admin/* and /steam/internal/*. We reuse the same
 * Authorization: Bearer <token> from the main app — no separate auth flow.
 *
 * Naming mirrors backend pydantic schemas (snake_case → camelCase in TS would
 * fight the API; we keep snake_case throughout to match payloads literally).
 */
import { getAuthToken } from "./api";

const API_URL = "https://api.atmos-steam.com";

/**
 * Pull a human-readable message out of whatever shape FastAPI returned.
 *
 * Backend conventions we've seen:
 *   - string detail:   { detail: "Template not found" }
 *   - object detail:   { detail: { error: "limit_exceeded", limit: 2 } }
 *   - pydantic 422:    { detail: [ { loc, msg, type }, ... ] }
 *   - non-JSON / network: e.message
 */
export function apiErrorMessage(e: any, fallback = "Something went wrong"): string {
    if (!e) return fallback;
    const d = e?.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) {
        return d.map((x: any) => `${(x.loc || []).join(".")}: ${x.msg}`).join("; ");
    }
    if (d && typeof d === "object") {
        // Inner-detail string ({ detail: { detail: "..." } } — rare but seen)
        if (typeof d.detail === "string") return d.detail;
        if (d.message) return String(d.message);
        if (d.error) {
            // domain error code with optional context
            const extras = Object.entries(d)
                .filter(([k]) => k !== "error")
                .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`);
            return extras.length ? `${d.error} (${extras.join(", ")})` : String(d.error);
        }
    }
    return e?.message || fallback;
}

async function req<T = any>(path: string, init: RequestInit = {}): Promise<T> {
    const token = getAuthToken();
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(init.headers as Record<string, string> | undefined),
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const resp = await fetch(`${API_URL}${path}`, { cache: "no-store", ...init, headers });
    if (!resp.ok) {
        let detail: unknown;
        try { detail = await resp.json(); } catch { /* ignore */ }
        const err: any = new Error(`API ${resp.status}: ${resp.statusText}`);
        err.status = resp.status;
        err.detail = detail;
        throw err;
    }
    // 204 No Content
    if (resp.status === 204) return undefined as unknown as T;
    return resp.json();
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ServiceType = "steam" | "massage";
export type TemplateStatus = "active" | "paused";
export type SlotStatus = "open" | "closed";
export type BookingStatus = "pending" | "confirmed" | "cancelled" | "expired" | "used";

export interface SteamSettings {
    max_bookings_per_guest: number;
    max_massage_bookings_per_guest: number;
    booking_window_minutes: number;
    qr_valid_before_slot_minutes: number;
    materialization_horizon_weeks: number;
    festival_name: string;
    location_name: string;
    resend_from_email: string | null;
    resend_reply_to: string | null;
    public_url: string | null;
    // Booleans surfaced by the API; hashes themselves are never sent to the client.
    reception_password_set: boolean;
    scanner_password_set: boolean;
    updated_at: string;
}

// Plaintext password write-only fields — only sent on PATCH, never echoed back.
export interface SteamSettingsUpdatePayload extends Partial<SteamSettings> {
    reception_password?: string | null;  // "" clears; null leaves unchanged
    scanner_password?: string | null;
}

export interface SlotTemplate {
    id: string;
    name: string | null;
    service_type: ServiceType;
    days_of_week: number[];   // ISO 1=Mon..7=Sun
    start_time: string;       // "18:00:00"
    duration_minutes: number;
    capacity: number;
    starts_on: string;        // YYYY-MM-DD
    repeats_until: string | null;
    status: TemplateStatus;
    therapist: string | null;
    room: string | null;
    variant: string | null;
    created_at: string;
    updated_at: string;
}

export interface Slot {
    id: string;
    service_type: ServiceType;
    starts_at: string;
    ends_at: string;
    capacity: number;
    booked_count: number;
    template_id: string | null;
    is_override: boolean;
    status: SlotStatus;
    therapist: string | null;
    room: string | null;
    variant: string | null;
    created_at: string;
    updated_at: string;
}

export interface BookingRow {
    id: string;
    code: string;
    service_type: ServiceType;
    slot_id: string;
    slot_starts_at: string | null;
    guest_email: string;
    guest_name: string | null;
    device_fingerprint: string | null;
    status: BookingStatus;
    qr_token: string;
    cancel_token: string;
    ip: string | null;
    user_agent: string | null;
    created_at: string;
    confirmed_at: string | null;
    cancelled_at: string | null;
    entered_at: string | null;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const fetchSettings = () => req<SteamSettings>("/steam/admin/settings");

export const updateSettings = (payload: Partial<SteamSettings>) =>
    req<SteamSettings>("/steam/admin/settings", {
        method: "PATCH",
        body: JSON.stringify(payload),
    });

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export const fetchTemplates = () => req<SlotTemplate[]>("/steam/admin/templates");

export interface CreateTemplatePayload {
    name?: string | null;
    service_type: ServiceType;
    days_of_week: number[];
    start_time: string;
    duration_minutes: number;
    capacity: number;
    starts_on: string;
    repeats_until?: string | null;
    therapist?: string | null;
    room?: string | null;
    variant?: string | null;
}

export const createTemplate = (payload: CreateTemplatePayload) =>
    req<SlotTemplate>("/steam/admin/templates", {
        method: "POST",
        body: JSON.stringify(payload),
    });

export const updateTemplate = (id: string, payload: Partial<CreateTemplatePayload & { status: TemplateStatus; apply_mode: string }>) =>
    req<SlotTemplate>(`/steam/admin/templates/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
    });

export const deleteTemplate = (id: string) =>
    req<void>(`/steam/admin/templates/${id}`, { method: "DELETE" });

export const pauseTemplate = (id: string) =>
    req<SlotTemplate>(`/steam/admin/templates/${id}/pause`, { method: "POST" });

export const previewTemplateDates = (payload: { days_of_week: number[]; starts_on: string; repeats_until?: string | null; limit?: number }) =>
    req<{ dates: string[] }>("/steam/admin/templates/preview", {
        method: "POST",
        body: JSON.stringify(payload),
    });

// ---------------------------------------------------------------------------
// Slots
// ---------------------------------------------------------------------------

export interface SlotsQuery {
    from?: string;
    to?: string;
    template_id?: string;
    service?: ServiceType;
}

export const fetchAdminSlots = (q: SlotsQuery = {}) => {
    const params = new URLSearchParams();
    if (q.from) params.set("from", q.from);
    if (q.to) params.set("to", q.to);
    if (q.template_id) params.set("template_id", q.template_id);
    if (q.service) params.set("service", q.service);
    const qs = params.toString();
    return req<Slot[]>(`/steam/admin/slots${qs ? "?" + qs : ""}`);
};

export interface CreateSlotPayload {
    service_type: ServiceType;
    starts_at: string;
    ends_at: string;
    capacity: number;
    therapist?: string | null;
    room?: string | null;
    variant?: string | null;
}

export const createSlot = (payload: CreateSlotPayload) =>
    req<Slot>("/steam/admin/slots", { method: "POST", body: JSON.stringify(payload) });

export const updateSlot = (
    id: string,
    payload: Partial<{ starts_at: string; ends_at: string; capacity: number; status: SlotStatus; therapist: string | null; room: string | null; variant: string | null }>,
) =>
    req<Slot>(`/steam/admin/slots/${id}`, { method: "PATCH", body: JSON.stringify(payload) });

export const deleteSlot = (id: string) =>
    req<void>(`/steam/admin/slots/${id}`, { method: "DELETE" });

// ---------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------

export interface BookingsQuery {
    status?: string;       // comma-separated
    from?: string;
    to?: string;
    email?: string;
    slot_id?: string;
    service?: ServiceType;
    limit?: number;
    offset?: number;
}

export const fetchAdminBookings = (q: BookingsQuery = {}) => {
    const params = new URLSearchParams();
    if (q.status) params.set("status", q.status);
    if (q.from) params.set("from", q.from);
    if (q.to) params.set("to", q.to);
    if (q.email) params.set("email", q.email);
    if (q.slot_id) params.set("slot_id", q.slot_id);
    if (q.service) params.set("service", q.service);
    if (q.limit !== undefined) params.set("limit", String(q.limit));
    if (q.offset !== undefined) params.set("offset", String(q.offset));
    const qs = params.toString();
    return req<{ items: BookingRow[]; limit: number; offset: number; has_next: boolean }>(`/steam/admin/bookings${qs ? "?" + qs : ""}`);
};

export const cancelBookingAdmin = (id: string) =>
    req<{ id: string; code: string; status: BookingStatus; cancelled_at: string }>(`/steam/admin/bookings/${id}/cancel`, { method: "POST" });

export interface BookingDetail {
    booking: BookingRow;
    slot: {
        id: string;
        starts_at: string | null;
        ends_at: string | null;
        capacity: number | null;
        booked_count: number | null;
        service_type: ServiceType | null;
        therapist: string | null;
        room: string | null;
        variant: string | null;
    } | null;
    events: Array<{
        event_type: string;
        properties: Record<string, unknown>;
        created_at: string | null;
    }>;
}

export const fetchBookingDetail = (id: string) =>
    req<BookingDetail>(`/steam/admin/bookings/${id}`);

export interface CronStatus {
    materialize: { at: string | null; properties: Record<string, unknown> } | null;
    expire:      { at: string | null; properties: Record<string, unknown> } | null;
}

export const fetchCronStatus = () => req<CronStatus>("/steam/admin/cron-status");

// ---------------------------------------------------------------------------
// Today / day view
// ---------------------------------------------------------------------------

export interface DayBooking {
    id: string;
    code: string;
    status: BookingStatus;
    guest_email: string;
    guest_name: string | null;
    qr_token: string;
    created_at: string | null;
    entered_at: string | null;
}

export interface DaySlot {
    id: string;
    service_type: ServiceType;
    starts_at: string;
    ends_at: string;
    capacity: number;
    booked_count: number;
    status: SlotStatus;
    is_override: boolean;
    template_id: string | null;
    therapist: string | null;
    room: string | null;
    variant: string | null;
    bookings: DayBooking[];
    active_count: number;
}

export interface DayLimitInfo {
    effective: number;
    default: number;
    override: number | null;  // null = no override; falls back to default
}

export interface DayLimits {
    steam: DayLimitInfo;
    massage: DayLimitInfo;
    note: string | null;
}

export interface DayView {
    date: string;
    stats: {
        steam: { slots: number; active_bookings: number };
        massage: { slots: number; active_bookings: number };
    };
    slots: DaySlot[];
    limits: DayLimits;
}

// Per-day per-guest booking limit override.
export interface DayOverride {
    day: string;
    max_steam_per_guest: number | null;
    max_massage_per_guest: number | null;
    note: string | null;
    defaults: {
        max_steam_per_guest: number;
        max_massage_per_guest: number;
    };
}

export const fetchDayOverride = (date: string) =>
    req<DayOverride>(`/steam/admin/day-overrides/${date}`);

export const upsertDayOverride = (date: string, body: {
    max_steam_per_guest?: number | null;
    max_massage_per_guest?: number | null;
    note?: string | null;
}) =>
    req<DayOverride>(`/steam/admin/day-overrides/${date}`, {
        method: "PUT",
        body: JSON.stringify(body),
    });

export const deleteDayOverride = (date: string) =>
    req<void>(`/steam/admin/day-overrides/${date}`, { method: "DELETE" });

export const createWalkin = (slot_id: string, name: string, email?: string) =>
    req<BookingRow>("/steam/admin/walkin", {
        method: "POST",
        body: JSON.stringify({ slot_id, name, email: email || undefined }),
    });

export const fetchDay = (date?: string, service?: ServiceType) => {
    const params = new URLSearchParams();
    if (date) params.set("date", date);
    if (service) params.set("service", service);
    const qs = params.toString();
    return req<DayView>(`/steam/admin/day${qs ? "?" + qs : ""}`);
};

export const exportBookingsCsvUrl = (q: BookingsQuery = {}) => {
    const params = new URLSearchParams();
    params.set("export", "csv");
    if (q.status) params.set("status", q.status);
    if (q.from) params.set("from", q.from);
    if (q.to) params.set("to", q.to);
    if (q.email) params.set("email", q.email);
    if (q.service) params.set("service", q.service);
    return `${API_URL}/steam/admin/bookings?${params.toString()}`;
};

// Helper because CSV needs auth header → we have to fetch + blob-download manually.
export async function downloadBookingsCsv(q: BookingsQuery = {}) {
    const token = getAuthToken();
    const resp = await fetch(exportBookingsCsvUrl(q), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!resp.ok) throw new Error(`CSV export ${resp.status}`);
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `steam_bookings_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Staff (magic-link) helpers removed — tablet auth is now shared-password.
// See settings: reception_password_set / scanner_password_set + the /login
// endpoints on /reception and /scanner.
