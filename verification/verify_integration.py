import os
from playwright.sync_api import sync_playwright, expect

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Go to the index page (simulating the deployed app context)
        page.goto("http://localhost:8000/index.html")

        # Click the "Protein Workbench" navigation button
        # This triggers the fetch and inject logic in index.html
        nav_btn = page.locator("button[data-src='protein_params.html']")
        expect(nav_btn).to_be_visible()
        nav_btn.click()

        # Wait for the tool to load
        # We check for the analyze button which is part of protein_params.html
        analyze_btn = page.locator("#analyze_button")
        expect(analyze_btn).to_be_visible()

        # Fill input
        page.fill("#fasta_input", ">Test\nMVLSPADKTNVKAAWGKVGAHAGEYGAEALERMFLSFPTTKTYFPHFDLSHGSAQVKGHGKKVADALTNAVAHVDDMPNALSALSDLHAHKLRVDPVNFKLLSHCLLVTLAAHLPAEFTPAVHASLDKFLASVSTVLTSKYR")

        # Click Analyze
        analyze_btn.click()

        # Wait for result card
        result_card = page.locator("#result-card-1")
        expect(result_card).to_be_visible()

        # Take screenshot
        page.screenshot(path="verification/verification_integration.png", full_page=True)

        browser.close()

if __name__ == "__main__":
    run()
