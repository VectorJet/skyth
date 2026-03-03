import type { OutboundMessage } from "@/bus/events";
import { MessageBus } from "@/bus/queue";
import { BaseChannel } from "@/channels/base";

export class QQChannel extends BaseChannel {
  override readonly name = "qq";
  private accessToken?: string;
  private tokenExpiryMs = 0;

  constructor(config: any, bus: MessageBus) {
    super(config, bus);
  }

  async start(): Promise<void> {
    if (!this.config.app_id || !this.config.secret) {
      throw new Error("qq app_id and secret are required");
    }
    this.running = true;
  }

  async stop(): Promise<void> {
    this.running = false;
  }

  async send(msg: OutboundMessage): Promise<void> {
    const token = await this.getAccessToken();
    if (!token) return;

    const url = `https://api.sgroup.qq.com/v2/users/${encodeURIComponent(msg.chatId)}/messages`;
    const payload = {
      msg_type: 0,
      content: msg.content,
      msg_id: msg.replyTo || `skyth-${Date.now()}`,
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `QQBot ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`qq send failed: http ${response.status} ${text.slice(0, 200)}`);
    }
  }

  private async getAccessToken(): Promise<string | undefined> {
    if (this.accessToken && Date.now() < this.tokenExpiryMs) return this.accessToken;

    const response = await fetch("https://bots.qq.com/app/getAppAccessToken", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appId: this.config.app_id,
        clientSecret: this.config.secret,
      }),
    });

    const json = await response.json().catch(() => ({}));
    if (!response.ok || !(json as any).access_token) {
      throw new Error(`qq token fetch failed: ${JSON.stringify(json)}`);
    }

    this.accessToken = String((json as any).access_token);
    const expiresIn = Number((json as any).expires_in ?? 7200);
    this.tokenExpiryMs = Date.now() + Math.max(60, expiresIn - 60) * 1000;
    return this.accessToken;
  }
}
