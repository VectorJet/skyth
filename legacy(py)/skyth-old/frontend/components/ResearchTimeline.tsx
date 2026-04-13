"use client";

import { AgentStep } from "@/types";
import { Search, BookOpen, PenTool, CheckCircle2 } from "lucide-react";

export default function ResearchTimeline({ steps, isStreaming }: { steps: AgentStep[], isStreaming: boolean }) {
  // Filter for relevant steps
  const searchSteps = steps.filter(s => s.type === 'tool_call' && (s.tool?.includes('search') || s.tool?.includes('google')));
  const readSteps = steps.filter(s => s.type === 'tool_call' && (s.tool?.includes('parse') || s.tool?.includes('transcript')));
  const thoughtSteps = steps.filter(s => s.type === 'thought');

  return (
    <div className="relative pl-4 space-y-6 before:content-[''] before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-[2px] before:bg-border-color">
      
      {/* 1. Planning Phase */}
      <div className="relative">
        <div className="absolute -left-[21px] top-0 w-4 h-4 rounded-full bg-surface border-2 border-blue-500 z-10" />
        <h4 className="text-sm font-semibold text-primary-text mb-1">Analysis & Planning</h4>
        <div className="text-xs text-secondary-text space-y-1">
          {thoughtSteps.slice(0, 2).map((t, i) => (
            <p key={i} className="line-clamp-2">{t.content}</p>
          ))}
        </div>
      </div>

      {/* 2. Gathering Phase */}
      {(searchSteps.length > 0 || isStreaming) && (
        <div className="relative">
          <div className={`absolute -left-[21px] top-0 w-4 h-4 rounded-full bg-surface border-2 ${searchSteps.length > 0 ? 'border-yellow-500' : 'border-gray-500'} z-10`} />
          <h4 className="text-sm font-semibold text-primary-text mb-1 flex items-center gap-2">
            <Search className="w-3 h-3" /> Information Gathering
          </h4>
          <div className="flex flex-wrap gap-2 mt-2">
            {searchSteps.map((s, i) => (
              <span key={i} className="px-2 py-1 bg-surface border border-border-color rounded text-[10px] text-secondary-text">
                {s.args?.query || 'Search'}
              </span>
            ))}
            {isStreaming && searchSteps.length === 0 && <span className="text-xs text-secondary-text italic">Searching...</span>}
          </div>
        </div>
      )}

      {/* 3. Reading Phase */}
      {readSteps.length > 0 && (
        <div className="relative">
          <div className="absolute -left-[21px] top-0 w-4 h-4 rounded-full bg-surface border-2 border-green-500 z-10" />
          <h4 className="text-sm font-semibold text-primary-text mb-1 flex items-center gap-2">
            <BookOpen className="w-3 h-3" /> Analyzing Sources
          </h4>
          <p className="text-xs text-secondary-text">
            Processed {readSteps.length} sources for deep analysis.
          </p>
        </div>
      )}

      {/* 4. Synthesis Phase (Completion) */}
      {!isStreaming && (
        <div className="relative">
          <div className="absolute -left-[21px] top-0 w-4 h-4 rounded-full bg-accent-color z-10 flex items-center justify-center">
            <CheckCircle2 className="w-3 h-3 text-white" />
          </div>
          <h4 className="text-sm font-semibold text-primary-text mb-1 flex items-center gap-2">
            <PenTool className="w-3 h-3" /> Report Generated
          </h4>
        </div>
      )}
    </div>
  );
}