<script lang="ts">
import ArrowUp from "$lib/components/icons/arrow-up.svelte";
import {
	PromptInput,
	PromptInputAction,
	PromptInputActions,
	PromptInputTextarea,
} from "$lib/components/prompt-kit/prompt-input";
import { Button } from "$lib/components/ui/button";

let {
	inputMessage = $bindable(""),
	composerRef = $bindable<HTMLElement | null>(null),
	onSubmit,
}: {
	inputMessage: string;
	composerRef?: HTMLElement | null;
	onSubmit: () => void;
} = $props();
</script>

<footer bind:this={composerRef} class="input-area">
	<div class="composer-fade" aria-hidden="true"></div>
	<div class="composer-shell mx-auto w-full max-w-3xl">
		<PromptInput
			value={inputMessage}
			onValueChange={(value) => (inputMessage = value)}
			{onSubmit}
			maxHeight={320}
			class="w-full border-border bg-card text-card-foreground shadow-2xl transition-colors focus-within:border-accent"
		>
			<PromptInputTextarea
				class="min-h-[24px] max-h-[150px] border-none !bg-transparent px-2.5 pt-1 text-base leading-tight text-foreground shadow-none outline-none focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground"
				placeholder="Ask Skyth or type @ to use an app..."
			/>
			<PromptInputActions class="w-full items-center justify-end gap-1 px-1.5 pt-2">
				<PromptInputAction>
					{#snippet tooltip()}
						Send message
					{/snippet}
					<Button
						aria-label="Send message"
						variant="secondary"
						size="icon"
						class="ml-auto h-10 w-10 rounded-full bg-secondary text-foreground hover:bg-secondary/90"
						onclick={onSubmit}
						disabled={!inputMessage.trim()}
					>
						<ArrowUp class="size-5" />
					</Button>
				</PromptInputAction>
			</PromptInputActions>
		</PromptInput>
	</div>
</footer>

<style>
	.input-area {
		position: absolute;
		right: 0;
		bottom: 0;
		left: 0;
		z-index: 50;
		padding: 16px 0;
		pointer-events: none;
		background: transparent;
		border-top: 0;
	}

	.composer-fade {
		position: absolute;
		inset: 0;
		pointer-events: none;
		background: linear-gradient(to top, rgba(10, 10, 10, 0.85) 0%, rgba(10, 10, 10, 0.5) 40%, transparent 55%);
	}

	.composer-shell {
		position: relative;
		pointer-events: auto;
		padding: 0 24px;
	}
</style>
