import re
from backend.basetool import BaseTool
from typing import List, Dict, Any


class YoutubeVideoPlayerTool(BaseTool):
    """
    A tool for playing YouTube videos with an embedded player.
    """

    @property
    def name(self) -> str:
        return "youtube_video_player"

    @property
    def description(self) -> str:
        return "Displays a YouTube video player for a given video URL or ID. Use when user wants to watch a video."

    @property
    def parameters(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "video_url",
                "type": "string",
                "description": "The YouTube video URL or video ID to play.",
            },
            {
                "name": "title",
                "type": "string",
                "description": "The title of the video (optional).",
                "required": False,
            },
        ]

    @property
    def output_type(self) -> str:
        return "app_widget"

    def execute(
        self, video_url: str, title: str = None, **kwargs: Any
    ) -> Dict[str, Any]:
        """
        Extracts video ID and returns widget data for the video player.
        """
        try:
            # Extract video ID from various YouTube URL formats
            video_id_match = re.search(
                r"(?:v=|\/|embed\/|youtu.be\/|shorts\/)([a-zA-Z0-9_-]{11})", video_url
            )

            if not video_id_match:
                # If it's already just an ID
                if re.match(r"^[a-zA-Z0-9_-]{11}$", video_url):
                    video_id = video_url
                else:
                    return {"error": "Could not extract video ID from URL."}
            else:
                video_id = video_id_match.group(1)

            print(f"[YouTube Player] Playing video: {video_id}")

            return {
                "widget": "youtube-video-player",
                "data": {
                    "videoId": video_id,
                    "title": title or f"YouTube Video: {video_id}",
                    "url": f"https://www.youtube.com/watch?v={video_id}",
                },
            }
        except Exception as e:
            print(f"[YouTube Player] Error: {e}")
            return {"error": f"Failed to load video player: {str(e)}"}


# Export the tool instance
youtube_video_player = YoutubeVideoPlayerTool()
