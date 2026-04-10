import wikipediaapi
import traceback
import requests
import asyncio
from backend.base_classes.basetool import BaseTool
from typing import Any, Dict, List, Optional

def format_article_to_markdown(page):
    """Formats a Wikipedia page object into a markdown string."""
    markdown_text = []
    
    if page.summary:
        markdown_text.append(page.summary)
        markdown_text.append("\n---\n")

    def add_sections(sections, level=2):
        for s in sections:
            if s.title:
                markdown_text.append(f"{{'#' * level}} {s.title}")
            if s.text:
                markdown_text.append(s.text)
            add_sections(s.sections, level + 1)
            
    add_sections(page.sections)
    
    return "\n\n".join(markdown_text).strip()

class WikipediaTool(BaseTool):
    """A tool to search for and retrieve full articles from Wikipedia."""

    @property
    def name(self) -> str:
        return "search_wikipedia"

    @property
    def description(self) -> str:
        return "Searches for a page on Wikipedia and returns the full article content and main image. Use this for in-depth knowledge, historical events, biographies, and scientific topics."

    @property
    def parameters(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "The search term or title of the Wikipedia page."}
            },
            "required": ["query"]
        }

    def _get_page_image_url(self, page_title: str) -> Optional[str]:
        """Makes a direct request to the MediaWiki API to get the main page image."""
        try:
            session = requests.Session()
            headers = {
                'User-Agent': 'Skyth-AI-Assistant/1.0 (https://github.com/your-repo/Skyth)'
            }
            url = "https://en.wikipedia.org/w/api.php"
            params = {
                "action": "query",
                "format": "json",
                "titles": page_title,
                "prop": "pageimages",
                "pithumbsize": 500
            }
            response = session.get(url=url, params=params, headers=headers)
            response.raise_for_status()
            data = response.json()
            pages = data.get("query", {}).get("pages", {})
            for page_id in pages:
                if "thumbnail" in pages[page_id]:
                    return pages[page_id]["thumbnail"]["source"]
            return None
        except Exception as e:
            print(f"🟡 [WikipediaTool] Could not fetch image for '{page_title}' via MediaWiki API: {e}")
            return None

    async def run(self, input_data: Any) -> Any:
        query = input_data.get("query")
        if not query:
            return {"error": "Missing query"}

        loop = asyncio.get_running_loop()

        def blocking_search():
            try:
                print(f"🔵 [WikipediaTool] Searching for page: '{query}'")
                wiki_wiki = wikipediaapi.Wikipedia(
                    language='en',
                    user_agent='Skyth-AI-Assistant/1.0'
                )
                page = wiki_wiki.page(query)

                if not page.exists():
                    print(f"🟡 [WikipediaTool] Page '{query}' does not exist.")
                    return {"error": f"I couldn't find a Wikipedia page for '{query}'."}

                full_text = format_article_to_markdown(page)
                image_url = self._get_page_image_url(page.title)

                if not full_text:
                    print(f"🟡 [WikipediaTool] Page '{query}' found, but no text content could be extracted.")
                    return {"error": f"The Wikipedia page for '{query}' exists but contains no readable content."}

                print(f"✅ [WikipediaTool] Successfully fetched data for '{query}'. Image URL: {image_url}")
                return {
                    "widget": "wikipedia-article-view",
                    "data": {
                        "title": page.title,
                        "full_text": full_text,
                        "url": page.fullurl,
                        "image_url": image_url
                    }
                }

            except Exception as e:
                print(f"🔴 [WikipediaTool] An unexpected error occurred while searching for '{query}': {e}")
                traceback.print_exc()
                return {"error": "An unexpected server error occurred while searching Wikipedia."}

        return await loop.run_in_executor(None, blocking_search)

wikipedia_search = WikipediaTool()
