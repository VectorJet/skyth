<script lang="ts">
import type { FormData } from "$lib/onboarding/types";
import { Switch } from "$lib/components/ui/switch/index.js";

let {
	formData,
	updateData,
}: {
	formData: FormData;
	updateData: (key: string, value: string | boolean) => void;
} = $props();
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between space-x-2">
		<div class="space-y-1">
			<label for="disable_auto_merge" class="text-sm font-medium leading-none">Disable Cross-Channel Context Merge</label>
			<p class="text-sm text-muted-foreground">
				If checked, Skyth will not merge context when switching channels. (Not recommended)
			</p>
		</div>
		<Switch
			id="disable_auto_merge"
			checked={formData.disable_auto_merge}
			onCheckedChange={(c: boolean) => updateData("disable_auto_merge", c)}
		/>
	</div>

	<div class="flex items-center justify-between space-x-2">
		<div class="space-y-1">
			<label for="use_router" class="text-sm font-medium leading-none">Smart Router</label>
			<p class="text-sm text-muted-foreground">
				Automatically route simple tasks to faster models to save costs.
			</p>
		</div>
		<Switch
			id="use_router"
			checked={formData.use_router}
			onCheckedChange={(c: boolean) => updateData("use_router", c)}
		/>
	</div>

	<div class="flex items-center justify-between space-x-2">
		<div class="space-y-1">
			<label for="watcher" class="text-sm font-medium leading-none">File Watcher</label>
			<p class="text-sm text-muted-foreground">
				Enable automatic file change detection for active context.
			</p>
		</div>
		<Switch
			id="watcher"
			checked={formData.watcher}
			onCheckedChange={(c: boolean) => updateData("watcher", c)}
		/>
	</div>

	<div class="flex items-center justify-between space-x-2">
		<div class="space-y-1">
			<label for="install_daemon" class="text-sm font-medium leading-none">Install Gateway Daemon</label>
			<p class="text-sm text-muted-foreground">
				Set up Skyth gateway as a background system service.
			</p>
		</div>
		<Switch
			id="install_daemon"
			checked={formData.install_daemon}
			onCheckedChange={(c: boolean) => updateData("install_daemon", c)}
		/>
	</div>
</div>