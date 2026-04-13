"use client";

import { Music } from "lucide-react";

interface Playlist {
  id: string;
  name: string;
  description: string;
  track_count: number;
  imageUrl?: string;
  externalUrl: string;
}

export default function SpotifyPlaylistList({ data }: { data: { playlists: Playlist[] } }) {
  return (
    <div className="bg-[#121212] text-white p-4">
      <h3 className="text-lg font-bold mb-4">Your Playlists</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {data.playlists.map((playlist) => (
          <a 
            key={playlist.id} 
            href={playlist.externalUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="block p-3 rounded-md bg-[#181818] hover:bg-[#282828] transition-colors group"
          >
            <div className="aspect-square w-full mb-3 relative shadow-lg">
              {playlist.imageUrl ? (
                <img src={playlist.imageUrl} alt={playlist.name} className="w-full h-full object-cover rounded-md" />
              ) : (
                <div className="w-full h-full bg-[#333] rounded-md flex items-center justify-center">
                  <Music className="w-10 h-10 text-gray-500" />
                </div>
              )}
            </div>
            <h4 className="font-bold truncate text-sm mb-1">{playlist.name}</h4>
            <p className="text-xs text-gray-400 line-clamp-2">{playlist.description || `By You • ${playlist.track_count} tracks`}</p>
          </a>
        ))}
      </div>
    </div>
  );
}