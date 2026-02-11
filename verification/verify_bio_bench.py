from playwright.sync_api import sync_playwright
import time

def verify(page):
    # Load index
    page.goto("http://localhost:8080/index.html")

    # Click Bio-Bench tab
    page.get_by_role("button", name="Bio-Bench").click()
    time.sleep(1) # wait for fetch

    # Click Sequence Viewer tab (inside bio-bench)
    # The tab button has text "Sequence Viewer"
    page.get_by_text("Sequence Viewer").first.click()

    # Input sequence
    seq_input = page.locator("#sv-seq-input")
    seq_input.fill("MSTRSVSSSSYRRMFGGPGTASRPSSSRSYVTTSTRTYSLGSALRPSTSRSLYASSPGGVYATRSSAVRLR")

    # Add highlighting
    page.locator("#sv-add-hl").click()

    # Toggle Features
    page.locator("#sv-show-feats").check()

    # Check if Uncheck All exists
    uncheck_btn = page.locator("#sv-uncheck-all")
    if not uncheck_btn.is_visible():
        print("Uncheck All button not visible")

    # Check if Color Picker exists
    color_picker = page.locator("#sv-hl-color")
    if not color_picker.is_visible():
        print("Color Picker not visible")

    # Toggle Dark Mode
    theme_btn = page.locator("#theme-toggle")
    theme_btn.click()
    time.sleep(0.5)

    # Screenshot Dark Mode
    page.screenshot(path="verification/bio_bench_dark.png")

    # Toggle Light Mode
    theme_btn.click()
    time.sleep(0.5)
    page.screenshot(path="verification/bio_bench_light.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify(page)
        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()
