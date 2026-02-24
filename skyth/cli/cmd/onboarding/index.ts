import { existsSync, mkdirSync } from "node:fs";
import { getWorkspacePath } from "../../../utils/helpers";
import { Config } from "../../../config/schema";
import { getConfigPath, saveConfig } from "../../../config/loader";
import { ensureWorkspaceTemplates } from "./templates";
import type { OnboardingArgs, OnboardingDeps } from "./types";

export function runOnboarding(args: OnboardingArgs, deps?: OnboardingDeps): string {
  const cfg = new Config();
  if (args.username) cfg.username = args.username;
  if (args.nickname) cfg.nickname = args.nickname;
  if (args.primary_provider) cfg.primary_model_provider = args.primary_provider;
  if (args.primary_model) {
    cfg.primary_model = args.primary_model;
    cfg.agents.defaults.model = args.primary_model;
  }

  if (args.api_key && cfg.primary_model_provider && (cfg.providers as any)[cfg.primary_model_provider]) {
    (cfg.providers as any)[cfg.primary_model_provider].api_key = args.api_key;
  }

  cfg.use_secondary_model = Boolean(args.use_secondary);
  cfg.use_router = Boolean(args.use_router);
  cfg.watcher = Boolean(args.watcher);

  saveConfig(cfg, deps?.configPath);

  const workspace = deps?.workspacePath ?? getWorkspacePath();
  const existed = existsSync(workspace);
  mkdirSync(workspace, { recursive: true });
  const created = ensureWorkspaceTemplates(workspace);
  const configPath = deps?.configPath ?? getConfigPath();

  const lines = [
    `Config saved: ${configPath}`,
    ...(existed ? [] : ["Workspace created"]),
    ...created,
    "Onboarding complete.",
    `Configuration saved to: ${configPath}`,
    "",
    "Next steps:",
    "  1. Run: skyth agent -m \"Hello\"",
    "  2. Review: ~/.skyth/config/config.yml and ~/.skyth/auth/api_keys.json",
  ];
  return lines.join("\n");
}

export function initAlias(args: OnboardingArgs, deps?: OnboardingDeps): string {
  return runOnboarding(args, deps);
}

export type { OnboardingArgs, OnboardingDeps };
