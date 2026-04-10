import os
import re
import time
import asyncio
from urllib.parse import urlparse, urljoin
import requests
from bs4 import BeautifulSoup
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from typing import List, Dict, Any, Optional

from backend.base_classes.basetool import BaseTool
from backend.utils import is_high_quality_image, setup_selenium_driver

def _parse_with_bs4(url: str) -> Optional[Dict[str, Any]]:
    print(f"鳩 https://beautiful-soup-4.readthedocs.io/en/latest/ Attempting fast parse of: {url}")
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'}
    try:
        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()
        content_type = response.headers.get('content-type', '').lower()
        if 'html' not in content_type:
            return None
        soup = BeautifulSoup(response.content, 'html.parser')
        for tag in soup(['script', 'style', 'nav', 'header', 'footer', 'aside', 'form']):
            tag.decompose()
        title = soup.title.string.strip() if soup.title else ''
        main_content_selectors = ['article', 'main', '[role="main"]', '.post-content', '.article-body', '#content', '#main-content']
        main_content_tag = next((soup.select_one(s) for s in main_content_selectors if soup.select_one(s)), soup.body)
        text_content, links, images = '', [], []
        if main_content_tag:
            lines = (line.strip() for line in main_content_tag.get_text(separator='\n').splitlines())
            chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
            text_content = '\n'.join(chunk for chunk in chunks if chunk)
            for link in main_content_tag.find_all('a', href=True):
                if (href := link.get('href')) and href.startswith('http'):
                    links.append({'url': urljoin(url, href), 'text': link.get_text(strip=True)})
            for img in main_content_tag.find_all('img', src=True):
                if (src := img.get('src')) and not src.startswith('data:image'):
                    images.append(urljoin(url, src))
        return {'url': url, 'domain': urlparse(url).netloc, 'title': title, 'text_content': text_content, 'images': images, 'videos': [], 'links': links, 'source_parser': 'bs4'}
    except Exception as e:
        print(f"閥 https://beautiful-soup-4.readthedocs.io/en/latest/ Error during fast parse of {url}: {e}")
        return None

def _parse_url_comprehensive(url: str) -> Dict[str, Any]:
    print(f"鳩 https://stackoverflow.com/questions/13960326/how-can-i-parse-a-website-using-selenium-and-beautifulsoup-in-python Starting comprehensive parse of: {url}")
    parsed_data = {'url': url, 'domain': urlparse(url).netloc, 'title': '', 'text_content': '', 'images': [], 'videos': [], 'links': [], 'source_parser': 'selenium'}
    
    driver = setup_selenium_driver()
    if not driver:
         print("Failed to init driver for comprehensive parse")
         return parsed_data

    try:
        driver.get(url)
        WebDriverWait(driver, 15).until(EC.presence_of_element_located((By.TAG_NAME, "body")))
        time.sleep(3)
        for _ in range(3):
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            time.sleep(1.5)
        parsed_data['title'] = driver.title
        parsed_data['text_content'] = driver.find_element(By.TAG_NAME, "body").text
        page_source = driver.page_source
        image_urls = set()
        for img in driver.find_elements(By.TAG_NAME, "img"):
            if (src := img.get_attribute("src") or img.get_attribute("data-src")) and not src.startswith('data:image') and is_high_quality_image(src):
                image_urls.add(urljoin(url, src))
        for match in re.findall(r'background-image:\s*url(["\\]?([^"\\]*))["\\]?', page_source, re.IGNORECASE):
            if not match[1].startswith('data:image') and is_high_quality_image(match[1]):
                image_urls.add(urljoin(url, match[1]))
        parsed_data['images'] = list(image_urls)
        video_urls = set()
        for video in driver.find_elements(By.TAG_NAME, "video"):
            if src := video.get_attribute("src"): video_urls.add(urljoin(url, src))
            for source in video.find_elements(By.TAG_NAME, "source"):
                if src := source.get_attribute("src"): video_urls.add(urljoin(url, src))
        parsed_data['videos'] = list(video_urls)
        link_data = []
        for link in driver.find_elements(By.TAG_NAME, "a"):
            if (href := link.get_attribute("href")) and href.startswith('http'):
                link_data.append({'url': href, 'text': link.text.strip()})
        parsed_data['links'] = link_data
        return parsed_data
    except Exception as e:
        print(f"閥 https://stackoverflow.com/questions/13960326/how-can-i-parse-a-website-using-selenium-and-beautifulsoup-in-python Error during comprehensive parsing of {url}: {e}")
        return parsed_data
    finally:
        driver.quit()

class UrlParserTool(BaseTool):
    @property
    def name(self) -> str: return "url_parser"
    @property
    def description(self) -> str: return "Comprehensively parses a web URL to extract text, images, videos, and links. Use when the user provides a URL and asks to analyze, summarize, or 'read' it."

    async def run(self, input_data: Any) -> Optional[Dict[str, Any]]:
        url = input_data.get("url")
        deep_scrape = input_data.get("deep_scrape", False)
        
        loop = asyncio.get_running_loop()
        
        def blocking_parse():
            parsed_data = None
            if not deep_scrape:
                parsed_data = _parse_with_bs4(url)
            
            if not parsed_data or len(parsed_data.get('text_content', '')) < 500 or deep_scrape:
                parsed_data = _parse_url_comprehensive(url)
            
            return parsed_data

        return await loop.run_in_executor(None, blocking_parse)
