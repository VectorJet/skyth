<script lang="ts">
import { goto } from "$app/navigation";
import ChevronLeft from "@lucide/svelte/icons/chevron-left";
import ChevronRight from "@lucide/svelte/icons/chevron-right";
import * as Card from "$lib/components/ui/card/index.js";
import { Button } from "$lib/components/ui/button/index.js";
import {
	createInitialFormData,
	type FormData,
	type Metadata,
} from "$lib/onboarding/types";
import {
	StepSecurityOnly,
	StepIdentity,
	StepModel,
	StepChannel,
	StepWebsearch,
	StepFeatures,
} from "$lib/onboarding/steps";

let step = $state(1);
let loading = $state(true);
let submitting = $state(false);
let error = $state<string | null>(null);
let errorKey = $state(0);

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
			errorKey = Date.now();
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
	errorKey = Date.now();
	if (step === 1) {
		if (!formData.security_acknowledged) {
			error = "You must acknowledge the security warning to proceed.";
			errorKey = Date.now();
			return;
		}
	}
	if (step === 2) {
		if (!formData.username.trim()) {
			error = "Username is required.";
			errorKey = Date.now();
			return;
		}
		if (!metadata.hasSuperuser) {
			const pwErrors = validatePasswordStrength(formData.superuser_password);
			if (pwErrors.length > 0) {
				error = pwErrors[0];
				errorKey = Date.now();
				return;
			}
		}
	}
	if (step === 3) {
		if (!formData.primary_provider) {
			error = "Provider is required.";
			errorKey = Date.now();
			return;
		}
		const finalModel =
			formData.primary_model === "__manual_model__"
				? formData.manual_model.trim()
				: formData.primary_model;
		if (!finalModel) {
			error = "Model is required.";
			errorKey = Date.now();
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
			errorKey = Date.now();
			return;
		}
	}
	step += 1;
}

function prevStep() {
	error = null;
	errorKey = Date.now();
	step -= 1;
}

async function submitOnboarding() {
	submitting = true;
	error = null;
	errorKey = Date.now();
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
		errorKey = Date.now();
	} finally {
		submitting = false;
	}
}

const modelsForProvider = $derived(
	metadata.modelsByProvider[formData.primary_provider] || [],
);
</script>

<style>
@keyframes slideDown {
	from {
		max-height: 0;
		opacity: 0;
		transform: translateY(-20px);
	}
	to {
		max-height: 60px;
		opacity: 1;
		transform: translateY(0);
	}
}

@keyframes slideUp {
	from {
		max-height: 60px;
		opacity: 1;
		transform: translateY(0);
	}
	to {
		max-height: 0;
		opacity: 0;
		transform: translateY(-20px);
	}
}

@keyframes slideInLeft {
	from {
		opacity: 0;
		transform: translateX(30px);
	}
	to {
		opacity: 1;
		transform: translateX(0);
	}
}

@keyframes slideOutRight {
	from {
		opacity: 1;
		transform: translateX(0);
	}
	to {
		opacity: 0;
		transform: translateX(-30px);
	}
}

.error-enter {
	animation: slideDown 0.25s ease-out forwards;
}

.error-exit {
	animation: slideUp 0.2s ease-in forwards;
}

.step-content {
	animation: slideInLeft 0.25s ease-out;
}

@keyframes slideInLeft {
	from {
		opacity: 0;
		transform: translateX(20px);
	}
	to {
		opacity: 1;
		transform: translateX(0);
	}
}
</style>

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
					Step {step} of 6: 
					{#if step === 1}Security Warning
					{:else if step === 2}Identity Setup
					{:else if step === 3}AI Model Selection
					{:else if step === 4}External Channels Configuration
					{:else if step === 5}Web Search Capabilities
					{:else if step === 6}Advanced Core Features{/if}
				</Card.Description>
			</Card.Header>

			<Card.Content class="space-y-6">
				{#if error}
					{#key errorKey}
						<div class="error-enter">
							<div class="p-3 text-sm text-red-500 bg-red-100 rounded-full dark:bg-red-900/30 dark:text-red-400">
								{error}
							</div>
						</div>
					{/key}
				{/if}

				{#key step}
					<div class="step-content">
						{#if step === 1}
							<StepSecurityOnly {formData} {updateData} />
						{:else if step === 2}
							<StepIdentity {formData} {metadata} {updateData} />
						{:else if step === 3}
							<StepModel {formData} {metadata} {handleProviderChange} {modelsForProvider} {updateData} />
						{:else if step === 4}
							<StepChannel {formData} {updateData} />
						{:else if step === 5}
							<StepWebsearch {formData} {updateData} />
						{:else if step === 6}
							<StepFeatures {formData} {updateData} />
						{/if}
					</div>
				{/key}
			</Card.Content>

			<Card.Footer class="flex justify-between">
				<Button variant="outline" size="icon" class="rounded-full" onclick={prevStep} disabled={step === 1 || submitting}>
					<ChevronLeft class="h-4 w-4" />
				</Button>
				{#if step < 6}
					<Button size="icon" class="rounded-full" onclick={nextStep} disabled={submitting}>
						<ChevronRight class="h-4 w-4" />
					</Button>
				{:else}
					<Button class="rounded-full" onclick={submitOnboarding} disabled={submitting}>{submitting ? "Initializing..." : "Complete Setup"}</Button>
				{/if}
			</Card.Footer>
		</Card.Root>
	</div>
{/if}