<script lang="ts">
import type { FormData, Metadata } from "$lib/onboarding/types";
import { Input } from "$lib/components/ui/input/index.js";
import { Switch } from "$lib/components/ui/switch/index.js";

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

<div class="space-y-6">
	<div class="rounded-full border p-4 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900">
		<h3 class="font-semibold text-amber-800 dark:text-amber-500 mb-2">
			Security Warning
		</h3>
		<ul class="text-sm text-amber-700 dark:text-amber-400 space-y-1 list-disc pl-4 mb-4">
			<li>Skyth can read files and run commands when tools are enabled.</li>
			<li>Treat this as privileged automation and keep credentials locked down.</li>
			<li>Keep sandboxing enabled for tool execution.</li>
			<li>Keep secrets outside the agent-reachable workspace.</li>
		</ul>
		<div class="flex items-center space-x-2">
			<Switch
				id="security_acknowledged"
				checked={formData.security_acknowledged}
				onCheckedChange={(c: boolean) => updateData("security_acknowledged", c)}
			/>
			<label for="security_acknowledged" class="font-medium text-amber-900 dark:text-amber-400">
				I understand this is powerful and inherently risky. Continue? *
			</label>
		</div>
	</div>

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
</div>