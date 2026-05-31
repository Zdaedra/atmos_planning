/**
 * FingerprintJS (open source) integration. Loaded once at app start.
 *
 * If the script fails (ad-blocker, ITP, network) we return null instead of crashing —
 * the backend handles fingerprint=null gracefully (limit then counts by email alone).
 */
import FingerprintJS from "@fingerprintjs/fingerprintjs";

let cached: Promise<string | null> | null = null;

export function getFingerprint(): Promise<string | null> {
    if (cached) return cached;
    cached = (async () => {
        try {
            const fp = await FingerprintJS.load();
            const result = await fp.get();
            return result.visitorId;
        } catch (e) {
            console.warn("[fingerprint] unavailable:", e);
            return null;
        }
    })();
    return cached;
}
