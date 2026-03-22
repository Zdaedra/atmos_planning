from playwright.sync_api import sync_playwright
import traceback

with sync_playwright() as p:
    try:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://89.167.122.76:4002/login")
        page.fill("input[type='email']", "admin@atmos.com")
        page.fill("input[type='password']", "admin123")
        page.click("button:has-text('Login')")
        page.wait_for_url("**/dashboard")
        page.click("text=Calendar")
        page.wait_for_timeout(2000)
        
        print("Before click:", page.locator("h2").all_inner_texts())
        buttons = page.locator("button.rdp-button").all_inner_texts()
        print("Buttons found:", len(buttons))
        
        # Try to click on the 15th
        day_15 = page.locator("button[name='day']", has_text="15")
        if day_15.count() > 0:
            day_15.first.click()
            print("Clicked 15th!")
        else:
            print("Could not find button 15")
            
        page.wait_for_timeout(2000)
        print("After click:", page.locator("h2").all_inner_texts())
        browser.close()
    except Exception as e:
        print("Error!")
        traceback.print_exc()
