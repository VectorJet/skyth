import { readFileSync } from "node:fs";
import { manifestFromObject, type ModuleManifest } from "@/core/manifest";
import type { AgentManifestLike } from "@/sdks/agent-sdk/types";

export interface AgentManifest extends ModuleManifest {
  global_tools?: boolean;
  subagents?: string[];
}

export function agentManifestFromObject(data: unknown, source?: string): AgentManifest {
  const base = manifestFromObject(data, source);
  const raw = data as Record<string, unknown>;

  if ("global_tools" in raw && typeof raw.global_tools !== "boolean") {
    throw new Error(`${source ?? "manifest"}:global_tools: must be a boolean`);
  }
  if ("subagents" in raw && (!Array.isArray(raw.subagents) || !raw.subagents.every((x) => typeof x === "string"))) {
    throw new Error(`${source ?? "manifest"}:subagents: must be a list of strings`);
  }

  return {
    ...base,
    global_tools: raw.global_tools as boolean | undefined,
    subagents: raw.subagents as string[] | undefined,
  };
}

export function agentManifestFromPath(path: string): AgentManifest {
  const raw = JSON.parse(readFileSync(path, "utf-8"));
  return agentManifestFromObject(raw as AgentManifestLike, path);
}
