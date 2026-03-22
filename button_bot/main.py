import os
import time
import threading
from fastapi import FastAPI, BackgroundTasks
from pydantic import BaseModel
from typing import List, Optional
import requests
from scenarios import run_all_scenarios

app = FastAPI(title="Atmos QA Bot")

# Global state
BOT_STATE = {
    "is_running": True,
    "last_run": None,
    "checks_count": 0,
    "errors_count": 0,
    "errors": []
}

LOOP_INTERVAL = int(os.environ.get("LOOP_INTERVAL_SECONDS", "300")) 

def bot_loop():
    while True:
        if BOT_STATE["is_running"]:
             _execute_run()
        time.sleep(LOOP_INTERVAL)

def _execute_run():
    print("QA Bot: Starting test run...")
    BOT_STATE["last_run"] = time.strftime("%Y-%m-%d %H:%M:%S")
    BOT_STATE["checks_count"] += 1
    
    # Run the playwright scenarios
    new_errors = run_all_scenarios()
    
    if new_errors:
        BOT_STATE["errors_count"] += len(new_errors)
        # Prepend new errors so latest are first
        BOT_STATE["errors"] = new_errors + BOT_STATE["errors"]
        # Keep only the last 50 errors in memory
        BOT_STATE["errors"] = BOT_STATE["errors"][:50]
    
    print(f"QA Bot: Run complete. Found {len(new_errors)} errors.")

# Start background thread immediately
@app.on_event("startup")
def startup_event():
    thread = threading.Thread(target=bot_loop, daemon=True)
    thread.start()

@app.get("/status")
def get_status():
    return BOT_STATE

@app.post("/start")
def start_bot():
    BOT_STATE["is_running"] = True
    return {"status": "started"}

@app.post("/stop")
def stop_bot():
    BOT_STATE["is_running"] = False
    return {"status": "stopped"}

@app.post("/run_now")
def run_now(background_tasks: BackgroundTasks):
    background_tasks.add_task(_execute_run)
    return {"status": "triggered"}
