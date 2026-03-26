import { createHash } from "node:crypto";

export interface ToolSnapshot {
  name: string;
  hash: string;
  version?: string;
  enabled: boolean;
}

export interface ToolMutationResult {
  detected: boolean;
  added: string[];
  removed: string[];
  changed: string[];
}

function computeToolHash(tool: { name: string; version?: string }): string {
  const payload = `${tool.name}:${tool.version ?? "unknown"}`;
  return createHash("sha256").update(payload).digest("hex").slice(0, 8);
}

export function snapshotTools(tools: Array<{ name: string; version?: string; enabled?: boolean }>): ToolSnapshot[] {
  return tools.map((tool) => ({
    name: tool.name,
    hash: computeToolHash(tool),
    version: tool.version,
    enabled: tool.enabled ?? true,
  }));
}

export function compareToolSnapshots(
  before: ToolSnapshot[],
  after: ToolSnapshot[],
): ToolMutationResult {
  const beforeMap = new Map(before.map((t) => [t.name, t]));
  const afterMap = new Map(after.map((t) => [t.name, t]));
  
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  
  for (const [name, tool] of afterMap) {
    if (!beforeMap.has(name)) {
      added.push(name);
    } else if (tool.hash !== beforeMap.get(name)?.hash) {
      changed.push(name);
    }
  }
  
  for (const name of beforeMap.keys()) {
    if (!afterMap.has(name)) {
      removed.push(name);
    }
  }
  
  return {
    detected: added.length > 0 || removed.length > 0 || changed.length > 0,
    added,
    removed,
    changed,
  };
}

export function detectToolMutation(
  originalTools: Array<{ name: string; version?: string }>,
  currentTools: Array<{ name: string; version?: string }>,
): ToolMutationResult {
  const originalSnapshots = snapshotTools(originalTools);
  const currentSnapshots = snapshotTools(currentTools);
  
  return compareToolSnapshots(originalSnapshots, currentSnapshots);
}
