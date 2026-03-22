import time
import os
import base64
import json
import urllib.request
from typing import List, Dict
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

# Target internal frontend URL reachable via Docker network
TARGET_URL = os.environ.get("FRONTEND_URL", "http://frontend:3000")
ADMIN_LOGINS = {"email": "admin@atmos.local", "password": "admin123"}
SUPE_LOGINS = {"email": "anna@atmos.com", "password": "password123"}

def cleanup_test_data():
    """Removes any orphaned Bot Test items from the database before a test run."""
    backend_url = os.environ.get("BACKEND_URL", "http://backend:8000")
    try:
        req = urllib.request.Request(f"{backend_url}/tasks/templates/")
        with urllib.request.urlopen(req) as response:
            templates = json.loads(response.read().decode())
        
        for t in templates:
            name = t.get("name") or ""
            if "Bot Test" in name:
                del_req = urllib.request.Request(f"{backend_url}/tasks/templates/{t['id']}", method="DELETE")
                urllib.request.urlopen(del_req)
    except Exception as e:
        print(f"Cleanup failed: {e}")

def run_all_scenarios() -> List[Dict]:
    """Runs all UI scenarios and returns a list of error dictionaries."""
    cleanup_test_data()
    errors = []
    
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--no-sandbox", "--disable-setuid-sandbox"])
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()

        def log_error(scenario, action, expected, actual, error_type):
            print(f"ERROR [{scenario}]: {actual}")
            # Capture screenshot
            screenshot_str = None
            try:
                screenshot_bytes = page.screenshot()
                screenshot_str = base64.b64encode(screenshot_bytes).decode('utf-8')
            except Exception as e:
                print(f"Failed to capture screenshot: {e}")
            
            errors.append({
                "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                "scenario": scenario,
                "screen": page.url,
                "action": action,
                "expected": expected,
                "actual": actual,
                "error_type": error_type,
                "screenshot_base64": screenshot_str
            })

        # --- SCENARIO: Login ---
        scenario_name = "Login"
        try:
            print(f"Running scenario: {scenario_name}")
            page.goto(TARGET_URL)
            page.wait_for_selector("input[type='email']", timeout=15000)
            
            page.fill("input[placeholder='admin@atmos.com']", ADMIN_LOGINS["email"])
            page.fill("input[placeholder='••••••••']", ADMIN_LOGINS["password"])
            page.click("button[type='submit']")
            page.wait_for_timeout(3000)
            # Submit triggers React router navigation
        except PlaywrightTimeoutError as e:
            log_error(scenario_name, "wait for login submit", "successful login routing", str(e), "interaction_error")
        except Exception as e:
            log_error(scenario_name, "perform login", "successful login routing", str(e), "unexpected_error")


        # --- SCENARIO: Admin Dashboard ---
        scenario_name = "Admin Dashboard"
        try:
            print(f"Running scenario: {scenario_name}")
            page.wait_for_selector("text=Overview", timeout=15000)
            # Verify KPI cards exist
            kpi_cards = page.locator("text=On Shift Today")
            if kpi_cards.count() == 0:
                log_error(scenario_name, "find KPI cards", "KPI cards are present", "0 cards found", "element_missing")
        except PlaywrightTimeoutError as e:
            log_error(scenario_name, "wait for Overview text", "Dashboard loaded", str(e), "visibility_error")
        except Exception as e:
            log_error(scenario_name, "verify dashboard", "Dashboard loaded", str(e), "unexpected_error")


        # --- SCENARIO: Admin Actions Verification ---
        scenario_name = "Admin Actions Verification"
        try:
            print(f"Running scenario: {scenario_name}")
            
            # 1. Tasks Tab Detail View Flow
            page.click("text=Tasks")
            page.wait_for_timeout(1000)
            
            # Create a test template
            page.click("button:has-text('Create Template')")
            page.wait_for_timeout(500)
            if page.locator("text=New Task Rule").count() == 0:
                log_error(scenario_name, "click Create Template", "Template form appears", "Form missing", "ui_broken")
            else:
                page.fill("input[placeholder='e.g. Deep Cleaning']", "Bot Test Detail Task")
                page.click("button:has-text('Save Rule')")
                page.wait_for_timeout(1500)

            # Expand the Daily Tasks accordion explicitly
            page.locator("text=Daily Tasks").first.click()
            page.wait_for_timeout(1000)

            # Find the task and click it
            page.screenshot(path="/app/bot_error_manual_before_wait.png")
            target_task = page.locator("div.hover-card", has_text="Bot Test Detail Task").first
            if target_task.count() == 0:
                page.screenshot(path="/app/bot_error_manual.png")
                log_error(scenario_name, "find created task", "Task in list", "0 found", "element_missing")
            else:
                target_task.click()
                page.wait_for_timeout(1000)
                
                # Verify Detail View (Cancel button exists in details form)
                if page.locator("button:has-text('Cancel')").count() == 0:
                    log_error(scenario_name, "open details view", "Detail view opened", "Cancel button missing", "ui_broken")
                else:
                    # We are in edit mode (form is visible)
                    if page.locator("text=Edit Task Rule").count() == 0:
                        log_error(scenario_name, "enter edit mode", "Edit form visible", "Form missing", "ui_broken")
                    else:
                        # Change the name and save
                        page.fill("input[placeholder='e.g. Deep Cleaning']", "Bot Test Detail Task - EDITED")
                        page.click("button:has-text('Save Rule')")
                        page.wait_for_timeout(1500)
                        
                        # Re-find the task to delete it
                        edited_task = page.locator("div.hover-card", has_text="Bot Test Detail Task - EDITED").first
                        if edited_task.count() == 0:
                            log_error(scenario_name, "verify edit save", "Edited task in list", "0 found", "element_missing")
                        else:
                            edited_task.click()
                            page.wait_for_timeout(1000)
                            
                            # Verify Delete task button and clean up
                            if page.locator("button:has-text('Delete task')").count() == 0:
                                log_error(scenario_name, "delete button", "Delete button present", "Button missing", "element_missing")
                            else:
                                page.once("dialog", lambda dialog: dialog.accept())
                                page.click("button:has-text('Delete task')")
                                page.wait_for_timeout(1500)

            # 2. Centers Tab
            page.click("text=Centers & Zones")
            page.wait_for_timeout(1000)
            page.click("button:has-text('New Center')")
            page.wait_for_timeout(500)
            if page.locator("text=Center Name").count() == 0:
                log_error(scenario_name, "click New Center", "Center form appears", "Form missing", "ui_broken")

            # 3. Users Tab
            page.click("text=Supervisors")
            page.wait_for_timeout(1000)
            page.click("button:has-text('Add Supervisor')")
            page.wait_for_timeout(500)
            if page.locator("input[placeholder*='password']").count() == 0: 
                log_error(scenario_name, "click Add Supervisor", "User form appears", "Form missing", "ui_broken")
                
            # 4. AI Alerts Tab
            page.click("text=AI Alerts")
            page.wait_for_timeout(1000)
            create_task_btn = page.locator("button:has-text('Create Task')").first
            if create_task_btn.count() > 0:
                create_task_btn.click()
                page.wait_for_timeout(500)
            else:
                 log_error(scenario_name, "find Create Task button in alerts", "Button present", "Button missing", "element_missing")

        except Exception as e:
            log_error(scenario_name, "test admin actions", "Actions clickable", str(e), "unexpected_error")


        # --- SCENARIO: Supervisor Shift Start ---
        scenario_name = "Supervisor Shift Start"
        try:
            print(f"Running scenario: {scenario_name}")
            page.goto(TARGET_URL)
            page.wait_for_selector("input[type='email']", timeout=15000)
            page.fill("input[type='email']", SUPE_LOGINS["email"])
            page.fill("input[type='password']", SUPE_LOGINS["password"])
            page.click("button[type='submit']")
            page.wait_for_timeout(1000)
            page.goto(TARGET_URL + "/dashboard")
            page.wait_for_timeout(2000)
            
            # Start Shift
            page.wait_for_selector("text=Anna, Supervisor", timeout=15000)
            
            # If the user is already on shift, the Start Shift button won't exist.
            start_btn = page.locator("button:has-text('Start Shift')")
            if start_btn.count() > 0:
                start_btn.click()
                page.wait_for_timeout(2000)
            
            # Verify Operations list appears
            page.wait_for_selector("text=Tasks", timeout=15000)
        except PlaywrightTimeoutError as e:
            log_error(scenario_name, "start shift flow", "Operations list visible", str(e), "visibility_error")
        except Exception as e:
            log_error(scenario_name, "start shift flow", "Operations list visible", str(e), "unexpected_error")


        # --- SCENARIO: Supervisor Task Completion ---
        scenario_name = "Supervisor Task Completion"
        try:
            print(f"Running scenario: {scenario_name}")
            # Assuming we are already on the dashboard with a started shift from the previous test
            page.wait_for_selector("text=Tasks", timeout=15000)
            
            # Find the first incomplete task card and click it to open Details
            task_cards = page.locator(".hover-card")
            if task_cards.count() > 0:
                task_cards.first.click()
                page.wait_for_timeout(1000)
                
                # Verify Details View loaded
                if page.locator("text=Time Objective").count() == 0:
                     log_error(scenario_name, "open task details", "Details view visible", "Missing details", "ui_broken")
                else:
                     # Type a comment
                     page.fill("textarea", "Button Bot tested this task.")
                     page.wait_for_timeout(500)
                     
                     # Click Submit Completion
                     complete_btns = page.locator("button:has-text('Submit Completion')")
                     if complete_btns.count() > 0:
                         complete_btns.first.click()
                         page.wait_for_timeout(2000)
                         
                         # Verify the UI updates to show Done on the main list
                         page.wait_for_selector("text=Done", timeout=15000)
                     else:
                         log_error(scenario_name, "find mark complete button", "Button present", "0 buttons found", "element_missing")
            else:
                log_error(scenario_name, "find task card", "Task cards present", "0 cards found", "element_missing")
        except PlaywrightTimeoutError as e:
            log_error(scenario_name, "complete task flow", "Task marked done", str(e), "interaction_error")
        except Exception as e:
            log_error(scenario_name, "complete task flow", "Task marked done", str(e), "unexpected_error")

        browser.close()
        
    return errors
