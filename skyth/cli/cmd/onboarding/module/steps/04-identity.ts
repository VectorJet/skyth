import type { OnboardingStepManifest, StepContext, StepResult } from "@/cli/cmd/onboarding/module/steps/registry";
import { hasSuperuserPasswordRecord, verifySuperuserPassword, writeSuperuserPasswordRecord } from "@/cli/cmd/onboarding/module/../../../../auth/superuser";

export const STEP_MANIFEST: OnboardingStepManifest = {
  id: "identity",
  name: "Identity Setup",
  description: "Configure username, nickname, and superuser password",
  order: 40,
  requiresAuth: true,
  group: "identity",
};

function normalizeYesNo(raw: string, fallback: boolean): boolean {
  const v = raw.trim().toLowerCase();
  if (!v) return fallback;
  return ["y", "yes", "true", "1"].includes(v);
}

export async function runIdentityStep(ctx: StepContext): Promise<StepResult> {
  const {
    clackTextValue,
    clackSecretValue,
    clackCancel: cancel,
  } = await import("../clack_helpers");

  const hasSuperuserPassword = hasSuperuserPasswordRecord(ctx.deps.authDir);
  const shouldConfigure = ctx.configMode === "update" || !ctx.cfg.username;

  if (!shouldConfigure) {
    if (!hasSuperuserPassword) {
      const superuserPassword = await clackSecretValue(
        "Create superuser password (required)",
        "",
      );
      if (!superuserPassword) {
        cancel("Superuser password is required.");
        return { cancelled: true, updates: {}, notices: [], patches: [] };
      }
      await writeSuperuserPasswordRecord(superuserPassword.trim(), ctx.deps.authDir);
      return {
        cancelled: false,
        updates: { _superuserPasswordSet: true },
        notices: ["Superuser password set."],
        patches: [],
      };
    }
    return { cancelled: false, updates: {}, notices: [], patches: [] };
  }

  const username = await clackTextValue("Username", ctx.cfg.username || "");
  if (username === undefined) {
    cancel("Onboarding cancelled.");
    return { cancelled: true, updates: {}, notices: [], patches: [] };
  }

  let superuserPasswordChange = false;
  if (hasSuperuserPassword) {
    const currentPassword = await clackSecretValue(
      "Current superuser password (required to change)",
      "",
    );
    if (currentPassword === undefined) {
      cancel("Onboarding cancelled.");
      return { cancelled: true, updates: {}, notices: [], patches: [] };
    }
    const isValid = await verifySuperuserPassword(currentPassword.trim() || "", ctx.deps.authDir);
    if (!isValid) {
      cancel("Incorrect current password.");
      return { cancelled: true, updates: {}, notices: [], patches: [] };
    }
  }

  const superuserPassword = await clackSecretValue(
    hasSuperuserPassword ? "New superuser password (leave blank to keep current)" : "Create superuser password",
    "",
  );
  if (superuserPassword === undefined) {
    cancel("Onboarding cancelled.");
    return { cancelled: true, updates: {}, notices: [], patches: [] };
  }

  if (superuserPassword.trim()) {
    await writeSuperuserPasswordRecord(superuserPassword.trim(), ctx.deps.authDir);
    superuserPasswordChange = true;
  }

  const nickname = await clackTextValue("Nickname", ctx.cfg.nickname || "");
  if (nickname === undefined) {
    cancel("Onboarding cancelled.");
    return { cancelled: true, updates: {}, notices: [], patches: [] };
  }

  const updates: Record<string, any> = {};
  if (username.trim()) updates.username = username.trim();
  if (nickname.trim()) updates.nickname = nickname.trim();

  const notices: string[] = [];
  if (superuserPasswordChange) {
    notices.push("Superuser password updated.");
  }

  return { cancelled: false, updates, notices, patches: [] };
}
