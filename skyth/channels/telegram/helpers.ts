const TELEGRAM_PAIRING_CODE_RE = /^[A-Z]{3}\d{3}$/i;

export function isCommand(text: string, command: string): boolean {
  const trimmed = text.trim().toLowerCase();
  return trimmed === `/${command}` || trimmed.startsWith(`/${command}@`) || trimmed.startsWith(`/${command} `);
}

export function isPairingPayload(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  const startMatch = trimmed.match(/^\/start(?:@[a-zA-Z0-9_]+)?(?:\s+(.+))?$/i);
  if (startMatch) {
    const arg = (startMatch[1] ?? "").trim().replace(/[^A-Z0-9]/gi, "");
    return !!arg && TELEGRAM_PAIRING_CODE_RE.test(arg);
  }

  const normalized = trimmed.replace(/[^A-Z0-9]/gi, "");
  return TELEGRAM_PAIRING_CODE_RE.test(normalized);
}

export function extractPairingCode(text: string): string | null {
  if (!text) return null;
  const normalized = text.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  if (TELEGRAM_PAIRING_CODE_RE.test(normalized)) {
    return normalized;
  }
  return null;
}
