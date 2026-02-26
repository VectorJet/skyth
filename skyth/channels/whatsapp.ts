import { OutboundMessage } from "@/bus/events";
import { MessageBus } from "@/bus/queue";
import { BaseChannel } from "@/channels/base";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class WhatsAppChannel extends BaseChannel {
  readonly name = "whatsapp";
  private ws?: WebSocket;
  private connected = false;
  private runTask?: Promise<void>;
  private readonly typingTimers = new Map<string, ReturnType<typeof setInterval>>();
  private readonly typingStartedAt = new Map<string, number>();

  constructor(config: any, bus: MessageBus) {
    super(config, bus);
  }

  async start(): Promise<void> {
    if (!this.config.bridge_url) throw new Error("whatsapp bridge_url is required");
    this.running = true;
    this.runTask = this.runLoop();
  }

  async stop(): Promise<void> {
    this.running = false;
    this.connected = false;
    for (const chatId of [...this.typingTimers.keys()]) this.stopTyping(chatId);
    this.ws?.close();
    if (this.runTask) await this.runTask.catch(() => undefined);
  }

  async send(msg: OutboundMessage): Promise<void> {
    if (!this.ws || !this.connected || this.ws.readyState !== WebSocket.OPEN) {
      console.error("[whatsapp] bridge is not connected");
      return;
    }
    this.stopTyping(msg.chatId);
    this.ws.send(JSON.stringify({ type: "send", to: msg.chatId, text: msg.content }));
  }

  private async runLoop(): Promise<void> {
    while (this.running) {
      try {
        await this.connectOnce();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[whatsapp] bridge connection error: ${message}`);
      }
      if (this.running) {
        this.connected = false;
        this.ws = undefined;
        await sleep(5000);
      }
    }
  }

  private async connectOnce(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.config.bridge_url);
      this.ws = ws;
      let settled = false;
      const settle = (fn: () => void): void => {
        if (settled) return;
        settled = true;
        fn();
      };

      ws.addEventListener("open", () => {
        if (this.config.bridge_token) {
          ws.send(JSON.stringify({ type: "auth", token: this.config.bridge_token }));
        }
        this.connected = true;
        console.log("[whatsapp] bridge connected");
      });

      ws.addEventListener("message", (event) => {
        if (!this.running) return;
        void this.handleBridgeMessage(event.data).catch((err) => {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[whatsapp] inbound handling error: ${message}`);
        });
      });

      ws.addEventListener("close", () => settle(resolve));
      ws.addEventListener("error", () => settle(() => reject(new Error("whatsapp websocket error"))));
    });
  }

  private async handleBridgeMessage(raw: string | ArrayBuffer | Blob): Promise<void> {
    const dataText = typeof raw === "string" ? raw : raw instanceof ArrayBuffer ? Buffer.from(raw).toString("utf-8") : await raw.text();
    let data: any;
    try {
      data = JSON.parse(dataText);
    } catch {
      console.error(`[whatsapp] invalid bridge payload: ${dataText.slice(0, 120)}`);
      return;
    }

    const msgType = String(data.type ?? "");
    if (msgType === "status") {
      const status = String(data.status ?? "");
      this.connected = status === "connected";
      console.log(`[whatsapp] status: ${status}`);
      return;
    }
    if (msgType === "qr") {
      console.log("[whatsapp] bridge requires QR authentication");
      return;
    }
    if (msgType === "error") {
      console.error(`[whatsapp] bridge error: ${String(data.error ?? "unknown")}`);
      return;
    }
    if (msgType !== "message") return;

    const pn = String(data.pn ?? "").trim();
    const sender = String(data.sender ?? "").trim();
    let content = String(data.content ?? "").trim();

    const userId = pn || sender;
    const senderId = userId.includes("@") ? userId.split("@")[0] : userId;
    if (!senderId || !sender) return;

    if (content === "[Voice Message]") {
      content = "[Voice Message: Transcription not available for WhatsApp yet]";
    }

    this.startTyping(sender);
    await this.handleMessage(senderId, sender, content, [], {
      message_id: data.id,
      timestamp: data.timestamp,
      is_group: Boolean(data.isGroup),
    });
  }

  private startTyping(chatId: string): void {
    if (!chatId) return;
    this.stopTyping(chatId);
    this.typingStartedAt.set(chatId, Date.now());

    const tick = (): void => {
      const startedAt = this.typingStartedAt.get(chatId) ?? 0;
      // Auto-stop stale indicators so they do not run forever on failed turns.
      if (Date.now() - startedAt > 120_000) {
        this.stopTyping(chatId);
        return;
      }
      this.sendTypingSignal(chatId, "start");
    };

    tick();
    const timer = setInterval(tick, 4_000);
    this.typingTimers.set(chatId, timer);
  }

  private stopTyping(chatId: string): void {
    const timer = this.typingTimers.get(chatId);
    if (timer) clearInterval(timer);
    this.typingTimers.delete(chatId);
    this.typingStartedAt.delete(chatId);
    this.sendTypingSignal(chatId, "stop");
  }

  private sendTypingSignal(chatId: string, action: "start" | "stop"): void {
    if (!this.ws || !this.connected || this.ws.readyState !== WebSocket.OPEN || !chatId) return;
    // Bridge protocol is best-effort: send both typed and generic forms.
    this.ws.send(JSON.stringify({ type: "typing", to: chatId, action }));
    this.ws.send(JSON.stringify({ type: "presence", to: chatId, state: action === "start" ? "composing" : "paused" }));
  }
}
