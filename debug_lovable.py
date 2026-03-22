from playwright.sync_api import sync_playwright

def debug_white_screen():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1400, "height": 900})
        
        # Listen for console logs and page errors
        page.on("console", lambda msg: print(f"CONSOLE: [{msg.type}] {msg.text}"))
        page.on("pageerror", lambda err: print(f"PAGE ERROR: {err}"))
        
        print("Navigating to http://89.167.122.76:4002/")
        page.goto("http://89.167.122.76:4002/", wait_until="networkidle")
        
        print("Taking login page screenshot...")
        page.screenshot(path='/Users/daedra/.gemini/antigravity/brain/9ce4aa02-8e69-45a4-8c87-32035488a45c/debug_login.png', full_page=True)
        
        print("Filling login info")
        try:
            page.fill('input[type="email"]', 'admin@atmos.com')
            page.fill('input[type="password"]', 'admin')
            page.click('button[type="submit"]')
        except Exception as e:
            print("Could not fill login info:", e)

        print("Waiting to see what happens...")
        page.wait_for_timeout(5000)
        
        print("Taking post-login screenshot...")
        page.screenshot(path='/Users/daedra/.gemini/antigravity/brain/9ce4aa02-8e69-45a4-8c87-32035488a45c/debug_post_login.png', full_page=True)
        browser.close()

if __name__ == "__main__":
    debug_white_screen()
