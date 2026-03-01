<script lang="ts">
  import Shield from '@lucide/svelte/icons/shield';
  import MessageSquare from '@lucide/svelte/icons/message-square';
  import ArrowUp from '@lucide/svelte/icons/arrow-up';
  import { SidebarTrigger } from "$lib/components/ui/sidebar/index.js";
  import {
    PromptInput,
    PromptInputAction,
    PromptInputActions,
    PromptInputTextarea,
  } from "$lib/components/prompt-kit/prompt-input";
  import {
    ChatContainerRoot,
    ChatContainerContent,
    ChatContainerScrollAnchor,
  } from "$lib/components/prompt-kit/chat-container";
  import { Message, MessageContent } from "$lib/components/prompt-kit/message";
  import { Reasoning, ReasoningTrigger, ReasoningContent } from "$lib/components/prompt-kit/reasoning";
  import { Markdown } from "$lib/components/prompt-kit/markdown";
  import { Button } from "$lib/components/ui/button";
  import "$lib/assets/animations.css";

  interface ChatMessage {
    id: string;
    sender: string;
    content: string;
    reasoning?: string;
    timestamp: string;
    isOwn: boolean;
  }

  let { 
    messages = [], 
    onSendMessage,
    status = 'disconnected',
    isLoading = false
  } = $props<{
    messages: ChatMessage[];
    onSendMessage: (content: string) => void;
    status: 'disconnected' | 'connecting' | 'connected';
    isLoading?: boolean;
  }>();

  let inputMessage = $state('');

  async function handleSubmit() {
    if (!inputMessage.trim()) return;
    onSendMessage(inputMessage);
    inputMessage = '';
  }
</script>

<div class="chat-view">
  <header class="chat-header">
    <div class="header-info">
      <SidebarTrigger class="mr-2" />
      <MessageSquare size={18} />
      <h1>MAIN_CHANNEL</h1>
    </div>
    <div class="header-actions">
      <Shield size={18} class="text-[#00ff41]" />
    </div>
  </header>

  <ChatContainerRoot class="flex-1 flex-col">
    <ChatContainerContent class="gap-4 max-w-3xl mx-auto w-full p-4">
      {#if messages.length === 0}
        <div class="empty-state">
          <p>No messages yet...</p>
        </div>
      {/if}
      {#each messages as msg (msg.id)}
        <Message class={msg.isOwn ? 'justify-end' : 'justify-start'}>
          <MessageContent class={msg.isOwn ? 'bg-primary text-primary-foreground' : 'bg-transparent border-none p-0 shadow-none max-w-none prose-invert'}>
            <div class="flex flex-col gap-1">
              <div class="flex items-center gap-2 text-xs opacity-70">
                <span class="font-semibold">{msg.sender}</span>
                <span>{msg.timestamp}</span>
              </div>
              {#if msg.reasoning}
                <Reasoning>
                  <ReasoningTrigger>Show AI reasoning</ReasoningTrigger>
                  <ReasoningContent markdown={true}>{msg.reasoning}</ReasoningContent>
                </Reasoning>
              {/if}
              <p>{msg.content}</p>
            </div>
          </MessageContent>
        </Message>
      {/each}

      {#if isLoading}
        <Message class="justify-start">
          <MessageContent class="bg-transparent border-none p-0 shadow-none max-w-none">
            <div class="flex flex-col gap-1">
              <div class="flex items-center gap-2 text-xs opacity-70">
                <span class="font-semibold text-primary">Skyth</span>
                <span class="animate-pulse">TYPING...</span>
              </div>
              <div class="beat-loader">
                <div class="beat-dot"></div>
                <div class="beat-dot"></div>
                <div class="beat-dot"></div>
              </div>
            </div>
          </MessageContent>
        </Message>
      {/if}
    </ChatContainerContent>
    <ChatContainerScrollAnchor />
  </ChatContainerRoot>

  <footer class="input-area">
    <div class="max-w-3xl mx-auto w-full">
      <PromptInput
        value={inputMessage}
        onValueChange={(v) => inputMessage = v}
        onSubmit={handleSubmit}
        class="w-full"
      >
        <PromptInputTextarea placeholder="Ask me anything..." />
        <PromptInputActions class="justify-end pt-2">
          <PromptInputAction>
            {#snippet tooltip()}
              Send message
            {/snippet}
            <Button
              variant="default"
              size="icon"
              class="h-8 w-8 rounded-full"
              onclick={handleSubmit}
              disabled={!inputMessage.trim()}
            >
              <ArrowUp class="size-5" />
            </Button>
          </PromptInputAction>
        </PromptInputActions>
      </PromptInput>
    </div>
  </footer>
</div>

<style>
  .chat-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .chat-header {
    height: 64px;
    flex-shrink: 0;
    border-bottom: 1px solid hsl(var(--border));
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 24px;
  }

  .header-info {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .chat-header h1 {
    font-size: 0.9rem;
    font-weight: bold;
    letter-spacing: 1px;
    margin: 0;
  }

  .empty-state {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.5;
    font-size: 0.85rem;
  }

  .input-area {
    flex-shrink: 0;
    padding: 16px 24px;
    border-top: 1px solid hsl(var(--border));
  }
</style>
