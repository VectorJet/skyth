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
	<div>
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
</div>
