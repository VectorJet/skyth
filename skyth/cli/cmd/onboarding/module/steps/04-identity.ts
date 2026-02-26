import type { OnboardingStepManifest, StepContext, StepResult } from "./registry";
import { hasSuperuserPasswordRecord } from "../../../../../auth/superuser";

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
      return {
        cancelled: false,
        updates: { superuser_password: superuserPassword },
        notices: [],
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

  const superuserPassword = await clackSecretValue(
    hasSuperuserPassword ? "Superuser password (leave blank to keep current)" : "Create superuser password",
    "",
  );
  if (superuserPassword === undefined) {
    cancel("Onboarding cancelled.");
    return { cancelled: true, updates: {}, notices: [], patches: [] };
  }

  const nickname = await clackTextValue("Nickname", ctx.cfg.nickname || "");
  if (nickname === undefined) {
    cancel("Onboarding cancelled.");
    return { cancelled: true, updates: {}, notices: [], patches: [] };
  }

  const updates: Record<string, any> = {};
  if (username.trim()) updates.username = username.trim();
  if (superuserPassword.trim()) updates.superuser_password = superuserPassword.trim();
  if (nickname.trim()) updates.nickname = nickname.trim();

  return { cancelled: false, updates, notices: [], patches: [] };
}
