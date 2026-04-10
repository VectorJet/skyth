import re
import json
import requests
from backend.basetool import BaseTool
from typing import List, Dict, Any


class YoutubeChannelTool(BaseTool):
    """
    A tool for viewing YouTube channel information and recent videos.
    """

    @property
    def name(self) -> str:
        return "youtube_channel_videos"

    @property
    def description(self) -> str:
        return "Shows recent videos from a YouTube channel. Use when user wants to see uploads from a specific channel or creator."

    @property
    def parameters(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "channel_url",
                "type": "string",
                "description": "The YouTube channel URL or ID",
            },
            {
                "name": "max_results",
                "type": "integer",
                "description": "Maximum number of videos to show (default: 10)",
            },
        ]

    @property
    def output_type(self) -> str:
        return "app_widget"

    def execute(self, channel_url: str, max_results: int = 10, **kwargs: Any) -> Any:
        try:
            print(f"[YouTube Channel] Fetching videos from: {channel_url}")

            # Extract channel ID or handle from URL
            channel_id = None
            if "/channel/" in channel_url:
                channel_id = (
                    channel_url.split("/channel/")[-1].split("/")[0].split("?")[0]
                )
            elif "/@" in channel_url:
                handle = channel_url.split("/@")[-1].split("/")[0].split("?")[0]
                channel_url = f"https://www.youtube.com/@{handle}/videos"
            elif "/c/" in channel_url:
                custom = channel_url.split("/c/")[-1].split("/")[0].split("?")[0]
                channel_url = f"https://www.youtube.com/c/{custom}/videos"
            else:
                # Assume it's a channel ID
                channel_id = channel_url
                channel_url = f"https://www.youtube.com/channel/{channel_id}/videos"

            if not channel_url.endswith("/videos"):
                channel_url += "/videos"

            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept-Language": "en-US,en;q=0.9",
            }

            response = requests.get(channel_url, headers=headers, timeout=15)
            response.raise_for_status()

            # Extract ytInitialData
            pattern = r"var ytInitialData = ({.*?});"
            match = re.search(pattern, response.text)

            if not match:
                print("[YouTube Channel] Failed to find ytInitialData")
                return {"error": "Failed to load channel data"}

            data = json.loads(match.group(1))

            # Get channel metadata - ensure all are strings
            channel_name = ""
            channel_thumbnail = ""
            subscriber_count = ""

            # Try to get from header
            header = data.get("header", {})
            if "c4TabbedHeaderRenderer" in header:
                renderer = header["c4TabbedHeaderRenderer"]

                # Get channel name
                title = renderer.get("title", "")
                if isinstance(title, str):
                    channel_name = title
                elif isinstance(title, dict):
                    if "simpleText" in title:
                        channel_name = str(title["simpleText"])
                    elif "runs" in title:
                        channel_name = "".join(
                            str(r.get("text", "")) for r in title["runs"]
                        )

                # Get thumbnail
                if "avatar" in renderer and "thumbnails" in renderer["avatar"]:
                    channel_thumbnail = str(
                        renderer["avatar"]["thumbnails"][-1].get("url", "")
                    )

                # Get subscriber count
                if "subscriberCountText" in renderer:
                    sct = renderer["subscriberCountText"]
                    if isinstance(sct, str):
                        subscriber_count = sct
                    elif "simpleText" in sct:
                        subscriber_count = str(sct["simpleText"])
                    elif "runs" in sct:
                        subscriber_count = "".join(
                            str(r.get("text", "")) for r in sct["runs"]
                        )

            elif "pageHeaderRenderer" in header:
                renderer = header["pageHeaderRenderer"]
                if (
                    "content" in renderer
                    and "pageHeaderViewModel" in renderer["content"]
                ):
                    page_header = renderer["content"]["pageHeaderViewModel"]
                    if (
                        "title" in page_header
                        and "dynamicTextViewModel" in page_header["title"]
                    ):
                        title = page_header["title"]["dynamicTextViewModel"].get(
                            "text", ""
                        )
                        channel_name = str(title) if title else ""

            # Get videos from tabs
            videos = []
            tabs = (
                data.get("contents", {})
                .get("twoColumnBrowseResultsRenderer", {})
                .get("tabs", [])
            )

            for tab in tabs:
                if "tabRenderer" in tab:
                    tab_renderer = tab["tabRenderer"]
                    if tab_renderer.get("selected", False):
                        content = tab_renderer.get("content", {})
                        if "richGridRenderer" in content:
                            contents = content["richGridRenderer"].get("contents", [])
                            for item in contents:
                                if "richItemRenderer" in item:
                                    video_renderer = (
                                        item["richItemRenderer"]
                                        .get("content", {})
                                        .get("videoRenderer", {})
                                    )

                                    video_id = str(video_renderer.get("videoId", ""))

                                    # Get title - ensure it's a string
                                    title = ""
                                    if "title" in video_renderer:
                                        title_obj = video_renderer["title"]
                                        if isinstance(title_obj, str):
                                            title = title_obj
                                        elif "runs" in title_obj:
                                            title = "".join(
                                                str(r.get("text", ""))
                                                for r in title_obj["runs"]
                                            )
                                        elif "simpleText" in title_obj:
                                            title = str(title_obj["simpleText"])

                                    # Get thumbnail
                                    thumbnail = ""
                                    if (
                                        "thumbnail" in video_renderer
                                        and "thumbnails" in video_renderer["thumbnail"]
                                    ):
                                        thumbnail = str(
                                            video_renderer["thumbnail"]["thumbnails"][
                                                -1
                                            ].get("url", "")
                                        )

                                    # Get view count - ensure it's a string
                                    view_count = ""
                                    if "viewCountText" in video_renderer:
                                        vct = video_renderer["viewCountText"]
                                        if isinstance(vct, str):
                                            view_count = vct
                                        elif "simpleText" in vct:
                                            view_count = str(vct["simpleText"])
                                        elif "runs" in vct:
                                            view_count = "".join(
                                                str(r.get("text", ""))
                                                for r in vct["runs"]
                                            )

                                    # Get publish date - ensure it's a string
                                    publish_date = ""
                                    if "publishedTimeText" in video_renderer:
                                        ptt = video_renderer["publishedTimeText"]
                                        if isinstance(ptt, str):
                                            publish_date = ptt
                                        elif "simpleText" in ptt:
                                            publish_date = str(ptt["simpleText"])
                                        elif "runs" in ptt:
                                            publish_date = "".join(
                                                str(r.get("text", ""))
                                                for r in ptt["runs"]
                                            )

                                    if video_id and title and len(videos) < max_results:
                                        videos.append(
                                            {
                                                "type": "video",
                                                "title": title,
                                                "thumbnail_url": thumbnail,
                                                "url": f"https://www.youtube.com/watch?v={video_id}",
                                                "video_id": video_id,
                                                "view_count": view_count,
                                                "publish_date": publish_date,
                                            }
                                        )
                        break

            print(f"[YouTube Channel] Found {len(videos)} videos from {channel_name}")

            if len(videos) == 0:
                return {"error": "No videos found for this channel"}

            return {
                "widget": "youtube-channel-view",
                "data": {
                    "channel_name": channel_name,
                    "channel_thumbnail": channel_thumbnail,
                    "subscriber_count": subscriber_count,
                    "channel_url": channel_url.replace("/videos", ""),
                    "videos": videos,
                },
            }

        except Exception as e:
            print(f"[YouTube Channel] Error: {e}")
            import traceback

            traceback.print_exc()
            return {"error": f"Failed to load channel: {str(e)}"}


# Export the tool instance
youtube_channel = YoutubeChannelTool()
