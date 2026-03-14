import { randomInt } from "node:crypto";
import { secureCompare } from "@/auth/cmd/token/shared";

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id?: number;
    text?: string;
    from?: { id?: number | string };
    chat?: { id?: number | string };
  };
}

interface TelegramPairingAPIResult<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

export interface TelegramPairingResult {
  status: "paired" | "timeout" | "error";
  senderId?: string;
  chatId?: string;
  error?: string;
}

export interface WaitForTelegramPairingParams {
  token: string;
  code: string;
  timeoutMs?: number;
  requestTimeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const TELEGRAM_API = "https://api.telegram.org";
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function normalizePairingCode(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function apiCall<T>(
  token: string,
  method: string,
  payload: Record<string, unknown>,
  fetchImpl: typeof fetch,
  requestTimeoutMs: number,
): Promise<T> {
  const response = await fetchImpl(`${TELEGRAM_API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(Math.max(1_000, requestTimeoutMs)),
  });
  const json = await response.json() as TelegramPairingAPIResult<T>;
  if (!response.ok || !json?.ok) {
    const details = json?.description ? `: ${json.description}` : "";
    throw new Error(`Telegram API ${method} failed${details}`);
  }
  return json.result as T;
}

export function generateTelegramPairingCode(): string {
  const letters = Array.from({ length: 3 }, () => LETTERS[randomInt(LETTERS.length)]).join("");
  const digits = String(randomInt(1000)).padStart(3, "0");
  return `${letters}-${digits}`;
}

export function parseTelegramStartCode(text: string): string | undefined {
  const trimmed = text.trim();
  const match = trimmed.match(/^\/start(?:@[a-zA-Z0-9_]+)?(?:\s+(.+))?$/i);
  if (match) {
    const arg = (match[1] ?? "").trim();
    return arg || "";
  }
  // Also accept direct pairing code messages like "ABC-123" or "ABC123".
  if (trimmed.match(/^[a-zA-Z]{3}[- ]?\d{3}$/)) return trimmed;
  return undefined;
}

export async function waitForTelegramPairing(params: WaitForTelegramPairingParams): Promise<TelegramPairingResult> {
  const token = params.token.trim();
  const code = params.code.trim();
  if (!token) return { status: "error", error: "Missing Telegram token." };
  if (!code) return { status: "error", error: "Missing pairing code." };

  const fetchImpl = params.fetchImpl ?? fetch;
  const timeoutMs = params.timeoutMs ?? 120_000;
  const requestTimeoutMs = params.requestTimeoutMs ?? 30_000;
  const expectedCode = normalizePairingCode(code);
  const deadline = Date.now() + timeoutMs;
  let offset = 0;

  try {
    await apiCall<boolean>(token, "deleteWebhook", { drop_pending_updates: false }, fetchImpl, requestTimeoutMs);
  } catch {
    // Proceed even if deleteWebhook fails; getUpdates will surface the real error.
  }

  try {
    const bootstrap = await apiCall<TelegramUpdate[]>(token, "getUpdates", {
      offset,
      timeout: 0,
      allowed_updates: ["message"],
    }, fetchImpl, requestTimeoutMs);
    for (const update of bootstrap) {
      offset = Math.max(offset, update.update_id + 1);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: "error", error: message };
  }

  while (Date.now() < deadline) {
    try {
      const remainingMs = Math.max(1_000, deadline - Date.now());
      const timeoutSeconds = Math.max(1, Math.min(25, Math.floor(remainingMs / 1000)));
      const updates = await apiCall<TelegramUpdate[]>(token, "getUpdates", {
        offset,
        timeout: timeoutSeconds,
        allowed_updates: ["message"],
      }, fetchImpl, requestTimeoutMs);

      for (const update of updates) {
        offset = Math.max(offset, update.update_id + 1);
        const message = update.message;
        const text = message?.text?.trim();
        if (!text) continue;

        const startCode = parseTelegramStartCode(text);
        if (startCode === undefined) continue;

        const senderId = message?.from?.id !== undefined ? String(message.from.id) : "";
        const chatId = message?.chat?.id !== undefined ? String(message.chat.id) : "";
        if (!senderId || !chatId) continue;

        const actualCode = normalizePairingCode(startCode);
        if (actualCode && secureCompare(actualCode, expectedCode)) {
          await apiCall(token, "sendMessage", {
            chat_id: chatId,
            text: "Pairing complete. You are now authorized for this bot.",
            reply_to_message_id: message?.message_id,
          }, fetchImpl, requestTimeoutMs).catch(() => undefined);
          return { status: "paired", senderId, chatId };
        }

        await apiCall(token, "sendMessage", {
          chat_id: chatId,
          text: "Authorization required. Use the pairing code shown in your terminal.",
          reply_to_message_id: message?.message_id,
        }, fetchImpl, requestTimeoutMs).catch(() => undefined);
      }
    } catch {
      await sleep(500);
    }
  }

  return { status: "timeout" };
}
