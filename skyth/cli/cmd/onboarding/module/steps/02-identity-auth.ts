import type {
	OnboardingStepManifest,
	StepContext,
	StepResult,
} from "@/cli/cmd/onboarding/module/steps/registry";
import { hasPassword, writePassword } from "@/auth/pass";
import { hasDeviceToken, createDeviceToken } from "@/auth/cmd/token/shared";
import {
	hasSuperuserPasswordRecord,
	verifySuperuserPassword,
	writeSuperuserPasswordRecord,
	validatePasswordStrength,
} from "@/cli/cmd/onboarding/module/../../../../auth/superuser";

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

	const passwordExists = hasPassword(ctx.deps.authDir);
	const tokenExists = hasDeviceToken(ctx.deps.authDir);
	const hasLegacyPassword = hasSuperuserPasswordRecord(ctx.deps.authDir);

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

	if (passwordExists && tokenExists) {
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

		await writePassword(password, ctx.deps.authDir);
		await createDeviceToken(password, ctx.deps.authDir);
		await writeSuperuserPasswordRecord(password.trim(), ctx.deps.authDir);

		note("Password saved and device token created.", "Authentication");
		return { cancelled: false, updates, notices: [], patches: [] };
	}

	if (!tokenExists) {
		const password = await clackSecretValue(
			"Enter superuser password to create device token",
			"",
		);
		if (!password || !password.trim()) {
			cancel("Password is required to create device token.");
			return { cancelled: true, updates: {}, notices: [], patches: [] };
		}

		const isValid = hasLegacyPassword
			? await verifySuperuserPassword(password.trim(), ctx.deps.authDir)
			: passwordExists;

		if (!isValid) {
			cancel("Incorrect password.");
			return { cancelled: true, updates: {}, notices: [], patches: [] };
		}

		await createDeviceToken(password.trim(), ctx.deps.authDir);

		note("Device token created.", "Authentication");
		return { cancelled: false, updates, notices: [], patches: [] };
	}

	return { cancelled: false, updates, notices: [], patches: [] };
}
