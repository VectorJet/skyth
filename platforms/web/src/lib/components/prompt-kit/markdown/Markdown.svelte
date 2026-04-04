<script lang="ts">
import { cn } from "$lib/utils";
import { Streamdown, type StreamdownProps } from "svelte-streamdown";
import { mode } from "mode-watcher";
import type { HTMLAttributes } from "svelte/elements";
import DOMPurify from "dompurify";

// Import Shiki themes
import githubLightDefault from "@shikijs/themes/github-light-default";
import githubDarkDefault from "@shikijs/themes/github-dark-default";
import Code from "svelte-streamdown/code";
import Math from "svelte-streamdown/math";
import Mermaid from "svelte-streamdown/mermaid";

type Props = {
	content: string;
	id?: string;
	class?: string;
} & Omit<StreamdownProps, "content" | "class"> &
	Omit<HTMLAttributes<HTMLDivElement>, "content">;

let { content, id, class: className, ...restProps }: Props = $props();
let currentTheme = $derived(
	mode.current === "dark" ? "github-dark-default" : "github-light-default",
);

const safeHtmlTags = ["br", "details", "kbd", "mark", "sub", "summary", "sup"];
const safeHtmlAttributes = ["open"];

function renderSafeHtml(token: { raw?: string; text?: string }) {
	const source = token.raw ?? token.text ?? "";
	return DOMPurify.sanitize(source, {
		ALLOWED_TAGS: safeHtmlTags,
		ALLOWED_ATTR: safeHtmlAttributes,
	});
}
</script>

<div {id} class={cn(className)} {...restProps}>
	<Streamdown
		{content}
		class="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
		shikiTheme={currentTheme}
		baseTheme="shadcn"
		components={{ code: Code, math: Math, mermaid: Mermaid }}
		controls={{ code: true, mermaid: true, table: true }}
		inlineCitationsMode="list"
		parseIncompleteMarkdown={true}
		renderHtml={renderSafeHtml}
		shikiThemes={{
			"github-light-default": githubLightDefault,
			"github-dark-default": githubDarkDefault,
		}}
	/>
</div>
