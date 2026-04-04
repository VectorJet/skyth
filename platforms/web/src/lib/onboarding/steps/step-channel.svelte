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
		<label for="channel_type" class="text-sm font-medium leading-none">Select Channel (QuickStart)</label>
		<select
			id="channel_type"
			class="flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring"
			value={formData.channel_type}
			onchange={(e) => updateData("channel_type", (e.target as HTMLSelectElement).value)}
		>
			<option value="none">None (Skip)</option>
			<option value="discord">Discord</option>
			<option value="telegram">Telegram</option>
			<option value="slack">Slack</option>
			<option value="whatsapp">WhatsApp</option>
		</select>
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