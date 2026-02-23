import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { getDataDir, getProviderTokensPath, loadConfig } from "../config/loader";
import { AISDKProvider } from "../providers/ai_sdk_provider";
import { parseModelRef } from "../providers/registry";

export type ArgMap = Record<string, string | boolean>;

export function parseArgs(argv: string[]): { positionals: string[]; flags: ArgMap } {
  const positionals: string[] = [];
  const flags: ArgMap = {};

  let i = 0;
  while (i < argv.length) {
    const token = argv[i]!;
    if (token.startsWith("--")) {
      const key = token.slice(2);
      if (key.startsWith("no-")) {
        flags[key.slice(3).replaceAll("-", "_")] = false;
        i += 1;
        continue;
      }
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) {
        flags[key.replaceAll("-", "_")] = next;
        i += 2;
        continue;
      }
      flags[key.replaceAll("-", "_")] = true;
      i += 1;
      continue;
    }
    if (token.startsWith("-") && token.length > 1) {
      const key = token.slice(1);
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) {
        flags[key] = next;
        i += 2;
        continue;
      }
      flags[key] = true;
      i += 1;
      continue;
    }
    positionals.push(token);
    i += 1;
  }

  return { positionals, flags };
}

export function usage(): string {
  return [
    "Usage: skyth [OPTIONS] COMMAND [ARGS]...",
    "",
    "skyth - Personal AI Assistant",
    "",
    "Options:",
    "  --version, -v",
    "  --install-completion",
    "  --show-completion",
    "  --help",
    "",
    "Commands:",
    "  init       Alias for `skyth run onboarding`.",
    "  gateway    Start the skyth gateway.",
    "  agent      Interact with the agent directly.",
    "  status     Show skyth status.",
    "  run        Run workflows",
    "  channels   Manage channels",
    "  cron       Manage scheduled tasks",
    "  provider   Manage providers",
    "",
    "Run onboarding:",
    "  skyth run onboarding [options]",
    "  skyth init [options]",
    "",
    "Cron add:",
    "  skyth cron add --name NAME --message MSG --cron EXPR [--tz ZONE]",
  ].join("\n");
}

export function boolFlag(flags: ArgMap, key: string, fallback = false): boolean {
  const val = flags[key];
  if (typeof val === "boolean") return val;
  if (typeof val === "string") return ["1", "true", "yes", "on"].includes(val.toLowerCase());
  return fallback;
}

export function strFlag(flags: ArgMap, key: string): string | undefined {
  const val = flags[key];
  return typeof val === "string" ? val : undefined;
}

export function ensureDataDir(): void {
  const dataDir = getDataDir();
  mkdirSync(dataDir, { recursive: true });
}

export async function runCommand(command: string, args: string[], cwd?: string, extraEnv?: Record<string, string>): Promise<number> {
  return await new Promise<number>((resolve) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      env: { ...process.env, ...(extraEnv ?? {}) },
    });
    child.on("error", () => resolve(1));
    child.on("close", (code) => resolve(code ?? 1));
  });
}

export function pythonModuleAvailable(moduleName: string): boolean {
  const python = existsSync(join(process.cwd(), "legacy", ".venv", "bin", "python"))
    ? join(process.cwd(), "legacy", ".venv", "bin", "python")
    : "python3";
  const proc = Bun.spawnSync({
    cmd: [python, "-c", `import ${moduleName}`],
    stdout: "ignore",
    stderr: "ignore",
  });
  return proc.exitCode === 0;
}

export function pythonCommand(): string {
  return existsSync(join(process.cwd(), "legacy", ".venv", "bin", "python"))
    ? join(process.cwd(), "legacy", ".venv", "bin", "python")
    : "python3";
}

export function makeProviderFromConfig(modelOverride?: string): AISDKProvider {
  const cfg = loadConfig();
  const model = modelOverride || cfg.agents.defaults.model;
  const providerName = parseModelRef(model).providerID;
  const p = ((cfg.providers as Record<string, any>)[providerName] as { api_key?: string; api_base?: string } | undefined);
  const token = readProviderTokens()[providerName];
  return new AISDKProvider({
    api_key: p?.api_key || token || undefined,
    api_base: p?.api_base || cfg.getApiBase(model) || undefined,
    default_model: model,
    provider_name: providerName || undefined,
  });
}

export function readProviderTokens(): Record<string, string> {
  const path = getProviderTokensPath();
  if (!existsSync(path)) return {};
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8"));
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return raw as Record<string, string>;
  } catch {
    return {};
  }
}

export function saveProviderToken(providerID: string, token: string): void {
  const path = getProviderTokensPath();
  mkdirSync(dirname(path), { recursive: true });
  const current = readProviderTokens();
  current[providerID] = token;
  writeFileSync(path, JSON.stringify(current, null, 2), "utf-8");
}

export async function promptInput(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const out = await new Promise<string>((resolve) => rl.question(prompt, resolve));
  rl.close();
  return out.trim();
}

export async function chooseProviderInteractive(providerIDs: string[]): Promise<string | undefined> {
  if (!providerIDs.length) return undefined;
  console.log("Add credential");
  console.log("Select provider:");
  providerIDs.slice(0, 80).forEach((id, idx) => {
    console.log(`${String(idx + 1).padStart(2, " ")}. ${id}`);
  });
  const raw = await promptInput("Provider number or id: ");
  if (!raw) return undefined;
  const n = Number(raw);
  if (Number.isInteger(n) && n >= 1 && n <= providerIDs.length) return providerIDs[n - 1];
  if (providerIDs.includes(raw.replaceAll("-", "_"))) return raw.replaceAll("-", "_");
  if (providerIDs.includes(raw)) return raw;
  return undefined;
}
