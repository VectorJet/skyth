// components/chat.tsx
"use client";
import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useChatContext } from '@/context/ChatContext';
import ChatMessage from './chat-message';
import { ChevronDown } from 'lucide-react';
import ImageModal from './ImageModal';

const ChatInput = dynamic(() => import('./chat-input'), { ssr: false });

const Chat = () => {
  const { 
    messages, 
    liveMessage, 
    isLoading, 
    sendMessage, 
    activeChatId, 
    connectedApps,
    submitQuery,
    loadChatHistory
  } = useChatContext();
  
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const isUserScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [maximizedImageUrl, setMaximizedImageUrl] = useState<string | null>(null);

  const allMessages = [...messages];
  if (liveMessage && !messages.some(m => m.id === liveMessage.id)) {
    allMessages.push(liveMessage);
  }
  
  const isChatActive = activeChatId !== null || allMessages.length > 0;
  const isInitial = !isChatActive; // Define isInitial state
  
  const scrollToBottom = (behavior: 'smooth' | 'auto' = 'smooth') => {
    if (chatAreaRef.current && !isUserScrollingRef.current) {
      chatAreaRef.current.scrollTo({ top: chatAreaRef.current.scrollHeight, behavior });
    }
  };

  useEffect(() => {
    const chatArea = chatAreaRef.current;
    const handleScroll = () => {
      if (chatArea) {
        const { scrollTop, scrollHeight, clientHeight } = chatArea;
        const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
        setShowScrollButton(scrollHeight > clientHeight && !isAtBottom);
        if (!isAtBottom) {
          isUserScrollingRef.current = true;
          if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
          scrollTimeoutRef.current = setTimeout(() => { isUserScrollingRef.current = false; }, 1500);
        } else { isUserScrollingRef.current = false; }
      }
    };
    chatArea?.addEventListener('scroll', handleScroll);
    return () => {
      chatArea?.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (chatAreaRef.current) {
      chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
    }
    setShowScrollButton(false);
    isUserScrollingRef.current = false;
  }, [activeChatId]);

  const handleSendMessage = (input: string) => {
    isUserScrollingRef.current = false;
    sendMessage(input);
  };
  
  const handleEditSubmit = (params: { userInput: string; editInfo: { group_uuid: string; old_message_id: number; }; }) => {
    const { userInput, editInfo } = params;
    const msgIndex = messages.findIndex(m => m.id === editInfo.old_message_id);
    const parentMessageId = msgIndex > 0 ? parseInt(messages[msgIndex - 1].id, 10) : undefined;
    submitQuery({ userInput, editInfo, parentMessageId });
  };

  const handleRegenerateSubmit = (params: { regenInfo: { group_uuid: string; }; }) => {
    const { regenInfo } = params;
    const msgIndex = messages.findIndex(m => m.message_group_uuid === regenInfo.group_uuid);

    if (msgIndex === -1) {
      console.error("Could not find message to regenerate");
      return;
    }

    const messageToRegenerate = messages[msgIndex];
    const parentMessageId = msgIndex > 0 ? parseInt(messages[msgIndex - 1].id, 10) : undefined;
    const userInput = msgIndex > 0 ? messages[msgIndex - 1].content : "Regenerate response";

    const fullRegenInfo = {
      group_uuid: regenInfo.group_uuid,
      old_message_id: messageToRegenerate.id
    };

    submitQuery({ userInput, regenInfo: fullRegenInfo, parentMessageId });
  };

  const handleLoadBranch = (messageId: number) => {
    if (activeChatId) {
      loadChatHistory(activeChatId, messageId);
    }
  };
  
  const handleWidgetAction = (message: string) => {
    handleSendMessage(message);
  };

  useEffect(() => { if (!isUserScrollingRef.current) scrollToBottom('smooth'); }, [messages.length, liveMessage?.content]);

  return (
    <div className="relative flex flex-col flex-grow min-h-0 h-full">
      <ImageModal imageUrl={maximizedImageUrl} onClose={() => setMaximizedImageUrl(null)} />
      
      {/* Render messages only if there are any */}
      {!isInitial && (
        // Increased bottom padding to clear the larger gradient
        <div ref={chatAreaRef} className="flex-grow overflow-y-auto overflow-x-hidden px-5 min-h-0 pb-[240px]">
          {/* Center the chat stream */}
          <div className="flex flex-col gap-4 max-w-3xl mx-auto w-full">
            {allMessages.map((msg) => (
              <ChatMessage 
                key={msg.id} 
                message={msg} 
                isLoading={liveMessage ? msg.id === liveMessage.id : false} 
                onWidgetAction={handleWidgetAction}
                connectedApps={connectedApps}
                onEditSubmit={handleEditSubmit}
                onRegenerateSubmit={handleRegenerateSubmit}
                onLoadBranch={handleLoadBranch}
                onImageMaximize={setMaximizedImageUrl}
              />
            ))}
          </div>
        </div>
      )}

      {showScrollButton && (
        <button onClick={() => { isUserScrollingRef.current = false; scrollToBottom('smooth'); }} className="fixed bottom-[140px] left-1/2 -translate-x-1/2 z-[25] w-8 h-8 min-h-0 rounded-full bg-surface border border-border-color text-primary-text flex items-center justify-center flex-shrink-0 cursor-pointer transition-all hover:bg-button-bg hover:scale-110 shadow-xl aspect-square">
          <ChevronDown className="w-4 h-4" />
        </button>
      )}

      <ChatInput 
        onSendMessage={handleSendMessage} 
        isLoading={isLoading} 
        onImageMaximize={setMaximizedImageUrl}
        isInitial={isInitial}
      />
    </div>
  );
};

export default Chat;