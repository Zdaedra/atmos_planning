from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("http://89.167.122.76:4002/login")
    page.fill("input[type='email']", "admin@atmos.com")
    page.fill("input[type='password']", "admin123")
    page.click("button:has-text('Login')")
    page.wait_for_url("**/dashboard")
    page.click("text=Calendar")
    page.wait_for_timeout(2000)
    page.screenshot(path="cal1.png")
    # Click on the 15th
    page.click("button:has-text('15')")
    page.wait_for_timeout(2000)
    page.screenshot(path="cal2.png")
    browser.close()
    print("Test passed without timeout!")
