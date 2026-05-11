import time
import os
import requests

POLL_INTERVAL_SECONDS = int(os.getenv("POLL_INTERVAL", 3600))
API_BASE_URL = os.getenv("API_BASE_URL", "http://backend:8000")
INTERNAL_TOKEN = os.getenv("INTERNAL_TOKEN")
PHOTO_CLEANUP_HOUR = int(os.getenv("PHOTO_CLEANUP_HOUR", 3))  # local container hour to trigger cleanup
_last_cleanup_day = None


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


def main():
    global _last_cleanup_day
    print("Atmos AI Monitoring Service started.")
    print(f"Polling interval: {POLL_INTERVAL_SECONDS} seconds")
    print(f"Internal token configured: {bool(INTERNAL_TOKEN)}")

    while True:
        try:
            now = time.localtime()
            print(f"--- Running checks at {time.strftime('%Y-%m-%d %H:%M:%S', now)} ---")
            generate_daily_tasks()

            today = time.strftime("%Y-%m-%d", now)
            if now.tm_hour >= PHOTO_CLEANUP_HOUR and _last_cleanup_day != today:
                cleanup_old_photos()
                _last_cleanup_day = today
        except Exception as e:
            print(f"Error in checking loop: {e}")

        time.sleep(POLL_INTERVAL_SECONDS)


if __name__ == "__main__":
    main()
