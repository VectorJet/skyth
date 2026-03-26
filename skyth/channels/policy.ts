import type { InboundMessage } from "@/bus/events";
import type { Config } from "@/config/schema";
import { isNodeTrusted } from "@/auth/cmd/token/shared";

export type ChannelPolicyType = "open" | "allowlist" | "mention";

export type InboundPolicyDecision = {
  allowed: boolean;
  reason?: string;
};

export type DMPolicyConfig = {
  enabled: boolean;
  policy: ChannelPolicyType;
  allow_from: string[];
};

export type GroupPolicyConfig = {
  policy: ChannelPolicyType;
  require_mention: boolean;
  group_allow_from: string[];
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

function evaluateSlackPolicy(cfg: Config, msg: InboundMessage): InboundPolicyDecision {
  const slackCfg = cfg.channels.slack as Record<string, any>;
  const slackMeta = (msg.metadata?.slack ?? {}) as Record<string, any>;
  const channelType = String(slackMeta.channel_type ?? "").toLowerCase();
  const isDm = channelType === "im";
  const isGroup = channelType === "channel" || channelType === "group";

  if (isDm) {
    if (!slackCfg.dm?.enabled) {
      return { allowed: false, reason: "slack dm disabled" };
    }
    const dmPolicy = slackCfg.dm?.policy ?? "open";
    if (dmPolicy === "allowlist" && !isSenderAllowed(slackCfg.dm?.allow_from, msg.senderId, "slack")) {
      return { allowed: false, reason: "slack dm sender not in allowlist" };
    }
    if (dmPolicy === "mention") {
      const mentioned = (msg.metadata?.slack as any)?.mentioned ?? false;
      if (!mentioned) {
        return { allowed: false, reason: "slack dm requires mention" };
      }
    }
    return { allowed: true };
  }

  if (isGroup) {
    const groupPolicy = slackCfg.group_policy ?? "mention";
    if (groupPolicy === "allowlist") {
      const allowGroups = normalizeList(slackCfg.group_allow_from);
      const chatId = String(msg.chatId ?? "").trim();
      if (allowGroups.length && !allowGroups.includes(chatId)) {
        return { allowed: false, reason: "slack group not in allowlist" };
      }
    }
    if (groupPolicy === "mention" || slackCfg.groups?.[msg.chatId as string]?.require_mention) {
      const mentioned = (msg.metadata?.slack as any)?.mentioned ?? false;
      if (!mentioned) {
        return { allowed: false, reason: "slack message requires mention" };
      }
    }
    return { allowed: true };
  }

  return { allowed: true };
}

function evaluateDiscordPolicy(cfg: Config, msg: InboundMessage): InboundPolicyDecision {
  const discordCfg = cfg.channels.discord as Record<string, any>;
  const isDm = (msg.metadata?.discord as any)?.is_dm ?? false;
  const isGroup = (msg.metadata?.discord as any)?.is_group ?? false;

  if (isDm) {
    if (!discordCfg.dm?.enabled) {
      return { allowed: false, reason: "discord dm disabled" };
    }
    const dmPolicy = discordCfg.dm?.policy ?? "open";
    if (dmPolicy === "allowlist" && !isSenderAllowed(discordCfg.dm?.allow_from, msg.senderId, "discord")) {
      return { allowed: false, reason: "discord dm sender not in allowlist" };
    }
    return { allowed: true };
  }

  if (isGroup) {
    const groupPolicy = discordCfg.group_policy ?? "allowlist";
    if (groupPolicy === "allowlist") {
      const allowGroups = normalizeList(discordCfg.group_allow_from);
      const chatId = String(msg.chatId ?? "").trim();
      if (allowGroups.length && !allowGroups.includes(chatId)) {
        return { allowed: false, reason: "discord channel not in allowlist" };
      }
    }
    if (groupPolicy === "mention") {
      const mentioned = (msg.metadata?.discord as any)?.mentioned ?? false;
      if (!mentioned) {
        return { allowed: false, reason: "discord message requires mention" };
      }
    }
    return { allowed: true };
  }

  return { allowed: true };
}

function evaluateTelegramPolicy(cfg: Config, msg: InboundMessage): InboundPolicyDecision {
  const telegramCfg = cfg.channels.telegram as Record<string, any>;
  const isDm = (msg.metadata?.telegram as any)?.is_private ?? false;
  const isGroup = (msg.metadata?.telegram as any)?.is_group ?? false;

  if (isDm) {
    const dmPolicy = telegramCfg.dm?.policy ?? "open";
    if (dmPolicy === "allowlist" && !isSenderAllowed(telegramCfg.dm?.allow_from, msg.senderId, "telegram")) {
      return { allowed: false, reason: "telegram dm sender not in allowlist" };
    }
    return { allowed: true };
  }

  if (isGroup) {
    const groupPolicy = telegramCfg.group_policy ?? "mention";
    if (groupPolicy === "allowlist") {
      const allowGroups = normalizeList(telegramCfg.group_allow_from);
      const chatId = String(msg.chatId ?? "").trim();
      if (allowGroups.length && !allowGroups.includes(chatId)) {
        return { allowed: false, reason: "telegram group not in allowlist" };
      }
    }
    if (groupPolicy === "mention") {
      const mentioned = (msg.metadata?.telegram as any)?.mentioned ?? false;
      if (!mentioned) {
        return { allowed: false, reason: "telegram message requires mention" };
      }
    }
    return { allowed: true };
  }

  return { allowed: true };
}

function evaluateWhatsAppPolicy(cfg: Config, msg: InboundMessage): InboundPolicyDecision {
  const waCfg = cfg.channels.whatsapp as Record<string, any>;
  const isGroup = (msg.metadata?.whatsapp as any)?.is_group ?? false;

  if (isGroup) {
    const groupPolicy = waCfg.group_policy ?? "mention";
    if (groupPolicy === "allowlist") {
      const allowGroups = normalizeList(waCfg.group_allow_from);
      const chatId = String(msg.chatId ?? "").trim();
      if (allowGroups.length && !allowGroups.includes(chatId)) {
        return { allowed: false, reason: "whatsapp group not in allowlist" };
      }
    }
    if (groupPolicy === "mention") {
      const mentioned = (msg.metadata?.whatsapp as any)?.mentioned ?? false;
      if (!mentioned) {
        return { allowed: false, reason: "whatsapp message requires mention" };
      }
    }
    return { allowed: true };
  }

  return { allowed: true };
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
    return evaluateSlackPolicy(cfg, msg);
  }

  if (channel === "discord") {
    return evaluateDiscordPolicy(cfg, msg);
  }

  if (channel === "telegram") {
    return evaluateTelegramPolicy(cfg, msg);
  }

  if (channel === "whatsapp") {
    return evaluateWhatsAppPolicy(cfg, msg);
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

export function getChannelPolicyStatus(cfg: Config, channel: string): {
  dmPolicy: ChannelPolicyType | null;
  groupPolicy: ChannelPolicyType | null;
} {
  const channelCfg = cfg.channels as unknown as Record<string, Record<string, any>>;
  const cfg2 = channelCfg[channel];
  if (!cfg2) return { dmPolicy: null, groupPolicy: null };

  return {
    dmPolicy: cfg2.dm?.policy ?? null,
    groupPolicy: cfg2.group_policy ?? cfg2.groupPolicy ?? null,
  };
}
