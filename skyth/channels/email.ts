import { OutboundMessage } from "@/bus/events";
import { MessageBus } from "@/bus/queue";
import { EmailConfig } from "@/config/schema";
import { BaseChannel } from "@/channels/base";

interface IMAPClient {
  login(user: string, pass: string): any;
  select(mailbox: string): any;
  search(...args: any[]): [string, any[]];
  fetch(id: Buffer, parts: string): [string, any[]];
  store(id: Buffer, op: string, flags: string): any;
  logout(): any;
}

interface SMTPClient {
  starttls(context?: any): any;
  login(user: string, pass: string): any;
  sendMessage(msg: Record<string, any>): any;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export class EmailChannel extends BaseChannel {
  readonly name = "email";
  private readonly emailConfig: EmailConfig;
  private readonly lastSubjectByChat = new Map<string, string>();
  private readonly lastMessageIdByChat = new Map<string, string>();
  private processedUids = new Set<string>();
  private readonly maxProcessedUids = 100000;
  private readonly imapFactory: (host: string, port: number, useSSL: boolean) => IMAPClient;
  private readonly smtpFactory: (host: string, port: number, timeout?: number) => SMTPClient;

  constructor(config: EmailConfig, bus: MessageBus, deps?: {
    imapFactory?: (host: string, port: number, useSSL: boolean) => IMAPClient;
    smtpFactory?: (host: string, port: number, timeout?: number) => SMTPClient;
  }) {
    super(config, bus);
    this.emailConfig = config;
    this.imapFactory = deps?.imapFactory ?? (() => { throw new Error("IMAP factory not configured"); });
    this.smtpFactory = deps?.smtpFactory ?? (() => { throw new Error("SMTP factory not configured"); });
  }

  async start(): Promise<void> {
    if (!this.emailConfig.consent_granted) return;
    if (!this.validateConfig()) return;
    this.running = true;
  }

  async stop(): Promise<void> {
    this.running = false;
  }

  async send(msg: OutboundMessage): Promise<void> {
    if (!this.emailConfig.consent_granted) return;
    const forceSend = Boolean(msg.metadata?.force_send);
    if (!this.emailConfig.auto_reply_enabled && !forceSend) return;
    if (!this.emailConfig.smtp_host) return;

    const toAddr = msg.chatId.trim();
    if (!toAddr) return;

    let subject = this.replySubject(this.lastSubjectByChat.get(toAddr) ?? "skyth reply");
    const override = msg.metadata?.subject;
    if (typeof override === "string" && override.trim()) subject = override.trim();

    const email = {
      from: this.emailConfig.from_address || this.emailConfig.smtp_username || this.emailConfig.imap_username,
      to: toAddr,
      subject,
      text: msg.content || "",
      inReplyTo: this.lastMessageIdByChat.get(toAddr),
    };

    const smtp = this.smtpFactory(this.emailConfig.smtp_host, this.emailConfig.smtp_port, 30);
    if (this.emailConfig.smtp_use_tls) smtp.starttls({});
    smtp.login(this.emailConfig.smtp_username, this.emailConfig.smtp_password);
    smtp.sendMessage(email);
  }

  validateConfig(): boolean {
    const missing: string[] = [];
    if (!this.emailConfig.imap_host) missing.push("imap_host");
    if (!this.emailConfig.imap_username) missing.push("imap_username");
    if (!this.emailConfig.imap_password) missing.push("imap_password");
    if (!this.emailConfig.smtp_host) missing.push("smtp_host");
    if (!this.emailConfig.smtp_username) missing.push("smtp_username");
    if (!this.emailConfig.smtp_password) missing.push("smtp_password");
    return missing.length === 0;
  }

  fetchNewMessages(): Array<Record<string, any>> {
    return this.fetchMessages({ searchCriteria: ["UNSEEN"], markSeen: this.emailConfig.mark_seen, dedupe: true, limit: 0 });
  }

  fetchMessagesBetweenDates(startDate: Date, endDate: Date, limit = 20): Array<Record<string, any>> {
    if (endDate <= startDate) return [];
    return this.fetchMessages({
      searchCriteria: ["SINCE", this.formatImapDate(startDate), "BEFORE", this.formatImapDate(endDate)],
      markSeen: false,
      dedupe: false,
      limit: Math.max(1, limit),
    });
  }

  private fetchMessages(params: { searchCriteria: string[]; markSeen: boolean; dedupe: boolean; limit: number }): Array<Record<string, any>> {
    const messages: Array<Record<string, any>> = [];
    const client = this.imapFactory(this.emailConfig.imap_host, this.emailConfig.imap_port, this.emailConfig.imap_use_ssl);

    try {
      client.login(this.emailConfig.imap_username, this.emailConfig.imap_password);
      const [selectStatus] = client.select(this.emailConfig.imap_mailbox || "INBOX");
      if (selectStatus !== "OK") return messages;

      const [searchStatus, data] = client.search(null, ...params.searchCriteria as any);
      if (searchStatus !== "OK" || !data?.length) return messages;

      let ids: Buffer[] = String(data[0]).split(" ").filter(Boolean).map((v) => Buffer.from(v));
      if (params.limit > 0 && ids.length > params.limit) ids = ids.slice(-params.limit);

      for (const imapId of ids) {
        const [fetchStatus, fetched] = client.fetch(imapId, "(BODY.PEEK[] UID)");
        if (fetchStatus !== "OK" || !fetched?.length) continue;

        const raw = this.extractMessageBytes(fetched);
        if (!raw) continue;
        const uid = this.extractUid(fetched);
        if (params.dedupe && uid && this.processedUids.has(uid)) continue;

        const parsed = this.parseRawEmail(raw);
        const sender = parsed.from.toLowerCase().trim();
        if (!sender) continue;

        const subject = parsed.subject;
        const dateValue = parsed.date;
        const messageId = parsed.messageId;
        const body = (parsed.body || "(empty email body)").slice(0, this.emailConfig.max_body_chars);
        const content = `Email received.\nFrom: ${sender}\nSubject: ${subject}\nDate: ${dateValue}\n\n${body}`;

        this.lastSubjectByChat.set(sender, subject);
        if (messageId) this.lastMessageIdByChat.set(sender, messageId);

        messages.push({
          sender,
          subject,
          message_id: messageId,
          content,
          metadata: { message_id: messageId, subject, date: dateValue, sender_email: sender, uid },
        });

        if (params.dedupe && uid) {
          this.processedUids.add(uid);
          if (this.processedUids.size > this.maxProcessedUids) {
            this.processedUids = new Set([...this.processedUids].slice(Math.floor(this.processedUids.size / 2)));
          }
        }

        if (params.markSeen) client.store(imapId, "+FLAGS", "\\Seen");
      }
    } finally {
      try { client.logout(); } catch {}
    }

    return messages;
  }

  private formatImapDate(value: Date): string {
    return `${String(value.getUTCDate()).padStart(2, "0")}-${MONTHS[value.getUTCMonth()]}-${value.getUTCFullYear()}`;
  }

  private extractMessageBytes(fetched: any[]): Buffer | undefined {
    for (const item of fetched) {
      if (Array.isArray(item) && item.length >= 2 && Buffer.isBuffer(item[1])) return item[1];
      if (item && typeof item === "object" && Buffer.isBuffer(item[1])) return item[1];
    }
    return undefined;
  }

  private extractUid(fetched: any[]): string {
    for (const item of fetched) {
      const head = Buffer.isBuffer(item?.[0]) ? String(item[0]) : "";
      const match = /UID\s+(\d+)/.exec(head);
      if (match) return match[1];
    }
    return "";
  }

  private parseRawEmail(raw: Buffer): { from: string; subject: string; date: string; messageId: string; body: string } {
    const text = raw.toString("utf-8");
    const [headerText, ...bodyParts] = text.split(/\r?\n\r?\n/);
    const body = bodyParts.join("\n\n").trim();
    const headers = new Map<string, string>();
    for (const line of headerText.split(/\r?\n/)) {
      const idx = line.indexOf(":");
      if (idx <= 0) continue;
      headers.set(line.slice(0, idx).toLowerCase(), line.slice(idx + 1).trim());
    }
    const fromHeader = headers.get("from") ?? "";
    const fromMatch = /<([^>]+)>/.exec(fromHeader);
    return {
      from: fromMatch?.[1] ?? fromHeader,
      subject: headers.get("subject") ?? "",
      date: headers.get("date") ?? "",
      messageId: headers.get("message-id") ?? "",
      body: this.extractTextBody(text),
    };
  }

  static htmlToText(rawHtml: string): string {
    return rawHtml
      .replace(/<\s*br\s*\/?>/gi, "\n")
      .replace(/<\s*\/\s*p\s*>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
  }

  static extractTextBody(rawOrParsed: string): string {
    if (/<html|<p|<br/i.test(rawOrParsed)) return EmailChannel.htmlToText(rawOrParsed).trim();
    return rawOrParsed.trim();
  }

  private extractTextBody(raw: string): string {
    const parts = raw.split(/\r?\n\r?\n/);
    if (parts.length <= 1) return "";
    const body = parts.slice(1).join("\n\n");
    return EmailChannel.extractTextBody(body);
  }

  private replySubject(base: string): string {
    const subject = base.trim() || "skyth reply";
    const prefix = this.emailConfig.subject_prefix || "Re: ";
    if (subject.toLowerCase().startsWith("re:")) return subject;
    return `${prefix}${subject}`;
  }

  // test hooks
  get _lastSubjectByChat(): Map<string, string> {
    return this.lastSubjectByChat;
  }

  get _lastMessageIdByChat(): Map<string, string> {
    return this.lastMessageIdByChat;
  }
}
