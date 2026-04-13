// context/ChatContext.tsx
"use client";

import React, { createContext, useContext, ReactNode, useEffect } from 'react';
import { useChat } from '@/hooks/use-chat';
import { useUser } from './UserContext';
import { App } from '@/types';

type ChatContextType = ReturnType<typeof useChat> & {
  connectedApps: App[];
};

const ChatContext = createContext<ChatContextType | null>(null);

export const useChatContext = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChatContext must be used within a ChatProvider");
  }
  return context;
};

export const ChatProvider = ({ children }: { children: ReactNode }) => {
  const chatState = useChat();
  const { user, connectedApps } = useUser();

  useEffect(() => {
    if (user) {
      chatState.fetchChats(); 
    } else {
      chatState.clearChats();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const contextValue = {
    ...chatState,
    connectedApps,
  };

  return (
    <ChatContext.Provider value={contextValue}>
      {children}
    </ChatContext.Provider>
  );
};