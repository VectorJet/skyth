<script lang="ts">
import { onMount } from "svelte";
import { watch } from "runed";
import MessageCircle from "$lib/components/icons/message-circle.svelte";
import ChevronDown from "$lib/components/icons/chevron-down.svelte";
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
import {
	Tool,
	ToolHeader,
	ToolInput,
	ToolOutput,
	ToolContent,
} from "$lib/components/ai-elements/tool";
import ChatViewComposer from "$lib/components/chat-view/ChatViewComposer.svelte";
import ChatViewHeader from "$lib/components/chat-view/ChatViewHeader.svelte";
import CollapsibleMessage from "$lib/components/chat-view/CollapsibleMessage.svelte";
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
let chatScrollRegion = $state<HTMLElement | null>(null);
let isAtBottom = $state(true);
let viewportHeight = $state("100%");
let composerElement = $state<HTMLElement | null>(null);
let composerOffset = $state("8rem");
let isUserScrolling = $state(false);
let showScrollButton = $state(false);
let scrollTimeout: ReturnType<typeof setTimeout> | null = null;

async function handleSubmit() {
	if (!inputMessage.trim()) return;
	isUserScrolling = false;
	onSendMessage(inputMessage);
	inputMessage = "";
}

function scrollToLatest(behavior: ScrollBehavior = "smooth") {
	if (isUserScrolling) return;
	chatScrollRegion?.scrollTo({
		top: chatScrollRegion.scrollHeight,
		behavior,
	});
}

function handleScrollButtonClick() {
	isUserScrolling = false;
	scrollToLatest("smooth");
}

// Auto-scroll on new messages / streaming content
watch(
	() => [messages.length, streamingMessage?.content],
	() => {
		if (!isUserScrolling) {
			requestAnimationFrame(() => scrollToLatest("smooth"));
		}
	},
);

onMount(() => {
	if (typeof window === "undefined" || !window.visualViewport) {
		return;
	}

	const updateComposerOffset = () => {
		const composerHeight = composerElement?.offsetHeight ?? 0;
		composerOffset = `${composerHeight + 24}px`;
	};

	const updateViewport = () => {
		viewportHeight = `${window.visualViewport?.height ?? window.innerHeight}px`;
		updateComposerOffset();

		if (
			document.activeElement instanceof HTMLTextAreaElement &&
			composerElement?.contains(document.activeElement)
		) {
			requestAnimationFrame(() => {
				composerElement?.scrollIntoView({
					block: "end",
					inline: "nearest",
				});
			});
		}

		if (isAtBottom) {
			requestAnimationFrame(() => scrollToLatest("instant"));
		}
	};

	const handleScroll = () => {
		if (!chatScrollRegion) return;
		const { scrollTop, scrollHeight, clientHeight } = chatScrollRegion;
		const atBottom = scrollHeight - scrollTop - clientHeight < 100;
		showScrollButton = scrollHeight > clientHeight && !atBottom;
		if (!atBottom) {
			isUserScrolling = true;
			if (scrollTimeout) clearTimeout(scrollTimeout);
			scrollTimeout = setTimeout(() => { isUserScrolling = false; }, 1500);
		} else {
			isUserScrolling = false;
		}
	};

	updateViewport();
	const resizeObserver =
		typeof ResizeObserver !== "undefined"
			? new ResizeObserver(() => updateComposerOffset())
			: null;
	if (composerElement && resizeObserver) {
		resizeObserver.observe(composerElement);
	}
	chatScrollRegion?.addEventListener("scroll", handleScroll);
	window.visualViewport.addEventListener("resize", updateViewport);
	window.visualViewport.addEventListener("scroll", updateViewport);

	return () => {
		resizeObserver?.disconnect();
		chatScrollRegion?.removeEventListener("scroll", handleScroll);
		if (scrollTimeout) clearTimeout(scrollTimeout);
		window.visualViewport?.removeEventListener("resize", updateViewport);
		window.visualViewport?.removeEventListener("scroll", updateViewport);
	};
});
</script>

<div
	class="chat-view"
	style={`--chat-viewport-height: ${viewportHeight}; --composer-offset: ${composerOffset};`}
>
  <ChatViewHeader {status} />

  <ChatContainerRoot
    bind:element={chatScrollRegion}
    bind:isAtBottom
    class="chat-scroll-region relative z-10 min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain"
  >
    <ChatContainerContent class="chat-thread gap-4 max-w-3xl mx-auto w-full py-4" style="padding-left: 24px; padding-right: 24px;">
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
          <MessageContent class={msg.isOwn ? 'w-fit max-w-[85%] px-4 py-3 rounded-[1.25rem] bg-secondary text-secondary-foreground shadow-[0_16px_32px_rgb(0_0_0/0.18)]' : 'flex-auto w-0 max-w-full p-0 border-none bg-transparent shadow-none'}>
            {#if msg.isOwn}
              <CollapsibleMessage>
                <Markdown class="chat-copy" content={msg.content} />
              </CollapsibleMessage>
            {:else}
              <div class="flex flex-col gap-2">
                {#if msg.reasoning}
                  <Reasoning>
                    <ReasoningTrigger>Show AI reasoning</ReasoningTrigger>
                    <ReasoningContent
                      markdown
                      content={msg.reasoning}
                      class="ml-2 border-l-2 border-l-slate-200 px-2 pb-0 dark:border-l-slate-700"
                    />
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
                <Markdown class="chat-copy" content={msg.content} />
              </div>
            {/if}
          </MessageContent>
        </Message>
      {/each}

      {#if streamingMessage}
        <Message class="justify-start">
          <MessageContent class="flex-auto w-0 max-w-full p-0 border-none bg-transparent shadow-none">
            <div class="flex flex-col gap-2">
              {#if streamingMessage.reasoning}
                <Reasoning isStreaming={true}>
                  <ReasoningTrigger>Show AI reasoning</ReasoningTrigger>
                  <ReasoningContent
                    markdown
                    content={streamingMessage.reasoning}
                    class="ml-2 border-l-2 border-l-slate-200 px-2 pb-0 dark:border-l-slate-700"
                  />
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
                <Markdown class="chat-copy" content={streamingMessage.content} />
              {/if}
            </div>
          </MessageContent>
        </Message>
      {:else if isLoading}
        <Message class="justify-start">
          <MessageContent class="flex-auto w-0 max-w-full p-0 border-none bg-transparent shadow-none">
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

      <div
        aria-hidden="true"
        class="chat-thread-spacer w-full shrink-0"
        style={`height: calc(var(--composer-offset, 8rem) + env(safe-area-inset-bottom));`}
      ></div>
    </ChatContainerContent>
    <ChatContainerScrollAnchor />
  </ChatContainerRoot>

  {#if showScrollButton}
    <button
      class="scroll-to-bottom"
      onclick={handleScrollButtonClick}
      aria-label="Scroll to bottom"
    >
      <ChevronDown class="size-4" />
    </button>
  {/if}

  <ChatViewComposer
    bind:composerRef={composerElement}
    bind:inputMessage
    onSubmit={handleSubmit}
  />
</div>

<style>
  .chat-view {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    height: var(--chat-viewport-height, 100%);
    min-height: 0;
    overflow: hidden;
    position: relative;
  }

  :global(.chat-scroll-region) {
    min-height: 0;
  }

  :global(.chat-thread) {
    min-height: 100%;
    padding-bottom: 0;
  }

  :global(.chat-copy) {
    margin: 0;
  }

  :global(.chat-copy pre) {
    overflow-x: auto;
  }

  :global(.chat-copy code) {
    overflow-x: auto;
    width: auto;
  }

  .empty-state {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.5;
    font-size: 0.85rem;
  }

  .scroll-to-bottom {
    position: absolute;
    bottom: 140px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 55;
    width: 32px;
    height: 32px;
    border-radius: 9999px;
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    background: var(--card, #1e1e1e);
    color: var(--muted-foreground, #a1a1aa);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 150ms ease, color 150ms ease, transform 150ms ease;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  .scroll-to-bottom:hover {
    background: var(--secondary, #2a2a2a);
    color: var(--foreground, #fafafa);
    transform: translateX(-50%) scale(1.1);
  }

  @media (max-width: 768px) {
    :global(.input-area) {
      padding: 12px 0 calc(12px + env(safe-area-inset-bottom));
    }

    :global(.composer-shell) {
      padding: 0 16px;
    }

    :global(.chat-thread) {
      padding: 8px 12px;
    }

    .scroll-to-bottom {
      bottom: 120px;
    }
  }
</style>
