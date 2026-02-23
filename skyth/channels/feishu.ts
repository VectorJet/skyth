import { OutboundMessage } from "../bus/events";
import { MessageBus } from "../bus/queue";
import { BaseChannel } from "./base";

export class FeishuChannel extends BaseChannel {
  readonly name = "feishu";
  private tenantAccessToken?: string;
  private tokenExpiryMs = 0;

  constructor(config: any, bus: MessageBus) {
    super(config, bus);
  }

  async start(): Promise<void> {
    if (!this.config.app_id || !this.config.app_secret) {
      throw new Error("feishu app_id and app_secret are required");
    }
    this.running = true;
    await this.getTenantAccessToken();
    console.log("[feishu] channel started (outbound OpenAPI mode)");
    console.log("[feishu] inbound websocket long-connection requires SDK bridge and is not enabled in this runtime");
  }

  async stop(): Promise<void> {
    this.running = false;
  }

  async send(msg: OutboundMessage): Promise<void> {
    const token = await this.getTenantAccessToken();
    if (!token) return;

    // chatId is treated as open_id by default; callers can set metadata.receive_id_type.
    const receiveIdType = String(msg.metadata?.receive_id_type ?? "open_id");
    const url = `https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=${encodeURIComponent(receiveIdType)}`;

    const payload = {
      receive_id: msg.chatId,
      msg_type: "text",
      content: JSON.stringify({ text: msg.content }),
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const json = await response.json().catch(() => ({}));
    if (!response.ok || Number((json as any).code ?? -1) !== 0) {
      throw new Error(`feishu send failed: ${JSON.stringify(json)}`);
    }
  }

  private async getTenantAccessToken(): Promise<string | undefined> {
    if (this.tenantAccessToken && Date.now() < this.tokenExpiryMs) return this.tenantAccessToken;

    const response = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_id: this.config.app_id,
        app_secret: this.config.app_secret,
      }),
    });

    const json = await response.json().catch(() => ({}));
    if (!response.ok || Number((json as any).code ?? -1) !== 0 || !(json as any).tenant_access_token) {
      throw new Error(`feishu token fetch failed: ${JSON.stringify(json)}`);
    }

    this.tenantAccessToken = String((json as any).tenant_access_token);
    const expire = Number((json as any).expire ?? 7200);
    this.tokenExpiryMs = Date.now() + Math.max(60, expire - 60) * 1000;
    return this.tenantAccessToken;
  }
}
