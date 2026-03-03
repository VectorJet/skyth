<script lang="ts">
  import Compose from '$lib/components/icons/compose.svelte';
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
  import { Tool, ToolHeader, ToolInput, ToolOutput, ToolContent } from "$lib/components/ai-elements/tool";
  import "$lib/assets/animations.css";

  interface ToolCall {
    id: string;
    name: string;
    args: string;
    result?: any;
    state: 'running' | 'completed' | 'error';
  }

  interface ChatMessage {
    id: string;
    sender: string;
    content: string;
    reasoning?: string;
    toolCalls?: ToolCall[];
    timestamp: string;
    isOwn: boolean;
  }

  let { 
    messages = [], 
    onSendMessage,
    status = 'disconnected',
    isLoading = false,
    streamingMessage = null
  } = $props<{
    messages: ChatMessage[];
    onSendMessage: (content: string) => void;
    status: 'disconnected' | 'connecting' | 'connected';
    isLoading?: boolean;
    streamingMessage?: ChatMessage | null;
  }>();

  let inputMessage = $state('');

  async function handleSubmit() {
    if (!inputMessage.trim()) return;
    onSendMessage(inputMessage);
    inputMessage = '';
  }
</script>

<div class="chat-view relative">
  <div class="absolute top-4 left-4 z-10 md:hidden">
    <SidebarTrigger />
  </div>
  <div class="absolute top-4 right-4 z-10">
    <Button variant="ghost" size="icon" class="text-zinc-500 hover:text-white rounded-md hover:bg-[#3c3c40]">
      <Compose class="size-5" />
    </Button>
  </div>

  <ChatContainerRoot class="flex-1 flex-col overflow-y-auto">
    <ChatContainerContent class="gap-4 max-w-3xl mx-auto w-full p-4 pt-16">
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
                  <ReasoningContent content={msg.reasoning} markdown={true} />
                </Reasoning>
              {/if}
              {#if msg.toolCalls && msg.toolCalls.length > 0}
                <div class="flex flex-col gap-2 mt-2">
                  {#each msg.toolCalls as tool (tool.id)}
                    <Tool>
                      <ToolHeader type={tool.name} state={tool.state === 'running' ? 'input-streaming' : 'output-available'} />
                      <ToolContent>
                        {#if tool.args}
                          <ToolInput input={(() => { try { return JSON.parse(tool.args) } catch { return tool.args } })()} />
                        {/if}
                        {#if tool.result}
                          <ToolOutput output={tool.result} />
                        {/if}
                      </ToolContent>
                    </Tool>
                  {/each}
                </div>
              {/if}
              <p>{msg.content}</p>
            </div>
          </MessageContent>
        </Message>
      {/each}

      {#if streamingMessage}
        <Message class="justify-start">
          <MessageContent class="bg-transparent border-none p-0 shadow-none max-w-none prose-invert">
            <div class="flex flex-col gap-1">
              <div class="flex items-center gap-2 text-xs opacity-70">
                <span class="font-semibold text-primary">{streamingMessage.sender}</span>
                <span>{streamingMessage.timestamp}</span>
              </div>
              {#if streamingMessage.reasoning}
                <Reasoning>
                  <ReasoningTrigger>Show AI reasoning</ReasoningTrigger>
                  <ReasoningContent content={streamingMessage.reasoning} markdown={true} />
                </Reasoning>
              {/if}
              {#if streamingMessage.toolCalls && streamingMessage.toolCalls.length > 0}
                <div class="flex flex-col gap-2 mt-2">
                  {#each streamingMessage.toolCalls as tool (tool.id)}
                    <Tool>
                      <ToolHeader type={tool.name} state={tool.state === 'running' ? 'input-streaming' : 'output-available'} />
                      <ToolContent>
                        {#if tool.args}
                          <ToolInput input={(() => { try { return JSON.parse(tool.args) } catch { return tool.args } })()} />
                        {/if}
                        {#if tool.result}
                          <ToolOutput output={tool.result} />
                        {/if}
                      </ToolContent>
                    </Tool>
                  {/each}
                </div>
              {/if}
              {#if streamingMessage.content}
                <p>{streamingMessage.content}</p>
              {/if}
            </div>
          </MessageContent>
        </Message>
      {:else if isLoading}
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
