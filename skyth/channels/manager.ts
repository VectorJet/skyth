import type { OutboundMessage } from "@/bus/events";
import { MessageBus } from "@/bus/queue";
import { Config } from "@/config/schema";
import { BaseChannel } from "@/channels/base";
import { DiscordChannel } from "@/channels/discord";
import { EmailChannel } from "@/channels/email";
import { SlackChannel } from "@/channels/slack";
import { TelegramChannel } from "@/channels/telegram";
import { WhatsAppChannel } from "@/channels/whatsapp";
import { eventLine } from "@/logging/events";
import { hasDeviceToken } from "@/auth/cmd/token/shared";
import { Chat } from "chat";
import { createSlackAdapter } from "@chat-adapter/slack";
import { createDiscordAdapter } from "@chat-adapter/discord";
import { createTelegramAdapter } from "@chat-adapter/telegram";
import { createMemoryState } from "@chat-adapter/state-memory";

const CHAT_SDK_CHANNELS = ["slack", "discord", "telegram"] as const;
const PAIRING_CODE_RE = /^[A-Z]{3}\d{3}$/;

type ChatSdkChannelName = typeof CHAT_SDK_CHANNELS[number];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizePairingCode(text: string): string | null {
  const normalized = text.replace(/[^A-Z0-9]/g, "").toUpperCase();
  if (!PAIRING_CODE_RE.test(normalized)) return null;
  return normalized;
}

function channelFromThreadId(threadId: string): ChatSdkChannelName | null {
  const prefix = threadId.split(":", 1)[0] ?? "";
  if (prefix === "slack" || prefix === "discord" || prefix === "telegram") return prefix;
  return null;
}

export class ChannelManager {
  private readonly config: Config;
  private readonly bus: MessageBus;
  private readonly legacyChannels = new Map<string, BaseChannel>();
  private readonly webhookPort: number;
  private readonly webhookHost: string;
  private readonly chatSdkChannels = new Set<ChatSdkChannelName>();
  private dispatchTask?: Promise<void>;
  private discordGatewayTask?: Promise<void>;
  private webhookServer?: Bun.Server<any>;
  private chat?: Chat<any, any>;
  private running = false;
  private pairingUrl: string | null = null;

  constructor(config: Config, bus: MessageBus, options?: { webhookPort?: number; webhookHost?: string }) {
    this.config = config;
    this.bus = bus;
    this.webhookPort = options?.webhookPort ?? 18797;
    this.webhookHost = options?.webhookHost ?? "0.0.0.0";
    this.initChannels();
  }

  private initChannels(): void {
    const hasToken = hasDeviceToken();
    this.pairingUrl = hasToken ? "http://127.0.0.1:18798" : null;

    this.initChatSdkChannels();
    this.initLegacyChannels();
  }

  private initChatSdkChannels(): void {
    const adapters: Record<string, any> = {};

    if (this.config.channels.telegram.enabled && this.config.channels.telegram.token) {
      adapters.telegram = createTelegramAdapter({
        botToken: this.config.channels.telegram.token,
      });
      this.chatSdkChannels.add("telegram");
    } else if (this.config.channels.telegram.enabled) {
      console.warn(eventLine("event", "telegram", "warn", "chat-sdk requires token; using legacy adapter"));
    }

    const slackSigningSecret = String((this.config.channels.slack as Record<string, any>).signing_secret ?? "").trim();
    if (this.config.channels.slack.enabled) {
      if (slackSigningSecret || process.env.SLACK_SIGNING_SECRET) {
        adapters.slack = createSlackAdapter({
          botToken: this.config.channels.slack.bot_token || undefined,
          signingSecret: slackSigningSecret || undefined,
        });
        this.chatSdkChannels.add("slack");
      } else {
        console.warn(eventLine("event", "slack", "warn", "chat-sdk needs SLACK_SIGNING_SECRET; using legacy adapter"));
      }
    }

    const discordPublicKey = String((this.config.channels.discord as Record<string, any>).public_key ?? process.env.DISCORD_PUBLIC_KEY ?? "").trim();
    const discordAppId = String((this.config.channels.discord as Record<string, any>).application_id ?? process.env.DISCORD_APPLICATION_ID ?? "").trim();
    if (this.config.channels.discord.enabled) {
      if (this.config.channels.discord.token && discordPublicKey && discordAppId) {
        adapters.discord = createDiscordAdapter({
          botToken: this.config.channels.discord.token,
          publicKey: discordPublicKey,
          applicationId: discordAppId,
        });
        this.chatSdkChannels.add("discord");
      } else {
        console.warn(eventLine("event", "discord", "warn", "chat-sdk needs token+public_key+application_id; using legacy adapter"));
      }
    }

    if (Object.keys(adapters).length === 0) return;

    this.chat = new Chat({
      userName: this.config.nickname || "assistant",
      adapters,
      state: createMemoryState(),
    });

    const handleInbound = async (thread: any, message: any): Promise<void> => {
      const threadId = String(thread.id ?? "").trim();
      const channel = channelFromThreadId(threadId);
      if (!threadId || !channel) return;

      const senderId = String(message?.author?.userId ?? "").trim();
      const content = String(message?.text ?? "").trim();
      if (!senderId || !content) return;

      const pairingCode = normalizePairingCode(content);
      if (pairingCode && this.pairingUrl) {
        await this.forwardPairingCode(channel, thread, senderId, pairingCode);
        return;
      }

      const metadata: Record<string, unknown> = {
        chat_sdk: true,
        thread_id: threadId,
      };

      if (channel === "slack") {
        const raw = (message?.raw ?? {}) as Record<string, unknown>;
        metadata.slack = {
          channel_type: String(raw.channel_type ?? ""),
        };
      }

      await this.bus.publishInbound({
        channel,
        senderId,
        chatId: threadId,
        content,
        metadata,
        timestamp: new Date(),
      });
    };

    this.chat.onNewMention(handleInbound);
    this.chat.onSubscribedMessage(handleInbound);
    this.chat.onNewMessage(/[\s\S]+/, handleInbound);
  }

  private initLegacyChannels(): void {
    const useLegacyTelegram = this.config.channels.telegram.enabled && !this.chatSdkChannels.has("telegram");
    const useLegacySlack = this.config.channels.slack.enabled && !this.chatSdkChannels.has("slack");
    const useLegacyDiscord = this.config.channels.discord.enabled && !this.chatSdkChannels.has("discord");

    if (useLegacyTelegram) {
      const channel = new TelegramChannel(this.config.channels.telegram, this.bus);
      if (this.pairingUrl) channel.setPairingEndpoint(this.pairingUrl);
      this.legacyChannels.set("telegram", channel);
    }
    if (this.config.channels.whatsapp.enabled) {
      const channel = new WhatsAppChannel(this.config.channels.whatsapp, this.bus);
      if (this.pairingUrl) channel.setPairingEndpoint(this.pairingUrl);
      this.legacyChannels.set("whatsapp", channel);
    }
    if (useLegacyDiscord) {
      const channel = new DiscordChannel(this.config.channels.discord, this.bus);
      if (this.pairingUrl) channel.setPairingEndpoint(this.pairingUrl);
      this.legacyChannels.set("discord", channel);
    }
    if (useLegacySlack) {
      const channel = new SlackChannel(this.config.channels.slack, this.bus);
      if (this.pairingUrl) channel.setPairingEndpoint(this.pairingUrl);
      this.legacyChannels.set("slack", channel);
    }
    if (this.config.channels.email.enabled) {
      this.legacyChannels.set("email", new EmailChannel(this.config.channels.email, this.bus));
    }
  }

  private async forwardPairingCode(
    channel: ChatSdkChannelName,
    thread: any,
    senderId: string,
    code: string,
  ): Promise<void> {
    if (!this.pairingUrl) return;
    try {
      const response = await fetch(`${this.pairingUrl}/pair`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, senderId, metadata: { platform: channel } }),
      });
      const result = await response.json() as { success: boolean; error?: string };
      if (result.success) {
        await thread.post("Pairing successful! Your device has been linked.");
      } else {
        await thread.post(`Pairing failed: ${result.error ?? "unknown error"}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(eventLine("event", channel, "error", `pair ${message}`));
    }
  }

  async startAll(): Promise<void> {
    this.running = true;
    if (!this.enabledChannels.length) {
      console.error(eventLine("event", "gateway", "warn", "no channels"));
    }

    if (this.chat && this.chatSdkChannels.size) {
      await this.startChatSdk();
    }

    for (const [, channel] of this.legacyChannels) {
      try {
        await channel.start();
        console.log(eventLine("event", channel.name, "status", "started"));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(eventLine("event", channel.name, "error", `start ${message}`));
      }
    }

    this.dispatchTask = this.dispatchOutbound();
  }

  async stopAll(): Promise<void> {
    this.running = false;
    if (this.dispatchTask) await this.dispatchTask.catch(() => undefined);

    if (this.discordGatewayTask) await this.discordGatewayTask.catch(() => undefined);

    for (const [, channel] of this.legacyChannels) {
      try {
        await channel.stop();
        console.log(eventLine("event", channel.name, "status", "stopped"));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(eventLine("event", channel.name, "error", `stop ${message}`));
      }
    }

    if (this.chat) {
      await this.chat.shutdown().catch(() => undefined);
    }

    if (this.webhookServer) {
      this.webhookServer.stop(true);
      this.webhookServer = undefined;
    }
  }

  private async startChatSdk(): Promise<void> {
    if (!this.chat) return;

    await this.chat.initialize();

    this.webhookServer = Bun.serve({
      hostname: this.webhookHost,
      port: this.webhookPort,
      fetch: async (request: Request): Promise<Response> => {
        const url = new URL(request.url);
        if (request.method === "GET" && url.pathname === "/health") {
          return new Response("ok", { status: 200 });
        }
        if (request.method !== "POST") {
          return new Response("Method Not Allowed", { status: 405 });
        }

        if (url.pathname === "/api/webhooks/slack" && this.chatSdkChannels.has("slack")) {
          return (this.chat!.webhooks as any).slack(request, { waitUntil: (task: Promise<unknown>) => { void task.catch(() => undefined); } });
        }
        if (url.pathname === "/api/webhooks/discord" && this.chatSdkChannels.has("discord")) {
          return (this.chat!.webhooks as any).discord(request, { waitUntil: (task: Promise<unknown>) => { void task.catch(() => undefined); } });
        }
        if (url.pathname === "/api/webhooks/telegram" && this.chatSdkChannels.has("telegram")) {
          return (this.chat!.webhooks as any).telegram(request, { waitUntil: (task: Promise<unknown>) => { void task.catch(() => undefined); } });
        }

        return new Response("Not Found", { status: 404 });
      },
    });

    console.log(eventLine("event", "chat-sdk", "status", `webhooks ${this.webhookHost}:${String(this.webhookPort)}`));

    if (this.chatSdkChannels.has("discord")) {
      this.discordGatewayTask = this.runDiscordGatewayLoop();
    }
  }

  private async runDiscordGatewayLoop(): Promise<void> {
    if (!this.chat || !this.running) return;

    const discordAdapter = this.chat.getAdapter("discord") as { startGatewayListener?: (...args: any[]) => Promise<Response> } | undefined;
    if (!discordAdapter?.startGatewayListener) return;

    const webhookUrl = `http://127.0.0.1:${String(this.webhookPort)}/api/webhooks/discord`;

    while (this.running) {
      try {
        await discordAdapter.startGatewayListener(
          { waitUntil: (task: Promise<unknown>) => { void task.catch(() => undefined); } },
          600_000,
          undefined,
          webhookUrl,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(eventLine("event", "discord", "error", `gateway ${message}`));
        await sleep(5000);
      }
    }
  }

  private async dispatchOutbound(): Promise<void> {
    while (this.running) {
      const msg = await this.bus.consumeOutboundWithTimeout(250);
      if (!msg) continue;

      if (this.chat && this.chatSdkChannels.has(msg.channel as ChatSdkChannelName)) {
        try {
          const adapter = this.chat.getAdapter(msg.channel as ChatSdkChannelName) as { postMessage: (threadId: string, content: { markdown: string }) => Promise<unknown> };
          await adapter.postMessage(msg.chatId, { markdown: msg.content });
          console.log(eventLine("event", msg.channel, "send", "outbound"));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(eventLine("event", msg.channel, "error", `send ${message}`));
        }
        continue;
      }

      const channel = this.legacyChannels.get(msg.channel);
      if (!channel) {
        console.error(eventLine("event", "gateway", "drop", "unknown chan"));
        continue;
      }
      try {
        await channel.send(msg);
        console.log(eventLine("event", msg.channel, "send", "outbound"));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(eventLine("event", msg.channel, "error", `send ${message}`));
      }
    }
  }

  getChannel(name: string): BaseChannel | undefined {
    return this.legacyChannels.get(name);
  }

  get enabledChannels(): string[] {
    const channels = new Set<string>(this.legacyChannels.keys());
    for (const name of this.chatSdkChannels) channels.add(name);
    return [...channels];
  }

  getStatus(): Record<string, { enabled: boolean; running: boolean }> {
    const out: Record<string, { enabled: boolean; running: boolean }> = {};
    for (const [name, channel] of this.legacyChannels) {
      out[name] = { enabled: true, running: channel.isRunning };
    }
    for (const name of this.chatSdkChannels) {
      out[name] = { enabled: true, running: Boolean(this.running && this.webhookServer) };
    }
    return out;
  }
}
