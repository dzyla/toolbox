from playwright.sync_api import sync_playwright, expect
import os
import time

def run_test():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Use a context with dark color scheme emulation
        context = browser.new_context(color_scheme='dark')
        page = context.new_page()

        files = [
            'gel_annotator.html',
            'text_detector.html',
            'color_generator.html',
            'binding_calculator.html',
            'text_counter.html',
            'protein_params.html',
            'bio_bench.html'
        ]

        base_url = "http://localhost:8080/"

        for filename in files:
            print(f"Verifying {filename}...")
            try:
                page.goto(f"{base_url}{filename}")
            except Exception as e:
                print(f"Failed to load {filename}: {e}")
                continue

            # Force dark mode class on html if it's not applied automatically by media query
            page.evaluate("document.documentElement.classList.add('dark')")

            # Wait a bit
            page.wait_for_timeout(500)

            # Take screenshot
            screenshot_path = f"/home/jules/verification/screenshot_{filename.replace('.html', '')}.png"
            page.screenshot(path=screenshot_path)
            print(f"Screenshot saved to {screenshot_path}")

            # Verify body class
            body_class = page.locator("body").get_attribute("class")
            expected_classes = "bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100"

            # Use strict checking or partial? The order might matter if I pasted it.
            # I pasted it exactly as requested.
            if expected_classes in (body_class or ""):
                 print(f"✅ {filename} has correct body classes.")
            else:
                 print(f"❌ {filename} MISSING body classes. Found: '{body_class}'")

        browser.close()

if __name__ == "__main__":
    run_test()
