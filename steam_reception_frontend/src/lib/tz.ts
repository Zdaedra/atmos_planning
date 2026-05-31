/**
 * Bali wall-clock helpers for the reception SPA. All dates are interpreted in
 * Asia/Makassar regardless of the device's local timezone — receptionists may
 * scan from a phone that thinks it's in Jakarta or roaming.
 */
export const LOCATION_TZ = "Asia/Makassar";

/** YYYY-MM-DD for "today" in Bali. */
export function todayKey(): string {
    return new Intl.DateTimeFormat("sv-SE", {
        timeZone: LOCATION_TZ,
        year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
}

/** Shift a YYYY-MM-DD key by N days (in Bali wall-clock). */
export function shiftDate(key: string, deltaDays: number): string {
    const [y, m, d] = key.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + deltaDays);
    return dt.toISOString().slice(0, 10);
}

/** "Today" / "Tomorrow" / "Yesterday" / full date for everything else. */
export function relativeLabel(key: string): string {
    const today = todayKey();
    if (key === today) return "Today";
    if (key === shiftDate(today,  1)) return "Tomorrow";
    if (key === shiftDate(today, -1)) return "Yesterday";
    const [y, m, d] = key.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
        timeZone: "UTC",
        weekday: "long", month: "long", day: "numeric",
    });
}

export function fmtTime(iso: string): string {
    return new Date(iso).toLocaleTimeString("en-US", {
        timeZone: LOCATION_TZ,
        hour: "numeric", minute: "2-digit",
    });
}

export function fmtDateTime(iso: string | null | undefined): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("en-US", {
        timeZone: LOCATION_TZ,
        weekday: "short", month: "short", day: "numeric",
        hour: "numeric", minute: "2-digit",
    });
}
