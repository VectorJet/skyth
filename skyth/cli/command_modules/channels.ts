import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getChannelsDirPath } from "../../config/loader";

const CHANNEL_NAMES = ["whatsapp", "telegram", "discord", "feishu", "mochat", "dingtalk", "slack", "qq", "email"] as const;
type ChannelName = (typeof CHANNEL_NAMES)[number];

function parseValue(raw: string): any {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
    (trimmed.startsWith("\"") && trimmed.endsWith("\""))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return raw;
    }
  }
  return raw;
}

function deepSet(obj: Record<string, any>, path: string, value: any): void {
  const parts = path.split(".").map((v) => v.trim()).filter(Boolean);
  if (!parts.length) return;
  let current: Record<string, any> = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i]!;
    const next = current[part];
    if (!next || typeof next !== "object" || Array.isArray(next)) current[part] = {};
    current = current[part];
  }
  current[parts.at(-1)!] = value;
}

export function channelsEditCommand(args: {
  channel: string;
  enable?: boolean;
  disable?: boolean;
  set?: string;
  json?: string;
}, deps?: { channelsDir?: string }): { exitCode: number; output: string } {
  const channel = args.channel.trim().toLowerCase();
  if (!CHANNEL_NAMES.includes(channel as ChannelName)) {
    return { exitCode: 1, output: `Error: unknown channel '${args.channel}'. Available: ${CHANNEL_NAMES.join(", ")}` };
  }
  if (args.enable && args.disable) {
    return { exitCode: 1, output: "Error: --enable and --disable cannot be used together" };
  }

  const channelsDir = deps?.channelsDir ?? getChannelsDirPath();
  mkdirSync(channelsDir, { recursive: true });
  const path = join(channelsDir, `${channel}.json`);

  const current: Record<string, any> = (() => {
    if (!existsSync(path)) return {};
    try {
      const parsed = JSON.parse(readFileSync(path, "utf-8"));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  })();

  let changed = false;
  if (args.enable) {
    current.enabled = true;
    changed = true;
  }
  if (args.disable) {
    current.enabled = false;
    changed = true;
  }

  if (args.json) {
    try {
      const patch = JSON.parse(args.json);
      if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
        return { exitCode: 1, output: "Error: --json must be a JSON object" };
      }
      Object.assign(current, patch);
      changed = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { exitCode: 1, output: `Error: invalid --json payload: ${message}` };
    }
  }

  if (args.set) {
    const idx = args.set.indexOf("=");
    if (idx <= 0) {
      return { exitCode: 1, output: "Error: --set must be in key=value form" };
    }
    const key = args.set.slice(0, idx).trim();
    const rawValue = args.set.slice(idx + 1);
    deepSet(current, key, parseValue(rawValue));
    changed = true;
  }

  if (!changed) {
    return { exitCode: 0, output: `Channel config (${channel}): ${path}\n${JSON.stringify(current, null, 2)}` };
  }

  writeFileSync(path, JSON.stringify(current, null, 2), "utf-8");
  return { exitCode: 0, output: `Updated channel config (${channel}): ${path}` };
}
