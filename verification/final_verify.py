from playwright.sync_api import sync_playwright
import os

def run_test():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:8080/bio_bench.html")
        page.wait_for_load_state('networkidle')

        # Enable dark mode
        page.evaluate("document.documentElement.classList.add('dark')")
        page.wait_for_timeout(500)

        os.makedirs("verification_output", exist_ok=True)
        page.screenshot(path="verification_output/final_dark_bio_bench.png")
        print("Saved final_dark_bio_bench.png")
        browser.close()

if __name__ == "__main__":
    run_test()
