export type ToolPolicyLike = {
  allow?: string[];
  deny?: string[];
};

const TOOL_NAME_ALIASES: Record<string, string> = {
  bash: "exec",
};

export const TOOL_GROUPS: Record<string, string[]> = {
  read: ["read_file", "list_dir", "codesearch"],
  write: ["write_file", "edit_file", "batch"],
  filesystem: ["read_file", "write_file", "edit_file", "list_dir", "codesearch"],
  system: ["exec", "shell"],
  dangerous: ["exec", "shell"],
  all: [],
};

export function normalizeToolName(name: string): string {
  const normalized = name.trim().toLowerCase();
  return TOOL_NAME_ALIASES[normalized] ?? normalized;
}

export function normalizeToolList(list?: string[]): string[] {
  if (!list) return [];
  return list.map(normalizeToolName).filter(Boolean);
}

export function expandToolGroups(list?: string[]): string[] {
  const normalized = normalizeToolList(list);
  const expanded: string[] = [];
  for (const value of normalized) {
    const group = TOOL_GROUPS[value];
    if (group) {
      expanded.push(...group);
      continue;
    }
    expanded.push(value);
  }
  return Array.from(new Set(expanded));
}

export function collectExplicitAllowlist(policies: Array<ToolPolicyLike | undefined>): string[] {
  const entries: string[] = [];
  for (const policy of policies) {
    if (!policy?.allow) continue;
    for (const value of policy.allow) {
      if (typeof value !== "string") continue;
      const trimmed = value.trim();
      if (trimmed) entries.push(trimmed);
    }
  }
  return entries;
}

const OWNER_ONLY_TOOL_NAMES = new Set<string>([
  "whatsapp_login",
  "cron",
  "gateway",
  "nodes",
  "save_key",
  "create_key",
  "revoke_key",
]);

export function isOwnerOnlyToolName(name: string): boolean {
  return OWNER_ONLY_TOOL_NAMES.has(normalizeToolName(name));
}
