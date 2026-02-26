import { OutboundMessage } from "@/bus/events";
import { MessageBus } from "@/bus/queue";
import { eventLine } from "@/logging/events";
import { BaseChannel } from "@/channels/base";

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    caption?: string;
    from?: { id?: number | string };
    chat?: { id?: number | string };
  };
}

const TELEGRAM_PAIRING_CODE_RE = /^[a-zA-Z]{3}[- ]?\d{3}$/;

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function replaceWithTokens(
  input: string,
  regex: RegExp,
  format: (...parts: string[]) => string,
): { text: string; tokens: Map<string, string> } {
  const tokens = new Map<string, string>();
  let index = 0;
  const text = input.replace(regex, (...args) => {
    const groups = args.slice(1, -2).map((value) => String(value ?? ""));
    const token = `\u0000tok${index}\u0000`;
    index += 1;
    tokens.set(token, format(...groups));
    return token;
  });
  return { text, tokens };
}

function restoreTokens(input: string, tokens: Map<string, string>): string {
  let out = input;
  for (const [token, value] of tokens.entries()) {
    out = out.split(token).join(value);
  }
  return out;
}

function renderInlineMarkdownToHtml(input: string): string {
  const codeStage = replaceWithTokens(
    input,
    /`([^`\n]+)`/g,
    (code) => `<code>${escapeHtml(code)}</code>`,
  );
  const linkStage = replaceWithTokens(
    codeStage.text,
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (label, url) => `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`,
  );

  let out = escapeHtml(linkStage.text);
  out = out.replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>");
  out = out.replace(/__(.+?)__/g, "<b>$1</b>");
  out = out.replace(/(^|[^\*])\*([^*\n]+)\*(?!\*)/g, "$1<i>$2</i>");
  out = out.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, "$1<i>$2</i>");

  out = restoreTokens(out, linkStage.tokens);
  out = restoreTokens(out, codeStage.tokens);
  return out;
}

export function renderTelegramMarkdown(input: string): string {
  const lines = input.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let inCodeBlock = false;
  let codeBuffer: string[] = [];
  let codeLang = "";

  const flushCodeBlock = (): void => {
    const code = codeBuffer.join("\n");
    if (!codeLang) {
      out.push(`<pre>${escapeHtml(code)}</pre>`);
    } else {
      out.push(`<pre><code class="language-${escapeHtml(codeLang)}">${escapeHtml(code)}</code></pre>`);
    }
    codeBuffer = [];
    codeLang = "";
  };

  for (const line of lines) {
    const fence = line.match(/^```([a-zA-Z0-9_-]+)?\s*$/);
    if (fence) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeLang = String(fence[1] ?? "");
      } else {
        inCodeBlock = false;
        flushCodeBlock();
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      out.push(`<b>${renderInlineMarkdownToHtml(heading[1] ?? "")}</b>`);
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      out.push(`• ${renderInlineMarkdownToHtml(bullet[1] ?? "")}`);
      continue;
    }

    const ordered = line.match(/^\s*(\d+)\.\s+(.*)$/);
    if (ordered) {
      out.push(`${ordered[1]}. ${renderInlineMarkdownToHtml(ordered[2] ?? "")}`);
      continue;
    }

    if (!line.trim()) {
      out.push("");
      continue;
    }

    out.push(renderInlineMarkdownToHtml(line));
  }

  if (inCodeBlock) {
    flushCodeBlock();
  }

  return out.join("\n");
}

export class TelegramChannel extends BaseChannel {
  readonly name = "telegram";
  private offset = 0;
  private pollTask?: Promise<void>;
  private readonly typingTimers = new Map<string, ReturnType<typeof setInterval>>();
  private readonly typingStartedAt = new Map<string, number>();

  constructor(config: any, bus: MessageBus) {
    super(config, bus);
  }

  private apiUrl(method: string): string {
    return `https://api.telegram.org/bot${this.config.token}/${method}`;
  }

  private async api(method: string, payload?: Record<string, any>): Promise<any> {
    const response = await fetch(this.apiUrl(method), {
      method: payload ? "POST" : "GET",
      headers: payload ? { "Content-Type": "application/json" } : undefined,
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const json = await response.json();
    if (!response.ok || !json?.ok) {
      const desc = json?.description ? `: ${json.description}` : "";
      throw new Error(`Telegram API ${method} failed${desc}`);
    }
    return json.result;
  }

  private async pollLoop(): Promise<void> {
    while (this.running) {
      try {
        const updates = (await this.api("getUpdates", {
          offset: this.offset,
          timeout: 25,
          allowed_updates: ["message"],
        })) as TelegramUpdate[];
        if (updates.length) {
          console.log(eventLine("event", "telegram", "receive", `${String(updates.length)} update`));
        }

        for (const update of updates) {
          this.offset = Math.max(this.offset, update.update_id + 1);
          const message = update.message;
          if (!message) continue;
          const senderId = message.from?.id;
          const chatId = message.chat?.id;
          const content = message.text ?? message.caption ?? "";
          if (senderId === undefined || chatId === undefined || !content.trim()) continue;
          if (this.isPairingPayload(content)) {
            console.log(eventLine("event", "telegram", "drop", "pairing"));
            continue;
          }
          if (await this.handleBuiltinCommand(message, String(chatId))) {
            continue;
          }
          if (!this.isAllowed(String(senderId))) {
            console.error(eventLine("event", "telegram", "block", "allowlist"));
            continue;
          }
          this.startTyping(String(chatId));
          await this.handleMessage(String(senderId), String(chatId), content, [], {
            message_id: message.message_id,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(eventLine("event", "telegram", "error", `poll ${message}`));
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  async start(): Promise<void> {
    if (!this.config.token) {
      throw new Error("telegram token is required");
    }
    const me = await this.api("getMe");
    console.log(eventLine("event", "telegram", "status", `auth ${String(me?.username ?? "ok")}`));
    this.running = true;
    this.pollTask = this.pollLoop();
  }

  async stop(): Promise<void> {
    this.running = false;
    for (const chatId of [...this.typingTimers.keys()]) this.stopTyping(chatId);
    if (this.pollTask) await this.pollTask.catch(() => undefined);
  }

  async send(msg: OutboundMessage): Promise<void> {
    if (!this.running) return;
    this.stopTyping(msg.chatId);
    const payload: Record<string, any> = {
      chat_id: msg.chatId,
      text: renderTelegramMarkdown(msg.content),
      parse_mode: "HTML",
      disable_web_page_preview: true,
    };
    if (msg.replyTo) {
      const n = Number(msg.replyTo);
      if (Number.isInteger(n) && n > 0) payload.reply_to_message_id = n;
    }
    try {
      await this.api("sendMessage", payload);
    } catch (error) {
      // Fallback to plain text if Telegram rejects parse entities for any reason.
      const fallback: Record<string, any> = {
        chat_id: msg.chatId,
        text: msg.content,
        disable_web_page_preview: true,
      };
      if (msg.replyTo) fallback.reply_to_message_id = payload.reply_to_message_id;
      await this.api("sendMessage", fallback);
      const detail = error instanceof Error ? error.message : String(error);
      console.error(eventLine("event", "telegram", "warn", `md ${detail}`));
    }
    console.log(eventLine("event", "telegram", "send", msg.content));
  }

  private isCommand(text: string, command: string): boolean {
    const trimmed = text.trim().toLowerCase();
    return trimmed === `/${command}` || trimmed.startsWith(`/${command}@`) || trimmed.startsWith(`/${command} `);
  }

  private isPairingPayload(text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed) return false;

    const startMatch = trimmed.match(/^\/start(?:@[a-zA-Z0-9_]+)?(?:\s+(.+))?$/i);
    if (startMatch) {
      const arg = (startMatch[1] ?? "").trim();
      return !!arg && TELEGRAM_PAIRING_CODE_RE.test(arg);
    }

    return TELEGRAM_PAIRING_CODE_RE.test(trimmed);
  }

  private async handleBuiltinCommand(
    message: NonNullable<TelegramUpdate["message"]>,
    chatId: string,
  ): Promise<boolean> {
    const text = (message.text ?? "").trim();
    if (!text) return false;

    if (this.isCommand(text, "start")) {
      await this.api("sendMessage", {
        chat_id: chatId,
        text: "Hi. I am skyth.\n\nSend me a message and I will respond.\nType /help to see available commands.",
        reply_to_message_id: message.message_id,
      });
      return true;
    }

    if (this.isCommand(text, "help")) {
      await this.api("sendMessage", {
        chat_id: chatId,
        text: "skyth commands:\n/new - Start a new conversation\n/help - Show available commands",
        reply_to_message_id: message.message_id,
      });
      return true;
    }

    return false;
  }

  private startTyping(chatId: string): void {
    this.stopTyping(chatId);
    this.typingStartedAt.set(chatId, Date.now());

    const tick = async (): Promise<void> => {
      if (!this.running) return;
      const startedAt = this.typingStartedAt.get(chatId) ?? 0;
      // Auto-stop stale indicators so they do not run forever on failed turns.
      if (Date.now() - startedAt > 120_000) {
        this.stopTyping(chatId);
        return;
      }
      try {
        await this.api("sendChatAction", { chat_id: chatId, action: "typing" });
      } catch {
        // best effort
      }
    };

    void tick();
    const timer = setInterval(() => {
      void tick();
    }, 4_000);
    this.typingTimers.set(chatId, timer);
  }

  private stopTyping(chatId: string): void {
    const timer = this.typingTimers.get(chatId);
    if (timer) clearInterval(timer);
    this.typingTimers.delete(chatId);
    this.typingStartedAt.delete(chatId);
  }
}
