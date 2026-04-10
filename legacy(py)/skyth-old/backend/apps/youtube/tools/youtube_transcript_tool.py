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
        return "Fetches the full text transcript from a given YouTube video URL. Use when a user provides a YouTube link and asks a question about it."

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
            # A slightly more robust regex that also handles 'shorts' URLs.
            video_id_match = re.search(
                r"(?:v=|\/|embed\/|youtu.be\/|shorts\/)([a-zA-Z0-9_-]{11})", video_url
            )
            if not video_id_match:
                return {"error": "Could not extract video ID from URL."}
            video_id = video_id_match.group(1)

            ytt_api = YouTubeTranscriptApi()
            transcript_list = ytt_api.list(video_id)

            transcript = None
            try:
                transcript = transcript_list.find_manually_created_transcript(["en"])
            except Exception:
                try:
                    transcript = transcript_list.find_generated_transcript(["en"])
                except Exception:
                    try:
                        transcript = next(iter(transcript_list))
                    except StopIteration:
                        return {"error": "No transcripts available for this video."}

            transcript_data = transcript.fetch()

            # CORRECTED: Use attribute access (item.text) instead of dictionary access (item['text']).
            # This resolves the "'FetchedTranscriptSnippet' object is not subscriptable" error.
            full_transcript = " ".join([item.text for item in transcript_data])

            print(
                f"[YouTube Transcript Tool] Fetched transcript of length: {len(full_transcript)} characters."
            )
            return {"transcript": full_transcript}
        except Exception as e:
            print(f"YouTube Transcript API error: {e}")
            return {"error": str(e)}


# Export the tool instance as requested.
youtube_transcript = YoutubeTranscriptTool()
