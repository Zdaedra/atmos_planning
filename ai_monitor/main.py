import time
import os
import requests

POLL_INTERVAL_SECONDS = int(os.getenv("POLL_INTERVAL", 3600))
API_BASE_URL = os.getenv("API_BASE_URL", "http://backend:8000")
INTERNAL_TOKEN = os.getenv("INTERNAL_TOKEN")
PHOTO_CLEANUP_HOUR = int(os.getenv("PHOTO_CLEANUP_HOUR", 3))  # local container hour to trigger cleanup
STEAM_MATERIALIZE_HOUR = int(os.getenv("STEAM_MATERIALIZE_HOUR", 3))  # daily materialization tick
_last_cleanup_day = None
_last_steam_materialize_day = None
_last_steam_session_cleanup_hour = None  # (date, hour) tuple for hourly tick


def _internal_headers():
    return {"X-Internal-Token": INTERNAL_TOKEN} if INTERNAL_TOKEN else {}


def generate_daily_tasks():
    print("Triggering daily task generation...")
    try:
        res = requests.post(f"{API_BASE_URL}/tasks/system/generate-daily",
                            headers=_internal_headers(), timeout=15)
        if res.status_code == 200:
            data = res.json()
            generated = data.get("generated_count", 0)
            if generated > 0:
                print(f"Generated {generated} tasks successfully.")
        else:
            print(f"generate-daily returned {res.status_code}: {res.text[:200]}")
    except Exception as e:
        print(f"Error triggering daily task generation: {e}")


def cleanup_old_photos():
    print("Triggering old-photo cleanup...")
    try:
        res = requests.post(f"{API_BASE_URL}/media/cleanup-old",
                            headers=_internal_headers(), timeout=120)
        if res.status_code == 200:
            print(f"cleanup-old: {res.json()}")
        else:
            print(f"cleanup-old returned {res.status_code}: {res.text[:200]}")
    except Exception as e:
        print(f"Error triggering photo cleanup: {e}")


def steam_materialize_slots():
    """Daily tick: materialize slots from every active steam_slot_template up to the
    configured horizon (default 8 weeks). Auto-pauses templates whose repeats_until passed."""
    print("Triggering steam slot materialization...")
    try:
        res = requests.post(f"{API_BASE_URL}/steam/internal/materialize",
                            headers=_internal_headers(), timeout=60)
        if res.status_code == 200:
            print(f"steam materialize: {res.json()}")
        else:
            print(f"steam materialize returned {res.status_code}: {res.text[:200]}")
    except Exception as e:
        print(f"Error triggering steam materialization: {e}")


def steam_cleanup_sessions():
    """Hourly tick: clear expired staff session tokens (24h TTL)."""
    try:
        res = requests.post(f"{API_BASE_URL}/steam/internal/cleanup-sessions",
                            headers=_internal_headers(), timeout=30)
        if res.status_code == 200:
            data = res.json()
            if data.get("cleared", 0):
                print(f"steam cleanup-sessions: cleared={data['cleared']}")
        else:
            print(f"steam cleanup-sessions returned {res.status_code}: {res.text[:200]}")
    except Exception as e:
        print(f"Error triggering steam cleanup-sessions: {e}")


def steam_expire_bookings():
    """Per-loop tick: pending bookings past booking_window → expired; confirmed bookings
    past slot.starts_at → expired (no-show). Capacity is NOT released on expiry."""
    try:
        res = requests.post(f"{API_BASE_URL}/steam/internal/expire-bookings",
                            headers=_internal_headers(), timeout=30)
        if res.status_code == 200:
            data = res.json()
            pending = data.get("pending_expired", 0)
            confirmed = data.get("confirmed_expired", 0)
            if pending or confirmed:
                print(f"steam expire-bookings: pending={pending} confirmed={confirmed}")
        else:
            print(f"steam expire-bookings returned {res.status_code}: {res.text[:200]}")
    except Exception as e:
        print(f"Error triggering steam expire-bookings: {e}")


def main():
    global _last_cleanup_day, _last_steam_materialize_day, _last_steam_session_cleanup_hour
    print("Atmos AI Monitoring Service started.")
    print(f"Polling interval: {POLL_INTERVAL_SECONDS} seconds")
    print(f"Internal token configured: {bool(INTERNAL_TOKEN)}")

    while True:
        try:
            now = time.localtime()
            print(f"--- Running checks at {time.strftime('%Y-%m-%d %H:%M:%S', now)} ---")
            generate_daily_tasks()
            steam_expire_bookings()

            today = time.strftime("%Y-%m-%d", now)
            if now.tm_hour >= PHOTO_CLEANUP_HOUR and _last_cleanup_day != today:
                cleanup_old_photos()
                _last_cleanup_day = today
            if now.tm_hour >= STEAM_MATERIALIZE_HOUR and _last_steam_materialize_day != today:
                steam_materialize_slots()
                _last_steam_materialize_day = today
            # hourly: cleanup expired staff sessions
            hour_key = (today, now.tm_hour)
            if _last_steam_session_cleanup_hour != hour_key:
                steam_cleanup_sessions()
                _last_steam_session_cleanup_hour = hour_key
        except Exception as e:
            print(f"Error in checking loop: {e}")

        time.sleep(POLL_INTERVAL_SECONDS)


if __name__ == "__main__":
    main()
