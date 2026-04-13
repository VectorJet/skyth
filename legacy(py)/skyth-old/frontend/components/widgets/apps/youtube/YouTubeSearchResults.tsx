"use client";

import { PlayCircle } from "lucide-react";

interface Video {
  type: 'video';
  title: string;
  url: string;
  video_id: string;
  thumbnail_url: string;
}

export default function YouTubeSearchResults({ data }: { data: { query: string; results: Video[] } }) {
  const handlePlay = (url: string) => {
    window.open(url, '_blank');
  };

  return (
    <div className="bg-[#0f0f0f] text-white p-4">
      <h3 className="text-sm font-medium text-gray-400 mb-4">Results for "{data.query}"</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {data.results.map((video) => (
          <div 
            key={video.video_id} 
            onClick={() => handlePlay(video.url)}
            className="group cursor-pointer"
          >
            <div className="relative aspect-video rounded-lg overflow-hidden mb-2">
              <img src={video.thumbnail_url} alt={video.title} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                <PlayCircle className="w-12 h-12 text-white" />
              </div>
            </div>
            <h4 className="text-sm font-semibold line-clamp-2 group-hover:text-blue-400 transition-colors">
              {video.title}
            </h4>
          </div>
        ))}
      </div>
    </div>
  );
}