<script lang="ts">
import { goto } from "$app/navigation";
import * as Card from "$lib/components/ui/card/index.js";
import { Button } from "$lib/components/ui/button/index.js";
import {
	createInitialFormData,
	type FormData,
	type Metadata,
} from "$lib/onboarding/types";
import {
	StepSecurity,
	StepModel,
	StepChannel,
	StepWebsearch,
	StepFeatures,
} from "$lib/onboarding/steps";

let step = $state(1);
let loading = $state(true);
let submitting = $state(false);
let error = $state<string | null>(null);

let metadata = $state<Metadata>({
	providers: [],
	modelsByProvider: {},
	hasSuperuser: false,
});

let formData = $state<FormData>(createInitialFormData());

$effect(() => {
	fetch("/api/onboarding/metadata")
		.then((res) => res.json())
		.then((data) => {
			if (data.error || !data.providers) {
				throw new Error(data.error || "Invalid metadata received");
			}
			metadata = data;
			const initialProvider = data.providers.find(
				(p: { value: string }) => p.value === "openai",
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
		if (!data.success)
			throw new Error(data.error || "Failed to complete onboarding");
		goto("/");
	} catch (err: unknown) {
		error = err instanceof Error ? err.message : "Unknown error";
	} finally {
		submitting = false;
	}
}

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
					{#if step === 1}Security & Identity Setup
					{:else if step === 2}AI Model Selection
					{:else if step === 3}External Channels Configuration
					{:else if step === 4}Web Search Capabilities
					{:else if step === 5}Advanced Core Features{/if}
				</Card.Description>
			</Card.Header>

			<Card.Content class="space-y-6">
				{#if error}
					<div class="p-3 text-sm text-red-500 bg-red-100 rounded-md dark:bg-red-900/30 dark:text-red-400">{error}</div>
				{/if}

				{#if step === 1}
					<StepSecurity {formData} {metadata} {updateData} />
				{:else if step === 2}
					<StepModel {formData} {metadata} {handleProviderChange} {modelsForProvider} {updateData} />
				{:else if step === 3}
					<StepChannel {formData} {updateData} />
				{:else if step === 4}
					<StepWebsearch {formData} {updateData} />
				{:else if step === 5}
					<StepFeatures {formData} {updateData} />
				{/if}
			</Card.Content>

			<Card.Footer class="flex justify-between">
				<Button variant="outline" onclick={prevStep} disabled={step === 1 || submitting}>Back</Button>
				{#if step < 5}
					<Button onclick={nextStep} disabled={submitting}>Next Step</Button>
				{:else}
					<Button onclick={submitOnboarding} disabled={submitting}>{submitting ? "Initializing..." : "Complete Setup"}</Button>
				{/if}
			</Card.Footer>
		</Card.Root>
	</div>
{/if}