<script lang="ts">
import type { FormData } from "$lib/onboarding/types";
import { Input } from "$lib/components/ui/input/index.js";
import * as Dialog from "$lib/components/ui/dialog/index.js";
import Search from "@lucide/svelte/icons/search";

let {
	formData,
	updateData,
}: {
	formData: FormData;
	updateData: (key: string, value: string | boolean) => void;
} = $props();

let providerDialogOpen = $state(false);
let providerSearch = $state("");

const providers = [
	{ value: "none", label: "None (Skip)" },
	{ value: "exa", label: "Exa - AI-powered search" },
	{ value: "serper", label: "Serper - Google results" },
	{ value: "serpapi", label: "SerpApi - Google search API" },
	{ value: "brave", label: "Brave Search - Privacy-focused" },
];

function selectProvider(value: string) {
	updateData("websearch_provider", value);
	providerDialogOpen = false;
	providerSearch = "";
}

function getProviderLabel(value: string): string {
	const p = providers.find((p) => p.value === value);
	return p ? p.label : value;
}

function openProviderDialog() {
	providerSearch = "";
	providerDialogOpen = true;
}

let filteredProviders = $derived(
	providerSearch
		? providers.filter((p) =>
				p.label.toLowerCase().includes(providerSearch.toLowerCase()),
			)
		: providers,
);
</script>

<div class="space-y-4">
	<div class="space-y-2">
		<label class="text-sm font-medium leading-none">Select Web Search Provider</label>
		<button
			type="button"
			class="flex h-9 w-full items-center justify-between whitespace-nowrap rounded-full border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring"
			onclick={openProviderDialog}
		>
			<span>{getProviderLabel(formData.websearch_provider)}</span>
			<svg class="h-4 w-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
			</svg>
		</button>
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

<Dialog.Root bind:open={providerDialogOpen}>
	<Dialog.Content class="max-w-sm">
		<Dialog.Header>
			<Dialog.Title>Select Web Search Provider</Dialog.Title>
		</Dialog.Header>
		<div class="relative">
			<Search class="absolute left-2 top-2.5 h-4 w-4 opacity-50" />
			<input
				type="text"
				placeholder="Search providers..."
				class="flex h-9 w-full rounded-full border border-input bg-transparent pl-8 pr-3 py-2 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring"
				bind:value={providerSearch}
			/>
		</div>
		<div class="space-y-1">
			{#each filteredProviders as p}
				<button
					type="button"
					class="w-full text-left px-3 py-2 rounded-full text-sm hover:bg-muted transition-colors {formData.websearch_provider === p.value ? 'bg-muted font-medium' : ''}"
					onclick={() => selectProvider(p.value)}
				>
					{p.label}
				</button>
			{/each}
		</div>
	</Dialog.Content>
</Dialog.Root>
