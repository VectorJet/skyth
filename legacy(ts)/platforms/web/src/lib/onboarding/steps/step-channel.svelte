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

let channelDialogOpen = $state(false);
let channelSearch = $state("");

const channels = [
	{ value: "none", label: "None (Skip)" },
	{ value: "discord", label: "Discord" },
	{ value: "telegram", label: "Telegram" },
	{ value: "slack", label: "Slack" },
	{ value: "whatsapp", label: "WhatsApp" },
];

function selectChannel(value: string) {
	updateData("channel_type", value);
	channelDialogOpen = false;
	channelSearch = "";
}

function getChannelLabel(value: string): string {
	const c = channels.find((c) => c.value === value);
	return c ? c.label : value;
}

function openChannelDialog() {
	channelSearch = "";
	channelDialogOpen = true;
}

let filteredChannels = $derived(
	channelSearch
		? channels.filter((c) =>
				c.label.toLowerCase().includes(channelSearch.toLowerCase()),
			)
		: channels,
);
</script>

<div class="space-y-4">
	<div class="space-y-2">
		<label class="text-sm font-medium leading-none">Select Channel (QuickStart)</label>
		<button
			type="button"
			class="flex h-9 w-full items-center justify-between whitespace-nowrap rounded-full border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring"
			onclick={openChannelDialog}
		>
			<span>{getChannelLabel(formData.channel_type)}</span>
			<svg class="h-4 w-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
			</svg>
		</button>
	</div>

	{#if formData.channel_type === "discord" || formData.channel_type === "telegram"}
		<div class="space-y-2">
			<label for="channel_token" class="text-sm font-medium leading-none">Bot Token</label>
			<Input
				id="channel_token"
				type="password"
				placeholder="Bot token"
				value={formData.channel_token}
				oninput={(e) => updateData("channel_token", e.currentTarget.value)}
			/>
		</div>
	{/if}

	{#if formData.channel_type === "slack"}
		<div class="space-y-2">
			<label for="channel_token" class="text-sm font-medium leading-none">Bot Token</label>
			<Input
				id="channel_token"
				type="password"
				placeholder="xoxb-..."
				value={formData.channel_token}
				oninput={(e) => updateData("channel_token", e.currentTarget.value)}
			/>
		</div>
		<div class="space-y-2">
			<label for="channel_app_token" class="text-sm font-medium leading-none">App Token (Socket Mode)</label>
			<Input
				id="channel_app_token"
				type="password"
				placeholder="xapp-..."
				value={formData.channel_app_token}
				oninput={(e) => updateData("channel_app_token", e.currentTarget.value)}
			/>
		</div>
	{/if}

	{#if formData.channel_type === "whatsapp"}
		<div class="space-y-2">
			<label for="channel_bridge_url" class="text-sm font-medium leading-none">WhatsApp Bridge URL</label>
			<Input
				id="channel_bridge_url"
				placeholder="ws://localhost:3001"
				value={formData.channel_bridge_url}
				oninput={(e) => updateData("channel_bridge_url", e.currentTarget.value)}
			/>
		</div>
		<div class="space-y-2">
			<label for="channel_bridge_token" class="text-sm font-medium leading-none">Bridge Token (Optional)</label>
			<Input
				id="channel_bridge_token"
				type="password"
				placeholder="Bridge auth token"
				value={formData.channel_bridge_token}
				oninput={(e) => updateData("channel_bridge_token", e.currentTarget.value)}
			/>
		</div>
	{/if}
</div>

<Dialog.Root bind:open={channelDialogOpen}>
	<Dialog.Content class="max-w-sm">
		<Dialog.Header>
			<Dialog.Title>Select Channel</Dialog.Title>
		</Dialog.Header>
		<div class="relative">
			<Search class="absolute left-2 top-2.5 h-4 w-4 opacity-50" />
			<input
				type="text"
				placeholder="Search channels..."
				class="flex h-9 w-full rounded-full border border-input bg-transparent pl-8 pr-3 py-2 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring"
				bind:value={channelSearch}
			/>
		</div>
		<div class="space-y-1">
			{#each filteredChannels as c}
				<button
					type="button"
					class="w-full text-left px-3 py-2 rounded-full text-sm hover:bg-muted transition-colors {formData.channel_type === c.value ? 'bg-muted font-medium' : ''}"
					onclick={() => selectChannel(c.value)}
				>
					{c.label}
				</button>
			{/each}
		</div>
	</Dialog.Content>
</Dialog.Root>
