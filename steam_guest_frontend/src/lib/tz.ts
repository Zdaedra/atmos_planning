/**
 * Same Bali wall-clock helpers used in the admin SPA — duplicated rather than shared
 * because the two frontends are separately-built artifacts.
 */
export const LOCATION_TZ = "Asia/Makassar";

export function fmtDateTime(iso: string | null | undefined): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("en-US", {
        timeZone: LOCATION_TZ,
        weekday: "short", month: "short", day: "numeric",
        hour: "numeric", minute: "2-digit",
    });
}

export function fmtDate(iso: string): string {
    return new Date(iso).toLocaleDateString("en-US", {
        timeZone: LOCATION_TZ,
        weekday: "long", month: "long", day: "numeric",
    });
}

export function fmtTime(iso: string): string {
    return new Date(iso).toLocaleTimeString("en-US", {
        timeZone: LOCATION_TZ,
        hour: "numeric", minute: "2-digit",
    });
}

/**
 * "Today" / "Tomorrow" / "Saturday, June 14" — relative for next 2 days, then absolute.
 * From spec §F.1.
 */
export function fmtDayHeader(iso: string): string {
    const d = new Date(iso);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const isoDay = new Date(iso);
    isoDay.setHours(0, 0, 0, 0);
    const dayMs = isoDay.getTime();

    if (dayMs === today.getTime()) return "Today";
    if (dayMs === tomorrow.getTime()) return "Tomorrow";
    return d.toLocaleDateString("en-US", {
        timeZone: LOCATION_TZ,
        weekday: "long", month: "long", day: "numeric",
    });
}

/** Group slots by Bali-local date. Returns array of [dateKey, slots[]] preserving order. */
export function groupByDay<T extends { starts_at: string }>(items: T[]): Array<[string, T[]]> {
    const groups: Record<string, T[]> = {};
    const order: string[] = [];
    for (const it of items) {
        const key = new Intl.DateTimeFormat("sv-SE", {
            timeZone: LOCATION_TZ,
            year: "numeric", month: "2-digit", day: "2-digit",
        }).format(new Date(it.starts_at));
        if (!groups[key]) {
            groups[key] = [];
            order.push(key);
        }
        groups[key].push(it);
    }
    return order.map((k) => [k, groups[k]]);
}
