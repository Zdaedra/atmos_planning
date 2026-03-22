import time
import os
import requests

POLL_INTERVAL_SECONDS = int(os.getenv("POLL_INTERVAL", 60))
API_BASE_URL = os.getenv("API_BASE_URL", "http://backend:8000")

def check_overdue_tasks():
    print("Checking for overdue tasks...")
    try:
        # In a real app we would call an internal endpoint to fetch and calculate overdue tasks based on Shifts
        # and current Time. Example:
        # response = requests.get(f"{API_BASE_URL}/tasks/overdue")
        # overdue_tasks = response.json()
        
        # Mock logic for MVP according to TZ
        overdue_tasks = []
        if overdue_tasks:
            send_telegram_alert(f"Alert! Found {len(overdue_tasks)} overdue tasks!")
    except Exception as e:
        print(f"Error checking overdue tasks: {e}")

def ai_verify_photos():
    print("Running AI verification on recently uploaded photos...")
    try:
        # Logic to fetch photos in 'needs_review' or newly uploaded status
        # Example validation logic according to TZ:
        # 1. EXIF Timestamp check
        # 2. Call OpenAI Vision API with prompt: "Does this photo match the zone {zone} tasks?"
        pass
    except Exception as e:
        print(f"Error in AI Photo Verification: {e}")

def send_telegram_alert(message: str):
    print(f"[TELEGRAM ALERT SIMULATION] -> {message}")
    # In production, this uses the Telegram Bot API
    # requests.post(f"https://api.telegram.org/bot{TOKEN}/sendMessage", json={"chat_id": CHAT_ID, "text": message})

def simulate_inbound_telegram():
    print("Simulating inbound Telegram message from a Supervisor...")
    try:
        payload = {
            "user_id": "supervisor_anna_123",
            "text": "Request: We need more cleaning supplies in Zone 2",
            "author_name": "Anna"
        }
        res = requests.post(f"{API_BASE_URL}/telegram/webhook", json=payload)
        if res.status_code == 200:
            print("Successfully processed mocked Telegram webhook to create ChangeRequest.")
    except Exception as e:
        print(f"Error simulating inbound Telegram message: {e}")

def generate_daily_tasks():
    print("Triggering daily task generation...")
    try:
        res = requests.post(f"{API_BASE_URL}/tasks/system/generate-daily")
        if res.status_code == 200:
            data = res.json()
            generated = data.get("generated_count", 0)
            if generated > 0:
                print(f"Generated {generated} tasks successfully.")
                send_telegram_alert(f"🌅 Good morning! Spawned {generated} new tasks for today.")
        else:
            print(f"Daily generation endpoint returned status {res.status_code}")
    except Exception as e:
        print(f"Error triggering daily task generation: {e}")

def main():
    print("Atmos AI Monitoring Service started.")
    print(f"Polling interval: {POLL_INTERVAL_SECONDS} seconds")
    
    while True:
        try:
            print(f"--- Running checks at {time.strftime('%Y-%m-%d %H:%M:%S')} ---")
            generate_daily_tasks()
            check_overdue_tasks()
            ai_verify_photos()
            simulate_inbound_telegram()
            
        except Exception as e:
            print(f"Error in checking loop: {e}")
            
        time.sleep(POLL_INTERVAL_SECONDS)

if __name__ == "__main__":
    main()
