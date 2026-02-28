import type { OutboundMessage } from "@/bus/events";
import { MessageBus } from "@/bus/queue";
import { BaseChannel } from "@/channels/base";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const SLACK_PAIRING_CODE_RE = /^[A-Z]{3}\d{3}$/;

export class SlackChannel extends BaseChannel {
  override readonly name = "slack";
  private ws?: WebSocket;
  private runTask?: Promise<void>;
  private botUserId?: string;
  private pairingEndpoint: string | null = null;

  constructor(config: any, bus: MessageBus) {
    super(config, bus);
  }

  setPairingEndpoint(url: string | null): void {
    this.pairingEndpoint = url;
  }

  async start(): Promise<void> {
    if (!this.config.bot_token || !this.config.app_token) {
      throw new Error("slack bot_token and app_token are required");
    }
    if (this.config.mode !== "socket") {
      throw new Error(`unsupported slack mode: ${this.config.mode}`);
    }

    this.botUserId = await this.resolveBotUserId();
    this.running = true;
    this.runTask = this.runSocketLoop();
  }

  async stop(): Promise<void> {
    this.running = false;
    this.ws?.close();
    if (this.runTask) await this.runTask.catch(() => undefined);
  }

  async send(msg: OutboundMessage): Promise<void> {
    const slackMeta = msg.metadata?.slack ?? {};
    const threadTs = slackMeta.thread_ts;
    const channelType = slackMeta.channel_type;
    const useThread = Boolean(threadTs) && channelType !== "im";

    if (msg.content) {
      await this.slackApi("chat.postMessage", {
        token: this.config.bot_token,
        payload: {
          channel: msg.chatId,
          text: msg.content,
          thread_ts: useThread ? threadTs : undefined,
        },
      });
    }
  }

  private async runSocketLoop(): Promise<void> {
    while (this.running) {
      try {
        const socketUrl = await this.openSocketConnection();
        await this.connectSocket(socketUrl);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[slack] socket mode error: ${message}`);
      }
      if (this.running) await sleep(5000);
    }
  }

  private async openSocketConnection(): Promise<string> {
    const response = await fetch("https://slack.com/api/apps.connections.open", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.app_token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "",
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !(json as any).ok || !(json as any).url) {
      throw new Error(`apps.connections.open failed: ${(json as any)?.error ?? response.status}`);
    }
    return String((json as any).url);
  }

  private async connectSocket(url: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;
      let settled = false;
      const settle = (fn: () => void): void => {
        if (settled) return;
        settled = true;
        fn();
      };

      ws.addEventListener("open", () => {
        console.log("[slack] socket mode connected");
      });

      ws.addEventListener("message", (event) => {
        if (!this.running) return;
        void this.handleSocketEnvelope(event.data).catch((err) => {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[slack] envelope error: ${message}`);
        });
      });

      ws.addEventListener("close", () => settle(resolve));
      ws.addEventListener("error", () => settle(() => reject(new Error("slack websocket error"))));
    });
  }

  private async handleSocketEnvelope(raw: string | ArrayBuffer | Blob): Promise<void> {
    const dataText = typeof raw === "string" ? raw : raw instanceof ArrayBuffer ? Buffer.from(raw).toString("utf-8") : await raw.text();
    let envelope: any;
    try {
      envelope = JSON.parse(dataText);
    } catch {
      return;
    }

    if (envelope.envelope_id && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ envelope_id: envelope.envelope_id }));
    }

    if (envelope.type !== "events_api") return;
    const event = envelope.payload?.event ?? {};
    const eventType = String(event.type ?? "");
    if (eventType !== "message" && eventType !== "app_mention") return;

    const senderId = String(event.user ?? "").trim();
    const chatId = String(event.channel ?? "").trim();
    let text = String(event.text ?? "");
    const channelType = String(event.channel_type ?? "");

    if (!senderId || !chatId) return;
    if (event.subtype) return;
    if (this.botUserId && senderId === this.botUserId) return;

    if (eventType === "message" && this.botUserId && text.includes(`<@${this.botUserId}>`)) {
      return;
    }

    const normalizedCode = this.extractPairingCode(text);
    if (normalizedCode && this.pairingEndpoint) {
      await this.forwardPairingCode(normalizedCode, senderId, chatId);
      return;
    }

    if (!this.isAllowedSlack(senderId, chatId, channelType)) return;

    if (channelType !== "im" && !this.shouldRespondInChannel(eventType, text, chatId)) return;

    text = this.stripBotMention(text);
    if (!text.trim()) return;

    let threadTs = event.thread_ts;
    if (this.config.reply_in_thread && !threadTs) threadTs = event.ts;

    await this.handleMessage(senderId, chatId, text, [], {
      slack: {
        event,
        thread_ts: threadTs,
        channel_type: channelType,
      },
    });
  }

  private isAllowedSlack(senderId: string, chatId: string, channelType: string): boolean {
    if (channelType === "im") {
      if (!this.config.dm?.enabled) return false;
      if (this.config.dm?.policy === "allowlist") {
        return Array.isArray(this.config.dm?.allow_from) && this.config.dm.allow_from.includes(senderId);
      }
      return true;
    }
    if (this.config.group_policy === "allowlist") {
      return Array.isArray(this.config.group_allow_from) && this.config.group_allow_from.includes(chatId);
    }
    return true;
  }

  private shouldRespondInChannel(eventType: string, text: string, chatId: string): boolean {
    if (this.config.group_policy === "open") return true;
    if (this.config.group_policy === "mention") {
      if (eventType === "app_mention") return true;
      return Boolean(this.botUserId && text.includes(`<@${this.botUserId}>`));
    }
    if (this.config.group_policy === "allowlist") {
      return Array.isArray(this.config.group_allow_from) && this.config.group_allow_from.includes(chatId);
    }
    return false;
  }

  private stripBotMention(text: string): string {
    if (!text || !this.botUserId) return text;
    return text.replaceAll(`<@${this.botUserId}>`, "").trim();
  }

  private async resolveBotUserId(): Promise<string | undefined> {
    const auth = await this.slackApi("auth.test", { token: this.config.bot_token, payload: {} }).catch(() => undefined);
    const userId = auth?.user_id ? String(auth.user_id) : undefined;
    if (userId) console.log(`[slack] bot connected as ${userId}`);
    return userId;
  }

  private async slackApi(method: string, params: { token: string; payload: Record<string, any> }): Promise<any> {
    const response = await fetch(`https://slack.com/api/${method}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params.payload),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !(json as any).ok) {
      throw new Error(`slack ${method} failed: ${(json as any)?.error ?? response.status}`);
    }
    return json;
  }

  private extractPairingCode(text: string): string | null {
    if (!text) return null;
    const normalized = text.replace(/[^A-Z0-9]/g, "").toUpperCase();
    if (SLACK_PAIRING_CODE_RE.test(normalized)) {
      return normalized;
    }
    return null;
  }

  private async forwardPairingCode(code: string, senderId: string, channelId: string): Promise<void> {
    if (!this.pairingEndpoint) return;
    try {
      const response = await fetch(`${this.pairingEndpoint}/pair`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, senderId, metadata: { platform: "slack" } }),
      });
      const result = await response.json() as { success: boolean; error?: string };
      if (result.success) {
        console.log(`[slack] pairing successful: ${senderId}`);
        await this.slackApi("chat.postMessage", {
          token: this.config.bot_token,
          payload: { channel: channelId, text: "Pairing successful! Your device has been linked." },
        });
      } else {
        console.error(`[slack] pairing failed: ${result.error}`);
        await this.slackApi("chat.postMessage", {
          token: this.config.bot_token,
          payload: { channel: channelId, text: `Pairing failed: ${result.error}` },
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[slack] pairing error: ${message}`);
    }
  }
}
