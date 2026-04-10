import re
import asyncio
from typing import Dict, Any, List
from youtube_transcript_api import YouTubeTranscriptApi
from backend.base_classes.basetool import BaseTool

class YoutubeTranscriptTool(BaseTool):
    """
    A tool for fetching transcripts from YouTube videos.
    """

    @property
    def name(self) -> str:
        return "youtube_transcript_getter"

    @property
    def description(self) -> str:
        return "Fetches the full text transcript from a given YouTube video URL. Use when a user provides a YouTube link and asks a question about it."

    @property
    def parameters(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "video_url": {"type": "string", "description": "The full URL of the YouTube video."}
            },
            "required": ["video_url"]
        }

    async def run(self, input_data: Any) -> Any:
        video_url = input_data.get("video_url")
        if not video_url:
            return {"error": "Missing video_url"}
            
        loop = asyncio.get_running_loop()
        
        def blocking_fetch():
            try:
                video_id_match = re.search(r'(?:v=|\/|embed\/|youtu.be\/)([a-zA-Z0-9_-]{11})', video_url)
                if not video_id_match:
                    return {"error": "Could not extract video ID from URL."}
                video_id = video_id_match.group(1)

                try:
                    transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
                except Exception:
                     # Fallback
                     transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)

                transcript = None
                try:
                    transcript = transcript_list.find_manually_created_transcript(['en'])
                except Exception:
                    try:
                        transcript = transcript_list.find_generated_transcript(['en'])
                    except Exception:
                        transcript = next(iter(transcript_list))

                transcript_data = transcript.fetch()
                
                full_transcript = " ".join([item['text'] for item in transcript_data])
                print(f"[YouTube Transcript Tool] Fetched transcript of length: {len(full_transcript)} characters.")
                return {"transcript": full_transcript}
            except Exception as e:
                print(f"YouTube Transcript API error: {e}")
                return {"error": str(e)}

        return await loop.run_in_executor(None, blocking_fetch)

# Instantiate the tool so the registry can find it
youtube_transcript = YoutubeTranscriptTool()