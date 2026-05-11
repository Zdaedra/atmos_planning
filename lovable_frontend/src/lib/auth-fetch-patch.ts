// Global fetch interceptor:
//  1. Attaches `Authorization: Bearer <token>` to every request to api.trypranaextract.com
//     (except /auth/login). Bounces to "/" on 401 so a stale token doesn't leave the
//     user on an empty-looking page.
//  2. Auto-appends `?department=<current>` so every backend query is scoped to the
//     selected department. Skips when the URL already specifies one.
//
// Imported once from main.tsx — must run before any component-level fetch().

const API_HOST = "api.trypranaextract.com";
const DEPT_STORAGE_KEY = "atmos.department";

// Endpoints that operate on data that does NOT belong to a department
// (auth, supervisors, locations, AI alert settings, media uploads, system messages).
const DEPT_AGNOSTIC_PATHS = [
    "/auth/",
    "/supervisors/",
    "/locations/",
    "/media/",
    "/messages/",
    "/shifts/",
    "/ai/alerts/settings",
];

declare global {
    interface Window {
        __atmosFetchPatched?: boolean;
    }
}

function currentDepartment(): string {
    try {
        const v = localStorage.getItem(DEPT_STORAGE_KEY);
        if (v === "maintenance" || v === "service") return v;
        if (v === "refreshments") {
            try { localStorage.setItem(DEPT_STORAGE_KEY, "service"); } catch { /* ignore */ }
            return "service";
        }
    } catch { /* ignore */ }
    return "maintenance";
}

function shouldScopeByDept(url: string): boolean {
    if (!url.includes(API_HOST)) return false;
    for (const p of DEPT_AGNOSTIC_PATHS) {
        if (url.includes(p)) return false;
    }
    return true;
}

function ensureDeptParam(url: string): string {
    try {
        const u = new URL(url);
        if (u.searchParams.has("department")) return url;
        u.searchParams.set("department", currentDepartment());
        return u.toString();
    } catch {
        return url;
    }
}

if (typeof window !== "undefined" && !window.__atmosFetchPatched) {
    const orig = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        let target = "";
        try {
            if (typeof input === "string") target = input;
            else if (input instanceof URL) target = input.toString();
            else target = (input as Request).url || "";
        } catch {
            target = "";
        }

        const isApi = target.includes(API_HOST);
        const isLogin = target.includes("/auth/login");

        // Inject ?department= for department-scoped endpoints.
        if (isApi && shouldScopeByDept(target)) {
            const newUrl = ensureDeptParam(target);
            if (newUrl !== target) {
                if (typeof input === "string") {
                    input = newUrl;
                } else if (input instanceof URL) {
                    input = new URL(newUrl);
                } else {
                    input = new Request(newUrl, input as Request);
                }
                target = newUrl;
            }
        }

        if (isApi && !isLogin) {
            const token = typeof localStorage !== "undefined" ? localStorage.getItem("access_token") : null;
            if (token) {
                const headers = new Headers(
                    init?.headers ||
                    (typeof input !== "string" && !(input instanceof URL) ? (input as Request).headers : undefined)
                );
                if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
                init = { ...(init || {}), headers };
            }
        }

        const res = await orig(input, init);
        if (res.status === 401 && isApi && !isLogin) {
            try { localStorage.removeItem("access_token"); } catch { /* ignore */ }
            if (typeof window !== "undefined" && window.location.pathname !== "/") {
                window.location.href = "/";
            }
        }
        return res;
    };

    window.__atmosFetchPatched = true;
}

export { };
