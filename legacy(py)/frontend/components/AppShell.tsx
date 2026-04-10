// components/AppShell.tsx
"use client";

import { useState, useEffect } from 'react';
import { useChatContext } from '@/context/ChatContext';
import Sidebar from './sidebar';
import SearchModal from './SearchModal';
import { usePathname, useRouter } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { Logo } from './icons';
import { PanelLeft, SquarePen } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { 
    chats, 
    activeChatId, 
    startNewChat, 
    switchChat, 
    deleteChat, 
    renameChat,
    selectedModel,
    setSelectedModel 
  } = useChatContext();
  const { user, isLoading: isUserLoading } = useUser();
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const isAuthPage = pathname === '/login' || pathname === '/register';

  useEffect(() => {
    if (isUserLoading) return;
    if (!user && !isAuthPage) router.push('/login');
    if (user && isAuthPage) router.push('/');
  }, [user, isUserLoading, pathname, router, isAuthPage]);

  useEffect(() => {
    if (window.innerWidth < 768) setSidebarOpen(false);
  }, [pathname]);

  useEffect(() => { 
    if (window.innerWidth >= 768) setSidebarOpen(true);
    else setSidebarOpen(false);
  }, []);

  const handleNewChat = () => {
    startNewChat();
    if (pathname !== '/') router.push('/');
    if (window.innerWidth < 768) setSidebarOpen(false);
  };

  const handleSwitchChat = (chatId: number) => {
    switchChat(chatId);
    if (pathname !== '/') router.push('/');
    if (window.innerWidth < 768) setSidebarOpen(false);
  };
  
  const handleOpenSearch = () => setIsSearchOpen(true);

  if (isUserLoading || (!user && !isAuthPage)) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-bg-color">
        <div className="relative w-16 h-16">
          <Logo className="w-full h-full fill-primary-text transform rotate-45 animate-pulse" />
        </div>
      </div>
    );
  }

  if (isAuthPage) return <>{children}</>;

  return (
    <div 
      className="flex w-full h-full relative overflow-hidden"
      style={{ '--sidebar-width': isSidebarOpen ? '260px' : '64px' } as React.CSSProperties}
    >
      <SearchModal 
        isOpen={isSearchOpen}
        onOpenChange={setIsSearchOpen}
        onSwitchChat={handleSwitchChat}
        chats={chats}
        activeChatId={activeChatId}
      />

      <Sidebar 
        chats={chats} 
        activeChatId={activeChatId} 
        onNewChat={handleNewChat}
        onSwitchChat={handleSwitchChat} 
        onDeleteChat={deleteChat} 
        onRenameChat={renameChat}
        onToggleSidebar={() => setSidebarOpen(!isSidebarOpen)} 
        isSidebarOpen={isSidebarOpen}
        onOpenSearch={handleOpenSearch}
      />
      
      <main className="flex-grow h-full bg-bg-color flex flex-col relative overflow-hidden transition-all duration-300 ease-in-out md:pl-[var(--sidebar-width)]">
        <header className="absolute top-0 left-0 md:left-[var(--sidebar-width)] right-0 flex-shrink-0 py-2 md:py-3 px-4 flex justify-between items-center z-10 bg-gradient-to-b from-bg-color via-bg-color/80 to-transparent pointer-events-none transition-all duration-300 ease-in-out">
          
          <div className="flex items-center gap-2 pointer-events-auto">
            <button 
              onClick={() => setSidebarOpen(true)} 
              className="text-secondary-text hover:text-primary-text text-xl cursor-pointer md:hidden"
            >
              <PanelLeft className="w-5 h-5 md:w-6 md:h-6" />
            </button>
            
            <div className="pointer-events-auto">
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger className="h-8 w-auto gap-2 border-0 bg-transparent text-sm font-bold text-primary-text hover:bg-[var(--sidebar-highlight-bg-color)] focus:ring-0 px-3 rounded-lg transition-colors">
                  <SelectValue placeholder="Select Model" />
                </SelectTrigger>
                <SelectContent align="start">
                  <SelectItem value="lite">Flash Lite</SelectItem>
                  <SelectItem value="flash">Flash</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <button
            onClick={handleNewChat}
            title="New Chat"
            className="p-2 rounded-full text-secondary-text hover:text-primary-text hover:bg-[var(--sidebar-highlight-bg-color)] transition-colors pointer-events-auto"
          >
            <SquarePen className="w-4 h-4 md:w-5 md:h-5" />
          </button>
        </header>

        <AnimatePresence mode="wait">
          <motion.div
            key={pathname}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="flex-grow flex flex-col min-h-0 pt-14 md:pt-16"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}