import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import YAML from "yaml";
import { getConfigPath, getLegacyConfigPath, getRuntimeConfigPath, loadConfig, saveConfig } from "../../../config/loader";
import { writeSuperuserPasswordRecord } from "../../../auth/superuser";
import { Config } from "../../../config/schema";
import { getWorkspacePath } from "../../../utils/helpers";
import { runInteractiveFlow } from "./module/flow";
import type { ChannelPatch, OnboardingArgs, OnboardingDeps } from "./module/types";
import { ensureWorkspaceTemplates } from "./module/workspace";

function hasSeedInputs(args: OnboardingArgs): boolean {
  return Boolean(
    args.username
      || args.nickname
      || args.superuser_password
      || args.primary_provider
      || args.primary_model
      || args.api_key
      || typeof args.use_secondary === "boolean"
      || typeof args.use_router === "boolean"
      || typeof args.watcher === "boolean"
      || typeof args.skip_mcp === "boolean"
      || typeof args.install_daemon === "boolean"
      || typeof args.no_install_daemon === "boolean",
  );
}

function phase1Payload(cfg: Config): Record<string, unknown> {
  return {
    username: cfg.username,
    nickname: cfg.nickname,
    primary_model_provider: cfg.primary_model_provider,
    primary_model: cfg.primary_model,
    use_secondary_model: cfg.use_secondary_model,
    secondary_model_provider: cfg.secondary_model_provider,
    secondary_model: cfg.secondary_model,
    use_router: cfg.use_router,
    router_model_provider: cfg.router_model_provider,
    router_model: cfg.router_model,
    watcher: cfg.watcher,
    mcp_config_path: cfg.mcp_config_path,
  };
}

function loadConfigForRun(deps?: OnboardingDeps): Config {
  const configPath = deps?.configPath;
  if (!configPath) return loadConfig();
  if (!existsSync(configPath)) return new Config();

  try {
    const raw = YAML.parse(readFileSync(configPath, "utf-8")) ?? {};
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return new Config();
    return Config.from(raw as Record<string, unknown>);
  } catch {
    return new Config();
  }
}

function detectExistingConfig(deps?: OnboardingDeps): boolean {
  if (deps?.configPath) return existsSync(deps.configPath);
  return existsSync(getConfigPath()) || existsSync(getRuntimeConfigPath()) || existsSync(getLegacyConfigPath());
}

function saveConfigForRun(cfg: Config, deps?: OnboardingDeps): string {
  const target = deps?.configPath;
  if (!target) {
    saveConfig(cfg);
    return getConfigPath();
  }

  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, YAML.stringify(phase1Payload(cfg)), "utf-8");
  return target;
}

async function resolveUsername(args: OnboardingArgs, deps: OnboardingDeps | undefined, fallback: string): Promise<string> {
  if (args.username?.trim()) return args.username.trim();
  if (deps?.promptUsername) {
    const prompted = (await deps.promptUsername()).trim();
    if (prompted) return prompted;
  }
  return fallback;
}

function applyArgsToConfig(cfg: Config, args: OnboardingArgs): void {
  const normalizeProvider = (value: string): string => value.trim().replaceAll("-", "_");
  const normalizeModelForProvider = (provider: string, model: string): string => {
    const normalizedProvider = normalizeProvider(provider);
    const trimmed = model.trim();
    if (!trimmed) return trimmed;
    const normalizedModel = trimmed.replaceAll("-", "_");
    if (normalizedModel.startsWith(`${normalizedProvider}/`)) return trimmed;
    return `${normalizedProvider}/${trimmed}`;
  };

  if (args.nickname?.trim()) cfg.nickname = args.nickname.trim();
  if (args.primary_provider?.trim()) cfg.primary_model_provider = normalizeProvider(args.primary_provider);
  if (args.primary_model?.trim()) {
    cfg.primary_model = cfg.primary_model_provider
      ? normalizeModelForProvider(cfg.primary_model_provider, args.primary_model)
      : args.primary_model.trim();
    cfg.agents.defaults.model = cfg.primary_model;
  }

  if (args.api_key && cfg.primary_model_provider && (cfg.providers as any)[cfg.primary_model_provider]) {
    (cfg.providers as any)[cfg.primary_model_provider].api_key = args.api_key;
  } else if (args.api_key && cfg.primary_model_provider) {
    (cfg.providers as any)[cfg.primary_model_provider] = { api_key: args.api_key };
  }

  if (typeof args.use_secondary === "boolean") cfg.use_secondary_model = args.use_secondary;
  if (typeof args.use_router === "boolean") cfg.use_router = args.use_router;
  if (typeof args.watcher === "boolean") cfg.watcher = args.watcher;
  if (args.disable_auto_merge) cfg.session_graph.auto_merge_on_switch = false;
  cfg.normalizePhase1();
}

function applyChannelPatches(cfg: Config, patches: ChannelPatch[] | undefined): void {
  if (!patches?.length) return;
  const channels = cfg.channels as Record<string, Record<string, unknown>>;
  for (const patch of patches) {
    const current = channels[patch.channel] && typeof channels[patch.channel] === "object"
      ? channels[patch.channel]
      : {};
    channels[patch.channel] = { ...current, ...patch.values };
  }
}

export async function runOnboarding(args: OnboardingArgs, deps?: OnboardingDeps): Promise<string> {
  const cfg = loadConfigForRun(deps);
  const existingConfigDetected = detectExistingConfig(deps);

  const interactive = !hasSeedInputs(args);
  let installDaemon = Boolean(args.install_daemon);
  let flowNotices: string[] = [];

  if (interactive) {
    const flow = await runInteractiveFlow(cfg, args, { ...(deps ?? {}), existingConfigDetected });
    if (flow.cancelled) return "Onboarding cancelled.";
    installDaemon = flow.installDaemon;
    args = { ...args, ...flow.updates };
    applyChannelPatches(cfg, flow.channelPatches);
    flowNotices = flow.notices ?? [];
  }

  cfg.username = await resolveUsername(args, deps, cfg.username);
  applyArgsToConfig(cfg, args);

  let superuserAuthPath = "";
  if (args.superuser_password?.trim()) {
    const written = await writeSuperuserPasswordRecord(args.superuser_password.trim(), deps?.authDir);
    superuserAuthPath = written.path;
  }

  const configPath = saveConfigForRun(cfg, deps);

  const workspace = deps?.workspacePath ?? cfg.workspace_path ?? getWorkspacePath();
  const existedWorkspace = existsSync(workspace);
  mkdirSync(workspace, { recursive: true });
  const sessions = join(workspace, "agents", "main", "sessions");
  mkdirSync(sessions, { recursive: true });
  const created = ensureWorkspaceTemplates(workspace);

  const lines = [
    `Config saved: ${configPath}`,
    ...(existedWorkspace ? [] : ["Workspace created"]),
    ...created,
    `Updated ${configPath}`,
    `Workspace OK: ${workspace}`,
    `Sessions OK: ${sessions}`,
    "Onboarding complete.",
    `Configuration saved to: ${configPath}`,
  ];

  if (superuserAuthPath) {
    lines.push(`Superuser password record saved: ${superuserAuthPath}`);
  }

  if (args.no_install_daemon) {
    lines.push("Gateway service install skipped.");
  } else if (installDaemon) {
    lines.push("Gateway service install requested. Service installer wiring is not implemented yet.");
  }
  if (flowNotices.length) lines.push(...flowNotices);

  lines.push("");
  lines.push("Next steps:");
  lines.push("  1. Run: skyth agent -m \"Hello\"");
  lines.push("  2. Review: ~/.skyth/config/config.yml and ~/.skyth/channels/*.json");
  return lines.join("\n");
}

export async function initAlias(args: OnboardingArgs, deps?: OnboardingDeps): Promise<string> {
  return await runOnboarding(args, deps);
}

export type { OnboardingArgs, OnboardingDeps };
