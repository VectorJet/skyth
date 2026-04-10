// components/CollapsibleContent.tsx
import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface CollapsibleContentProps {
  children: React.ReactNode;
  maxHeight?: number;
}

const CollapsibleContent = ({ children, maxHeight = 300 }: CollapsibleContentProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (contentRef.current) {
      setIsOverflowing(contentRef.current.scrollHeight > maxHeight);
    }
  }, [children, maxHeight]);

  return (
    <div className="relative">
      <div
        ref={contentRef}
        className={`overflow-hidden transition-[max-height] duration-500 ease-in-out`}
        style={{ maxHeight: isExpanded ? 'none' : `${maxHeight}px` }}
      >
        {children}
      </div>
      
      {isOverflowing && !isExpanded && (
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-button-bg to-transparent pointer-events-none flex items-end justify-center pb-2">
           <button
            onClick={() => setIsExpanded(true)}
            className="pointer-events-auto bg-surface/80 hover:bg-surface border border-border-color text-xs px-3 py-1 rounded-full flex items-center gap-1 shadow-lg backdrop-blur-sm transition-all hover:scale-105"
          >
            Show More <ChevronDown className="w-3 h-3" />
          </button>
        </div>
      )}
      
      {isOverflowing && isExpanded && (
        <div className="flex justify-center mt-2">
          <button
            onClick={() => setIsExpanded(false)}
            className="text-xs text-secondary-text hover:text-primary-text flex items-center gap-1"
          >
            Show Less <ChevronUp className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
};

export default CollapsibleContent;