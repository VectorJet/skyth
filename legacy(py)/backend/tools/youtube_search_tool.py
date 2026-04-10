import re
import json
import asyncio
import requests
from urllib.parse import quote
from typing import List, Dict, Any
from backend.base_classes.basetool import BaseTool

class YoutubeSearchTool(BaseTool):
    """
    A tool for searching YouTube videos.
    """

    @property
    def name(self) -> str:
        return "youtube_search"

    @property
    def description(self) -> str:
        return "Searches YouTube for videos based on a query."

    @property
    def parameters(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "The search query."},
                "max_results": {"type": "integer", "description": "The maximum number of results to return (default: 5)."}
            },
            "required": ["query"]
        }

    async def run(self, input_data: Any) -> Any:
        # Extract arguments
        query = input_data.get("query")
        max_results = input_data.get("max_results", 5)

        if not query:
            return []

        loop = asyncio.get_running_loop()

        def blocking_search():
            try:
                print(f"[YouTube Search] Searching for: {query}, Max Results: {max_results}")
                headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"}
                url = f"https://www.youtube.com/results?search_query={quote(query)}"
                response = requests.get(url, headers=headers, timeout=15)
                response.raise_for_status()
                
                pattern = r'var ytInitialData = ({.*?});'
                match = re.search(pattern, response.text)
                
                if not match:
                    print("[YouTube Search] Failed to find ytInitialData JSON in page.")
                    return []
                    
                data = json.loads(match.group(1))
                videos = []
                
                try:
                    contents = data.get('contents', {}).get('twoColumnSearchResultsRenderer', {}).get('primaryContents', {}).get('sectionListRenderer', {}).get('contents', [{}])[0].get('itemSectionRenderer', {}).get('contents', [])
                except (KeyError, IndexError):
                    return []

                count = 0
                for item in contents:
                    if 'videoRenderer' in item and count < max_results:
                        video = item['videoRenderer']
                        video_id = video.get('videoId', '')
                        title_data = video.get('title', {})
                        if 'runs' in title_data:
                            title = ''.join(run.get('text', '') for run in title_data['runs'])
                        else:
                            title = title_data.get('simpleText', '')
                            
                        thumbnail = video.get('thumbnail', {}).get('thumbnails', [{}])[-1].get('url', '')
                        
                        if video_id and title and thumbnail:
                            videos.append({
                                "type": "video",
                                "title": title,
                                "text": f"YouTube video: {title}",
                                "thumbnail_url": thumbnail,
                                "url": f"https://www.youtube.com/watch?v={video_id}",
                                "video_id": video_id
                            })
                            count += 1
                print(f"[YouTube Search] Found {len(videos)} videos.")
                
                # Return standardized widget format if possible
                return {
                    "widget": "youtube-search-results",
                    "data": {"videos": videos}
                }
            except Exception as e:
                print(f"[YouTube Search] Error: {e}")
                return {"error": str(e)}

        return await loop.run_in_executor(None, blocking_search)

# Instantiate the tool so the registry can find it
youtube_search = YoutubeSearchTool()