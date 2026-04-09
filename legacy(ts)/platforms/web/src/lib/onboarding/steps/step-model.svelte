<script lang="ts">
import type { FormData, Metadata } from "$lib/onboarding/types";
import { Input } from "$lib/components/ui/input/index.js";
import * as Dialog from "$lib/components/ui/dialog/index.js";
import Search from "@lucide/svelte/icons/search";

let {
	formData,
	metadata,
	handleProviderChange,
	modelsForProvider,
}: {
	formData: FormData;
	metadata: Metadata;
	handleProviderChange: (e: Event) => void;
	modelsForProvider: { value: string; label: string }[];
	updateData: (key: string, value: string | boolean) => void;
} = $props();

const selectedProviderMeta = metadata.providers.find(
	(p) => p.value === formData.primary_provider,
);

let providerDialogOpen = $state(false);
let modelDialogOpen = $state(false);
let providerSearch = $state("");
let modelSearch = $state("");

function selectProvider(value: string) {
	(formData as Record<string, unknown>).primary_provider = value;
	handleProviderChange({ target: { value } } as unknown as Event);
	providerDialogOpen = false;
	providerSearch = "";
}

function selectModel(value: string) {
	(formData as Record<string, unknown>).primary_model = value;
	modelDialogOpen = false;
	modelSearch = "";
}

function getProviderLabel(value: string): string {
	const p = metadata.providers.find((p) => p.value === value);
	return p ? `${p.label} ${p.hint ? `(${p.hint})` : ""}` : value;
}

function getModelLabel(value: string): string {
	if (value === "__manual_model__") return "Enter model manually...";
	const m = modelsForProvider.find((m) => m.value === value);
	return m ? m.label : value;
}

function openProviderDialog() {
	providerSearch = "";
	providerDialogOpen = true;
}

function openModelDialog() {
	modelSearch = "";
	modelDialogOpen = true;
}

let filteredProviders = $derived(
	providerSearch
		? metadata.providers.filter(
				(p) =>
					p.label.toLowerCase().includes(providerSearch.toLowerCase()) ||
					p.hint?.toLowerCase().includes(providerSearch.toLowerCase()),
			)
		: metadata.providers,
);

let filteredModels = $derived(
	modelSearch
		? modelsForProvider.filter((m) =>
				m.label.toLowerCase().includes(modelSearch.toLowerCase()),
			)
		: modelsForProvider,
);
</script>

<div class="space-y-6">
	<div class="space-y-2">
		<label class="text-sm font-medium leading-none">Select Provider *</label>
		<button
			type="button"
			class="flex h-9 w-full items-center justify-between whitespace-nowrap rounded-full border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring"
			onclick={openProviderDialog}
		>
			<span>{getProviderLabel(formData.primary_provider)}</span>
			<svg class="h-4 w-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
			</svg>
		</button>
	</div>

	<div class="space-y-2">
		<label class="text-sm font-medium leading-none">Default Model *</label>
		<button
			type="button"
			class="flex h-9 w-full items-center justify-between whitespace-nowrap rounded-full border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring"
			onclick={openModelDialog}
		>
			<span>{getModelLabel(formData.primary_model)}</span>
			<svg class="h-4 w-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
			</svg>
		</button>
	</div>

	{#if formData.primary_model === "__manual_model__"}
		<div class="space-y-2">
			<label for="manual_model" class="text-sm font-medium leading-none">Enter Model ID *</label>
			<Input
				id="manual_model"
				placeholder="e.g. claude-3-5-sonnet-20240620"
				value={formData.manual_model}
				oninput={(e) => (formData as Record<string, unknown>).manual_model = e.currentTarget.value}
			/>
		</div>
	{/if}

	{#if selectedProviderMeta && !selectedProviderMeta.isOAuth}
		<div class="space-y-2">
			<label for="api_key" class="text-sm font-medium leading-none">API Key *</label>
			<Input
				id="api_key"
				type="password"
				placeholder="sk-..."
				value={formData.api_key}
				oninput={(e) => (formData as Record<string, unknown>).api_key = e.currentTarget.value}
			/>
		</div>
	{/if}
</div>

<Dialog.Root bind:open={providerDialogOpen}>
	<Dialog.Content class="max-w-sm">
		<Dialog.Header>
			<Dialog.Title>Select Provider</Dialog.Title>
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
		<div class="max-h-[60vh] overflow-y-auto space-y-1">
			{#each filteredProviders as p}
				<button
					type="button"
					class="w-full text-left px-3 py-2 rounded-full text-sm hover:bg-muted transition-colors {formData.primary_provider === p.value ? 'bg-muted font-medium' : ''}"
					onclick={() => selectProvider(p.value)}
				>
					{p.label} {p.hint ? `(${p.hint})` : ""}
				</button>
			{/each}
			{#if filteredProviders.length === 0}
				<p class="text-sm text-muted-foreground text-center py-4">No providers found</p>
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={modelDialogOpen}>
	<Dialog.Content class="max-w-sm">
		<Dialog.Header>
			<Dialog.Title>Select Model</Dialog.Title>
		</Dialog.Header>
		<div class="relative">
			<Search class="absolute left-2 top-2.5 h-4 w-4 opacity-50" />
			<input
				type="text"
				placeholder="Search models..."
				class="flex h-9 w-full rounded-full border border-input bg-transparent pl-8 pr-3 py-2 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring"
				bind:value={modelSearch}
			/>
		</div>
		<div class="max-h-[60vh] overflow-y-auto space-y-1">
			{#each filteredModels as m}
				<button
					type="button"
					class="w-full text-left px-3 py-2 rounded-full text-sm hover:bg-muted transition-colors {formData.primary_model === m.value ? 'bg-muted font-medium' : ''}"
					onclick={() => selectModel(m.value)}
				>
					{m.label}
				</button>
			{/each}
			<button
				type="button"
				class="w-full text-left px-3 py-2 rounded-full text-sm hover:bg-muted transition-colors {formData.primary_model === '__manual_model__' ? 'bg-muted font-medium' : ''}"
				onclick={() => selectModel("__manual_model__")}
			>
				Enter model manually...
			</button>
			{#if filteredModels.length === 0}
				<p class="text-sm text-muted-foreground text-center py-4">No models found</p>
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>
