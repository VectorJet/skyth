<script lang="ts">
import type { FormData, Metadata } from "$lib/onboarding/types";
import { Input } from "$lib/components/ui/input/index.js";

let {
	formData,
	metadata,
	updateData,
}: {
	formData: FormData;
	metadata: Metadata;
	updateData: (key: string, value: string | boolean) => void;
} = $props();
</script>

<div class="space-y-4">
	<div class="space-y-2">
		<label for="username" class="text-sm font-medium leading-none">Username *</label>
		<Input
			id="username"
			placeholder="e.g. admin"
			value={formData.username}
			oninput={(e) => updateData("username", e.currentTarget.value)}
		/>
	</div>
	<div class="space-y-2">
		<label for="nickname" class="text-sm font-medium leading-none">Nickname (Optional)</label>
		<Input
			id="nickname"
			placeholder="e.g. Boss"
			value={formData.nickname}
			oninput={(e) => updateData("nickname", e.currentTarget.value)}
		/>
	</div>

	{#if !metadata.hasSuperuser}
		<div class="space-y-2">
			<label for="superuser_password" class="text-sm font-medium leading-none">Create Superuser Password *</label>
			<Input
				id="superuser_password"
				type="password"
				placeholder="Secure password"
				value={formData.superuser_password}
				oninput={(e) => updateData("superuser_password", e.currentTarget.value)}
			/>
			<p class="text-xs text-muted-foreground">
				Required: At least 12 chars, 1 uppercase, 1 lowercase, 1 number, and 1 special character.
			</p>
		</div>
	{:else}
		<div class="p-3 text-sm text-green-700 bg-green-100 rounded-full dark:bg-green-900/30 dark:text-green-400">
			Superuser password is already configured on this system.
		</div>
	{/if}
</div>
