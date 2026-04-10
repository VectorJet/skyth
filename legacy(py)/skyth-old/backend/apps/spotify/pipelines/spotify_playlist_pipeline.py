# backend/apps/spotify/pipelines/spotify_playlist_pipeline.py
from typing import Any, Dict, List, Generator

from backend.baseline import BasePipeline
from backend.tools import call_llm
from backend.utils import yield_data
from backend.apps.spotify.tools.spotify_tool import spotify_search, BaseSpotifyTool


class CreateSpotifyPlaylistPipeline(BasePipeline):
    """
    A multi-step pipeline to create a Spotify playlist from a natural language description.
    """

    @property
    def name(self) -> str:
        return "create_spotify_playlist_pipeline"

    @property
    def description(self) -> str:
        return "Creates a new Spotify playlist with songs based on a user's description (e.g., 'a workout playlist with upbeat rock music')."

    @property
    def parameters(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "playlist_name",
                "type": "string",
                "description": "The name for the new playlist.",
            },
            {
                "name": "song_description",
                "type": "string",
                "description": "A natural language description of the types of songs to add.",
            },
            {
                "name": "song_count",
                "type": "integer",
                "description": "The number of songs to generate for the playlist (default: 15).",
            },
        ]

    def execute(
        self,
        playlist_name: str,
        song_description: str,
        song_count: int = 15,
        **kwargs: Any,
    ) -> Generator[str, None, None]:
        api_key = kwargs.get("api_key")
        utility_model = kwargs.get("utility_model")
        user_id = kwargs.get("user_id")

        if not api_key or not utility_model:
            yield yield_data(
                "error",
                {"message": "API key or utility model not provided to pipeline."},
            )
            return

        spotify_api = BaseSpotifyTool().spotify_api
        if not spotify_api:
            yield yield_data(
                "error",
                {
                    "message": "Spotify client is not authorized. Please check server console."
                },
            )
            return

        try:
            # Step 1: Generate song ideas using an LLM
            yield yield_data(
                "step",
                {
                    "status": "thinking",
                    "text": f'Generating song ideas for "{playlist_name}"...',
                },
            )

            prompt = f"Based on the description '{song_description}', generate a list of exactly {song_count} songs. For each song, provide the title and the main artist. Format each entry on a new line EXACTLY like this: Song Title by Artist Name. Do not add numbers, bullet points, or any other formatting."

            response = call_llm(prompt, api_key, utility_model, stream=False)
            song_ideas_raw = response.json()["candidates"][0]["content"]["parts"][0][
                "text"
            ]
            song_ideas = [
                line.strip() for line in song_ideas_raw.split("\n") if " by " in line
            ]

            if not song_ideas:
                yield yield_data("error", {"message": "Could not generate song ideas."})
                return

            # Step 2: Search for each song on Spotify to get its URI
            yield yield_data(
                "step",
                {
                    "status": "acting",
                    "text": f"Searching for {len(song_ideas)} songs on Spotify...",
                },
            )
            track_uris = []
            for idea in song_ideas:
                # --- FIX: Search for multiple results and verify ---
                search_result = spotify_search.execute(query=idea, limit=3)
                if (
                    isinstance(search_result, dict)
                    and "data" in search_result
                    and search_result["data"]["items"]
                ):
                    # Simple verification: check if the artist from our idea is in the result's artists
                    try:
                        idea_artist = idea.split(" by ")[1].lower()
                        for item in search_result["data"]["items"]:
                            if any(
                                idea_artist in artist.lower()
                                for artist in item["artists"].split(", ")
                            ):
                                track_uris.append(item["uri"])
                                break  # Found a good match, move to next song idea
                    except IndexError:
                        # If 'by' isn't in the line, just take the first result as a fallback
                        track_uris.append(search_result["data"]["items"][0]["uri"])
            # --- END FIX ---

            if not track_uris:
                yield yield_data(
                    "error",
                    {
                        "message": "Could not find any of the generated songs on Spotify."
                    },
                )
                return

            # Step 3: Create the new playlist
            yield yield_data(
                "step", {"status": "acting", "text": "Creating the new playlist..."}
            )
            current_user = spotify_api.current_user()
            new_playlist = spotify_api.user_playlist_create(
                user=current_user["id"],
                name=playlist_name,
                public=False,
                description=f"A playlist created by Skyth AI based on the prompt: '{song_description}'",
            )
            playlist_id = new_playlist["id"]

            # Step 4: Add the tracks to the playlist
            yield yield_data(
                "step",
                {"status": "acting", "text": f"Adding {len(track_uris)} songs..."},
            )
            spotify_api.playlist_add_items(playlist_id, track_uris)

            # Step 5: Fetch playlist details and yield final widget
            final_playlist_details = spotify_api.playlist(playlist_id)
            tracks = final_playlist_details.get("tracks", {}).get("items", [])

            track_data = [
                {
                    "id": item["track"]["id"],
                    "uri": item["track"]["uri"],
                    "name": item["track"]["name"],
                    "artists": ", ".join(
                        [artist["name"] for artist in item["track"]["artists"]]
                    ),
                    "albumName": item["track"]["album"]["name"],
                    "imageUrl": (
                        item["track"]["album"]["images"][0]["url"]
                        if item["track"]["album"]["images"]
                        else None
                    ),
                    "duration": self._format_duration_ms(item["track"]["duration_ms"]),
                }
                for item in tracks
                if item.get("track")
            ]

            widget_payload = {
                "widget": "spotify-playlist-view",
                "data": {
                    "playlistName": final_playlist_details["name"],
                    "playlistImageUrl": (
                        final_playlist_details["images"][0]["url"]
                        if final_playlist_details["images"]
                        else None
                    ),
                    "totalTracks": final_playlist_details["tracks"]["total"],
                    "externalUrl": final_playlist_details["external_urls"]["spotify"],
                    "tracks": track_data,
                    "highlightedTrackUri": None,
                },
            }

            yield yield_data(
                "artifacts",
                [
                    {
                        "id": f"widget_spotify-playlist-view_{playlist_id}",
                        "type": "app_widget",
                        "content": widget_payload,
                    }
                ],
            )

            yield yield_data(
                "step",
                {
                    "status": "done",
                    "text": f'Successfully created playlist "{playlist_name}".',
                },
            )

        except Exception as e:
            yield yield_data(
                "error",
                {"message": f"An error occurred during playlist creation: {str(e)}"},
            )

    def _format_duration_ms(self, ms):
        minutes = ms // 60000
        seconds = int((ms % 60000) / 1000)
        return f"{minutes}:{seconds:02d}"


# Instantiate the pipeline to make it discoverable
create_spotify_playlist = CreateSpotifyPlaylistPipeline()
