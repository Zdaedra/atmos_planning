/**
 * Timezone helpers for the Steam booking admin UI.
 *
 * Problem: <input type="datetime-local"> emits values like "2026-06-01T18:00"
 * with **no** timezone, and `new Date(str)` interprets them in the browser's
 * local timezone. A manager working from Moscow editing a Bali slot would
 * silently misalign the booking by 5 hours.
 *
 * Solution: force a fixed display timezone (Asia/Makassar — the operational
 * timezone of the only location running this for now). Helpers parse the
 * datetime-local string as Bali wall-clock and convert to UTC for the API,
 * and vice versa.
 *
 * If we ever multi-locate, swap `LOCATION_TZ` for a per-location lookup.
 */
export const LOCATION_TZ = "Asia/Makassar";

/** Parse "YYYY-MM-DDTHH:MM" as wall-clock in LOCATION_TZ; return UTC ISO. */
export function localInputToIso(localStr: string, tz: string = LOCATION_TZ): string {
    if (!localStr) return "";
    // Build an instant by guessing UTC, then correcting for the tz offset at that instant.
    const guess = new Date(`${localStr}:00Z`); // pretend it's UTC
    // What time does that instant LOOK LIKE in tz? Compare to the wall-clock the user typed.
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hourCycle: "h23",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(guess);
    const map: Record<string, string> = {};
    for (const p of parts) if (p.type !== "literal") map[p.type] = p.value;
    const inTz = new Date(`${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}:${map.second}Z`);
    const offsetMs = inTz.getTime() - guess.getTime();
    return new Date(guess.getTime() - offsetMs).toISOString();
}

/** UTC ISO → "YYYY-MM-DDTHH:MM" wall-clock in LOCATION_TZ for <input type="datetime-local">. */
export function isoToLocalInput(iso: string | null | undefined, tz: string = LOCATION_TZ): string {
    if (!iso) return "";
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hourCycle: "h23",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit",
    }).formatToParts(new Date(iso));
    const map: Record<string, string> = {};
    for (const p of parts) if (p.type !== "literal") map[p.type] = p.value;
    return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}`;
}

/** Format a UTC ISO timestamp as a friendly Bali-localized string. */
export function fmtDateTime(iso: string | null | undefined, tz: string = LOCATION_TZ): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("en-US", {
        timeZone: tz,
        weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });
}

/** Same but date only (e.g. for grouping by day). */
export function fmtDateLong(iso: string, tz: string = LOCATION_TZ): string {
    return new Date(iso).toLocaleDateString("en-US", {
        timeZone: tz,
        weekday: "long", month: "short", day: "numeric",
    });
}

/** Hour:minute only in Bali tz. */
export function fmtTime(iso: string, tz: string = LOCATION_TZ): string {
    return new Date(iso).toLocaleTimeString("en-US", {
        timeZone: tz,
        hour: "numeric", minute: "2-digit",
    });
}
