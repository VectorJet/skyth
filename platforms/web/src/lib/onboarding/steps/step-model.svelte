<script lang="ts">
import type { FormData, Metadata } from "$lib/onboarding/types";
import { Input } from "$lib/components/ui/input/index.js";

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
</script>

<div class="space-y-6">
	<div class="space-y-2">
		<label for="primary_provider" class="text-sm font-medium leading-none">Select Provider *</label>
		<select
			id="primary_provider"
			class="flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring"
			value={formData.primary_provider}
			onchange={handleProviderChange}
		>
			{#each metadata.providers as p}
				<option value={p.value}>{p.label} {p.hint ? `(${p.hint})` : ""}</option>
			{/each}
		</select>
	</div>

	<div class="space-y-2">
		<label for="primary_model" class="text-sm font-medium leading-none">Default Model *</label>
		<select
			id="primary_model"
			class="flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring"
			value={formData.primary_model}
			onchange={(e) => {
				const target = e.target as HTMLSelectElement;
				(formData as Record<string, unknown>).primary_model = target.value;
			}}
		>
			{#each modelsForProvider as m}
				<option value={m.value}>{m.label}</option>
			{/each}
			<option value="__manual_model__">Enter model manually...</option>
		</select>
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