import type { OutboundMessage } from "@/bus/events";
import { Tool } from "@/base/base_agent/tools/base";

type SendCallback = (msg: OutboundMessage) => Promise<void>;

export interface MessageToolSendRecord {
  sourceChannel: string;
  sourceChatId: string;
  targetChannel: string;
  targetChatId: string;
}

export class MessageTool extends Tool {
  private sendCallback?: SendCallback;
  private defaultChannel = "";
  private defaultChatId = "";
  private defaultMessageId?: string;
  private sentInTurn = false;
  private sentRecords: MessageToolSendRecord[] = [];

  constructor(sendCallback?: SendCallback, defaultChannel = "", defaultChatId = "", defaultMessageId?: string) {
    super();
    this.sendCallback = sendCallback;
    this.defaultChannel = defaultChannel;
    this.defaultChatId = defaultChatId;
    this.defaultMessageId = defaultMessageId;
  }

  get name(): string {
    return "message";
  }

  get description(): string {
    return "Send a message to the user through the active channel or a provided channel/chat.";
  }

  get parameters(): Record<string, any> {
    return {
      type: "object",
      properties: {
        content: { type: "string", description: "Message content to send" },
        channel: { type: "string", description: "Optional target channel" },
        chat_id: { type: "string", description: "Optional target chat ID" },
        message_id: { type: "string", description: "Optional source message ID" },
        media: { type: "array", items: { type: "string" }, description: "Optional media paths" },
      },
      required: ["content"],
    };
  }

  setContext(channel: string, chatId: string, messageId?: string): void {
    this.defaultChannel = channel;
    this.defaultChatId = chatId;
    this.defaultMessageId = messageId;
  }

  setSendCallback(callback: SendCallback): void {
    this.sendCallback = callback;
  }

  startTurn(): void {
    this.sentInTurn = false;
    this.sentRecords = [];
  }

  get hasSentInTurn(): boolean {
    return this.sentInTurn;
  }

  consumeTurnSendRecords(): MessageToolSendRecord[] {
    const records = [...this.sentRecords];
    this.sentRecords = [];
    return records;
  }

  async execute(params: Record<string, any>): Promise<string> {
    const sourceChannel = String(this.defaultChannel ?? "");
    const sourceChatId = String(this.defaultChatId ?? "");
    const content = String(params.content ?? "");
    const channel = String(params.channel ?? this.defaultChannel ?? "");
    const chatId = String(params.chat_id ?? this.defaultChatId ?? "");
    const messageId = String(params.message_id ?? this.defaultMessageId ?? "");
    const media = Array.isArray(params.media) ? params.media.map((item: unknown) => String(item)) : [];

    if (!channel || !chatId) return "Error: No target channel/chat specified";
    if (!this.sendCallback) return "Error: Message sending not configured";

    try {
      await this.sendCallback({
        channel,
        chatId,
        content,
        media,
        metadata: {
          message_id: messageId || undefined,
        },
      });
      this.sentInTurn = true;
      this.sentRecords.push({
        sourceChannel,
        sourceChatId,
        targetChannel: channel,
        targetChatId: chatId,
      });
      return `Message sent to ${channel}:${chatId}`;
    } catch (error) {
      return `Error sending message: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
