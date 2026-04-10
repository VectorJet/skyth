"use client";

import { ExternalLink, BookOpen } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface WikipediaArticleViewProps {
  data: {
    title: string;
    full_text: string;
    url: string;
    image_url?: string;
  };
}

export default function WikipediaArticleView({ data }: WikipediaArticleViewProps) {
  return (
    <div className="bg-white text-gray-900">
      {/* Header Image */}
      {data.image_url && (
        <div className="w-full h-48 md:h-64 overflow-hidden relative">
          <img src={data.image_url} alt={data.title} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          <h2 className="absolute bottom-4 left-4 md:left-6 text-2xl md:text-3xl font-serif font-bold text-white shadow-sm">
            {data.title}
          </h2>
        </div>
      )}

      <div className="p-4 md:p-6">
        {!data.image_url && (
          <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-200">
            <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-500">
              <BookOpen className="w-6 h-6" />
            </div>
            <h2 className="text-2xl font-serif font-bold">{data.title}</h2>
          </div>
        )}

        <div className="prose prose-slate max-w-none prose-headings:font-serif prose-headings:font-semibold prose-a:text-blue-600">
          <ReactMarkdown>{data.full_text}</ReactMarkdown>
        </div>

        <div className="mt-6 pt-4 border-t border-gray-100 flex justify-end">
          <a 
            href={data.url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-blue-600 transition-colors"
          >
            Read full article on Wikipedia <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}