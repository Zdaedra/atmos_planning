import sys
from playwright.sync_api import sync_playwright
import time
import os
import traceback

def run():
    print("Starting Good Bot verification for UI Grouping...")
    with sync_playwright() as p:
        browser = p.chromium.launch(args=['--no-sandbox', '--disable-setuid-sandbox'])
        print("Browser launched")
        page = browser.new_page()
        
        try:
            print("Navigating to Admin Tasks Page...")
            page.goto("http://frontend:3000/admin", wait_until="domcontentloaded", timeout=60000)
            time.sleep(4)
            page.click("text=Tasks")
            time.sleep(5)
            
            print("Taking screenshot of grouped task layout...")
            page.screenshot(path="/app/tasks_grouped_view.png")

            print("Testing interactive flow - clicking a task within a group...")
            if page.locator(".hover-card").count() > 0:
                page.locator(".hover-card").first.click()
                time.sleep(2)
                print("Taking screenshot of opened task form...")
                page.screenshot(path="/app/tasks_grouped_edit_form.png")
            else:
                print("No active rules to click. Just taking standard screenshot.")
            print("Done!")
        except Exception as e:
            print("Failed. Capturing error context.")
            page.screenshot(path="/app/error_context.png")
            traceback.print_exc()
            sys.exit(1)
        finally:
            browser.close()

if __name__ == "__main__":
    run()
