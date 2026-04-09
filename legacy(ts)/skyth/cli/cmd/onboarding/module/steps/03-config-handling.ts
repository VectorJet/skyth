import type {
	OnboardingStepManifest,
	StepContext,
	StepResult,
} from "@/cli/cmd/onboarding/module/steps/registry";

export const STEP_MANIFEST: OnboardingStepManifest = {
	id: "config-handling",
	name: "Config Handling",
	description: "Select whether to keep existing config or update values",
	order: 30,
	requiresExistingConfig: true,
	group: "identity",
};

export async function runConfigHandlingStep(
	ctx: StepContext,
): Promise<StepResult> {
	const { clackSelectValue, clackCancel: cancel } = await import(
		"../clack_helpers"
	);

	const configMode = await clackSelectValue<"keep" | "update">(
		"Config handling",
		[
			{ value: "keep", label: "Use existing values" },
			{ value: "update", label: "Update values" },
		],
		"keep",
	);

	if (!configMode) {
		cancel("Onboarding cancelled.");
		return { cancelled: true, updates: {}, notices: [], patches: [] };
	}

	ctx.configMode = configMode;
	return { cancelled: false, updates: {}, notices: [], patches: [] };
}
