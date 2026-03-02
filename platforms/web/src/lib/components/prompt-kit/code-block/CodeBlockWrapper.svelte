<script lang="ts">
	import { CodeBlock, CodeBlockCode, CodeBlockGroup } from "../code-block/index.js";
	import { CopyButton } from "../copy-button/index.js";
	import type { Tokens } from "marked";
	import { mode } from "mode-watcher";

	let {
		id,
		token
	}: {
		id: string;
		token: Tokens.Code;
	} = $props();

	const theme = $derived(mode.current === "dark" ? "github-dark" : "github-light");
</script>

<CodeBlock>
	<CodeBlockGroup language={token.lang}>
		<span class="font-mono text-xs lowercase">{token.lang}</span>
		<CopyButton text={token.text} />
	</CodeBlockGroup>
	<CodeBlockCode code={token.text} language={token.lang} {theme} />
</CodeBlock>
