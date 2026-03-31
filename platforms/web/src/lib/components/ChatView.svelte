<script lang="ts">
import Compose from "$lib/components/icons/compose.svelte";
import ArrowUp from "$lib/components/icons/arrow-up.svelte";
import MessageCircle from "$lib/components/icons/message-circle.svelte";
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
import {
	Reasoning,
	ReasoningTrigger,
	ReasoningContent,
} from "$lib/components/prompt-kit/reasoning";
import { Markdown } from "$lib/components/prompt-kit/markdown";
import { Button } from "$lib/components/ui/button";
import {
	Tool,
	ToolHeader,
	ToolInput,
	ToolOutput,
	ToolContent,
} from "$lib/components/ai-elements/tool";
import "$lib/assets/animations.css";

interface ToolCall {
	id: string;
	name: string;
	args: string;
	result?: any;
	state: "running" | "completed" | "error";
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
	status = "disconnected",
	isLoading = false,
	streamingMessage = null,
} = $props<{
	messages: ChatMessage[];
	onSendMessage: (content: string) => void;
	status: "disconnected" | "connecting" | "connected";
	isLoading?: boolean;
	streamingMessage?: ChatMessage | null;
}>();

let inputMessage = $state("");

async function handleSubmit() {
	if (!inputMessage.trim()) return;
	onSendMessage(inputMessage);
	inputMessage = "";
}
</script>

<div class="chat-view">
  <header class="chat-header">
    <div class="chat-header__left">
      <SidebarTrigger />
    </div>

    <div class="chat-header__right">
      <span class={`status-pill status-pill--${status}`}>{status}</span>
      <Button aria-label="New chat" variant="ghost" size="icon" class="text-zinc-500 hover:text-white rounded-md hover:bg-[#3c3c40]">
        <Compose class="size-5" />
      </Button>
    </div>
  </header>

  <ChatContainerRoot class="chat-scroll-region relative z-10 min-h-0 flex-1 flex-col overflow-y-auto">
    <ChatContainerContent class="chat-thread gap-4 max-w-3xl mx-auto w-full p-4">
      {#if messages.length === 0 && !isLoading && !streamingMessage}
        <div class="empty-state flex flex-col items-center justify-center gap-4 text-center">
          <div class="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800/50">
            <MessageCircle class="size-6 text-zinc-500 dark:text-zinc-400" />
          </div>
          <div class="flex flex-col gap-1">
            <h3 class="text-lg font-medium text-zinc-900 dark:text-zinc-200">How can I help you today?</h3>
            <p class="text-sm text-zinc-500 dark:text-zinc-400">Send a message to start chatting with Skyth.</p>
          </div>
        </div>
      {/if}
      {#each messages as msg (msg.id)}
        <Message class={msg.isOwn ? 'justify-end' : 'justify-start'}>
          <MessageContent class={msg.isOwn ? 'max-w-[min(42rem,100%)] px-4 py-3 rounded-[1.25rem] bg-secondary text-secondary-foreground shadow-[0_16px_32px_rgb(0_0_0/0.18)]' : 'p-0 border-none bg-transparent shadow-none max-w-[min(48rem,100%)]'}>
            <div class="flex flex-col gap-2">
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
              <p class="chat-copy">{msg.content}</p>
            </div>
          </MessageContent>
        </Message>
      {/each}

      {#if streamingMessage}
        <Message class="justify-start">
          <MessageContent class="p-0 border-none bg-transparent shadow-none max-w-[min(48rem,100%)]">
            <div class="flex flex-col gap-2">
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
                <p class="chat-copy">{streamingMessage.content}</p>
              {/if}
            </div>
          </MessageContent>
        </Message>
      {:else if isLoading}
        <Message class="justify-start">
          <MessageContent class="p-0 border-none bg-transparent shadow-none max-w-[min(48rem,100%)]">
            <div class="flex flex-col gap-1">
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

  <footer class="input-area z-50">
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
              aria-label="Send message"
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
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    position: relative;
  }

  .chat-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid hsl(var(--border));
    background: hsl(var(--background) / 0.92);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
  }

  .chat-header__left,
  .chat-header__right {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
  }

  .chat-scroll-region {
    min-height: 0;
  }

  .chat-thread {
    min-height: 100%;
    padding-bottom: 1.5rem;
  }

  .chat-copy {
    margin: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
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
    background: hsl(var(--background) / 0.96);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
  }

  .status-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 6.25rem;
    padding: 0.35rem 0.7rem;
    border-radius: 999px;
    border: 1px solid hsl(var(--border));
    background: rgb(24 24 27 / 0.9);
    color: rgb(212 212 216);
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .status-pill--connected {
    color: rgb(187 247 208);
    border-color: rgb(34 197 94 / 0.35);
    background: rgb(20 83 45 / 0.22);
  }

  .status-pill--connecting {
    color: rgb(253 224 71);
    border-color: rgb(234 179 8 / 0.35);
    background: rgb(113 63 18 / 0.24);
  }

  .status-pill--disconnected {
    color: rgb(244 114 182);
    border-color: rgb(244 114 182 / 0.28);
    background: rgb(80 7 36 / 0.24);
  }

  @media (max-width: 768px) {
    .chat-header {
      padding: 0.875rem 1rem;
    }

    .chat-header :global([data-sidebar-trigger]) {
      display: inline-flex;
    }

    .status-pill {
      display: none;
    }

    .input-area {
      padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
    }
  }

  @media (min-width: 769px) {
    .chat-header :global([data-sidebar-trigger]) {
      display: inline-flex;
    }
  }
</style>
