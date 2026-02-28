import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { OutboundMessage } from "@/bus/events";
import { MessageBus } from "@/bus/queue";
import { BaseChannel } from "@/channels/base";

const DISCORD_API_BASE = "https://discord.com/api/v10";
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const MAX_MESSAGE_LEN = 2000;
const DISCORD_PAIRING_CODE_RE = /^[A-Z]{3}\d{3}$/;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function splitMessage(content: string, maxLen = MAX_MESSAGE_LEN): string[] {
  if (!content) return [];
  if (content.length <= maxLen) return [content];
  const chunks: string[] = [];
  let remaining = content;
  while (remaining.length > maxLen) {
    const cut = remaining.slice(0, maxLen);
    let pos = cut.lastIndexOf("\n");
    if (pos <= 0) pos = cut.lastIndexOf(" ");
    if (pos <= 0) pos = maxLen;
    chunks.push(remaining.slice(0, pos));
    remaining = remaining.slice(pos).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

export class DiscordChannel extends BaseChannel {
  override readonly name = "discord";
  private ws?: WebSocket;
  private seq: number | null = null;
  private runTask?: Promise<void>;
  private heartbeatTimer?: Timer;
  private typingTasks = new Map<string, Promise<void>>();
  private pairingEndpoint: string | null = null;

  constructor(config: any, bus: MessageBus) {
    super(config, bus);
  }

  setPairingEndpoint(url: string | null): void {
    this.pairingEndpoint = url;
  }

  async start(): Promise<void> {
    if (!this.config.token) throw new Error("discord token is required");
    this.running = true;
    this.runTask = this.runLoop();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
    this.ws?.close();
    for (const task of this.typingTasks.values()) {
      await task.catch(() => undefined);
    }
    this.typingTasks.clear();
    if (this.runTask) await this.runTask.catch(() => undefined);
  }

  async send(msg: OutboundMessage): Promise<void> {
    const chunks = splitMessage(msg.content ?? "");
    if (!chunks.length) return;

    const url = `${DISCORD_API_BASE}/channels/${msg.chatId}/messages`;
    const headers = {
      Authorization: `Bot ${this.config.token}`,
      "Content-Type": "application/json",
    };

    try {
      for (let i = 0; i < chunks.length; i += 1) {
        const payload: Record<string, any> = { content: chunks[i] };
        if (i === 0 && msg.replyTo) {
          payload.message_reference = { message_id: msg.replyTo };
          payload.allowed_mentions = { replied_user: false };
        }
        const ok = await this.sendPayload(url, headers, payload);
        if (!ok) break;
      }
    } finally {
      await this.stopTyping(msg.chatId);
    }
  }

  private async runLoop(): Promise<void> {
    while (this.running) {
      try {
        console.log("[discord] connecting gateway");
        await this.connectOnce();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[discord] gateway error: ${message}`);
      }
      if (this.running) await sleep(5000);
    }
  }

  private async connectOnce(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.config.gateway_url);
      this.ws = ws;
      let settled = false;
      const settle = (fn: () => void): void => {
        if (settled) return;
        settled = true;
        fn();
      };

      ws.addEventListener("open", () => {
        console.log("[discord] gateway connected");
      });

      ws.addEventListener("message", (event) => {
        if (!this.running) return;
        void this.onGatewayPayload(event.data).catch((err) => {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[discord] message handling error: ${message}`);
        });
      });

      ws.addEventListener("close", () => {
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = undefined;
        settle(resolve);
      });

      ws.addEventListener("error", () => {
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = undefined;
        settle(() => reject(new Error("discord websocket error")));
      });
    });
  }

  private async onGatewayPayload(raw: string | ArrayBuffer | Blob): Promise<void> {
    const dataText = typeof raw === "string" ? raw : raw instanceof ArrayBuffer ? Buffer.from(raw).toString("utf-8") : await raw.text();
    let data: any;
    try {
      data = JSON.parse(dataText);
    } catch {
      return;
    }

    if (typeof data.s === "number") this.seq = data.s;
    const op = data.op;
    const type = data.t;
    const payload = data.d ?? {};

    if (op === 10) {
      const interval = Number(payload.heartbeat_interval ?? 45000);
      this.startHeartbeat(Math.max(5000, interval));
      this.identify();
      return;
    }

    if (op === 7 || op === 9) {
      console.log("[discord] reconnect requested");
      this.ws?.close();
      return;
    }

    if (op === 0 && type === "READY") {
      console.log("[discord] gateway ready");
      return;
    }

    if (op === 0 && type === "MESSAGE_CREATE") {
      await this.handleMessageCreate(payload);
    }
  }

  private startHeartbeat(intervalMs: number): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      if (!this.running || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      try {
        this.ws.send(JSON.stringify({ op: 1, d: this.seq }));
      } catch {
        // noop
      }
    }, intervalMs);
  }

  private identify(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const identify = {
      op: 2,
      d: {
        token: this.config.token,
        intents: this.config.intents,
        properties: { os: "skyth", browser: "skyth", device: "skyth" },
      },
    };
    this.ws.send(JSON.stringify(identify));
  }

  private async handleMessageCreate(payload: Record<string, any>): Promise<void> {
    const author = payload.author ?? {};
    if (author.bot) return;

    const senderId = String(author.id ?? "").trim();
    const channelId = String(payload.channel_id ?? "").trim();
    if (!senderId || !channelId) return;

    const content = String(payload.content ?? "").trim();
    const normalizedCode = this.extractPairingCode(content);
    if (normalizedCode && this.pairingEndpoint) {
      await this.forwardPairingCode(normalizedCode, senderId, channelId);
      return;
    }

    if (!this.isAllowed(senderId)) return;

    const contentParts: string[] = [];
    const text = String(payload.content ?? "");
    if (text) contentParts.push(text);

    const mediaPaths: string[] = [];
    const mediaDir = join(homedir(), ".skyth", "media");
    const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];
    for (const attachment of attachments) {
      const url = String(attachment?.url ?? "").trim();
      const filename = String(attachment?.filename ?? "attachment");
      const size = Number(attachment?.size ?? 0);
      if (!url) continue;
      if (size > MAX_ATTACHMENT_BYTES) {
        contentParts.push(`[attachment: ${filename} - too large]`);
        continue;
      }
      try {
        await mkdir(mediaDir, { recursive: true });
        const safeName = filename.replace(/[\\/]/g, "_");
        const filePath = join(mediaDir, `${String(attachment?.id ?? "file")}_${safeName}`);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`http ${response.status}`);
        const buffer = Buffer.from(await response.arrayBuffer());
        await writeFile(filePath, buffer);
        mediaPaths.push(filePath);
        contentParts.push(`[attachment: ${filePath}]`);
      } catch {
        contentParts.push(`[attachment: ${filename} - download failed]`);
      }
    }

    await this.startTyping(channelId);
    await this.handleMessage(
      senderId,
      channelId,
      contentParts.join("\n") || "[empty message]",
      mediaPaths,
      {
        message_id: String(payload.id ?? ""),
        guild_id: payload.guild_id,
        reply_to: String(payload?.referenced_message?.id ?? "") || undefined,
      },
    );
  }

  private extractPairingCode(text: string): string | null {
    if (!text) return null;
    const normalized = text.replace(/[^A-Z0-9]/g, "").toUpperCase();
    if (DISCORD_PAIRING_CODE_RE.test(normalized)) {
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
        body: JSON.stringify({ code, senderId, metadata: { platform: "discord" } }),
      });
      const result = await response.json() as { success: boolean; error?: string };
      if (result.success) {
        console.log(`[discord] pairing successful: ${senderId}`);
        await this.sendSimpleMessage(channelId, "Pairing successful! Your device has been linked.");
      } else {
        console.error(`[discord] pairing failed: ${result.error}`);
        await this.sendSimpleMessage(channelId, `Pairing failed: ${result.error}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[discord] pairing error: ${message}`);
    }
  }

  private async sendSimpleMessage(channelId: string, text: string): Promise<void> {
    const url = `${DISCORD_API_BASE}/channels/${channelId}/messages`;
    const headers = {
      Authorization: `Bot ${this.config.token}`,
      "Content-Type": "application/json",
    };
    await this.sendPayload(url, headers, { content: text });
  }

  private async sendPayload(url: string, headers: Record<string, string>, payload: Record<string, any>): Promise<boolean> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });
        if (response.status === 429) {
          const data = await response.json().catch(() => ({}));
          const retryAfter = Number((data as any).retry_after ?? 1);
          await sleep(Math.ceil(retryAfter * 1000));
          continue;
        }
        if (!response.ok) throw new Error(`http ${response.status}`);
        return true;
      } catch (error) {
        if (attempt === 2) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`[discord] send failed: ${message}`);
          return false;
        }
        await sleep(1000);
      }
    }
    return false;
  }

  private async startTyping(channelId: string): Promise<void> {
    await this.stopTyping(channelId);
    const task = (async () => {
      const url = `${DISCORD_API_BASE}/channels/${channelId}/typing`;
      const headers = { Authorization: `Bot ${this.config.token}` };
      while (this.running && this.typingTasks.has(channelId)) {
        try {
          await fetch(url, { method: "POST", headers });
        } catch {
          // noop
        }
        await sleep(8000);
      }
    })();
    this.typingTasks.set(channelId, task);
  }

  private async stopTyping(channelId: string): Promise<void> {
    const task = this.typingTasks.get(channelId);
    if (!task) return;
    this.typingTasks.delete(channelId);
    await task.catch(() => undefined);
  }
}
