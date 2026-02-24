import { OutboundMessage } from "../bus/events";
import { MessageBus } from "../bus/queue";
import { BaseChannel } from "./base";

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
          console.log(`[telegram] received ${updates.length} update(s)`);
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
            console.log(`[telegram] dropped pairing payload from ${senderId} in chat ${chatId}`);
            continue;
          }
          if (await this.handleBuiltinCommand(message, String(chatId))) {
            continue;
          }
          if (!this.isAllowed(String(senderId))) {
            console.error(`[telegram] blocked sender ${senderId}; not in allow_from`);
            continue;
          }
          this.startTyping(String(chatId));
          await this.handleMessage(String(senderId), String(chatId), content, [], {
            message_id: message.message_id,
          });
          console.log(`[telegram] inbound queued from ${senderId} in chat ${chatId}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[telegram] polling error: ${message}`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  async start(): Promise<void> {
    if (!this.config.token) {
      throw new Error("telegram token is required");
    }
    const me = await this.api("getMe");
    console.log(`[telegram] bot authenticated: @${me?.username ?? "unknown"} (${me?.id ?? "n/a"})`);
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
      text: msg.content,
      disable_web_page_preview: true,
    };
    if (msg.replyTo) {
      const n = Number(msg.replyTo);
      if (Number.isInteger(n) && n > 0) payload.reply_to_message_id = n;
    }
    await this.api("sendMessage", payload);
    console.log(`[telegram] outbound sent to chat ${msg.chatId}`);
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
