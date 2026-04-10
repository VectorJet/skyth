# backend/utils.py
import re

def is_high_quality_image(url: str) -> bool:
    """Basic check to see if an image URL looks high-res or valid."""
    if not url: return False
    # Filter out common low-res thumbnails or data URIs if they leak through
    if "base64" in url: return False
    # Heuristics can be improved
    return True

# Placeholder for selenium setup if we want to include it, 
# but for migration safety and container environments, 
# we might want to make it optional or mock it if chromedriver isn't present.
def setup_selenium_driver():
    try:
        from selenium import webdriver
        from selenium.webdriver.chrome.options import Options
        
        options = Options()
        options.add_argument("--headless")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        
        # Assume chromedriver is in path or managed by webdriver-manager
        driver = webdriver.Chrome(options=options)
        return driver
    except Exception as e:
        print(f"Failed to setup selenium: {e}")
        return None
