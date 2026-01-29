from playwright.sync_api import sync_playwright
import time
import sys

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        base_url = "http://localhost:8000/protein_params.html"
        print(f"Navigating to {base_url}")
        page.goto(base_url)

        # 1. Input Sequence
        seq = "MNNST"
        page.fill("#fasta_input", f">test\n{seq}")
        page.click("#analyze_button")

        # 2. Check Results appeared
        page.wait_for_selector("#results_section .feature-track-svg")
        print("Results rendered.")

        # 3. Check Feature Control Panel
        assert page.is_visible("#feature-controls-container"), "Feature controls container missing"

        # 4. Search for 'glycosylation'
        page.fill("#feature_search", "glycosylation")
        time.sleep(0.5)

        # Take screenshot of the filtered list
        screenshot_path = "/home/jules/verification/feature_filtering.png"
        page.screenshot(path=screenshot_path)
        print(f"Screenshot saved to {screenshot_path}")

        browser.close()

if __name__ == "__main__":
    run()
