<script lang="ts">
import type { Snippet } from "svelte";

interface Props {
	children?: Snippet;
	content?: string;
	class?: string;
	contentClassName?: string;
	markdown?: boolean;
	[key: string]: any;
}

let { ...props }: Props = $props();

const Component = import("./reasoning-content.svelte");
</script>

{#await Component}
	{#if props.content}
		<div class={props.class}>
			<div class="text-muted-foreground prose prose-sm dark:prose-invert animate-pulse">
				{props.content}
			</div>
		</div>
	{/if}
{:then mod}
	<mod.default {...props} />
{/await}
