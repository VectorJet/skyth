<script lang="ts">
import { cn } from "$lib/utils";
import Textarea from "$lib/components/ui/textarea/textarea.svelte";
import { getPromptInputContext } from "./prompt-input-context.svelte.js";
import type { HTMLTextareaAttributes } from "svelte/elements";
import { watch } from "runed";
import { onMount } from "svelte";

let {
	class: className,
	onkeydown,
	disableAutosize = false,
	...restProps
}: HTMLTextareaAttributes & {
	disableAutosize?: boolean;
} = $props();

const context = getPromptInputContext();
let isComposing = false;
let compositionEndedAt = Number.NEGATIVE_INFINITY;
let shouldSubmitOnEnter = true;

function detectMobileInputMode() {
	if (typeof window === "undefined") {
		return false;
	}

	return window.matchMedia("(max-width: 768px), (pointer: coarse)").matches;
}

function isNearCompositionBoundary(event: KeyboardEvent) {
	if (isComposing) {
		return true;
	}

	if (
		typeof navigator !== "undefined" &&
		/^((?!chrome|android).)*safari/i.test(navigator.userAgent) &&
		Math.abs(event.timeStamp - compositionEndedAt) < 500
	) {
		compositionEndedAt = Number.NEGATIVE_INFINITY;
		return true;
	}

	return false;
}

onMount(() => {
	shouldSubmitOnEnter = !detectMobileInputMode();

	const mediaQuery = window.matchMedia("(max-width: 768px), (pointer: coarse)");
	const updateMode = () => {
		shouldSubmitOnEnter = !mediaQuery.matches;
	};

	updateMode();
	mediaQuery.addEventListener("change", updateMode);

	return () => mediaQuery.removeEventListener("change", updateMode);
});

// Auto-resize functionality using watch from runed
watch(
	[() => context.value, () => context.maxHeight, () => disableAutosize],
	() => {
		if (disableAutosize) return;
		if (!context.textareaRef) return;

		if (context.textareaRef.scrollTop === 0) {
			context.textareaRef.style.height = "auto";
		}

		context.textareaRef.style.height =
			typeof context.maxHeight === "number"
				? `${Math.min(context.textareaRef.scrollHeight, context.maxHeight)}px`
				: `min(${context.textareaRef.scrollHeight}px, ${context.maxHeight})`;
	},
);

function handleKeyDown(
	e: KeyboardEvent & { currentTarget: HTMLTextAreaElement },
) {
	if (
		e.key === "Enter" &&
		shouldSubmitOnEnter &&
		!e.shiftKey &&
		!e.ctrlKey &&
		!e.metaKey &&
		!e.altKey &&
		!isNearCompositionBoundary(e)
	) {
		e.preventDefault();
		context.onSubmit?.();
	}
	onkeydown?.(e);
}

function handleInput(e: Event & { currentTarget: HTMLTextAreaElement }) {
	context.setValue(e.currentTarget.value);
}
</script>

<Textarea
	bind:ref={context.textareaRef}
	value={context.value}
	aria-label="Message input"
	oninput={handleInput}
	onkeydown={handleKeyDown}
	oncompositionstart={() => {
		isComposing = true;
	}}
	oncompositionend={(e) => {
		isComposing = false;
		compositionEndedAt = e.timeStamp;
	}}
	class={cn(
		"text-primary min-h-[44px] w-full resize-none border-none !bg-transparent shadow-none outline-none focus-visible:ring-0 focus-visible:ring-offset-0",
		className
	)}
	rows={1}
	disabled={context.disabled}
	{...restProps}
></Textarea>
