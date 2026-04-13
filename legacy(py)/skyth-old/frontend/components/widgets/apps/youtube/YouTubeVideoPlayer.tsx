"use client";

import { ExternalLink } from "lucide-react";

export default function YouTubeVideoPlayer({ data }: { data: { videoId: string; title: string; url: string } }) {
  return (
    <div className="bg-black rounded-lg overflow-hidden border border-gray-800">
      <div className="aspect-video w-full">
        <iframe
          width="100%"
          height="100%"
          src={`https://www.youtube.com/embed/${data.videoId}?autoplay=0`}
          title={data.title}
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="w-full h-full"
        />
      </div>
      <div className="p-3 bg-[#0f0f0f] flex justify-between items-center">
        <span className="text-sm font-medium text-white truncate max-w-[80%]">
          {data.title}
        </span>
        <a 
          href={data.url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
        >
          Open <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}