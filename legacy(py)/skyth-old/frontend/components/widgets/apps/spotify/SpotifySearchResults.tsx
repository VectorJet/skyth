"use client";

import { Play, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

interface Track {
  id: string;
  uri: string;
  name: string;
  artists: string;
  albumName: string;
  imageUrl?: string;
  duration: string;
}

export default function SpotifySearchResults({ data }: { data: { query: string; items: Track[] } }) {
  const handlePlay = async (uri: string) => {
    // Note: requires active device/premium usually
    await api('/mcp/execute', {
      method: 'POST',
      body: JSON.stringify({ tool: 'play_spotify_track', args: { track_uri: uri } }) 
    });
  };

  const handleQueue = async (uri: string) => {
    await api('/mcp/execute', {
      method: 'POST',
      body: JSON.stringify({ tool: 'add_track_to_spotify_queue', args: { track_uri: uri } })
    });
  };

  return (
    <div className="bg-black text-white p-4">
      <h3 className="text-sm font-medium text-gray-400 mb-3 uppercase tracking-wider">
        Results for "{data.query}"
      </h3>
      <div className="space-y-1">
        {data.items.map((track) => (
          <div key={track.id} className="group flex items-center gap-3 p-2 rounded-md hover:bg-white/10 transition-colors">
            <div className="relative w-10 h-10 flex-shrink-0">
              <img src={track.imageUrl || "/placeholder-music.png"} alt={track.albumName} className="w-full h-full object-cover rounded" />
              <button 
                onClick={() => handlePlay(track.uri)}
                className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded"
              >
                <Play className="w-4 h-4 fill-current" />
              </button>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate text-sm">{track.name}</div>
              <div className="text-xs text-gray-400 truncate">{track.artists}</div>
            </div>
            <div className="text-xs text-gray-500 font-mono hidden sm:block">{track.duration}</div>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-white" onClick={() => handleQueue(track.uri)}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}