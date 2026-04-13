// components/chat-input.tsx
import React, { useState, useRef, useEffect, KeyboardEvent, FormEvent, forwardRef } from 'react';
import ContextMenu from './ContextMenu';
import { useUser } from '@/context/UserContext';
import { useChatContext } from '@/context/ChatContext';
import { App } from '@/types';
import { Plus, ArrowUp, LoaderCircle, Image, File, X, Lightbulb, GraduationCap, TrendingUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Logo } from './icons';
import GreetingAnimator from './GreetingAnimator'; // Import the new component

const iosPopupAnimation = {
  initial: { opacity: 0, scale: 0.95, y: 10 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 400, damping: 25 } },
  exit: { opacity: 0, scale: 0.95, y: 10, transition: { duration: 0.15 } },
};

const AppSuggestions = ({ apps, onSelect }: { apps: App[], onSelect: (appName: string) => void }) => {
  if (apps.length === 0) return null;
  return (
    <motion.div
      variants={iosPopupAnimation}
      initial="initial"
      animate="animate"
      exit="exit"
      className="absolute bottom-full left-0 right-0 mb-2 w-full bg-surface border border-border-color rounded-xl shadow-lg p-2 max-h-[200px] overflow-y-auto origin-bottom z-30"
    >
      <p className="text-xs text-secondary-text px-2 pb-1 font-semibold">Connected Apps</p>
      {apps.map(app => (
        <button key={app.name} onClick={() => onSelect(app.name)} className="w-full text-left flex items-center gap-3 p-2 rounded-md hover:bg-button-bg">
          <img src={app.icon_url} alt={app.name} className="w-6 h-6" />
          <span className="text-primary-text text-sm font-medium">{app.name}</span>
        </button>
      ))}
    </motion.div>
  );
};

const AttachmentPreview = ({ file, onRemove, onMaximize }: { file: File, onRemove: () => void, onMaximize: (url: string) => void }) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    const isImage = file.type.startsWith('image/');
    if (isImage) {
      const objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);
      return () => URL.revokeObjectURL(objectUrl);
    }
  }, [file]);

  const content = previewUrl ? (
    <img src={previewUrl} alt={file.name} className="w-full h-full object-cover" />
  ) : (
    <div className="w-full h-full flex flex-col items-center justify-center text-secondary-text p-1">
      <File className="w-6 h-6 mb-1 flex-shrink-0" />
      <p className="text-xs text-center leading-tight break-all truncate">{file.name}</p>
    </div>
  );

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      className="relative w-20 h-20 bg-surface rounded-lg overflow-hidden border border-border-color flex-shrink-0"
    >
      {previewUrl ? (
        <button onClick={() => onMaximize(previewUrl)} className="w-full h-full block cursor-zoom-in">
          {content}
        </button>
      ) : (
        content
      )}
      <button
        onClick={onRemove}
        className="absolute top-1 right-1 w-5 h-5 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center transition-colors"
        aria-label="Remove attachment"
      >
        <X className="w-3 h-3" />
      </button>
    </motion.div>
  );
};

const suggestions = [
  { title: "Give me ideas", subtitle: "for what to do with my kids' art", prompt: "Give me ideas for what to do with my kids' art", icon: Lightbulb },
  { title: "Help me study", subtitle: "vocabulary for a college entrance exam", prompt: "Help me study vocabulary for a college entrance exam", icon: GraduationCap },
  { title: "Explain options trading", subtitle: "if I'm familiar with buying and selling stocks", prompt: "Explain options trading if I'm familiar with buying and selling stocks", icon: TrendingUp },
];

const InlineMarkdownRenderer = ({ content }: { content: string }) => {
  const renderText = () => {
    if (!content) return <span className="opacity-50">Ask Skyth or type @ to use an app...</span>;

    const parts = [];
    let lastIndex = 0;
    const regex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`(.+?)`)/g;
    
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push(<span key={lastIndex}>{content.substring(lastIndex, match.index)}</span>);
      }
      if (match[1]) {
        parts.push(<span key={match.index} className="font-bold text-accent-color">{match[2]}</span>);
      } else if (match[3]) {
        parts.push(<span key={match.index} className="italic text-accent-color">{match[4]}</span>);
      } else if (match[5]) {
        parts.push(<span key={match.index} className="font-mono bg-white/10 rounded px-1 text-sm mx-0.5">{match[6]}</span>);
      }
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < content.length) {
      parts.push(<span key={lastIndex}>{content.substring(lastIndex)}</span>);
    }
    return parts;
  };
  return <>{renderText()}</>;
};

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  isLoading: boolean;
  onImageMaximize: (imageUrl: string) => void;
  isInitial?: boolean;
}

const ChatInput = forwardRef<HTMLDivElement, ChatInputProps>(
  ({ onSendMessage, isLoading, onImageMaximize, isInitial = false }, ref) => {
    const { connectedApps } = useUser();
    const { attachedFiles, addAttachedFile, removeAttachedFile } = useChatContext();
    const [input, setInput] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [activeMenu, setActiveMenu] = useState<'attach' | null>(null);
    const [showAppSuggestions, setShowAppSuggestions] = useState(false);
    const [appSuggestions, setAppSuggestions] = useState<App[]>([]);
    const [activeApp, setActiveApp] = useState<App | null>(null);
    const [queryText, setQueryText] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);
    const attachButtonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
      const match = input.match(/^@(\w+)\s*(.*)/s);
      if (match) {
        const appName = match[1];
        const restOfQuery = match[2];
        const app = connectedApps.find(a => a.name.toLowerCase() === appName.toLowerCase());
        if (app) {
          setActiveApp(app);
          setQueryText(restOfQuery);
          setShowAppSuggestions(false);
        } else {
          setActiveApp(null);
          setQueryText(input);
        }
      } else {
        setActiveApp(null);
        setQueryText(input);
      }

      if (input.startsWith('@') && !activeApp) {
        const searchTerm = input.substring(1).toLowerCase();
        const filtered = connectedApps.filter(app => app.name.toLowerCase().startsWith(searchTerm));
        setAppSuggestions(filtered);
        setShowAppSuggestions(true);
      } else {
        setShowAppSuggestions(false);
      }
    }, [input, connectedApps, activeApp]);

    const handleAppSelect = (appName: string) => {
      setInput(`@${appName} `);
      setShowAppSuggestions(false);
      textareaRef.current?.focus();
    };

    const handleSubmit = (e: FormEvent) => {
      e.preventDefault();
      if ((input.trim() || attachedFiles.length > 0) && !isLoading) {
        onSendMessage(input);
        setInput('');
      }
    };

    const handleSuggestionClick = (prompt: string) => {
      onSendMessage(prompt);
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit(e as any);
      }
    };

    useEffect(() => {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
      }
    }, [input]);

    useEffect(() => {
      if (!isInitial) {
        const handleFocus = () => {
          setTimeout(() => {
            if (containerRef.current) {
              containerRef.current.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'end' 
              });
            }
          }, 300);
        };
        const textarea = textareaRef.current;
        textarea?.addEventListener('focus', handleFocus);
        return () => { textarea?.removeEventListener('focus', handleFocus); };
      }
    }, [isInitial]);

    useEffect(() => {
      const handleResize = () => {
        if (containerRef.current && document.activeElement === textareaRef.current) {
          requestAnimationFrame(() => {
            containerRef.current?.scrollIntoView({ 
              behavior: 'smooth', 
              block: 'end' 
            });
          });
        }
      };

      if ('visualViewport' in window) {
        window.visualViewport?.addEventListener('resize', handleResize);
        return () => {
          window.visualViewport?.removeEventListener('resize', handleResize);
        };
      }
    }, []);

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        addAttachedFile(file);
      }
      if (event.target) {
        event.target.value = '';
      }
    };

    const triggerFileInput = (accept?: string) => {
      if (fileInputRef.current) {
        if (accept) {
          fileInputRef.current.accept = accept;
        } else {
          fileInputRef.current.removeAttribute('accept');
        }
        fileInputRef.current.click();
      }
    };

    const attachMenuItems = [
      { label: 'Upload Image', icon: Image, onClick: () => triggerFileInput('image/png,image/jpeg,image/webp,image/gif') },
      { label: 'Upload File', icon: File, onClick: () => triggerFileInput('.txt,.py,.js,.html,.css,.md') },
    ];

    const containerVariants = {
      initial: { bottom: "50%", y: "50%" },
      active: { bottom: 0, y: "0%" }
    };

    return (
      <motion.div 
        ref={containerRef}
        className={`fixed left-0 right-0 z-20 md:left-[var(--sidebar-width)] transition-[left,right] duration-300 ease-in-out`}
        initial={isInitial ? "initial" : "active"}
        animate={isInitial ? "initial" : "active"}
        variants={containerVariants}
        transition={{ type: "spring", stiffness: 120, damping: 20, mass: 0.5 }} 
      >
        <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" />
        
        {/* FIX: Solid background block to cover text leakage on mobile 
          - Located absolutely at the bottom
          - Extends downwards (-bottom-10)
          - Visible only in active state (when at bottom)
        */}
        {!isInitial && (
          <div className="absolute bottom-[-40px] left-0 right-0 h-[100px] bg-bg-color z-[-1]" />
        )}

        <div className="w-full flex flex-col items-center gap-6 p-4">
          <AnimatePresence>
            {isInitial && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                className="flex flex-col items-center gap-4 mb-2"
              >
                <div className="w-16 h-16 mb-2"><Logo className="w-full h-full fill-primary-text transform rotate-45" /></div>
                {/* Replaced simple h2 with the new Animator */}
                <GreetingAnimator />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Main Input Container with Enhanced Gradient */}
          <div className={`w-full flex justify-center ${isInitial ? '' : 'bg-gradient-to-t from-bg-color via-bg-color/95 to-transparent pt-12 pb-4'}`}>
            <div className="relative max-w-3xl w-full">
              <AnimatePresence>
                {showAppSuggestions && <AppSuggestions apps={appSuggestions} onSelect={handleAppSelect} />}
              </AnimatePresence>
              
              <AnimatePresence>
                {attachedFiles.length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden mb-2"
                  >
                    <div className="flex flex-row gap-2 p-2 bg-surface border border-border-color rounded-xl overflow-x-auto">
                      {attachedFiles.map((file, index) => (
                        <AttachmentPreview
                          key={`${file.name}-${index}`}
                          file={file}
                          onRemove={() => removeAttachedFile(file)}
                          onMaximize={onImageMaximize}
                        />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="relative p-2.5 flex flex-col gap-2 rounded-3xl bg-surface border border-border-color transition-colors focus-within:border-accent-color shadow-2xl">
                <div className="relative grid place-items-start">
                  <div 
                    className="col-start-1 row-start-1 bg-transparent border-none outline-none text-primary-text text-base leading-tight min-h-[24px] max-h-[150px] w-full px-2.5 whitespace-pre-wrap break-words pointer-events-none overflow-hidden"
                    aria-hidden="true"
                  >
                    {activeApp ? (
                      <span className="inline-flex flex-wrap gap-1">
                        <span className="inline-flex items-center gap-2 bg-black/20 py-1 pl-2 pr-3 rounded-full text-sm font-medium -ml-1.5 mb-1 align-middle">
                          <img src={activeApp.icon_url} alt={activeApp.name} className="w-5 h-5" />
                          {activeApp.name}
                        </span>
                        <InlineMarkdownRenderer content={queryText} />
                      </span>
                    ) : (
                      <InlineMarkdownRenderer content={queryText} />
                    )}
                    {input === '' && <span className="invisible">.</span>} 
                  </div>

                  <textarea 
                    ref={textareaRef} 
                    rows={1} 
                    placeholder="Ask Skyth or type @ to use an app..." 
                    value={input} 
                    onChange={(e) => setInput(e.target.value)} 
                    onKeyDown={handleKeyDown} 
                    disabled={isLoading} 
                    className="col-start-1 row-start-1 inset-0 bg-transparent border-none outline-none focus-visible:outline-none text-transparent caret-primary-text text-base resize-none leading-tight max-h-[150px] w-full px-2.5 whitespace-pre-wrap break-words overflow-hidden" 
                  />
                </div>
                
                <div className="flex items-center gap-1 px-1.5">
                  <div className="relative">
                    <button ref={attachButtonRef} onClick={() => setActiveMenu(activeMenu === 'attach' ? null : 'attach')} className="bg-transparent text-secondary-text w-10 h-10 min-h-0 rounded-full flex items-center justify-center flex-shrink-0 aspect-square transition-colors hover:not(:disabled):bg-button-bg">
                      <Plus className="w-5 h-5" />
                    </button>
                    {activeMenu === 'attach' && <ContextMenu items={attachMenuItems} triggerRef={attachButtonRef} onClose={() => setActiveMenu(null)} />}
                  </div>
                  <button onClick={handleSubmit} disabled={isLoading || (!input.trim() && attachedFiles.length === 0)} className="w-10 h-10 min-h-0 rounded-full flex items-center justify-center flex-shrink-0 aspect-square transition-colors ml-auto bg-button-bg text-primary-text disabled:bg-[#3a3a3e] disabled:text-[#6a6a6e] disabled:cursor-not-allowed">
                    {isLoading ? <LoaderCircle className="w-5 h-5 animate-spin" /> : <ArrowUp className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <AnimatePresence>
            {isInitial && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20, transition: { duration: 0.2 } }}
                className="hidden md:flex gap-4 w-full max-w-3xl flex-wrap justify-center"
              >
                {suggestions.map(s => (
                  <button 
                    key={s.title} 
                    onClick={() => handleSuggestionClick(s.prompt)}
                    className="flex-1 min-w-[180px] p-4 bg-surface border border-border-color rounded-2xl text-left hover:bg-button-bg transition-colors group"
                  >
                    <div className="flex justify-between items-start mb-1">
                      <p className="text-sm font-semibold text-primary-text">{s.title}</p>
                      {s.icon && <s.icon className="w-4 h-4 text-secondary-text group-hover:text-accent-color transition-colors" />}
                    </div>
                    <p className="text-xs text-secondary-text opacity-70 line-clamp-2">{s.subtitle}</p>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    );
  }
);

ChatInput.displayName = 'ChatInput';
export default ChatInput;