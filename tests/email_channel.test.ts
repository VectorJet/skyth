import { describe, expect, test } from "bun:test";
import { MessageBus } from "../skyth/bus/queue";
import { EmailChannel } from "../skyth/channels/email";
import { OutboundMessage } from "../skyth/bus/events";
import { Config } from "../skyth/config/schema";

function makeConfig() {
	const cfg = new Config().channels.email;
	cfg.enabled = true;
	cfg.consent_granted = true;
	cfg.imap_host = "imap.example.com";
	cfg.imap_port = 993;
	cfg.imap_username = "bot@example.com";
	cfg.imap_password = "secret";
	cfg.smtp_host = "smtp.example.com";
	cfg.smtp_port = 587;
	cfg.smtp_username = "bot@example.com";
	cfg.smtp_password = "secret";
	cfg.mark_seen = true;
	return cfg;
}

function makeRawEmail(
	fromAddr = "alice@example.com",
	subject = "Hello",
	body = "This is the body.",
): Buffer {
	return Buffer.from(
		[
			`From: <${fromAddr}>`,
			`To: bot@example.com`,
			`Subject: ${subject}`,
			`Message-ID: <m1@example.com>`,
			"",
			body,
		].join("\r\n"),
		"utf-8",
	);
}

describe("email channel", () => {
	test("fetch new messages parses unseen and marks seen", () => {
		const raw = makeRawEmail("alice@example.com", "Invoice", "Please pay");

		class FakeIMAP {
			storeCalls: Array<[Buffer, string, string]> = [];
			login() {
				return ["OK", ["logged in"]];
			}
			select() {
				return ["OK", ["1"]];
			}
			search() {
				return ["OK", ["1"]];
			}
			fetch() {
				return [
					"OK",
					[[Buffer.from("1 (UID 123 BODY[] {200})"), raw], Buffer.from(")")],
				];
			}
			store(id: Buffer, op: string, flags: string) {
				this.storeCalls.push([id, op, flags]);
				return ["OK", [""]];
			}
			logout() {
				return ["BYE", [""]];
			}
		}

		const fake = new FakeIMAP();
		const channel = new EmailChannel(makeConfig(), new MessageBus(), {
			imapFactory: () => fake as any,
			smtpFactory: () => ({ starttls() {}, login() {}, sendMessage() {} }),
		});

		const items = channel.fetchNewMessages();
		expect(items.length).toBe(1);
		expect(items[0].sender).toBe("alice@example.com");
		expect(items[0].subject).toBe("Invoice");
		expect(items[0].content).toContain("Please pay");
		expect(fake.storeCalls).toEqual([[Buffer.from("1"), "+FLAGS", "\\Seen"]]);

		const itemsAgain = channel.fetchNewMessages();
		expect(itemsAgain).toEqual([]);
	});

	test("extract text body falls back to html", () => {
		const html = "<p>Hello<br>world</p>";
		const text = EmailChannel.extractTextBody(html);
		expect(text).toContain("Hello");
		expect(text).toContain("world");
	});

	test("start returns immediately without consent", async () => {
		const cfg = makeConfig();
		cfg.consent_granted = false;
		const channel = new EmailChannel(cfg, new MessageBus(), {
			imapFactory: () =>
				({
					login() {},
					select() {
						return ["OK", [""]];
					},
					search() {
						return ["OK", [""]];
					},
					fetch() {
						return ["OK", []];
					},
					store() {},
					logout() {},
				}) as any,
			smtpFactory: () => ({ starttls() {}, login() {}, sendMessage() {} }),
		});

		await channel.start();
		expect(channel.isRunning).toBeFalse();
	});

	test("send uses smtp and reply subject", async () => {
		const sent: any[] = [];
		const channel = new EmailChannel(makeConfig(), new MessageBus(), {
			imapFactory: () =>
				({
					login() {},
					select() {
						return ["OK", [""]];
					},
					search() {
						return ["OK", [""]];
					},
					fetch() {
						return ["OK", []];
					},
					store() {},
					logout() {},
				}) as any,
			smtpFactory: () => ({
				starttls() {},
				login() {},
				sendMessage(msg: any) {
					sent.push(msg);
				},
			}),
		});

		channel._lastSubjectByChat.set("alice@example.com", "Invoice #42");
		channel._lastMessageIdByChat.set("alice@example.com", "<m1@example.com>");

		const outbound: OutboundMessage = {
			channel: "email",
			chatId: "alice@example.com",
			content: "Acknowledged.",
		};

		await channel.send(outbound);

		expect(sent.length).toBe(1);
		expect(sent[0].subject).toBe("Re: Invoice #42");
		expect(sent[0].to).toBe("alice@example.com");
		expect(sent[0].inReplyTo).toBe("<m1@example.com>");
	});

	test("send skips when auto reply disabled", async () => {
		const sent: any[] = [];
		const cfg = makeConfig();
		cfg.auto_reply_enabled = false;
		const channel = new EmailChannel(cfg, new MessageBus(), {
			imapFactory: () =>
				({
					login() {},
					select() {
						return ["OK", [""]];
					},
					search() {
						return ["OK", [""]];
					},
					fetch() {
						return ["OK", []];
					},
					store() {},
					logout() {},
				}) as any,
			smtpFactory: () => ({
				starttls() {},
				login() {},
				sendMessage(msg: any) {
					sent.push(msg);
				},
			}),
		});

		await channel.send({
			channel: "email",
			chatId: "alice@example.com",
			content: "Should not send.",
		});
		expect(sent).toEqual([]);

		await channel.send({
			channel: "email",
			chatId: "alice@example.com",
			content: "Force send.",
			metadata: { force_send: true },
		});
		expect(sent.length).toBe(1);
	});

	test("send skips when consent not granted", async () => {
		let called = false;
		const cfg = makeConfig();
		cfg.consent_granted = false;
		const channel = new EmailChannel(cfg, new MessageBus(), {
			imapFactory: () =>
				({
					login() {},
					select() {
						return ["OK", [""]];
					},
					search() {
						return ["OK", [""]];
					},
					fetch() {
						return ["OK", []];
					},
					store() {},
					logout() {},
				}) as any,
			smtpFactory: () => ({
				starttls() {},
				login() {},
				sendMessage() {
					called = true;
				},
			}),
		});

		await channel.send({
			channel: "email",
			chatId: "alice@example.com",
			content: "Should not send.",
			metadata: { force_send: true },
		});
		expect(called).toBeFalse();
	});

	test("fetch messages between dates uses since before without mark seen", () => {
		const raw = makeRawEmail("alice@example.com", "Status", "Yesterday update");

		class FakeIMAP {
			searchArgs: any[] | null = null;
			storeCalls: Array<[Buffer, string, string]> = [];
			login() {
				return ["OK", ["logged in"]];
			}
			select() {
				return ["OK", ["1"]];
			}
			search(...args: any[]) {
				this.searchArgs = args;
				return ["OK", ["5"]];
			}
			fetch() {
				return [
					"OK",
					[[Buffer.from("5 (UID 999 BODY[] {200})"), raw], Buffer.from(")")],
				];
			}
			store(id: Buffer, op: string, flags: string) {
				this.storeCalls.push([id, op, flags]);
				return ["OK", [""]];
			}
			logout() {
				return ["BYE", [""]];
			}
		}

		const fake = new FakeIMAP();
		const channel = new EmailChannel(makeConfig(), new MessageBus(), {
			imapFactory: () => fake as any,
			smtpFactory: () => ({ starttls() {}, login() {}, sendMessage() {} }),
		});

		const items = channel.fetchMessagesBetweenDates(
			new Date(Date.UTC(2026, 1, 6)),
			new Date(Date.UTC(2026, 1, 7)),
			10,
		);
		expect(items.length).toBe(1);
		expect(items[0].subject).toBe("Status");
		expect(fake.searchArgs?.slice(1)).toEqual([
			"SINCE",
			"06-Feb-2026",
			"BEFORE",
			"07-Feb-2026",
		]);
		expect(fake.storeCalls).toEqual([]);
	});
});
