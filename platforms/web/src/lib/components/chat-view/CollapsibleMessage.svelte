<script lang="ts">
import ChevronDown from "$lib/components/icons/chevron-down.svelte";
import type { Snippet } from "svelte";
import { onMount } from "svelte";

let {
	children,
	collapsedHeight = 200,
}: {
	children: Snippet;
	collapsedHeight?: number;
} = $props();

let expanded = $state(false);
let contentEl = $state<HTMLDivElement | null>(null);
let needsCollapse = $state(false);

onMount(() => {
	if (!contentEl) return;

	const check = () => {
		needsCollapse = contentEl!.scrollHeight > collapsedHeight + 40;
	};

	check();

	const observer = new ResizeObserver(check);
	observer.observe(contentEl);
	return () => observer.disconnect();
});
</script>

<div class="collapsible-message" class:collapsed={needsCollapse && !expanded}>
	<div
		bind:this={contentEl}
		class="collapsible-content"
		style={needsCollapse ? (expanded ? `max-height: ${contentEl?.scrollHeight ?? 9999}px` : `max-height: ${collapsedHeight}px`) : ""}
	>
		{@render children()}
	</div>

	{#if needsCollapse && !expanded}
		<div class="collapse-overlay">
			<button
				class="expand-btn"
				onclick={() => (expanded = true)}
				aria-label="Show full message"
			>
				<ChevronDown class="size-4" />
			</button>
		</div>
	{/if}

	{#if needsCollapse && expanded}
		<div class="collapse-anchor">
			<button
				class="expand-btn"
				onclick={() => (expanded = false)}
				aria-label="Collapse message"
			>
				<ChevronDown class="size-4 rotate-180" />
			</button>
		</div>
	{/if}
</div>

<style>
	.collapsible-message {
		position: relative;
	}

	.collapsible-content {
		overflow: hidden;
		transition: max-height 300ms cubic-bezier(0.22, 1, 0.36, 1);
	}

	.collapsed .collapsible-content {
		mask-image: linear-gradient(to bottom, black 40%, transparent 100%);
		-webkit-mask-image: linear-gradient(to bottom, black 40%, transparent 100%);
	}

	.collapse-overlay {
		position: absolute;
		right: 0;
		bottom: 0;
		left: 0;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		padding-bottom: 8px;
		pointer-events: none;
	}

	.expand-btn {
		pointer-events: auto;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: 9999px;
		border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
		background: var(--card, #1e1e1e);
		color: var(--muted-foreground, #a1a1aa);
		cursor: pointer;
		transition: background 150ms ease, color 150ms ease;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
	}

	.expand-btn:hover {
		background: var(--secondary, #2a2a2a);
		color: var(--foreground, #fafafa);
	}

	.collapse-anchor {
		display: flex;
		justify-content: center;
		padding-top: 8px;
	}
</style>
