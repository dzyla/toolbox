from playwright.sync_api import sync_playwright
import time
import sys

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        # Use localhost
        base_url = "http://localhost:8000/index.html"

        print(f"Navigating to {base_url}")
        try:
            page.goto(base_url)
        except Exception as e:
            print(f"Error loading page: {e}")
            sys.exit(1)

        time.sleep(1) # wait for init

        # Ensure Dark Mode
        if "dark" not in page.evaluate("document.documentElement.className"):
            print("Switching to Dark Mode")
            page.click("button:has-text('Dark')")
            time.sleep(0.5)

        # 2. Navigate to Bio-Bench
        print("Clicking Bio-Bench")
        page.click("text=Bio-Bench")
        time.sleep(2) # Give plenty of time for fetch and render

        # 2a. Check Buffer Mixer
        print("Checking Buffer Mixer")
        # Click the tab to be sure, though it's default
        # The tab might have emoji
        page.click("#bb-tabs button[data-target='tab-buffer']")

        # Verify Import/Export buttons exist
        assert page.is_visible("#btn-import-json")
        assert page.is_visible("#btn-export-json")

        # Verify Add Component adds a row (Smoke test for XSS refactor)
        # Count rows
        rows_before = page.locator("#buffer-rows > div").count()
        page.click("#add-component-btn")
        rows_after = page.locator("#buffer-rows > div").count()
        assert rows_after > rows_before, "Add Component button did not add a row"

        page.screenshot(path="bio_bench_buffer_verified.png")

        # 2b. Check Macromolecules (New Features)
        print("Checking Macromolecules")
        page.click("#bb-tabs button[data-target='tab-macro']")
        time.sleep(0.5)
        # Verify FASTA input
        assert page.is_visible("#macro-prot-seq")
        # Verify Mods List button
        assert page.is_visible("#btn-add-mod")
        page.screenshot(path="bio_bench_macro_verified.png")

        # 3. Check Binding Calculator
        print("Checking Binding Calculator")
        page.click("text=Binding Calc")
        time.sleep(2)
        # Verify Hill Plot explanation
        assert page.is_visible("text=Hill Plot (Linearization)")
        page.screenshot(path="binding_calc_verified.png")

        # 4. Check Color Generator
        print("Checking Color Generator")
        page.click("text=Colors")
        time.sleep(1)
        page.screenshot(path="color_generator_verified.png")

        browser.close()
        print("Verification script finished successfully.")

if __name__ == "__main__":
    run()
