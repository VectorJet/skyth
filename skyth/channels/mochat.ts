import type { OutboundMessage } from "@/bus/events";
import { MessageBus } from "@/bus/queue";
import { BaseChannel } from "@/channels/base";

const MAX_SEEN = 2000;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function textValue(value: unknown): string {
	if (typeof value === "string") return value;
	if (value === null || value === undefined) return "";
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

function resolveTarget(raw: string): { id: string; isPanel: boolean } {
	const trimmed = (raw || "").trim();
	if (!trimmed) return { id: "", isPanel: false };
	const lower = trimmed.toLowerCase();
	for (const prefix of ["mochat:", "group:", "channel:", "panel:"]) {
		if (lower.startsWith(prefix)) {
			const id = trimmed.slice(prefix.length).trim();
			return {
				id,
				isPanel: prefix !== "mochat:" || !id.startsWith("session_"),
			};
		}
	}
	return { id: trimmed, isPanel: !trimmed.startsWith("session_") };
}

export class MochatChannel extends BaseChannel {
	override readonly name = "mochat";
	private runTask?: Promise<void>;
	private sessionCursor = new Map<string, number>();
	private seenIds: string[] = [];
	private seenSet = new Set<string>();
	private sessionIds = new Set<string>();
	private panelIds = new Set<string>();
	private autoSessions = false;
	private autoPanels = false;
	private lastRefresh = 0;

	constructor(config: any, bus: MessageBus) {
		super(config, bus);
	}

	async start(): Promise<void> {
		if (!this.config.claw_token)
			throw new Error("mochat claw_token is required");

		const sessions = Array.isArray(this.config.sessions)
			? this.config.sessions
					.map((v: unknown) => String(v).trim())
					.filter(Boolean)
			: [];
		const panels = Array.isArray(this.config.panels)
			? this.config.panels.map((v: unknown) => String(v).trim()).filter(Boolean)
			: [];

		this.autoSessions = sessions.includes("*");
		this.autoPanels = panels.includes("*");
		for (const sid of sessions) if (sid !== "*") this.sessionIds.add(sid);
		for (const pid of panels) if (pid !== "*") this.panelIds.add(pid);

		this.running = true;
		await this.refreshTargets();
		this.runTask = this.pollLoop();
	}

	async stop(): Promise<void> {
		this.running = false;
		if (this.runTask) await this.runTask.catch(() => undefined);
	}

	async send(msg: OutboundMessage): Promise<void> {
		const target = resolveTarget(msg.chatId);
		if (!target.id) {
			console.error("[mochat] outbound target is empty");
			return;
		}

		const parts = [
			String(msg.content ?? "").trim(),
			...(msg.media ?? []).map((x) => String(x).trim()).filter(Boolean),
		].filter(Boolean);
		const content = parts.join("\n").trim();
		if (!content) return;

		const isPanel = target.isPanel || this.panelIds.has(target.id);
		const path = isPanel
			? "/api/claw/groups/panels/send"
			: "/api/claw/sessions/send";
		const idKey = isPanel ? "panelId" : "sessionId";

		await this.postJson(path, {
			[idKey]: target.id,
			content,
			quoteMessageId: msg.replyTo,
			groupId: msg.metadata?.group_id,
		});
	}

	private async pollLoop(): Promise<void> {
		while (this.running) {
			try {
				const now = Date.now();
				const refreshMs = Number(this.config.refresh_interval_ms ?? 30000);
				if (now - this.lastRefresh > refreshMs) {
					await this.refreshTargets();
					this.lastRefresh = now;
				}

				for (const sessionId of this.sessionIds) {
					await this.pollSession(sessionId);
				}
				for (const panelId of this.panelIds) {
					await this.pollPanel(panelId);
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.error(`[mochat] poll error: ${message}`);
			}
			const retryMs = Number(this.config.retry_delay_ms ?? 500);
			await sleep(Math.max(100, retryMs));
		}
	}

	private async refreshTargets(): Promise<void> {
		if (this.autoSessions) {
			try {
				const response = await this.postJson("/api/claw/sessions/list", {});
				const sessions = Array.isArray((response as any).sessions)
					? (response as any).sessions
					: [];
				for (const item of sessions) {
					const sessionId = String(item?.sessionId ?? "").trim();
					if (sessionId) this.sessionIds.add(sessionId);
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.error(`[mochat] refresh sessions failed: ${message}`);
			}
		}

		if (this.autoPanels) {
			try {
				const response = await this.postJson("/api/claw/groups/get", {});
				const panels = Array.isArray((response as any).panels)
					? (response as any).panels
					: [];
				for (const item of panels) {
					const panelId = String(item?.id ?? item?.panelId ?? "").trim();
					if (panelId) this.panelIds.add(panelId);
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.error(`[mochat] refresh panels failed: ${message}`);
			}
		}
	}

	private async pollSession(sessionId: string): Promise<void> {
		const payload = await this.postJson("/api/claw/sessions/watch", {
			sessionId,
			cursor: this.sessionCursor.get(sessionId) ?? 0,
			timeoutMs: Number(this.config.watch_timeout_ms ?? 25000),
			limit: Number(this.config.watch_limit ?? 100),
		});

		const parsedCursor = Number(
			(payload as any).parsedCursor ?? (payload as any).cursor ?? 0,
		);
		if (Number.isFinite(parsedCursor) && parsedCursor >= 0) {
			this.sessionCursor.set(sessionId, parsedCursor);
		}

		const events = Array.isArray((payload as any).events)
			? (payload as any).events
			: [];
		for (const event of events) {
			if (event?.type !== "message.add") continue;
			await this.processInboundEvent(sessionId, event, "session");
		}
	}

	private async pollPanel(panelId: string): Promise<void> {
		const payload = await this.postJson("/api/claw/groups/panels/messages", {
			panelId,
			limit: Math.min(100, Math.max(1, Number(this.config.watch_limit ?? 100))),
		});

		const messages = Array.isArray((payload as any).messages)
			? (payload as any).messages
			: [];
		for (const item of messages) {
			const messageId = String(item?.id ?? item?.messageId ?? "").trim();
			if (!messageId) continue;
			const event = {
				type: "message.add",
				payload: {
					messageId,
					author: String(item?.author ?? item?.senderId ?? ""),
					content:
						item?.content ??
						item?.messagePlainContent ??
						item?.messageSnippet ??
						"",
					groupId: String(item?.groupId ?? ""),
					authorInfo: item?.authorInfo ?? {},
				},
				timestamp: item?.createdAt,
			};
			await this.processInboundEvent(panelId, event, "panel");
		}
	}

	private async processInboundEvent(
		targetId: string,
		event: Record<string, any>,
		targetKind: "session" | "panel",
	): Promise<void> {
		const payload = (event.payload ?? {}) as Record<string, any>;
		const messageId = String(payload.messageId ?? payload.id ?? "").trim();
		if (messageId && this.seenSet.has(messageId)) return;

		const author = String(payload.author ?? payload.senderId ?? "").trim();
		const rawBody = textValue(
			payload.content ??
				payload.messagePlainContent ??
				payload.messageSnippet ??
				"",
		).trim();
		if (!author || !rawBody) return;

		const isGroup = targetKind === "panel" || Boolean(payload.groupId);
		const requireMention =
			isGroup && Boolean(this.config.mention?.require_in_groups);
		const agentUserId = String(this.config.agent_user_id ?? "").trim();
		if (
			requireMention &&
			agentUserId &&
			!rawBody.includes(`@${agentUserId}`) &&
			!rawBody.includes(`<@${agentUserId}>`)
		) {
			return;
		}

		if (messageId) this.markSeen(messageId);

		await this.handleMessage(author, targetId, rawBody, [], {
			message_id: messageId || undefined,
			group_id: String(payload.groupId ?? "") || undefined,
			sender_name:
				String(
					payload?.authorInfo?.nickname ?? payload?.authorInfo?.name ?? "",
				) || undefined,
			sender_username: String(payload?.authorInfo?.agentId ?? "") || undefined,
			timestamp: event.timestamp,
		});
	}

	private markSeen(messageId: string): void {
		this.seenSet.add(messageId);
		this.seenIds.push(messageId);
		if (this.seenIds.length > MAX_SEEN) {
			const old = this.seenIds.shift();
			if (old) this.seenSet.delete(old);
		}
	}

	private async postJson(
		path: string,
		payload: Record<string, any>,
	): Promise<Record<string, any>> {
		const baseUrl = String(this.config.base_url ?? "").replace(/\/$/, "");
		const url = `${baseUrl}${path}`;
		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Claw-Token": String(this.config.claw_token),
			},
			body: JSON.stringify(payload),
		});

		const json = await response.json().catch(() => ({}));
		if (!response.ok) {
			throw new Error(
				`http ${response.status}: ${JSON.stringify(json).slice(0, 200)}`,
			);
		}
		return json as Record<string, any>;
	}
}
