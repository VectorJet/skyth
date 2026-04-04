<script lang="ts">
import type { FormData } from "$lib/onboarding/types";
import { Input } from "$lib/components/ui/input/index.js";

let {
	formData,
	updateData,
}: {
	formData: FormData;
	updateData: (key: string, value: string | boolean) => void;
} = $props();
</script>

<div class="space-y-4">
	<div class="space-y-2">
		<label for="websearch_provider" class="text-sm font-medium leading-none">Select Web Search Provider</label>
		<select
			id="websearch_provider"
			class="flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring"
			value={formData.websearch_provider}
			onchange={(e) => updateData("websearch_provider", (e.target as HTMLSelectElement).value)}
		>
			<option value="none">None (Skip)</option>
			<option value="exa">Exa - AI-powered search</option>
			<option value="serper">Serper - Google results</option>
			<option value="serpapi">SerpApi - Google search API</option>
			<option value="brave">Brave Search - Privacy-focused</option>
		</select>
	</div>

	{#if formData.websearch_provider !== "none"}
		<div class="space-y-2">
			<label for="websearch_api_key" class="text-sm font-medium leading-none">API Key</label>
			<Input
				id="websearch_api_key"
				type="password"
				placeholder="API key for {formData.websearch_provider}"
				value={formData.websearch_api_key}
				oninput={(e) => updateData("websearch_api_key", e.currentTarget.value)}
			/>
		</div>
	{/if}
</div>