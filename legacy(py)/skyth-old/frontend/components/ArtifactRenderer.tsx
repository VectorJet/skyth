// components/ArtifactRenderer.tsx
import React, { useState } from 'react';
import { Artifact, StockChartData } from '@/types';
import InteractiveStockChart from './InteractiveStockChart';
import AppWidgetRenderer from './widgets/AppWidgetRenderer';
import { FileText, Image as ImageIcon, Download, Maximize2 } from 'lucide-react';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';

interface ArtifactRendererProps {
  artifact: Artifact;
  onWidgetAction?: (message: string) => void;
  onImageMaximize: (imageUrl: string) => void;
}

const ArtifactRenderer = ({ artifact, onWidgetAction, onImageMaximize }: ArtifactRendererProps) => {
  
  if (artifact.type === 'stock_chart_data') {
    return <InteractiveStockChart data={artifact.content as StockChartData} />;
  }

  if (artifact.type === 'app_widget') {
    return (
      <AppWidgetRenderer 
        widgetType={artifact.content.widget} 
        data={artifact.content.data} 
        onAction={onWidgetAction} 
      />
    );
  }

  if (artifact.type === 'html_content') {
    return (
      <div className="w-full bg-white text-black p-4 rounded-lg overflow-auto max-h-[500px] border border-border-color shadow-sm">
        <iframe 
          srcDoc={artifact.content} 
          title="HTML Content"
          className="w-full h-full min-h-[300px] border-none" 
          sandbox="allow-scripts"
        />
      </div>
    );
  }

  // --- USER UPLOAD RENDERERS ---

  if (artifact.type === 'image') {
    const imageUrl = artifact.base64_data 
      ? `data:${artifact.mime_type};base64,${artifact.base64_data}`
      : '/file.svg';

    return (
      <div className="relative group w-full h-full rounded-xl overflow-hidden border border-border-color bg-black/20">
        <img 
          src={imageUrl} 
          alt={artifact.filename || 'Uploaded Image'} 
          className="w-full h-full object-cover transition-transform group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <button 
            onClick={() => onImageMaximize(imageUrl)}
            className="p-1.5 bg-black/60 rounded-full text-white hover:bg-black/80 transition-colors"
            title="Maximize"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <a 
            href={imageUrl} 
            download={artifact.filename || 'image.png'}
            className="p-1.5 bg-black/60 rounded-full text-white hover:bg-black/80 transition-colors"
            title="Download"
            onClick={(e) => e.stopPropagation()}
          >
            <Download className="w-4 h-4" />
          </a>
        </div>
      </div>
    );
  }

  if (artifact.type === 'file') {
    // For non-image files, we show a card with an icon
    return (
      <div className="flex items-center gap-3 p-3 bg-surface border border-border-color rounded-xl max-w-sm hover:bg-button-bg transition-colors group cursor-default">
        <div className="w-10 h-10 bg-black/20 rounded-lg flex items-center justify-center text-accent">
          <FileText className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-primary-text truncate" title={artifact.filename}>{artifact.filename}</p>
          <p className="text-xs text-secondary-text truncate">{artifact.mime_type}</p>
        </div>
        {artifact.base64_data && (
           <a 
             href={`data:${artifact.mime_type};base64,${artifact.base64_data}`} 
             download={artifact.filename}
             className="p-2 text-secondary-text hover:text-primary-text opacity-0 group-hover:opacity-100 transition-opacity"
             title="Download"
           >
             <Download className="w-4 h-4" />
           </a>
        )}
      </div>
    );
  }

  return null;
};

export default ArtifactRenderer;