const CHANNEL_NAMES = ["whatsapp", "telegram", "discord", "feishu", "mochat", "dingtalk", "slack", "qq", "email"] as const;
type ChannelName = (typeof CHANNEL_NAMES)[number];

export function isKnownChannel(name: string): name is ChannelName {
  return CHANNEL_NAMES.includes(name as ChannelName);
}

export function knownChannelsText(): string {
  return CHANNEL_NAMES.join(", ");
}

export function parseValue(raw: string): any {
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

export function deepSet(obj: Record<string, any>, path: string, value: any): void {
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
