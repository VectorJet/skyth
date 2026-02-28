import type { InboundMessage } from "@/bus/events";
import type { Config } from "@/config/schema";
import { isNodeTrusted } from "@/auth/cmd/token/shared";

type InboundPolicyDecision = {
  allowed: boolean;
  reason?: string;
};

function normalizeList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = String(value ?? "").trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function splitIdentityParts(value: string): string[] {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return [];
  const parts = [trimmed];
  if (trimmed.includes("|")) {
    for (const part of trimmed.split("|")) {
      const token = part.trim();
      if (token) parts.push(token);
    }
  }
  return [...new Set(parts)];
}

function listIncludesIdentity(allowList: string[], identity: string): boolean {
  if (!allowList.length) return true;
  const identityParts = splitIdentityParts(identity);
  if (!identityParts.length) return false;

  for (const candidate of identityParts) {
    if (allowList.includes(candidate)) return true;
  }
  return false;
}

export function isSenderAllowed(allowFrom: unknown, senderId: string, channel?: string): boolean {
  if (channel && isNodeTrusted(channel, senderId)) return true;
  const allowList = normalizeList(allowFrom);
  return listIncludesIdentity(allowList, senderId);
}

export function evaluateInboundAllowlistPolicy(
  cfg: Config,
  msg: InboundMessage,
): InboundPolicyDecision {
  const channel = String(msg.channel ?? "").trim().toLowerCase();
  if (!channel || channel === "cli" || channel === "cron" || channel === "system") {
    return { allowed: true };
  }

  if (channel === "slack") {
    const slackCfg = cfg.channels.slack as Record<string, any>;
    const slackMeta = (msg.metadata?.slack ?? {}) as Record<string, any>;
    const channelType = String(slackMeta.channel_type ?? "").toLowerCase();
    const isDm = channelType === "im";

    if (isDm) {
      if (!slackCfg.dm?.enabled) {
        return { allowed: false, reason: "slack dm disabled" };
      }
      if (slackCfg.dm?.policy === "allowlist" && !isSenderAllowed(slackCfg.dm?.allow_from, msg.senderId, "slack")) {
        return { allowed: false, reason: "slack dm sender not in allowlist" };
      }
      return { allowed: true };
    }

    if (slackCfg.group_policy === "allowlist") {
      const allowGroups = normalizeList(slackCfg.group_allow_from);
      if (allowGroups.length && !allowGroups.includes(String(msg.chatId ?? "").trim())) {
        return { allowed: false, reason: "slack group chat not in allowlist" };
      }
    }
    return { allowed: true };
  }

  const channels = cfg.channels as unknown as Record<string, Record<string, unknown>>;
  const channelCfg = channels[channel];
  if (!channelCfg || typeof channelCfg !== "object") {
    return { allowed: true };
  }

  if (!isSenderAllowed(channelCfg.allow_from, msg.senderId, channel)) {
    return { allowed: false, reason: "sender not in allowlist" };
  }
  return { allowed: true };
}

