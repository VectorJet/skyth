<script lang="ts">
import {
	setChatContainerContext,
	type ResizeMode,
	type InitialMode,
} from "./chat-container-context.svelte";
import { cn } from "$lib/utils";
import { watch } from "runed";

let {
	children,
	class: className,
	resize = "smooth",
	initial = "instant",
	element = $bindable<HTMLElement | null>(null),
	isAtBottom = $bindable(true),
	...restProps
}: {
	children?: import("svelte").Snippet;
	class?: string;
	resize?: ResizeMode;
	initial?: InitialMode;
	element?: HTMLElement | null;
	isAtBottom?: boolean;
	[key: string]: any;
} = $props();

const context = setChatContainerContext(
	() => resize,
	() => initial,
);

let containerElement = $state<HTMLElement | null>(null);

watch(
	() => containerElement,
	() => {
		if (containerElement) {
			context.setElement(containerElement);
			element = containerElement;
		}
	},
);

watch(
	() => context.isAtBottom,
	() => {
		isAtBottom = context.isAtBottom;
	},
);
</script>

<div
	bind:this={containerElement}
	class={cn("flex overflow-y-auto", className)}
	role="log"
	{...restProps}
>
	{@render children?.()}
</div>
