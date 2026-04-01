<script lang="ts">
import { cn } from "$lib/utils";
import type { Snippet } from "svelte";
import type { HTMLAttributes } from "svelte/elements";
import Markdown from "$lib/components/prompt-kit/markdown/LazyMarkdown.svelte";

let {
	markdown = false,
	class: className,
	content,
	children,
	...restProps
}: {
	content?: string;
	markdown?: boolean;
	class?: string;
	children?: Snippet;
} & HTMLAttributes<HTMLDivElement> = $props();

let classNames = $derived(
	cn(
		"text-foreground prose dark:prose-invert prose-headings:font-semibold prose-headings:my-1 prose-p:my-0 prose-pre:my-0 prose-table:my-0 prose-img:my-1 prose-ul:-my-0 prose-ol:-my-0 prose-li:-my-0 prose-blockquote:my-0 prose-blockquote:border-s-2 prose-blockquote:border-s-slate-200 prose-blockquote:ps-4 prose-blockquote:not-italic prose-blockquote:font-normal dark:prose-blockquote:border-s-slate-800 break-words whitespace-pre-line",
		className,
	),
);
</script>

{#if markdown && content}
	<!-- Markdown rendering can be added here when needed -->
	<!-- For now, we'll render as plain div -->
	<!-- <div class={classNames} {...restProps}>
		{@render children()}
	</div> -->
	<Markdown class={classNames} {content}></Markdown>
{:else}
	<div class={classNames} {...restProps}>
		{@render children?.()}
	</div>
{/if}
