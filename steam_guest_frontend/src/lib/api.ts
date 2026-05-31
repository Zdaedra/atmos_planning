/**
 * Guest-facing API client. Talks to the same FastAPI backend the admin SPA uses,
 * but only against the public endpoints.
 *
 * The door-scanner page (/staff/scan) uses shared-password auth via the
 * X-Scanner-Token header. Token is the sha256 hash returned by /scanner/login
 * and lives in localStorage indefinitely; admin changing the password makes
 * the tablet re-prompt once.
 */

export const API_URL = "https://api.atmos-steam.com";

const SCANNER_TOKEN_KEY = "atmos_scanner_token";

export const getScannerToken = () => localStorage.getItem(SCANNER_TOKEN_KEY);
export const setScannerToken = (token: string) => localStorage.setItem(SCANNER_TOKEN_KEY, token);
export const clearScannerToken = () => localStorage.removeItem(SCANNER_TOKEN_KEY);

interface ApiOptions extends RequestInit {
    scannerAuth?: boolean;
}

async function req<T = unknown>(path: string, init: ApiOptions = {}): Promise<T> {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(init.headers as Record<string, string> | undefined),
    };
    if (init.scannerAuth) {
        const token = getScannerToken();
        if (token) headers["X-Scanner-Token"] = token;
    }
    const resp = await fetch(`${API_URL}${path}`, { ...init, headers });
    if (resp.status === 401 && init.scannerAuth) {
        clearScannerToken();
        if (location.pathname !== "/staff") location.href = "/staff?expired=1";
    }
    if (!resp.ok) {
        let detail: unknown;
        try { detail = await resp.json(); } catch { /* not JSON */ }
        const err = new Error(`API ${resp.status}: ${resp.statusText}`) as Error & {
            status: number;
            detail: unknown;
        };
        err.status = resp.status;
        err.detail = (detail as { detail?: unknown })?.detail ?? detail;
        throw err;
    }
    if (resp.status === 204) return undefined as T;
    return resp.json();
}

/**
 * Pull a human-readable message out of whatever shape FastAPI returned.
 * Prefers `detail.message` (backend-authored copy) over `detail.error` (machine code).
 */
export function apiErrorMessage(e: unknown, fallback = "Something went wrong"): string {
    const err = e as { detail?: unknown; message?: string; status?: number } | null | undefined;
    if (!err) return fallback;
    const d = err.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) {
        return d.map((x: any) => `${(x.loc || []).join(".")}: ${x.msg}`).join("; ");
    }
    if (d && typeof d === "object") {
        const o = d as Record<string, unknown>;
        if (typeof o.message === "string") return o.message;
        // No `message` (older backend code path) — translate the machine code into
        // something the guest can read, not `{"error":"slot_full"}`.
        if (typeof o.error === "string") return _humanizeErrorCode(o.error, fallback);
    }
    if (err.status === 429) {
        return "We're getting a lot of requests right now — please wait a few seconds and try again.";
    }
    return err.message || fallback;
}

function _humanizeErrorCode(code: string, fallback: string): string {
    switch (code) {
        case "slot_full":      return "Someone just took the last seat — please pick another time.";
        case "slot_past":      return "That time has already started — please pick a later one.";
        case "slot_closed":    return "That session has just closed — please pick another time.";
        case "slot_not_found": return "That session is no longer available. Refresh and try again.";
        case "limit_exceeded": return "You've reached today's booking limit. We'll see you then!";
        case "rate_limited":   return "Too many attempts — please wait a moment and try again.";
        case "no_slots":       return "Pick at least one session to continue.";
        default:               return fallback;
    }
}

// ---------------------------------------------------------------------------
// Types (subset of admin types — only what guest UI needs)
// ---------------------------------------------------------------------------

export type ServiceType = "steam" | "massage";
export type BookingStatus = "pending" | "confirmed" | "cancelled" | "expired" | "used";

export interface PublicSlot {
    id: string;
    service_type: ServiceType;
    starts_at: string;
    ends_at: string;
    capacity: number;
    booked_count: number;
    therapist: string | null;
    variant: string | null;
}

export interface PublicBooking {
    id: string;
    code: string;
    service_type: ServiceType;
    slot_id: string;
    slot_starts_at: string;
    slot_ends_at: string;
    status: BookingStatus;
    qr_token: string;
    cancel_token: string;
    guest_email: string;
    created_at: string;
}

export interface BookingByCode {
    id: string;
    code: string;
    service_type: ServiceType;
    status: BookingStatus;
    slot_id: string;
    slot_starts_at: string;
    slot_ends_at: string;
    qr_token: string;
    guest_email: string;
}

// ---------------------------------------------------------------------------
// Public endpoints
// ---------------------------------------------------------------------------

export interface PublicSettings {
    festival_name: string;
    location_name: string;
    max_steam_per_day: number;
    max_massage_per_day: number;
    qr_valid_before_slot_minutes: number;
}

export const fetchPublicSettings = () => req<PublicSettings>("/steam/settings/public");

export const fetchSlots = (service?: ServiceType) => {
    const qs = service ? `?service=${service}` : "";
    return req<PublicSlot[]>(`/steam/slots${qs}`);
};

export interface CreateBookingPayload {
    slot_ids: string[];
    email: string;
    name?: string;
    fingerprint?: string | null;
}

export const createBooking = (payload: CreateBookingPayload) =>
    req<{ bookings: PublicBooking[] }>("/steam/bookings", {
        method: "POST",
        body: JSON.stringify(payload),
    });

export const fetchBookingByCode = (code: string) =>
    req<BookingByCode>(`/steam/bookings/by-code/${encodeURIComponent(code)}`);

export const cancelBookingByToken = (cancel_token: string) =>
    req<{ id: string; code: string; status: BookingStatus; cancelled_at: string }>(
        "/steam/bookings/cancel",
        { method: "POST", body: JSON.stringify({ cancel_token }) },
    );

export const resendBookingsEmail = (email: string) =>
    req<{ ok: true }>("/steam/bookings/resend", {
        method: "POST",
        body: JSON.stringify({ email }),
    });

export const qrPngUrl = (qr_token: string) =>
    `${API_URL}/steam/qr/${qr_token}.png`;

// ---------------------------------------------------------------------------
// Door-scanner endpoints — shared-password auth (X-Scanner-Token)
// ---------------------------------------------------------------------------

export const scannerLogin = (password: string) =>
    req<{ token: string }>("/steam/scanner/login", {
        method: "POST",
        body: JSON.stringify({ password }),
    });

export interface VerifyResult {
    result: "valid" | "wrong_time" | "already_used" | "cancelled" | "expired" | "not_found";
    reason?: "too_early" | "too_late";
    code?: string;
    service_type?: ServiceType;
    slot_starts_at?: string;
    slot_ends_at?: string;
    therapist?: string | null;
    room?: string | null;
    variant?: string | null;
    guest_email?: string;
    entered_at?: string | null;
    entry_opens_at?: string;
}

export const verifyQr = (qr_token: string) =>
    req<VerifyResult>("/steam/staff/verify", {
        method: "POST",
        body: JSON.stringify({ qr_token }),
        scannerAuth: true,
    });

// ---------------------------------------------------------------------------
// "My bookings" — remembered locally so a returning guest sees their bookings
// without re-entering email. We deliberately store only public codes + email
// (no QR token, no cancel token), because the canonical source of truth
// for everything else is /bookings/by-code/{code}. localStorage is per-device
// per-browser — a different device sees nothing, which is the right privacy
// default for a public-poster scan flow.
// ---------------------------------------------------------------------------

const MY_BOOKINGS_KEY = "atmos_my_bookings";
const MY_BOOKINGS_MAX = 10;

export interface MyBookings {
    email: string;
    codes: string[];  // most-recent-first
}

export function getMyBookings(): MyBookings | null {
    const raw = localStorage.getItem(MY_BOOKINGS_KEY);
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as MyBookings;
        if (typeof parsed?.email !== "string" || !Array.isArray(parsed.codes)) return null;
        return parsed;
    } catch { return null; }
}

export function rememberMyBookings(email: string, newCodes: string[]) {
    const cur = getMyBookings();
    const merged = [...newCodes, ...(cur?.codes ?? [])]
        .filter((c, i, arr) => c && arr.indexOf(c) === i)
        .slice(0, MY_BOOKINGS_MAX);
    localStorage.setItem(MY_BOOKINGS_KEY, JSON.stringify({ email, codes: merged }));
}

export function forgetMyBookings() {
    localStorage.removeItem(MY_BOOKINGS_KEY);
}
