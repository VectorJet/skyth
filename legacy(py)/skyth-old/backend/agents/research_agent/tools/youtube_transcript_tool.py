# backend/agents/research_agent/tools/youtube_transcript_tool.py
import re
from backend.basetool import BaseTool
from typing import List, Dict, Any
from youtube_transcript_api import YouTubeTranscriptApi


class YoutubeTranscriptTool(BaseTool):
    """
    A tool for fetching transcripts from YouTube videos.
    """

    @property
    def name(self) -> str:
        return "youtube_transcript_getter"

    @property
    def description(self) -> str:
        return "Fetches the full text transcript from a given YouTube video URL. Use this after finding a relevant video with 'youtube_search' to analyze its content."

    @property
    def parameters(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "video_url",
                "type": "string",
                "description": "The full URL of the YouTube video.",
            }
        ]

    @property
    def output_type(self) -> str:
        return "youtube_transcript"

    def execute(self, video_url: str) -> Dict[str, str]:
        """
        Fetches the transcript. Returns a dict with 'transcript' or 'error'.
        """
        try:
            video_id_match = re.search(
                r"(?:v=|\/|embed\/|youtu.be\/)([a-zA-Z0-9_-]{11})", video_url
            )
            if not video_id_match:
                return {"error": "Could not extract video ID from URL."}
            video_id = video_id_match.group(1)

            api = YouTubeTranscriptApi()
            transcript_list = api.list(video_id)

            transcript = None
            try:
                transcript = transcript_list.find_manually_created_transcript(["en"])
            except:
                try:
                    transcript = transcript_list.find_generated_transcript(["en"])
                except:
                    transcript = next(iter(transcript_list))

            # The fetch() method returns a list of snippet objects
            transcript_data = transcript.fetch()

            # --- DEFINITIVE FIX: Use '.text' for objects, not ['text'] for dicts ---
            full_transcript = " ".join([item.text for item in transcript_data])

            print(
                f"✅ [YouTube Transcript Tool] Fetched transcript of length: {len(full_transcript)} characters."
            )
            return {"transcript": full_transcript}

        except Exception as e:
            print(f"🔴 [YouTube Transcript Tool] API error: {e}")
            if "TranscriptsDisabled" in str(e):
                return {"error": "Transcripts are disabled for this video."}
            return {"error": f"Could not retrieve transcript: {str(e)}"}


youtube_transcript_getter = YoutubeTranscriptTool()
