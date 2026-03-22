from playwright.sync_api import sync_playwright
import traceback

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.on("console", lambda msg: print(f"Browser console ({msg.type}): {msg.text}"))
    page.on("pageerror", lambda err: print(f"Browser error: {err}"))
    
    try:
        page.goto("http://89.167.122.76:4002/login")
        page.fill("input[type='email']", "admin@atmos.com")
        page.fill("input[type='password']", "admin123")
        page.click("button:has-text('Login')")
        page.wait_for_url("**/dashboard")
        print("At dashboard, navigating to tasks...")
        page.click("text=Tasks")
        page.wait_for_timeout(3000)
    except Exception as e:
        print(f"Error occurred: {e}")
        traceback.print_exc()
    finally:
        with open("/app/tasks_html2.html", "w") as f:
            f.write(page.content())
        page.screenshot(path="/app/tasks_img2.png")
        browser.close()
    print("Tasks debug complete")
