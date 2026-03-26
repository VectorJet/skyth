import type { Config } from "@/config/schema";

export type PermissionDecision = "allow" | "deny" | "prompt";

export interface PermissionEvalResult {
  action: PermissionDecision;
  reason?: string;
}

export interface ToolPermissionPolicy {
  allow?: string[];
  deny?: string[];
}

export interface AgentPermissionConfig {
  tool?: ToolPermissionPolicy;
  fs?: {
    workspaceOnly?: boolean;
  };
}

function normalizeToolName(name: string): string {
  return name.trim().toLowerCase();
}

function expandToolGroups(list: string[]): string[] {
  const TOOL_GROUPS: Record<string, string[]> = {
    read: ["read_file", "list_dir", "codesearch"],
    write: ["write_file", "edit_file", "batch"],
    filesystem: ["read_file", "write_file", "edit_file", "list_dir", "codesearch"],
    system: ["exec", "shell"],
    dangerous: ["exec", "shell"],
    all: [],
  };
  
  const expanded: string[] = [];
  for (const value of list) {
    const group = TOOL_GROUPS[value];
    if (group) {
      expanded.push(...group);
    } else {
      expanded.push(value);
    }
  }
  return Array.from(new Set(expanded));
}

function matchesPattern(toolName: string, pattern: string): boolean {
  const normalized = normalizeToolName(toolName);
  const pat = pattern.trim().toLowerCase();
  
  if (pat === normalized) return true;
  if (pat === "*") return true;
  if (pat.startsWith("*.") && normalized.endsWith(pat.slice(1))) return true;
  if (pat.endsWith(".*") && normalized.startsWith(pat.slice(0, -1))) return true;
  
  return false;
}

function evaluateSinglePolicy(
  toolName: string,
  policy: ToolPermissionPolicy | undefined,
): PermissionEvalResult {
  if (!policy) return { action: "allow" };
  
  const expandedAllow = expandToolGroups(policy.allow ?? []);
  const expandedDeny = expandToolGroups(policy.deny ?? []);
  
  for (const denyPattern of expandedDeny) {
    if (matchesPattern(toolName, denyPattern)) {
      return { action: "deny", reason: `Tool ${toolName} is explicitly denied` };
    }
  }
  
  if (expandedAllow.length > 0) {
    for (const allowPattern of expandedAllow) {
      if (matchesPattern(toolName, allowPattern)) {
        return { action: "allow" };
      }
    }
    return { action: "deny", reason: `Tool ${toolName} not in allowlist` };
  }
  
  return { action: "allow" };
}

export function evaluateToolPermission(
  toolName: string,
  cfg: Config,
  agentId?: string,
  senderIsOwner?: boolean,
): PermissionEvalResult {
  if (senderIsOwner === false) {
    const ownerOnlyTools = new Set([
      "whatsapp_login",
      "cron",
      "gateway",
      "nodes",
      "save_key",
      "create_key",
      "revoke_key",
    ]);
    if (ownerOnlyTools.has(normalizeToolName(toolName))) {
      return { action: "deny", reason: "Tool restricted to owner senders" };
    }
  }
  
  let toolPolicy: ToolPermissionPolicy | undefined;
  
  const globalTools = cfg.tools as Record<string, any>;
  if (globalTools?.policy?.allow || globalTools?.policy?.deny) {
    toolPolicy = globalTools.policy;
  }
  
  const agentsConfig = cfg.agents as Record<string, any>;
  if (agentId && agentsConfig?.defaults?.tool?.allow || agentsConfig?.defaults?.tool?.deny) {
    toolPolicy = agentsConfig.defaults.tool;
  }
  
  return evaluateSinglePolicy(toolName, toolPolicy);
}

export function evaluateFsPermission(
  cfg: Config,
  agentId?: string,
  senderIsOwner?: boolean,
): { workspaceOnly: boolean } {
  let workspaceOnly = false;
  
  const toolsConfig = cfg.tools as Record<string, any>;
  if (toolsConfig?.restrict_to_workspace === true) {
    workspaceOnly = true;
  }
  
  const agentsConfig = cfg.agents as Record<string, any>;
  if (agentId && agentsConfig?.defaults?.fs?.workspaceOnly === true) {
    workspaceOnly = true;
  }
  
  return { workspaceOnly };
}
