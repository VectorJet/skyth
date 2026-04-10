import json
import time
import asyncio
from urllib.parse import quote
from concurrent.futures import ThreadPoolExecutor
import requests
from bs4 import BeautifulSoup
from typing import List, Dict, Any

from backend.base_classes.basetool import BaseTool
from backend.utils import is_high_quality_image, setup_selenium_driver

def _scrape_google_images(driver, query, max_results=10):
    """Extracts high-quality image URLs from Google Images."""
    from selenium.webdriver.common.by import By # Import here to avoid top-level dependency failure
    
    print(f"鳩 [Google Images] Searching for: {query}")
    try:
        url = f"https://www.google.com/search?tbm=isch&q={quote(query)}&safe=off&tbs=isz:l" # isz:l for large
        driver.get(url)
        time.sleep(2)

        # Scroll to load more images
        for _ in range(3):
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            time.sleep(1.5)

        img_elements = driver.find_elements(By.CSS_SELECTOR, "img.rg_i")
        
        image_urls = set()
        for img in img_elements:
            src = img.get_attribute("src") or img.get_attribute("data-src")
            if src and src.startswith('http') and not src.startswith('data:image'):
                if is_high_quality_image(src):
                    image_urls.add(src)
            if len(image_urls) >= max_results:
                break
        
        image_urls_list = list(image_urls)
        print(f"   - Found {len(image_urls_list)} high-quality images.")
        
        source_page_url = f"https://www.google.com/search?tbm=isch&q={quote(query)}"
        return [{"type": "image_search_result", "title": query, "image_url": url, "source_url": source_page_url} for url in image_urls_list]
    except Exception as e:
        print(f"閥 [Google Images] Error scraping Google Images: {e}")
        return []


def _scrape_bing_images(query, max_results=8):
    """Extracts high-quality image URLs from Bing Images."""
    print(f"鳩 [Bing Images] Searching for: {query}")
    try:
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"}
        url = f"https://www.bing.com/images/search?q={quote(query)}&form=HDRSC2&qft=+filterui:imagesize-large"
        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, 'html.parser')
        results = []
        for i, tag in enumerate(soup.select("a.iusc")):
            if i >= max_results: break
            if m_data := tag.get("m"):
                try:
                    json_data = json.loads(m_data)
                    if image_url := json_data.get("murl"):
                        if is_high_quality_image(image_url):
                            results.append({
                                "type": "image_search_result",
                                "title": json_data.get("t", "Image"),
                                "image_url": image_url,
                                "source_url": json_data.get("purl", url)
                            })
                except Exception:
                    continue # Ignore malformed tags
        print(f"   - Found {len(results)} high-quality images.")
        return results
    except Exception as e:
        print(f"閥 [Bing Images] Bing image search error: {e}")
        return []

class ImageSearchTool(BaseTool):
    """A tool for searching the web for high-quality images."""

    @property
    def name(self) -> str: return "image_searcher"
    @property
    def description(self) -> str: return "Searches both Google and Bing for high-quality images based on a query. Use this to find pictures of things."

    async def run(self, input_data: Any) -> List[Dict[str, Any]]:
        query = input_data.get("query")
        max_results_per_source = input_data.get("max_results_per_source", 8)
        
        # Execute blocking calls in thread pool
        loop = asyncio.get_running_loop()
        
        def blocking_search():
            driver = None
            try:
                # We do internal threading for Bing vs Google inside this block if needed,
                # or just run them sequentially in the thread.
                # Since we are already offloading to a thread, sequential is fine, 
                # but let's keep the ThreadPool for parallelism between engines.
                
                with ThreadPoolExecutor(max_workers=2) as executor:
                    bing_future = executor.submit(_scrape_bing_images, query, max_results_per_source)
                    
                    driver = setup_selenium_driver()
                    if driver:
                        google_results = _scrape_google_images(driver, query, max_results_per_source)
                    else:
                        google_results = []
                    
                    bing_results = bing_future.result()

                return google_results + bing_results
            finally:
                if driver:
                    driver.quit()
                    print("   - [Selenium] Driver instance for image search has been closed.")

        all_results = await loop.run_in_executor(None, blocking_search)
        
        # Deduplicate results based on the image URL
        unique_results = list({v['image_url']:v for v in all_results}.values())
        return unique_results
