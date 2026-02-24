import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getChannelsDirPath } from "../../../config/loader";
import { deepSet, isKnownChannel, knownChannelsText, parseValue } from "./utils";
import type { ChannelsEditArgs, ChannelsEditDeps } from "./types";

export function channelsEditCommand(args: ChannelsEditArgs, deps?: ChannelsEditDeps): { exitCode: number; output: string } {
  const channel = args.channel.trim().toLowerCase();
  if (!isKnownChannel(channel)) {
    return { exitCode: 1, output: `Error: unknown channel '${args.channel}'. Available: ${knownChannelsText()}` };
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
