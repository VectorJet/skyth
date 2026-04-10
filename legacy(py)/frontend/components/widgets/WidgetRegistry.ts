import { ComponentType } from "react";
import SpotifySearchResults from "./apps/spotify/SpotifySearchResults";
import SpotifyPlaylistList from "./apps/spotify/SpotifyPlaylistList";
import SpotifyPlaylistView from "./apps/spotify/SpotifyPlaylistView";
import MusicPlayer from "./apps/music/MusicPlayer";
import WikipediaArticleView from "./apps/wikipedia/WikipediaArticleView";
import YouTubeSearchResults from "./apps/youtube/YouTubeSearchResults";
import YouTubeChannelView from "./apps/youtube/YouTubeChannelView";
import YouTubeVideoPlayer from "./apps/youtube/YouTubeVideoPlayer";

// Registry mapping backend widget identifiers to React components
export const WIDGET_REGISTRY: Record<string, ComponentType<any>> = {
  // Spotify
  "spotify-search-results": SpotifySearchResults,
  "spotify-playlist-list": SpotifyPlaylistList,
  "spotify-playlist-view": SpotifyPlaylistView,
  
  // Music (Local)
  "music-player": MusicPlayer,
  
  // Wikipedia
  "wikipedia-article-view": WikipediaArticleView,
  
  // YouTube
  "youtube-search-results": YouTubeSearchResults,
  "youtube-channel-view": YouTubeChannelView,
  "youtube-video-player": YouTubeVideoPlayer,
};