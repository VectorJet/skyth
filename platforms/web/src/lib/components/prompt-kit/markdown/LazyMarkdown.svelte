<script lang="ts">
import { cn } from "$lib/utils";
import type { HTMLAttributes } from "svelte/elements";

type Props = {
	content: string;
	id?: string;
	class?: string;
} & Omit<HTMLAttributes<HTMLDivElement>, "content">;

let { content, id, class: className, ...restProps }: Props = $props();

const Component = import("./Markdown.svelte");
</script>

{#await Component}
	<div {id} class={cn(className)} {...restProps}>
		<div class="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0 animate-pulse">
			{content}
		</div>
	</div>
{:then mod}
	<mod.default {content} {id} class={className} {...restProps} />
{/await}
