import { OutboundMessage } from "../bus/events";
import { MessageBus } from "../bus/queue";
import { Config } from "../config/schema";
import { BaseChannel } from "./base";
import { DingTalkChannel } from "./dingtalk";
import { DiscordChannel } from "./discord";
import { EmailChannel } from "./email";
import { FeishuChannel } from "./feishu";
import { MochatChannel } from "./mochat";
import { QQChannel } from "./qq";
import { SlackChannel } from "./slack";
import { TelegramChannel } from "./telegram";
import { WhatsAppChannel } from "./whatsapp";
import { eventLine } from "../logging/events";

export class ChannelManager {
  private readonly config: Config;
  private readonly bus: MessageBus;
  private readonly channels = new Map<string, BaseChannel>();
  private dispatchTask?: Promise<void>;
  private running = false;

  constructor(config: Config, bus: MessageBus) {
    this.config = config;
    this.bus = bus;
    this.initChannels();
  }

  private initChannels(): void {
    if (this.config.channels.telegram.enabled) this.channels.set("telegram", new TelegramChannel(this.config.channels.telegram, this.bus));
    if (this.config.channels.whatsapp.enabled) this.channels.set("whatsapp", new WhatsAppChannel(this.config.channels.whatsapp, this.bus));
    if (this.config.channels.discord.enabled) this.channels.set("discord", new DiscordChannel(this.config.channels.discord, this.bus));
    if (this.config.channels.feishu.enabled) this.channels.set("feishu", new FeishuChannel(this.config.channels.feishu, this.bus));
    if (this.config.channels.mochat.enabled) this.channels.set("mochat", new MochatChannel(this.config.channels.mochat, this.bus));
    if (this.config.channels.dingtalk.enabled) this.channels.set("dingtalk", new DingTalkChannel(this.config.channels.dingtalk, this.bus));
    if (this.config.channels.slack.enabled) this.channels.set("slack", new SlackChannel(this.config.channels.slack, this.bus));
    if (this.config.channels.qq.enabled) this.channels.set("qq", new QQChannel(this.config.channels.qq, this.bus));
    if (this.config.channels.email.enabled) this.channels.set("email", new EmailChannel(this.config.channels.email, this.bus));
  }

  async startAll(): Promise<void> {
    this.running = true;
    if (!this.channels.size) {
      console.error(eventLine("event", "gateway", "warn", "no channels"));
    }
    for (const [, channel] of this.channels) {
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
    for (const [, channel] of this.channels) {
      try {
        await channel.stop();
        console.log(eventLine("event", channel.name, "status", "stopped"));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(eventLine("event", channel.name, "error", `stop ${message}`));
      }
    }
  }

  private async dispatchOutbound(): Promise<void> {
    while (this.running) {
      const msg = await this.bus.consumeOutboundWithTimeout(250);
      if (!msg) continue;
      const channel = this.channels.get(msg.channel);
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
    return this.channels.get(name);
  }

  get enabledChannels(): string[] {
    return [...this.channels.keys()];
  }

  getStatus(): Record<string, { enabled: boolean; running: boolean }> {
    const out: Record<string, { enabled: boolean; running: boolean }> = {};
    for (const [name, channel] of this.channels) {
      out[name] = { enabled: true, running: channel.isRunning };
    }
    return out;
  }
}
