"use client";

import { ExternalLink, Music } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Track {
  id: string;
  name: string;
  artists: string;
  uri: string;
}

interface PlaylistData {
  playlistName: string;
  playlistImageUrl?: string;
  totalTracks: number;
  externalUrl: string;
  tracks: Track[];
  highlightedTrackUri?: string;
}

export default function SpotifyPlaylistView({ data }: { data: PlaylistData }) {
  return (
    <div className="bg-gradient-to-b from-green-900/20 to-black text-white p-6">
      <div className="flex flex-col md:flex-row gap-6 items-center md:items-end mb-6">
        <div className="w-40 h-40 shadow-2xl flex-shrink-0">
          {data.playlistImageUrl ? (
            <img src={data.playlistImageUrl} alt={data.playlistName} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-[#282828] flex items-center justify-center">
              <Music className="w-16 h-16 text-gray-500" />
            </div>
          )}
        </div>
        <div className="flex-1 text-center md:text-left">
          <p className="text-xs font-bold uppercase tracking-widest mb-2">Playlist</p>
          <h2 className="text-3xl md:text-5xl font-black mb-4">{data.playlistName}</h2>
          <p className="text-sm text-gray-300 font-medium">
            {data.totalTracks} songs
          </p>
        </div>
      </div>

      <div className="bg-black/20 rounded-lg overflow-hidden">
        <div className="px-4 py-2 border-b border-white/10 text-xs text-gray-400 uppercase tracking-wider flex">
          <span className="flex-1">Title</span>
          <span className="hidden sm:block w-1/3">Artist</span>
        </div>
        {data.tracks.map((track, i) => (
          <div 
            key={track.id} 
            className={`px-4 py-3 flex items-center hover:bg-white/10 transition-colors text-sm ${data.highlightedTrackUri === track.uri ? 'bg-white/10 text-green-400' : 'text-gray-300'}`}
          >
            <div className="flex-1 font-medium flex items-center gap-3">
              <span className="text-gray-500 w-4 text-right">{i + 1}</span>
              <span className="truncate">{track.name}</span>
            </div>
            <div className="hidden sm:block w-1/3 text-gray-400 truncate">
              {track.artists}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex justify-center">
        <Button asChild className="rounded-full bg-[#1DB954] hover:bg-[#1ed760] text-black font-bold px-8">
          <a href={data.externalUrl} target="_blank" rel="noopener noreferrer">
            Open in Spotify <ExternalLink className="ml-2 w-4 h-4" />
          </a>
        </Button>
      </div>
    </div>
  );
}