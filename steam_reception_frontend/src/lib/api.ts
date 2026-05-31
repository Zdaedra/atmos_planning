/**
 * Reception portal API client — shared-password tablet auth.
 *
 * One password (set in admin → Settings) unlocks the SPA on any device. After
 * login the hash-token lives in localStorage indefinitely; admin changing the
 * password makes every tablet re-enter it once.
 */

export const API_URL = "https://api.atmos-steam.com";

const TOKEN_KEY = "atmos_reception_token";

export type ServiceType = "steam" | "massage";
export type BookingStatus = "pending" | "confirmed" | "used" | "cancelled" | "expired";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

async function req<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(init.headers as Record<string, string> | undefined),
    };
    const token = getToken();
    if (token) headers["X-Reception-Token"] = token;

    const resp = await fetch(`${API_URL}${path}`, { ...init, headers });
    if (resp.status === 401) {
        // Token rejected (likely admin changed password) — drop it and bounce
        // back to login. Avoid loops if we're already on /login.
        clearToken();
        if (location.pathname !== "/login") location.href = "/login?expired=1";
    }
    if (!resp.ok) {
        let detail: unknown;
        try { detail = await resp.json(); } catch { /* not JSON */ }
        const err = new Error(`API ${resp.status}: ${resp.statusText}`) as Error & {
            status: number; detail: unknown;
        };
        err.status = resp.status;
        err.detail = (detail as { detail?: unknown })?.detail ?? detail;
        throw err;
    }
    if (resp.status === 204) return undefined as T;
    return resp.json();
}

/** Pull a human-readable message out of FastAPI's three error shapes. */
export function apiErrorMessage(e: unknown, fallback = "Something went wrong"): string {
    const err = e as { detail?: unknown; message?: string } | null | undefined;
    if (!err) return fallback;
    const d = err.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) {
        return d.map((x: any) => `${(x.loc || []).join(".")}: ${x.msg}`).join("; ");
    }
    if (d && typeof d === "object") {
        const o = d as Record<string, unknown>;
        if (typeof o.message === "string") return o.message;
        if (typeof o.error === "string") {
            const extras = Object.entries(o).filter(([k]) => k !== "error").map(([k, v]) => `${k}=${v}`);
            return extras.length ? `${o.error} (${extras.join(", ")})` : o.error;
        }
    }
    return err.message || fallback;
}

// ---------------------------------------------------------------------------
// Types — mirror what the backend returns for /reception/day
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
    status: "open" | "closed";
    is_override: boolean;
    template_id: string | null;
    therapist: string | null;
    room: string | null;
    variant: string | null;
    bookings: DayBooking[];
    active_count: number;
}

export interface DayResponse {
    date: string;
    stats: Record<ServiceType, { slots: number; active_bookings: number }>;
    slots: DaySlot[];
}

export interface ReceptionSettings {
    festival_name: string;
    location_name: string;
    qr_valid_before_slot_minutes: number;
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export const login = (password: string) =>
    req<{ token: string }>("/steam/reception/login", {
        method: "POST",
        body: JSON.stringify({ password }),
    });

export const fetchSettings = () =>
    req<ReceptionSettings>("/steam/reception/settings");

export const fetchDay = (date: string, service: ServiceType) =>
    req<DayResponse>(`/steam/reception/day?date=${date}&service=${service}`);

export const createWalkin = (slot_id: string, name: string, email?: string) =>
    req<{ id: string; code: string }>("/steam/reception/walkin", {
        method: "POST",
        body: JSON.stringify({ slot_id, name, email: email || undefined }),
    });

export const cancelBooking = (booking_id: string) =>
    req<{ id: string; code: string; status: BookingStatus; cancelled_at: string }>(
        `/steam/reception/bookings/${booking_id}/cancel`,
        { method: "POST" },
    );
