// components/StreamingText.tsx
"use client";

import React, { memo, useMemo } from 'react';
import { marked } from 'marked';
import hljs from 'highlight.js';

interface StreamingTextProps {
  content: string;
  isStreaming: boolean;
}

// Configure marked
marked.setOptions({
  breaks: true,
  highlight: function (code, lang) {
    const language = hljs.getLanguage(lang) ? lang : 'plaintext';
    return hljs.highlight(code, { language }).value;
  },
});

// Custom renderer to wrap tables and code blocks
const renderer = new marked.Renderer();
const originalTableRenderer = renderer.table;
renderer.table = function(header, body) {
  const tableHtml = originalTableRenderer.call(this, header, body);
  return `<div class="table-scroll-container">${tableHtml}</div>`;
};

const originalCodeRenderer = renderer.code;
renderer.code = function(code, language) {
  const codeHtml = originalCodeRenderer.call(this, code, language);
  return `<div class="code-wrapper">${codeHtml}</div>`;
};

marked.use({ renderer });

const StreamingTextComponent = ({ content, isStreaming }: StreamingTextProps) => {
  
  // Parse markdown only when content changes
  const htmlContent = useMemo(() => {
    if (!content) return '';
    return marked.parse(content);
  }, [content]);

  // 1. LOADING STATE: Streaming is active, but no text has arrived yet.
  if (isStreaming && !content) {
    return (
      <div className="py-2">
        <div className="loading-circle"></div>
        <style jsx>{`
          .loading-circle {
            width: 10px;
            height: 10px;
            background-color: currentColor; /* Uses text color */
            border-radius: 50%; /* Makes it a perfect circle */
            animation: pulse 1s infinite ease-in-out;
          }
          @keyframes pulse {
            0% { transform: scale(0.8); opacity: 0.5; }
            50% { transform: scale(1.2); opacity: 1; }
            100% { transform: scale(0.8); opacity: 0.5; }
          }
        `}</style>
      </div>
    );
  }

  // 2. TEXT STATE: Content exists (streaming or finished).
  return (
    <>
      <div
        className="prose prose-invert max-w-none prose-p:my-2 prose-pre:bg-[#0d0d0d] prose-code:font-mono prose-table:border-collapse prose-th:border prose-th:border-border-color prose-th:px-3 prose-th:py-2 prose-td:border prose-td:border-border-color prose-td:px-3 prose-td:py-2 prose-td:whitespace-normal prose-th:whitespace-normal animate-text-fade-in"
        dangerouslySetInnerHTML={{ __html: htmlContent }}
      />
      <style jsx global>{`
        /* Fade In Animation for new text block */
        .animate-text-fade-in {
          animation: fadeIn 0.4s ease-out forwards;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(2px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* Invisible container to control table height and scrolling */
        .table-scroll-container {
          max-height: 600px;
          overflow-y: auto;
          overflow-x: auto;
          margin: 1rem 0;
          -webkit-overflow-scrolling: touch;
        }

        .table-scroll-container table {
          margin-top: 0;
          margin-bottom: 0;
        }
        
        /* Allow text wrapping but set a minimum column width */
        .table-scroll-container th,
        .table-scroll-container td {
          white-space: normal;
          min-width: 150px;
        }
        
        /* Code wrapper to prevent horizontal overflow */
        .code-wrapper {
          max-width: 100%;
          overflow: hidden;
          margin: 1rem 0;
          border-radius: 8px;
        }
        
        .code-wrapper pre {
          margin: 0;
          overflow-x: auto;
          max-width: 100%;
          -webkit-overflow-scrolling: touch;
        }
        
        .code-wrapper code {
          display: block;
          white-space: pre;
          word-wrap: normal;
          overflow-wrap: normal;
        }
        
        @media (max-width: 768px) {
          .code-wrapper pre {
            font-size: 0.75rem;
          }
        }
      `}</style>
    </>
  );
};

const StreamingText = memo(StreamingTextComponent);
StreamingText.displayName = 'StreamingText';

export default StreamingText;