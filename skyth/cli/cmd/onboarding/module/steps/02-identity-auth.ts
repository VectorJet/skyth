import type {
	OnboardingStepManifest,
	StepContext,
	StepResult,
} from "@/cli/cmd/onboarding/module/steps/registry";
import {
	hasQuasarAuthRecord,
	validatePasswordStrength,
} from "@/cli/cmd/onboarding/module/quasar_auth";

export const STEP_MANIFEST: OnboardingStepManifest = {
	id: "identity-auth",
	name: "Identity and Authentication",
	description: "Set username and superuser password",
	order: 25,
	group: "identity",
};

export async function runIdentityAuthStep(
	ctx: StepContext,
): Promise<StepResult> {
	const {
		clackTextValue,
		clackSecretValue,
		clackCancel: cancel,
		clackNote: note,
	} = await import("../clack_helpers");

	const passwordExists = hasQuasarAuthRecord();

	const username = await clackTextValue(
		"Username",
		ctx.cfg.username || "",
		(value) => {
			if (!value || !value.trim()) return "Username is required.";
			return undefined;
		},
	);
	if (username === undefined) {
		cancel("Onboarding cancelled.");
		return { cancelled: true, updates: {}, notices: [], patches: [] };
	}

	const updates: Record<string, any> = { username: username.trim() };

	if (passwordExists) {
		return { cancelled: false, updates, notices: [], patches: [] };
	}

	if (!passwordExists) {
		const password = await clackSecretValue(
			"Create superuser password (required)",
			"",
			(value) => {
				if (!value || !value.trim()) return "Superuser password is required.";
				const validation = validatePasswordStrength(value.trim());
				if (!validation.valid) return validation.errors[0];
				return undefined;
			},
		);
		if (password === undefined) {
			cancel("Superuser password is required.");
			return { cancelled: true, updates: {}, notices: [], patches: [] };
		}

		note(
			"Password will be stored by Quasar during final onboarding.",
			"Authentication",
		);
		return {
			cancelled: false,
			updates: { ...updates, superuser_password: password.trim() },
			notices: [],
			patches: [],
		};
	}

	return { cancelled: false, updates, notices: [], patches: [] };
}
