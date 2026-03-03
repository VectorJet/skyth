import type { OutboundMessage } from "@/bus/events";
import { MessageBus } from "@/bus/queue";
import { BaseChannel } from "@/channels/base";

export class DingTalkChannel extends BaseChannel {
  override readonly name = "dingtalk";
  private accessToken?: string;
  private tokenExpiryMs = 0;

  constructor(config: any, bus: MessageBus) {
    super(config, bus);
  }

  async start(): Promise<void> {
    if (!this.config.client_id || !this.config.client_secret) {
      throw new Error("dingtalk client_id and client_secret are required");
    }
    this.running = true;
  }

  async stop(): Promise<void> {
    this.running = false;
  }

  async send(msg: OutboundMessage): Promise<void> {
    const token = await this.getAccessToken();
    if (!token) return;

    const payload = {
      robotCode: this.config.client_id,
      userIds: [msg.chatId],
      msgKey: "sampleMarkdown",
      msgParam: JSON.stringify({ text: msg.content, title: "Skyth Reply" }),
    };

    const response = await fetch("https://api.dingtalk.com/v1.0/robot/oToMessages/batchSend", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-acs-dingtalk-access-token": token,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`dingtalk send failed: http ${response.status} ${text.slice(0, 200)}`);
    }
  }

  private async getAccessToken(): Promise<string | undefined> {
    const now = Date.now();
    if (this.accessToken && now < this.tokenExpiryMs) return this.accessToken;

    const response = await fetch("https://api.dingtalk.com/v1.0/oauth2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appKey: this.config.client_id,
        appSecret: this.config.client_secret,
      }),
    });

    const json = await response.json().catch(() => ({}));
    if (!response.ok || !(json as any).accessToken) {
      throw new Error(`dingtalk access token failed: ${JSON.stringify(json)}`);
    }

    this.accessToken = String((json as any).accessToken);
    const expiresIn = Number((json as any).expireIn ?? 7200);
    this.tokenExpiryMs = Date.now() + Math.max(60, expiresIn - 60) * 1000;
    return this.accessToken;
  }
}
