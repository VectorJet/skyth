// components/SearchModal.tsx
import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Search, Loader2, MessageSquare, Clock } from "lucide-react";
import { Chat } from '@/types';
import { useDebounce } from '@/hooks/useDebounce';
import { api } from '@/lib/api';

interface SearchModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSwitchChat: (chatId: number) => void;
  chats: Chat[];
  activeChatId: number | null;
}

interface SearchResult {
  chat_id: number;
  message_id: number | null;
  chat_title: string;
  match_type: 'title' | 'message';
  match_content: string;
  relevance: number;
}

export default function SearchModal({ isOpen, onOpenChange, onSwitchChat, chats, activeChatId }: SearchModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setSearchTerm('');
      setResults([]);
    }
  }, [isOpen]);

  useEffect(() => {
    const performSearch = async () => {
      if (!debouncedSearchTerm.trim()) {
        setResults([]);
        return;
      }

      setIsSearching(true);
      try {
        const response = await api(`/search/query?q=${encodeURIComponent(debouncedSearchTerm)}`);
        if (response.ok) {
          const data = await response.json();
          setResults(data);
        }
      } catch (error) {
        console.error("Search failed:", error);
      } finally {
        setIsSearching(false);
      }
    };

    performSearch();
  }, [debouncedSearchTerm]);

  const handleSelectResult = (result: SearchResult) => {
    onSwitchChat(result.chat_id);
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl bg-surface border-border-color p-0 gap-0 overflow-hidden">
        <div className="flex items-center border-b border-border-color px-4 py-3">
          <Search className="w-5 h-5 text-secondary-text mr-3" />
          <input
            ref={inputRef}
            className="flex-1 bg-transparent border-none outline-none text-primary-text placeholder:text-secondary-text text-lg"
            placeholder="Search messages and chats..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {isSearching && <Loader2 className="w-4 h-4 animate-spin text-accent" />}
        </div>
        
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {results.length > 0 ? (
            <div className="space-y-1">
              {results.map((result, index) => (
                <button
                  key={`${result.chat_id}-${result.message_id || 'chat'}-${index}`}
                  onClick={() => handleSelectResult(result)}
                  className="w-full text-left px-4 py-3 hover:bg-button-bg rounded-lg transition-colors flex flex-col gap-1 group"
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="font-medium text-primary-text flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-accent opacity-70" />
                      {result.chat_title}
                    </span>
                    {result.match_type === 'message' && (
                      <span className="text-xs text-secondary-text bg-black/20 px-2 py-0.5 rounded-full">
                        Message Match
                      </span>
                    )}
                  </div>
                  {result.match_type === 'message' && (
                    <p className="text-sm text-secondary-text line-clamp-2 pl-6 border-l-2 border-border-color group-hover:border-accent/50 transition-colors">
                      {result.match_content}
                    </p>
                  )}
                </button>
              ))}
            </div>
          ) : searchTerm ? (
            <div className="py-8 text-center text-secondary-text">
              No results found for "{searchTerm}"
            </div>
          ) : (
            <div className="py-4 px-4">
              <p className="text-xs font-semibold text-secondary-text mb-2 uppercase tracking-wider">Recent Chats</p>
              <div className="space-y-1">
                {chats.slice(0, 5).map(chat => (
                  <button
                    key={chat.id}
                    onClick={() => { onSwitchChat(chat.id); onOpenChange(false); }}
                    className="w-full text-left px-3 py-2 hover:bg-button-bg rounded-lg transition-colors flex items-center gap-3 text-primary-text"
                  >
                    <Clock className="w-4 h-4 text-secondary-text" />
                    <span className="truncate">{chat.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}