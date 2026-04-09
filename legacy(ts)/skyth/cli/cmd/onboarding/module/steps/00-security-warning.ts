import type {
	OnboardingStepManifest,
	StepContext,
	StepResult,
} from "@/cli/cmd/onboarding/module/steps/registry";

export const STEP_MANIFEST: OnboardingStepManifest = {
	id: "security-warning",
	name: "Security Warning",
	description: "Display security warnings and get user acknowledgment",
	order: 1,
	group: "identity",
};

export async function runSecurityWarningStep(
	ctx: StepContext,
): Promise<StepResult> {
	const {
		clackConfirmValue,
		clackCancel: cancel,
		clackNote: note,
	} = await import("../clack_helpers");

	note(
		[
			"Security warning - please read.",
			"",
			"Skyth can read files and run commands when tools are enabled.",
			"Treat this as privileged automation and keep credentials locked down.",
			"",
			"Recommended baseline:",
			"- Use allowlists and mention/pairing controls.",
			"- Keep sandboxing enabled for tool execution.",
			"- Keep secrets outside the agent-reachable workspace.",
			"",
			"Run regularly:",
			"skyth status",
			"Review ~/.skyth/config and ~/.skyth/channels/*.json",
		].join("\n"),
		"Security",
	);

	const acceptedRisk = await clackConfirmValue(
		"I understand this is powerful and inherently risky. Continue?",
		false,
	);

	if (acceptedRisk !== true) {
		cancel("Onboarding cancelled.");
		return { cancelled: true, updates: {}, notices: [], patches: [] };
	}

	return { cancelled: false, updates: {}, notices: [], patches: [] };
}
