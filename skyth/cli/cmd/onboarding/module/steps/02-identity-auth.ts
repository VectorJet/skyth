import type { OnboardingStepManifest, StepContext, StepResult } from "@/cli/cmd/onboarding/module/steps/registry";
import { hasPassword, writePassword } from "@/auth/pass";
import { hasDeviceToken, createDeviceToken } from "@/auth/cmd/token/shared";

export const STEP_MANIFEST: OnboardingStepManifest = {
  id: "identity-auth",
  name: "Identity and Authentication",
  description: "Set username and superuser password",
  order: 25,
  group: "identity",
};

export async function runIdentityAuthStep(ctx: StepContext): Promise<StepResult> {
  const {
    clackTextValue,
    clackSecretValue,
    clackCancel: cancel,
    clackNote: note,
  } = await import("../clack_helpers");

  const passwordExists = hasPassword(ctx.deps.authDir);
  const tokenExists = hasDeviceToken(ctx.deps.authDir);

  const username = await clackTextValue("Username", ctx.cfg.username || "");
  if (username === undefined) {
    cancel("Onboarding cancelled.");
    return { cancelled: true, updates: {}, notices: [], patches: [] };
  }

  if (!username.trim()) {
    cancel("Username is required.");
    return { cancelled: true, updates: {}, notices: [], patches: [] };
  }

  const updates: Record<string, any> = { username: username.trim() };

  if (passwordExists && tokenExists) {
    return { cancelled: false, updates, notices: [], patches: [] };
  }

  if (!passwordExists) {
    const password = await clackSecretValue("Create superuser password (required)", "");
    if (!password || !password.trim()) {
      cancel("Superuser password is required.");
      return { cancelled: true, updates: {}, notices: [], patches: [] };
    }

    await writePassword(password, ctx.deps.authDir);
    await createDeviceToken(password, ctx.deps.authDir);

    updates.superuser_password = password.trim();
    note("Password saved and device token created.", "Authentication");
    return { cancelled: false, updates, notices: [], patches: [] };
  }

  if (!tokenExists) {
    const password = await clackSecretValue("Enter superuser password to create device token", "");
    if (!password || !password.trim()) {
      cancel("Password is required to create device token.");
      return { cancelled: true, updates: {}, notices: [], patches: [] };
    }

    await createDeviceToken(password, ctx.deps.authDir);

    updates.superuser_password = password.trim();
    note("Device token created.", "Authentication");
    return { cancelled: false, updates, notices: [], patches: [] };
  }

  return { cancelled: false, updates, notices: [], patches: [] };
}
