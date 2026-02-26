import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface DeliveryTarget {
  channel: string;
  chatId: string;
}

const NON_CHANNEL_TARGETS = new Set(["cli", "cron", "heartbeat"]);

function normalizeChannel(channel: string): string {
  return channel.trim().toLowerCase();
}

export function isChannelDeliveryTarget(channel: string): boolean {
  const normalized = normalizeChannel(channel);
  if (!normalized) return false;
  return !NON_CHANNEL_TARGETS.has(normalized);
}

export function resolveDeliveryTarget(params: {
  channel?: string;
  chatId?: string;
  fallback?: DeliveryTarget;
}): DeliveryTarget | undefined {
  const explicitChannel = String(params.channel ?? "").trim();
  const explicitChatId = String(params.chatId ?? "").trim();
  const fallback = params.fallback;

  if (explicitChannel && explicitChatId) {
    return { channel: explicitChannel, chatId: explicitChatId };
  }

  if (explicitChannel && fallback && normalizeChannel(fallback.channel) === normalizeChannel(explicitChannel)) {
    return { channel: explicitChannel, chatId: fallback.chatId };
  }

  if (explicitChatId && fallback) {
    return { channel: fallback.channel, chatId: explicitChatId };
  }

  if (!explicitChannel && !explicitChatId && fallback) {
    return { channel: fallback.channel, chatId: fallback.chatId };
  }

  return undefined;
}

export function loadLastActiveChannelTarget(workspacePath: string): DeliveryTarget | undefined {
  const all = loadAllActiveChannelTargets(workspacePath);
  let latest: DeliveryTarget | undefined;
  let latestTs = -1;
  for (const [, entry] of all) {
    if (entry.ts > latestTs) {
      latestTs = entry.ts;
      latest = { channel: entry.channel, chatId: entry.chatId };
    }
  }
  return latest;
}

export function loadAllActiveChannelTargets(workspacePath: string): Map<string, DeliveryTarget & { ts: number }> {
  const sessionsDir = join(workspacePath, "sessions");
  const targets = new Map<string, DeliveryTarget & { ts: number }>();
  if (!existsSync(sessionsDir)) return targets;

  for (const file of readdirSync(sessionsDir)) {
    if (!file.endsWith(".jsonl")) continue;
    const path = join(sessionsDir, file);
    let firstLine = "";
    try {
      firstLine = readFileSync(path, "utf-8").split(/\r?\n/, 1)[0] ?? "";
    } catch {
      continue;
    }
    if (!firstLine.trim()) continue;

    let parsed: Record<string, any>;
    try {
      parsed = JSON.parse(firstLine);
    } catch {
      continue;
    }

    if (parsed._type !== "metadata") continue;
    const metadata = (parsed.metadata ?? {}) as Record<string, any>;
    const channel = String(metadata.last_channel ?? "").trim();
    const chatId = String(metadata.last_chat_id ?? "").trim();
    if (!channel || !chatId) continue;
    if (!isChannelDeliveryTarget(channel)) continue;

    const updatedAt = Date.parse(String(parsed.updated_at ?? ""));
    const ts = Number.isFinite(updatedAt) ? updatedAt : 0;
    const existing = targets.get(channel);
    if (!existing || ts > existing.ts) {
      targets.set(channel, { channel, chatId, ts });
    }
  }

  return targets;
}
