"use client";

import { Users } from "lucide-react";

interface Video {
  video_id: string;
  title: string;
  thumbnail_url: string;
  view_count: string;
  publish_date: string;
  url: string;
}

interface ChannelData {
  channel_name: string;
  channel_thumbnail: string;
  subscriber_count: string;
  channel_url: string;
  videos: Video[];
}

export default function YouTubeChannelView({ data }: { data: ChannelData }) {
  return (
    <div className="bg-[#0f0f0f] text-white">
      {/* Header */}
      <div className="p-6 border-b border-white/10 flex items-center gap-4">
        {data.channel_thumbnail && (
          <img src={data.channel_thumbnail} alt={data.channel_name} className="w-16 h-16 rounded-full" />
        )}
        <div>
          <h2 className="text-xl font-bold">{data.channel_name}</h2>
          <div className="flex items-center gap-2 text-sm text-gray-400 mt-1">
            <Users className="w-4 h-4" />
            <span>{data.subscriber_count} subscribers</span>
          </div>
        </div>
      </div>

      {/* Videos Grid */}
      <div className="p-4">
        <h3 className="text-sm font-semibold mb-3 uppercase text-gray-500">Recent Uploads</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-6">
          {data.videos.map((video) => (
            <a 
              key={video.video_id} 
              href={video.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group block"
            >
              <div className="relative aspect-video rounded-lg overflow-hidden mb-2 bg-gray-800">
                <img src={video.thumbnail_url} alt={video.title} className="w-full h-full object-cover" />
                <div className="absolute bottom-1 right-1 bg-black/80 px-1 rounded text-[10px] font-bold text-white">
                  Video
                </div>
              </div>
              <h4 className="text-sm font-medium line-clamp-2 leading-tight mb-1 group-hover:text-blue-400">
                {video.title}
              </h4>
              <div className="text-xs text-gray-400">
                {video.view_count} • {video.publish_date}
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}