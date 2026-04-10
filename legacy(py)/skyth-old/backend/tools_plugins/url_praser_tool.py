import re
import time
from urllib.parse import urlparse, urljoin
import requests
from bs4 import BeautifulSoup
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from typing import List, Dict, Any, Optional

from backend.basetool import BaseTool
from backend.tools import setup_selenium_driver
from backend.utils import is_high_quality_image


def _parse_with_bs4(url: str) -> Optional[Dict[str, Any]]:
    print(
        f"鳩 https://beautiful-soup-4.readthedocs.io/en/latest/ Attempting fast parse of: {url}"
    )
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
    }
    try:
        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()
        content_type = response.headers.get("content-type", "").lower()
        if "html" not in content_type:
            return None
        soup = BeautifulSoup(response.content, "html.parser")
        for tag in soup(
            ["script", "style", "nav", "header", "footer", "aside", "form"]
        ):
            tag.decompose()
        title = soup.title.string.strip() if soup.title else ""
        main_content_selectors = [
            "article",
            "main",
            '[role="main"]',
            ".post-content",
            ".article-body",
            "#content",
            "#main-content",
        ]
        main_content_tag = next(
            (soup.select_one(s) for s in main_content_selectors if soup.select_one(s)),
            soup.body,
        )
        text_content, links, images = "", [], []
        if main_content_tag:
            lines = (
                line.strip()
                for line in main_content_tag.get_text(separator="\n").splitlines()
            )
            chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
            text_content = "\n".join(chunk for chunk in chunks if chunk)
            for link in main_content_tag.find_all("a", href=True):
                if (href := link.get("href")) and href.startswith("http"):
                    links.append(
                        {"url": urljoin(url, href), "text": link.get_text(strip=True)}
                    )
            for img in main_content_tag.find_all("img", src=True):
                if (src := img.get("src")) and not src.startswith("data:image"):
                    images.append(urljoin(url, src))
        return {
            "url": url,
            "domain": urlparse(url).netloc,
            "title": title,
            "text_content": text_content,
            "images": images,
            "videos": [],
            "links": links,
            "source_parser": "bs4",
        }
    except Exception as e:
        print(
            f"閥 https://beautiful-soup-4.readthedocs.io/en/latest/ Error during fast parse of {url}: {e}"
        )
        return None


def _parse_url_comprehensive(driver, url: str) -> Dict[str, Any]:
    print(
        f"鳩 https://stackoverflow.com/questions/13960326/how-can-i-parse-a-website-using-selenium-and-beautifulsoup-in-python Starting comprehensive parse of: {url}"
    )
    parsed_data = {
        "url": url,
        "domain": urlparse(url).netloc,
        "title": "",
        "text_content": "",
        "images": [],
        "videos": [],
        "links": [],
        "source_parser": "selenium",
    }
    try:
        driver.get(url)
        WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.TAG_NAME, "body"))
        )
        time.sleep(3)
        for _ in range(3):
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            time.sleep(1.5)
        parsed_data["title"] = driver.title
        parsed_data["text_content"] = driver.find_element(By.TAG_NAME, "body").text
        page_source = driver.page_source
        image_urls = set()
        for img in driver.find_elements(By.TAG_NAME, "img"):
            if (
                (src := img.get_attribute("src") or img.get_attribute("data-src"))
                and not src.startswith("data:image")
                and is_high_quality_image(src)
            ):
                image_urls.add(urljoin(url, src))
        for match in re.findall(
            r'background-image:\s*url\(["\']?([^"\']*)["\']?\)',
            page_source,
            re.IGNORECASE,
        ):
            if not match.startswith("data:image") and is_high_quality_image(match):
                image_urls.add(urljoin(url, match))
        parsed_data["images"] = list(image_urls)
        video_urls = set()
        for video in driver.find_elements(By.TAG_NAME, "video"):
            if src := video.get_attribute("src"):
                video_urls.add(urljoin(url, src))
            for source in video.find_elements(By.TAG_NAME, "source"):
                if src := source.get_attribute("src"):
                    video_urls.add(urljoin(url, src))
        parsed_data["videos"] = list(video_urls)
        link_data = []
        for link in driver.find_elements(By.TAG_NAME, "a"):
            if (href := link.get_attribute("href")) and href.startswith("http"):
                link_data.append({"url": href, "text": link.text.strip()})
        parsed_data["links"] = link_data
        return parsed_data
    except Exception as e:
        print(
            f"閥 https://stackoverflow.com/questions/13960326/how-can-i-parse-a-website-using-selenium-and-beautifulsoup-in-python Error during comprehensive parsing of {url}: {e}"
        )
        return parsed_data


class UrlParserTool(BaseTool):
    @property
    def name(self) -> str:
        return "url_parser"

    @property
    def description(self) -> str:
        return "Comprehensively parses a web URL to extract text, images, videos, and links. Use when the user provides a URL and asks to analyze, summarize, or 'read' it."

    @property
    def parameters(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "url",
                "type": "string",
                "description": "The URL of the web page to parse.",
            },
            {
                "name": "deep_scrape",
                "type": "boolean",
                "description": "Force using the deep (Selenium) scraper instead of trying the fast scraper first.",
            },
        ]

    @property
    def output_type(self) -> str:
        return "parsed_url_content"

    def execute(
        self, url: str, deep_scrape: bool = False, driver=None
    ) -> Optional[Dict[str, Any]]:
        parsed_data = None
        if not deep_scrape:
            parsed_data = _parse_with_bs4(url)
        if (
            not parsed_data
            or len(parsed_data.get("text_content", "")) < 500
            or deep_scrape
        ):
            should_quit_driver = False
            if driver is None:
                driver = setup_selenium_driver()
                should_quit_driver = True
            if not driver:
                return {
                    "error": "Browser driver could not be initialized for deep analysis."
                }
            try:
                parsed_data = _parse_url_comprehensive(driver, url)
            finally:
                if should_quit_driver and driver:
                    driver.quit()
        return parsed_data


# Instantiate the tool so the registry can find it
url_parser = UrlParserTool()
