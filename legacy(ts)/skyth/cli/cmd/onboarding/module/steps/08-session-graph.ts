import type {
	OnboardingStepManifest,
	StepContext,
	StepResult,
} from "@/cli/cmd/onboarding/module/steps/registry";

export const STEP_MANIFEST: OnboardingStepManifest = {
	id: "session-graph",
	name: "Session Graph",
	description: "Configure cross-channel context merging",
	order: 80,
	group: "skills",
	optional: true,
};

export async function runSessionGraphStep(
	ctx: StepContext,
): Promise<StepResult> {
	const {
		clackConfirmValue,
		clackCancel: cancel,
		clackNote: note,
	} = await import("../clack_helpers");

	note(
		[
			"When you switch between channels (e.g., Discord to Telegram),",
			"Skyth can automatically carry over conversation context.",
			"A lightweight check determines if the topics match before merging.",
		].join("\n"),
		"Cross-channel context merging",
	);

	const disableAutoMerge = await clackConfirmValue(
		"Disable automatic context merging on channel switch? (not recommended)",
		false,
	);

	if (disableAutoMerge === undefined) {
		cancel("Onboarding cancelled.");
		return { cancelled: true, updates: {}, notices: [], patches: [] };
	}

	if (disableAutoMerge) {
		return {
			cancelled: false,
			updates: { disable_auto_merge: true },
			notices: ["Auto-merge disabled."],
			patches: [],
		};
	}

	return { cancelled: false, updates: {}, notices: [], patches: [] };
}
