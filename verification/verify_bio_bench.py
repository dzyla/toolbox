
from playwright.sync_api import sync_playwright
import os

def run_verification():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Load the index page
        # Since we are static, we can load the file directly.
        # But we need to make sure the relative fetches work.
        # Using a simple python http server might be safer if fetch is used.
        # However, let's try direct file access first, but fetch often fails on file://
        # We will use python http.server to serve the current directory.

        page.goto("http://localhost:8000/index.html")

        # Wait for content to load
        page.wait_for_selector("nav")

        # Click on Bio-Bench tab
        page.click("button[data-src='bio_bench.html']")

        # Wait for Bio-Bench content
        page.wait_for_selector("#tab-buffer")

        # 1. Verify Buffer Mixer
        # Check if placeholder 10 is gone
        conc_input = page.locator(".comp-conc").first
        placeholder = conc_input.get_attribute("placeholder")
        if placeholder == "10":
            print("FAIL: Placeholder 10 still present")
        else:
            print("PASS: Placeholder 10 removed")

        # Take screenshot of Buffer Mixer
        page.screenshot(path="verification/buffer_mixer.png")

        # 2. Verify Macromolecules
        # Switch tab
        page.click("button[data-target='tab-macro']")
        page.wait_for_selector("#tab-macro:not(.hidden)")

        # Check for Abs 0.1% field
        if page.locator("#macro-prot-abs-percent").is_visible():
             print("PASS: Abs 0.1% field visible")
        else:
             print("FAIL: Abs 0.1% field missing")

        # Test calculation
        # Set MW = 10kDa (10000), Eps = 10000. Abs1% should be 1.0.
        # Enter A280 = 1.0. Conc mg/mL should be 1.0.
        page.fill("#macro-prot-mw", "10")
        page.fill("#macro-prot-eps", "10000")
        # Trigger input event on MW to calc Abs1%
        page.locator("#macro-prot-mw").dispatch_event("input")

        # Check Abs1% value
        abs_val = page.locator("#macro-prot-abs-percent").input_value()
        print(f"Abs 0.1% Value: {abs_val}") # Should be 1.000

        page.fill("#macro-prot-a280", "1.0")
        page.locator("#macro-prot-a280").dispatch_event("input")

        mg_val = page.locator("#macro-prot-res-mgml-in").input_value()
        print(f"Conc mg/mL Value: {mg_val}") # Should be 1.000

        page.screenshot(path="verification/macromolecule.png")

        # 3. Verify Cryo-EM
        page.click("button[data-target='tab-cryo']")
        page.wait_for_selector("#tab-cryo:not(.hidden)")

        # Check Fourier Crop inputs
        if page.locator("#cryo-fc-box").is_visible():
            print("PASS: Fourier Crop Box input visible")

        page.screenshot(path="verification/cryo.png")

        # 4. Verify Purification / Dilution Schematic
        page.click("button[data-target='tab-purify']")
        page.wait_for_selector("#tab-purify:not(.hidden)")

        # Trigger schematic draw
        page.fill("#sd-factor", "2")
        page.fill("#sd-vol", "100")
        page.locator("#sd-vol").dispatch_event("input")

        # Check if schematic exists
        if page.locator("#sd-schematic > div").count() > 0:
            print("PASS: Schematic generated")

        page.screenshot(path="verification/dilution.png")

        browser.close()

if __name__ == "__main__":
    run_verification()
