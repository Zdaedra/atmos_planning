from playwright.sync_api import sync_playwright
import traceback

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    try:
        page.goto("http://89.167.122.76:4002/login")
        page.fill("input[placeholder='admin@atmos.com']", "admin@atmos.local")
        page.fill("input[placeholder='••••••••']", "admin123")
        page.click("button:has-text('Login')")
        page.wait_for_timeout(2000)
        page.click("text=Tasks")
        page.wait_for_timeout(2000)
    except Exception as e:
        print(f"Error occurred: {e}")
        traceback.print_exc()
    finally:
        with open("/app/tasks_html.html", "w") as f:
            f.write(page.content())
        page.screenshot(path="/app/tasks_img.png")
        browser.close()
    print("Tasks debug complete")
