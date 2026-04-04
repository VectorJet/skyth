<script lang="ts">
import { goto } from "$app/navigation";
import * as Card from "$lib/components/ui/card/index.js";
import { Button } from "$lib/components/ui/button/index.js";
import { Input } from "$lib/components/ui/input/index.js";
import { Switch } from "$lib/components/ui/switch/index.js";

type Provider = {
	value: string;
	label: string;
	hint?: string;
	isOAuth: boolean;
};
type Model = { value: string; label: string };

let step = $state(1);
let loading = $state(true);
let submitting = $state(false);
let error = $state<string | null>(null);

let metadata = $state<{
	providers: Provider[];
	modelsByProvider: Record<string, Model[]>;
	hasSuperuser: boolean;
}>({
	providers: [],
	modelsByProvider: {},
	hasSuperuser: false,
});

let formData = $state({
	security_acknowledged: false,
	username: "",
	nickname: "",
	superuser_password: "",

	primary_provider: "openai",
	primary_model: "__manual_model__",
	manual_model: "",
	api_key: "",

	channel_type: "none",
	channel_token: "",
	channel_app_token: "",
	channel_bridge_url: "ws://localhost:3001",
	channel_bridge_token: "",

	websearch_provider: "none",
	websearch_api_key: "",

	disable_auto_merge: false,
	use_router: false,
	watcher: false,
	install_daemon: false,
});

$effect(() => {
	fetch("/api/onboarding/metadata")
		.then((res) => res.json())
		.then((data) => {
			if (data.error || !data.providers) {
				throw new Error(data.error || "Invalid metadata received");
			}

			metadata = data;

			const initialProvider = data.providers.find(
				(p: Provider) => p.value === "openai",
			)
				? "openai"
				: data.providers[0]?.value || "";

			const initialModel =
				data.modelsByProvider[initialProvider]?.[0]?.value ||
				"__manual_model__";

			formData = {
				...formData,
				primary_provider: initialProvider,
				primary_model: initialModel,
			};

			loading = false;
		})
		.catch(() => {
			error =
				"Failed to load onboarding metadata. Make sure you restart your dev server if backend code changed.";
			loading = false;
		});
});

function updateData(key: string, value: string | boolean) {
	(formData as Record<string, unknown>)[key] = value;
}

function handleProviderChange(e: Event) {
	const target = e.target as HTMLSelectElement;
	const newProvider = target.value;
	const defaultModel =
		metadata.modelsByProvider[newProvider]?.[0]?.value || "__manual_model__";
	formData = {
		...formData,
		primary_provider: newProvider,
		primary_model: defaultModel,
	};
}

function validatePasswordStrength(password: string): string[] {
	const errors: string[] = [];
	const trimmed = password.trim();

	if (trimmed.length < 12)
		errors.push("Password must be at least 12 characters long.");
	if (!/[A-Z]/.test(trimmed))
		errors.push("Password must contain at least one uppercase letter.");
	if (!/[a-z]/.test(trimmed))
		errors.push("Password must contain at least one lowercase letter.");
	if (!/[0-9]/.test(trimmed))
		errors.push("Password must contain at least one number.");
	if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(trimmed)) {
		errors.push("Password must contain at least one special character.");
	}
	return errors;
}

function nextStep() {
	error = null;

	if (step === 1) {
		if (!formData.security_acknowledged) {
			error = "You must acknowledge the security warning to proceed.";
			return;
		}

		if (!formData.username.trim()) {
			error = "Username is required.";
			return;
		}

		if (!metadata.hasSuperuser) {
			const pwErrors = validatePasswordStrength(formData.superuser_password);
			if (pwErrors.length > 0) {
				error = pwErrors[0];
				return;
			}
		}
	}

	if (step === 2) {
		if (!formData.primary_provider) {
			error = "Provider is required.";
			return;
		}
		const finalModel =
			formData.primary_model === "__manual_model__"
				? formData.manual_model.trim()
				: formData.primary_model;

		if (!finalModel) {
			error = "Model is required.";
			return;
		}

		const selectedProviderMeta = metadata.providers.find(
			(p) => p.value === formData.primary_provider,
		);
		if (
			selectedProviderMeta &&
			!selectedProviderMeta.isOAuth &&
			!formData.api_key.trim()
		) {
			error = "API Key is required for this provider.";
			return;
		}
	}

	step += 1;
}

function prevStep() {
	error = null;
	step -= 1;
}

async function submitOnboarding() {
	submitting = true;
	error = null;

	try {
		const finalModel =
			formData.primary_model === "__manual_model__"
				? formData.manual_model.trim()
				: formData.primary_model;

		const payload: Record<string, unknown> = {
			username: formData.username.trim(),
			nickname: formData.nickname.trim(),
			superuser_password: formData.superuser_password.trim(),
			primary_provider: formData.primary_provider,
			primary_model: finalModel,
			api_key: formData.api_key.trim(),
			use_router: formData.use_router,
			watcher: formData.watcher,
			disable_auto_merge: formData.disable_auto_merge,
			install_daemon: formData.install_daemon,
		};

		if (
			formData.websearch_provider !== "none" &&
			formData.websearch_api_key.trim()
		) {
			payload.websearch_providers = {
				[formData.websearch_provider]: {
					api_key: formData.websearch_api_key.trim(),
				},
			};
		}

		if (formData.channel_type !== "none") {
			let patch: Record<string, unknown> = { enabled: true };
			if (formData.channel_type === "discord") {
				patch.token = formData.channel_token.trim();
			} else if (formData.channel_type === "telegram") {
				patch.token = formData.channel_token.trim();
				patch.allow_from = [];
			} else if (formData.channel_type === "slack") {
				patch.mode = "socket";
				patch.bot_token = formData.channel_token.trim();
				patch.app_token = formData.channel_app_token.trim();
			} else if (formData.channel_type === "whatsapp") {
				patch.bridge_url = formData.channel_bridge_url.trim();
				patch.bridge_token = formData.channel_bridge_token.trim();
			}

			if (patch.token || patch.bot_token || patch.bridge_url) {
				payload.channel_patches = [
					{ channel: formData.channel_type, values: patch },
				];
			}
		}

		const res = await fetch("/api/onboarding", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});
		const data = await res.json();
		if (!data.success) {
			throw new Error(data.error || "Failed to complete onboarding");
		}
		goto("/");
	} catch (err: unknown) {
		error = err instanceof Error ? err.message : "Unknown error";
	} finally {
		submitting = false;
	}
}

const selectedProviderMeta = $derived(
	metadata.providers.find((p) => p.value === formData.primary_provider),
);
const modelsForProvider = $derived(
	metadata.modelsByProvider[formData.primary_provider] || [],
);
</script>

{#if loading}
	<div class="flex min-h-screen items-center justify-center bg-muted/40">
		<p class="text-muted-foreground animate-pulse">Loading Skyth configuration...</p>
	</div>
{:else}
	<div class="flex min-h-screen items-center justify-center p-4 bg-muted/40 py-10">
		<Card.Root class="w-full max-w-2xl">
			<Card.Header>
				<Card.Title>Skyth Initialization</Card.Title>
				<Card.Description>
					Step {step} of 5:
					{#if step === 1}
						Security & Identity Setup
					{:else if step === 2}
						AI Model Selection
					{:else if step === 3}
						External Channels Configuration
					{:else if step === 4}
						Web Search Capabilities
					{:else if step === 5}
						Advanced Core Features
					{/if}
				</Card.Description>
			</Card.Header>

			<Card.Content class="space-y-6">
				{#if error}
					<div
						class="p-3 text-sm text-red-500 bg-red-100 rounded-md dark:bg-red-900/30 dark:text-red-400"
					>
						{error}
					</div>
				{/if}

				{#if step === 1}
					<div class="space-y-6">
						<div
							class="rounded-md border p-4 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900"
						>
							<h3 class="font-semibold text-amber-800 dark:text-amber-500 mb-2">
								Security Warning
							</h3>
							<ul
								class="text-sm text-amber-700 dark:text-amber-400 space-y-1 list-disc pl-4 mb-4"
							>
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
								<label
									for="security_acknowledged"
									class="font-medium text-amber-900 dark:text-amber-400"
								>
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
										oninput={(e) =>
											updateData("superuser_password", e.currentTarget.value)}
									/>
									<p class="text-xs text-muted-foreground">
										Required: At least 12 chars, 1 uppercase, 1 lowercase, 1 number,
										and 1 special character.
									</p>
								</div>
							{:else}
								<div
									class="p-3 text-sm text-green-700 bg-green-100 rounded-md dark:bg-green-900/30 dark:text-green-400"
								>
									Superuser password is already configured on this system.
								</div>
							{/if}
						</div>
					</div>
				{/if}

				{#if step === 2}
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
									<option value={p.value}>
										{p.label} {p.hint ? `(${p.hint})` : ""}
									</option>
								{/each}
							</select>
						</div>

						<div class="space-y-2">
							<label for="primary_model" class="text-sm font-medium leading-none">Default Model *</label>
							<select
								id="primary_model"
								class="flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring"
								value={formData.primary_model}
								onchange={(e) => updateData("primary_model", e.currentTarget.value)}
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
									oninput={(e) => updateData("manual_model", e.currentTarget.value)}
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
									oninput={(e) => updateData("api_key", e.currentTarget.value)}
								/>
							</div>
						{/if}
					</div>
				{/if}

				{#if step === 3}
					<div class="space-y-4">
						<div class="space-y-2">
							<label for="channel_type" class="text-sm font-medium leading-none">Select Channel (QuickStart)</label>
							<select
								id="channel_type"
								class="flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring"
								value={formData.channel_type}
								onchange={(e) => updateData("channel_type", e.currentTarget.value)}
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
									oninput={(e) =>
										updateData("channel_app_token", e.currentTarget.value)}
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
									oninput={(e) =>
										updateData("channel_bridge_url", e.currentTarget.value)}
								/>
							</div>
							<div class="space-y-2">
								<label for="channel_bridge_token" class="text-sm font-medium leading-none">Bridge Token (Optional)</label>
								<Input
									id="channel_bridge_token"
									type="password"
									placeholder="Bridge auth token"
									value={formData.channel_bridge_token}
									oninput={(e) =>
										updateData("channel_bridge_token", e.currentTarget.value)}
								/>
							</div>
						{/if}
					</div>
				{/if}

				{#if step === 4}
					<div class="space-y-4">
						<div class="space-y-2">
							<label for="websearch_provider" class="text-sm font-medium leading-none">Select Web Search Provider</label>
							<select
								id="websearch_provider"
								class="flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring"
								value={formData.websearch_provider}
								onchange={(e) =>
									updateData("websearch_provider", e.currentTarget.value)}
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
									oninput={(e) =>
										updateData("websearch_api_key", e.currentTarget.value)}
								/>
							</div>
						{/if}
					</div>
				{/if}

				{#if step === 5}
					<div class="space-y-6">
						<div class="flex items-center justify-between space-x-2">
							<div class="space-y-1">
								<label for="disable_auto_merge" class="text-sm font-medium leading-none">Disable Cross-Channel Context Merge</label>
								<p class="text-sm text-muted-foreground">
									If checked, Skyth will not merge context when switching channels.
									(Not recommended)
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
				{/if}
			</Card.Content>

			<Card.Footer class="flex justify-between">
				<Button variant="outline" onclick={prevStep} disabled={step === 1 || submitting}>
					Back
				</Button>
				{#if step < 5}
					<Button onclick={nextStep} disabled={submitting}>Next Step</Button>
				{:else}
					<Button onclick={submitOnboarding} disabled={submitting}>
						{submitting ? "Initializing..." : "Complete Setup"}
					</Button>
				{/if}
			</Card.Footer>
		</Card.Root>
	</div>
{/if}