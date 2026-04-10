from typing import Dict, Any, List
from backend.base_classes.basetool import BaseTool

class YoutubeVideoPlayerTool(BaseTool):
    """
    A tool to 'play' a video by returning a widget/embed.
    """

    @property
    def name(self) -> str:
        return "play_youtube_video"

    @property
    def description(self) -> str:
        return "Plays a specific YouTube video given its ID."

    @property
    def parameters(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "video_id": {"type": "string", "description": "The ID of the YouTube video."}
            },
            "required": ["video_id"]
        }

    async def run(self, input_data: Any) -> Any:
        video_id = input_data.get("video_id")
        if not video_id:
            return {"error": "Missing video_id"}

        # Return a widget command
        return {
            "widget": "youtube-player",
            "data": {
                "videoId": video_id,
                "autoplay": True
            }
        }

# Instantiate
youtube_video_player = YoutubeVideoPlayerTool()