import os
import base64
from pathlib import Path
from mutagen import File as MutagenFile
from backend.basetool import BaseTool
from typing import List, Dict, Any


class MusicLibraryTool(BaseTool):
    """
    A tool for managing and playing local music files.
    """

    @property
    def name(self) -> str:
        return "music_library"

    @property
    def description(self) -> str:
        return "Opens your local music library. Shows all available songs, allows playback, playlist management, and music control. Use when user wants to play music, see their songs, or manage playlists."

    @property
    def parameters(self) -> List[Dict[str, Any]]:
        return []

    @property
    def output_type(self) -> str:
        return "app_widget"

    def execute(self, **kwargs: Any) -> Any:
        try:
            # Music directory is in the app folder
            app_dir = Path(__file__).parent.parent
            music_dir = app_dir / "music"

            print(f"[Music Library] Loading music from: {music_dir}")

            # Create music directory if it doesn't exist
            music_dir.mkdir(exist_ok=True)

            # Scan for music files
            songs = self._scan_music_directory(music_dir)

            # Calculate total size of audio data
            total_audio_size = sum(len(song.get("audio_data", "")) for song in songs)
            print(
                f"[Music Library] Found {len(songs)} songs, total audio data: {total_audio_size / (1024*1024):.2f} MB"
            )

            # Split songs into metadata and audio data
            songs_metadata = []
            for song in songs:
                metadata = {
                    "id": song["id"],
                    "title": song["title"],
                    "artist": song["artist"],
                    "album": song["album"],
                    "duration": song["duration"],
                    "filename": song["filename"],
                    "mime_type": song["mime_type"],
                }
                if song.get("album_art"):
                    metadata["album_art"] = song["album_art"]
                songs_metadata.append(metadata)

            # Store audio data separately (will be loaded on demand by widget)
            audio_data_map = {song["id"]: song["audio_data"] for song in songs}

            return {
                "widget": "music-player",
                "data": {
                    "songs": songs_metadata,
                    "audio_data": audio_data_map,  # Widget will access this directly
                },
            }
        except Exception as e:
            print(f"[Music Library] Error: {e}")
            import traceback

            traceback.print_exc()
            return {"error": f"Failed to load music library: {str(e)}"}

    def _scan_music_directory(self, music_dir: Path) -> List[Dict[str, Any]]:
        """Scans the music directory and extracts metadata from audio files."""
        songs = []
        supported_formats = [".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aac", ".wma"]

        if not music_dir.exists():
            return songs

        for root, _, files in os.walk(music_dir):
            for file in files:
                file_path = os.path.join(root, file)
                file_ext = os.path.splitext(file)[1].lower()

                if file_ext in supported_formats:
                    song_info = self._extract_metadata(file_path, file)
                    if song_info:
                        songs.append(song_info)

        # Sort by title
        songs.sort(key=lambda x: x["title"].lower())
        return songs

    def _extract_metadata(self, file_path: str, filename: str) -> Dict[str, Any]:
        """Extracts metadata from an audio file and encodes the file as base64."""
        try:
            # Load audio file with mutagen
            audio = MutagenFile(file_path)

            # Extract metadata
            title = filename
            artist = "Unknown Artist"
            album = "Unknown Album"
            duration = 0
            album_art = None

            if audio is not None:
                # Get duration
                if hasattr(audio.info, "length"):
                    duration = int(audio.info.length)

                # Try to get tags (works for MP3, FLAC, etc.)
                tags = audio.tags if hasattr(audio, "tags") else None

                if tags:
                    # Get title
                    if "TIT2" in tags:  # MP3
                        title = str(tags["TIT2"])
                    elif "title" in tags:  # FLAC/OGG
                        title = (
                            str(tags["title"][0])
                            if isinstance(tags["title"], list)
                            else str(tags["title"])
                        )
                    elif "\xa9nam" in tags:  # M4A
                        title = (
                            str(tags["\xa9nam"][0])
                            if isinstance(tags["\xa9nam"], list)
                            else str(tags["\xa9nam"])
                        )
                    else:
                        title = os.path.splitext(filename)[0]

                    # Get artist
                    if "TPE1" in tags:  # MP3
                        artist = str(tags["TPE1"])
                    elif "artist" in tags:  # FLAC/OGG
                        artist = (
                            str(tags["artist"][0])
                            if isinstance(tags["artist"], list)
                            else str(tags["artist"])
                        )
                    elif "\xa9ART" in tags:  # M4A
                        artist = (
                            str(tags["\xa9ART"][0])
                            if isinstance(tags["\xa9ART"], list)
                            else str(tags["\xa9ART"])
                        )

                    # Get album
                    if "TALB" in tags:  # MP3
                        album = str(tags["TALB"])
                    elif "album" in tags:  # FLAC/OGG
                        album = (
                            str(tags["album"][0])
                            if isinstance(tags["album"], list)
                            else str(tags["album"])
                        )
                    elif "\xa9alb" in tags:  # M4A
                        album = (
                            str(tags["\xa9alb"][0])
                            if isinstance(tags["\xa9alb"], list)
                            else str(tags["\xa9alb"])
                        )

                    # Extract album art
                    try:
                        if "APIC:" in tags:  # MP3
                            artwork = tags["APIC:"]
                            album_art = f"data:{artwork.mime};base64,{base64.b64encode(artwork.data).decode('utf-8')}"
                        elif "APIC" in tags:  # Alternative MP3 format
                            artwork = tags["APIC"]
                            album_art = f"data:image/jpeg;base64,{base64.b64encode(artwork.data).decode('utf-8')}"
                        elif hasattr(audio, "pictures") and audio.pictures:  # FLAC
                            artwork = audio.pictures[0]
                            album_art = f"data:{artwork.mime};base64,{base64.b64encode(artwork.data).decode('utf-8')}"
                        elif "covr" in tags:  # M4A
                            artwork = tags["covr"][0]
                            album_art = f"data:image/jpeg;base64,{base64.b64encode(bytes(artwork)).decode('utf-8')}"
                    except Exception as art_error:
                        print(
                            f"[Music Library] Could not extract album art from {filename}: {art_error}"
                        )
            else:
                title = os.path.splitext(filename)[0]

            # Read file and encode as base64
            with open(file_path, "rb") as f:
                audio_data = base64.b64encode(f.read()).decode("utf-8")

            # Determine MIME type
            ext = os.path.splitext(filename)[1].lower()
            mime_types = {
                ".mp3": "audio/mpeg",
                ".wav": "audio/wav",
                ".flac": "audio/flac",
                ".ogg": "audio/ogg",
                ".m4a": "audio/mp4",
                ".aac": "audio/aac",
                ".wma": "audio/x-ms-wma",
            }
            mime_type = mime_types.get(ext, "audio/mpeg")

            result = {
                "id": filename,
                "title": title,
                "artist": artist,
                "album": album,
                "duration": duration,
                "filename": filename,
                "audio_data": audio_data,
                "mime_type": mime_type,
            }

            if album_art:
                result["album_art"] = album_art

            return result
        except Exception as e:
            print(f"[Music Library] Failed to process {filename}: {e}")
            import traceback

            traceback.print_exc()
            return None


# Export the tool instance
music_library = MusicLibraryTool()
