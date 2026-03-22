from playwright.sync_api import sync_playwright
import time
import os

def run():
    print("Starting playwright...")
    with sync_playwright() as p:
        browser = p.chromium.launch(args=['--no-sandbox', '--disable-setuid-sandbox'])
        print("Browser launched")
        page = browser.new_page()
        
        print("Navigating to login...")
        page.goto("http://frontend:3000/login")
        page.fill("input[name='email']", "admin@atmos.com")
        page.fill("input[name='password']", "admin")
        page.click("button[type='submit']")
        time.sleep(2)
        
        print("Navigating to admin tasks...")
        page.goto("http://frontend:3000/admin")
        time.sleep(2)
        page.click("text=Tasks")
        time.sleep(4)
        
        print("Taking before screenshot...")
        page.screenshot(path="/app/before_click.png")

        print("Clicking a task card...")
        # Hover and click the first element with class 'hover-card'
        page.locator(".hover-card").first.click()
        time.sleep(2)
        
        print("Taking after screenshot...")
        page.screenshot(path="/app/after_click.png")
        print("Done!")
        
        browser.close()

if __name__ == "__main__":
    run()
