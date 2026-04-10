// hooks/useCustomTextSelection.ts
"use client";

import { useState, useEffect, useCallback } from 'react';

interface SelectionInfo {
  text: string;
  rect: DOMRect;
}

export function useCustomTextSelection() {
  const [selectionInfo, setSelectionInfo] = useState<SelectionInfo | null>(null);

  const handleSelectionChange = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      setSelectionInfo(null);
      return;
    }

    const selectedText = selection.toString().trim();
    const range = selection.getRangeAt(0);
    
    // Ignore selections inside input fields or textareas
    const parentElement = range.startContainer.parentElement;
    if (parentElement) {
      const tagName = parentElement.tagName.toUpperCase();
      if (tagName === 'INPUT' || tagName === 'TEXTAREA' || parentElement.isContentEditable) {
        setSelectionInfo(null);
        return;
      }
    }

    if (selectedText.length > 0) {
      setSelectionInfo({
        text: selectedText,
        rect: range.getBoundingClientRect(),
      });
    } else {
      setSelectionInfo(null);
    }
  }, []);

  const clearSelection = useCallback(() => {
    window.getSelection()?.empty();
    setSelectionInfo(null);
  }, []);

  useEffect(() => {
    document.addEventListener('selectionchange', handleSelectionChange);
    document.addEventListener('mousedown', () => {
        // A small delay to allow the new selection to register before clearing
        setTimeout(() => {
            const selection = window.getSelection();
            if (selection && selection.isCollapsed) {
                setSelectionInfo(null);
            }
        }, 10);
    });

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [handleSelectionChange]);

  return { selectionInfo, clearSelection };
}