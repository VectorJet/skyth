# backend/apps/spotify/tools/spotify_tool.py
import os
import spotipy
from spotipy.oauth2 import SpotifyOAuth
from backend.basetool import BaseTool
from typing import Any, Dict, List


def format_duration_ms(ms):
    minutes = ms // 60000
    seconds = int((ms % 60000) / 1000)
    return f"{minutes}:{seconds:02d}"


# --- BASE CLASS FOR AUTHENTICATION ---
class BaseSpotifyTool(BaseTool):
    _spotify_api = None

    def __init__(self):
        super().__init__()
        if BaseSpotifyTool._spotify_api is None:
            if os.getenv("SPOTIPY_CLIENT_ID") and os.getenv("SPOTIPY_CLIENT_SECRET"):
                BaseSpotifyTool._initialize_client()
            else:
                print(
                    "🟡 [SpotifyTool] SPOTIPY environment variables not set. Skipping initialization."
                )

    @classmethod
    def _initialize_client(cls):
        """Initializes the Spotipy client on the first tool instantiation."""
        if cls._spotify_api:
            return

        try:
            cache_path = os.path.join(os.getcwd(), ".spotify_cache")
            auth_manager = SpotifyOAuth(
                client_id=os.getenv("SPOTIPY_CLIENT_ID"),
                client_secret=os.getenv("SPOTIPY_CLIENT_SECRET"),
                redirect_uri=os.getenv("SPOTIPY_REDIRECT_URI"),
                scope="user-read-playback-state user-modify-playback-state user-read-currently-playing playlist-read-private playlist-modify-private playlist-modify-public user-library-read user-library-modify user-read-recently-played",
                cache_path=cache_path,
                open_browser=False,
            )
            cls._spotify_api = spotipy.Spotify(auth_manager=auth_manager)
            cls._spotify_api.me()
            print("✅ [SpotifyTool] Client initialized and authenticated successfully.")
        except Exception:
            cls._spotify_api = None
            print(
                "🔴 [SpotifyTool] Awaiting Spotify authorization. Please follow the instructions in the console."
            )
            # Spotipy itself will print the auth URL and prompt.

    @property
    def spotify_api(self):
        if BaseSpotifyTool._spotify_api is None and os.getenv("SPOTIPY_CLIENT_ID"):
            BaseSpotifyTool._initialize_client()
        return BaseSpotifyTool._spotify_api

    def handle_api_error(self, e: Exception) -> Dict[str, str]:
        """Handles Spotipy exceptions and returns a user-friendly error."""
        if isinstance(e, spotipy.SpotifyException):
            if e.reason == "PREMIUM_REQUIRED":
                return {"error": "This action requires a Spotify Premium account."}
        return {"error": f"An error occurred with Spotify: {str(e)}"}

    # These need to be implemented to satisfy the abstract base class, but they won't be used directly.
    @property
    def name(self) -> str:
        return "base_spotify_tool"

    @property
    def description(self) -> str:
        return "Base tool for Spotify authentication"

    @property
    def parameters(self) -> List[Dict[str, Any]]:
        return []

    @property
    def output_type(self) -> str:
        return "text"

    def execute(self, **kwargs: Any) -> Any:
        raise NotImplementedError("This base tool should not be executed directly.")


# --- TOOL 1: SEARCH TRACKS ---
class SpotifySearchTool(BaseSpotifyTool):
    @property
    def name(self) -> str:
        return "search_spotify_tracks"

    @property
    def description(self) -> str:
        return "Searches for tracks on Spotify and returns a list of results. Use this to find music."

    @property
    def parameters(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "query",
                "type": "string",
                "description": "The search term for the track.",
            },
            {
                "name": "limit",
                "type": "integer",
                "description": "The maximum number of tracks to return (default: 5).",
            },
        ]

    @property
    def output_type(self) -> str:
        return "app_widget"

    def execute(self, query: str, limit: int = 5, **kwargs: Any) -> Any:
        if not self.spotify_api:
            return {
                "error": "Spotify client is not authorized. Please check server console."
            }

        try:
            results = self.spotify_api.search(q=query, type="track", limit=limit)
            tracks = results.get("tracks", {}).get("items", [])

            track_data = [
                {
                    "id": track["id"],
                    "uri": track["uri"],
                    "name": track["name"],
                    "artists": ", ".join(
                        [artist["name"] for artist in track["artists"]]
                    ),
                    "albumName": track["album"]["name"],
                    "imageUrl": (
                        track["album"]["images"][0]["url"]
                        if track["album"]["images"]
                        else None
                    ),
                    "duration": format_duration_ms(track["duration_ms"]),
                }
                for track in tracks
            ]

            return {
                "widget": "spotify-search-results",
                "data": {"query": query, "items": track_data},
            }
        except Exception as e:
            return self.handle_api_error(e)


# --- TOOL 2: GET USER PLAYLISTS ---
class SpotifyGetPlaylistsTool(BaseSpotifyTool):
    @property
    def name(self) -> str:
        return "get_my_spotify_playlists"

    @property
    def description(self) -> str:
        return "Retrieves a list of the current user's personal playlists on Spotify."

    @property
    def parameters(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "limit",
                "type": "integer",
                "description": "The maximum number of playlists to return (default: 20).",
            }
        ]

    @property
    def output_type(self) -> str:
        return "app_widget"

    def execute(self, limit: int = 20, **kwargs: Any) -> Any:
        if not self.spotify_api:
            return {
                "error": "Spotify client is not authorized. Please check server console."
            }

        try:
            playlists = self.spotify_api.current_user_playlists(limit=limit)
            playlist_data = [
                {
                    "id": pl["id"],
                    "name": pl["name"],
                    "description": pl.get("description", ""),
                    "track_count": pl["tracks"]["total"],
                    "imageUrl": pl["images"][0]["url"] if pl["images"] else None,
                    "externalUrl": pl["external_urls"]["spotify"],  # <-- ADDED
                }
                for pl in playlists.get("items", [])
            ]

            return {
                "widget": "spotify-playlist-list",
                "data": {"playlists": playlist_data},
            }
        except Exception as e:
            return self.handle_api_error(e)


# --- TOOL 3: PLAY MUSIC ---
class SpotifyPlayTool(BaseSpotifyTool):
    @property
    def name(self) -> str:
        return "play_spotify_track"

    @property
    def description(self) -> str:
        return "Plays a specific track on Spotify using its URI. Requires a premium account."

    @property
    def parameters(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "track_uri",
                "type": "string",
                "description": "The Spotify URI of the track to play.",
            }
        ]

    @property
    def output_type(self) -> str:
        return "text"

    def execute(self, track_uri: str, **kwargs: Any) -> Any:
        if not self.spotify_api:
            return {
                "error": "Spotify client is not authorized. Please check server console."
            }
        try:
            self.spotify_api.start_playback(uris=[track_uri])
            return {"status": "success", "message": f"Now playing track {track_uri}."}
        except Exception as e:
            return self.handle_api_error(e)


# --- TOOL 4: ADD TO QUEUE ---
class SpotifyQueueTool(BaseSpotifyTool):
    @property
    def name(self) -> str:
        return "add_track_to_spotify_queue"

    @property
    def description(self) -> str:
        return "Adds a specific track to the user's Spotify playback queue. Requires a premium account."

    @property
    def parameters(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "track_uri",
                "type": "string",
                "description": "The Spotify URI of the track to add to the queue.",
            }
        ]

    @property
    def output_type(self) -> str:
        return "text"

    def execute(self, track_uri: str, **kwargs: Any) -> Any:
        if not self.spotify_api:
            return {
                "error": "Spotify client is not authorized. Please check server console."
            }
        try:
            self.spotify_api.add_to_queue(uri=track_uri)
            return {
                "status": "success",
                "message": f"Added track {track_uri} to the queue.",
            }
        except Exception as e:
            return self.handle_api_error(e)


# --- TOOL 5: ADD TO PLAYLIST (NEW) ---
class SpotifyAddToPlaylistTool(BaseSpotifyTool):
    @property
    def name(self) -> str:
        return "add_tracks_to_spotify_playlist"

    @property
    def description(self) -> str:
        return "Adds one or more tracks to one of the user's Spotify playlists."

    @property
    def parameters(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "playlist_id",
                "type": "string",
                "description": "The ID of the playlist to add tracks to.",
            },
            {
                "name": "track_uris",
                "type": "array",
                "description": "A list of Spotify track URIs to add.",
            },
        ]

    @property
    def output_type(self) -> str:
        return "app_widget"

    def execute(self, playlist_id: str, track_uris: List[str], **kwargs: Any) -> Any:
        if not self.spotify_api:
            return {
                "error": "Spotify client is not authorized. Please check server console."
            }
        try:
            self.spotify_api.playlist_add_items(playlist_id, track_uris)

            # Fetch playlist details to return a confirmation widget
            playlist = self.spotify_api.playlist(playlist_id)
            tracks = playlist.get("tracks", {}).get("items", [])

            track_data = [
                {
                    "id": item["track"]["id"],
                    "uri": item["track"]["uri"],
                    "name": item["track"]["name"],
                    "artists": ", ".join(
                        [artist["name"] for artist in item["track"]["artists"]]
                    ),
                }
                for item in tracks[-5:]
                if item.get("track")
            ]  # Show last 5 tracks

            return {
                "widget": "spotify-playlist-view",
                "data": {
                    "playlistName": playlist["name"],
                    "playlistImageUrl": (
                        playlist["images"][0]["url"] if playlist["images"] else None
                    ),
                    "totalTracks": playlist["tracks"]["total"],
                    "externalUrl": playlist["external_urls"]["spotify"],
                    "tracks": track_data,
                    "highlightedTrackUri": track_uris[0] if track_uris else None,
                },
            }
        except Exception as e:
            return self.handle_api_error(e)


# --- TOOL 6: REMOVE FROM PLAYLIST (NEW) ---
class SpotifyRemoveFromPlaylistTool(BaseSpotifyTool):
    @property
    def name(self) -> str:
        return "remove_tracks_from_spotify_playlist"

    @property
    def description(self) -> str:
        return "Removes one or more tracks from one of the user's Spotify playlists."

    @property
    def parameters(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "playlist_id",
                "type": "string",
                "description": "The ID of the playlist to remove tracks from.",
            },
            {
                "name": "track_uris",
                "type": "array",
                "description": "A list of Spotify track URIs to remove.",
            },
        ]

    @property
    def output_type(self) -> str:
        return "text"

    def execute(self, playlist_id: str, track_uris: List[str], **kwargs: Any) -> Any:
        if not self.spotify_api:
            return {
                "error": "Spotify client is not authorized. Please check server console."
            }
        try:
            self.spotify_api.playlist_remove_all_occurrences_of_items(
                playlist_id, track_uris
            )
            return {
                "status": "success",
                "message": f"Removed {len(track_uris)} track(s) from the playlist.",
            }
        except Exception as e:
            return self.handle_api_error(e)


# --- Instantiate ALL concrete tool classes to make them discoverable ---
spotify_search = SpotifySearchTool()
spotify_get_playlists = SpotifyGetPlaylistsTool()
spotify_play = SpotifyPlayTool()
spotify_queue = SpotifyQueueTool()
spotify_add_to_playlist = SpotifyAddToPlaylistTool()
spotify_remove_from_playlist = SpotifyRemoveFromPlaylistTool()
