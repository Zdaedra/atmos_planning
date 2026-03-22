from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("http://89.167.122.76:4002/login")
    page.fill("input[placeholder='Email']", "admin@atmos.local")
    page.fill("input[placeholder='Password']", "admin123")
    page.click("button:has-text('Login')")
    page.wait_for_timeout(2000)
    page.click("text=Tasks")
    page.wait_for_timeout(2000)
    page.click("button:has-text('Create Template')")
    page.wait_for_timeout(1000)
    page.fill("input[placeholder='e.g. Clean Main Lobby']", "Bot Test Detail Task Debug")
    page.click("button:has-text('Save Rule')")
    page.wait_for_timeout(2000)
    
    with open("debug_html.html", "w") as f:
        f.write(page.content())
    page.screenshot(path="debug_img.png")
    
    browser.close()
    print("Debug script complete")
