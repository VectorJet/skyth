import re
import json
import requests
import urllib.parse
from backend.basetool import BaseTool
from typing import List, Dict, Any


class YoutubeSearchTool(BaseTool):
    """
    A tool for searching YouTube videos and channels.
    """

    @property
    def name(self) -> str:
        return "youtube_search"

    @property
    def description(self) -> str:
        return "Searches YouTube for videos or channels based on a query. Use this to find specific videos, latest uploads from creators, or discover channels. Examples: 'latest mkbhd video', 'mrwhosetheboss tech reviews', 'quantum computing explained'"

    @property
    def parameters(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "query",
                "type": "string",
                "description": "The search query (e.g., 'latest mkbhd video', 'channel name', 'topic')",
            },
            {
                "name": "max_results",
                "type": "integer",
                "description": "The maximum number of results to return (default: 8)",
            },
        ]

    @property
    def output_type(self) -> str:
        return "app_widget"

    def execute(self, query: str, max_results: int = 8, **kwargs: Any) -> Any:
        try:
            print(
                f"[YouTube Search] Searching for: {query}, Max Results: {max_results}"
            )
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept-Language": "en-US,en;q=0.9",
            }

            search_query = query

            # Extract channel name if query contains "latest" or "recent"
            if "latest" in query.lower() or "recent" in query.lower():
                # Remove words like "latest", "recent", "new", "newest", "video", "videos", "from", "by" to get channel name
                for word in [
                    "latest",
                    "recent",
                    "new",
                    "newest",
                    "video",
                    "videos",
                    "from",
                    "by",
                ]:
                    search_query = search_query.lower().replace(word, "").strip()
                # Add channel filter and sort by date
                url = f"https://www.youtube.com/results?search_query={urllib.parse.quote(search_query)}&sp=CAISAhAB"
            else:
                url = f"https://www.youtube.com/results?search_query={urllib.parse.quote(search_query)}"

            response = requests.get(url, headers=headers, timeout=15)
            response.raise_for_status()

            pattern = r"var ytInitialData = ({.*?});"
            match = re.search(pattern, response.text)

            if not match:
                print("[YouTube Search] Failed to find ytInitialData JSON in page.")
                return {
                    "error": "Failed to parse YouTube search results. YouTube may have changed their layout."
                }

            data = json.loads(match.group(1))
            results = []

            try:
                contents = (
                    data.get("contents", {})
                    .get("twoColumnSearchResultsRenderer", {})
                    .get("primaryContents", {})
                    .get("sectionListRenderer", {})
                    .get("contents", [{}])[0]
                    .get("itemSectionRenderer", {})
                    .get("contents", [])
                )
            except (KeyError, IndexError):
                return {"error": "Could not locate video results in YouTube response."}

            video_count = 0
            channel_count = 0

            for item in contents:
                # Handle video results
                if "videoRenderer" in item and video_count < max_results:
                    video = item["videoRenderer"]
                    video_id = video.get("videoId", "")

                    # Extract title
                    title = ""
                    if "title" in video:
                        if isinstance(video["title"], str):
                            title = video["title"]
                        elif "runs" in video["title"]:
                            title = "".join(
                                str(run.get("text", ""))
                                for run in video["title"]["runs"]
                            )
                        elif "simpleText" in video["title"]:
                            title = str(video["title"]["simpleText"])

                    thumbnail_url = ""
                    if "thumbnail" in video and "thumbnails" in video["thumbnail"]:
                        thumbnail_url = video["thumbnail"]["thumbnails"][-1].get(
                            "url", ""
                        )

                    # Get channel name
                    channel_name = ""
                    if "ownerText" in video:
                        if isinstance(video["ownerText"], str):
                            channel_name = video["ownerText"]
                        elif "runs" in video["ownerText"]:
                            channel_name = str(
                                video["ownerText"]["runs"][0].get("text", "")
                            )
                        elif "simpleText" in video["ownerText"]:
                            channel_name = str(video["ownerText"]["simpleText"])

                    if video_id and title and thumbnail_url:
                        results.append(
                            {
                                "type": "video",
                                "title": title,
                                "channel_name": channel_name,
                                "thumbnail_url": thumbnail_url,
                                "url": f"https://www.youtube.com/watch?v={video_id}",
                                "video_id": video_id,
                            }
                        )
                        video_count += 1

                # Handle channel results
                elif "channelRenderer" in item and channel_count < 3:
                    channel = item["channelRenderer"]
                    channel_id = str(channel.get("channelId", ""))

                    channel_name = ""
                    if "title" in channel:
                        if isinstance(channel["title"], str):
                            channel_name = channel["title"]
                        elif "simpleText" in channel["title"]:
                            channel_name = str(channel["title"]["simpleText"])
                        elif "runs" in channel["title"]:
                            channel_name = "".join(
                                str(r.get("text", "")) for r in channel["title"]["runs"]
                            )

                    channel_thumbnail = ""
                    if "thumbnail" in channel and "thumbnails" in channel["thumbnail"]:
                        channel_thumbnail = str(
                            channel["thumbnail"]["thumbnails"][-1].get("url", "")
                        )

                    if channel_id and channel_name:
                        results.append(
                            {
                                "type": "channel",
                                "channel_name": channel_name,
                                "channel_id": channel_id,
                                "thumbnail_url": channel_thumbnail,
                                "url": f"https://www.youtube.com/channel/{channel_id}",
                            }
                        )
                        channel_count += 1

            print(
                f"[YouTube Search] Found {video_count} videos and {channel_count} channels."
            )

            if len(results) == 0:
                return {"error": f"No results found for query: {query}"}

            return {
                "widget": "youtube-search-results",
                "data": {"query": query, "results": results},
            }
        except Exception as e:
            print(f"[YouTube Search] Error: {e}")
            import traceback

            traceback.print_exc()
            return {"error": f"Search failed: {str(e)}"}


# Export the tool instance
youtube_search = YoutubeSearchTool()
