"use client";

import { WIDGET_REGISTRY } from "./WidgetRegistry";
import { AlertCircle } from "lucide-react";

interface AppWidgetRendererProps {
  widgetType: string;
  data: any;
}

export default function AppWidgetRenderer({ widgetType, data }: AppWidgetRendererProps) {
  const WidgetComponent = WIDGET_REGISTRY[widgetType];

  if (!WidgetComponent) {
    console.warn(`Unknown widget type: ${widgetType}`);
    return (
      <div className="p-4 rounded-lg bg-surface border border-border-color text-secondary-text flex items-center gap-2">
        <AlertCircle className="w-5 h-5 text-yellow-500" />
        <span>Widget not supported: <code className="bg-black/20 rounded px-1">{widgetType}</code></span>
      </div>
    );
  }

  return (
    <div className="w-full overflow-hidden rounded-xl border border-border-color bg-surface shadow-sm animate-in fade-in zoom-in-95 duration-300">
      <WidgetComponent data={data} />
    </div>
  );
}