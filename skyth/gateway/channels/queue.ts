/**
 * MessageRouter: serializes user + gateway messages into ordered agent turns.
 *
 *   - userQueue is FIFO, preserving conversational order.
 *   - gatewayStack is LIFO, with tag-based collapsing so newer status pushes
 *     supersede older ones still pending.
 *   - An async lock guarantees only one agent turn drains at a time, so a
 *     user message arriving mid-flight is queued cleanly instead of racing.
 *   - A burst window coalesces 3-in-a-row user messages into a single turn so
 *     the agent sees them as a numbered batch with a `[GATEWAY]` preface.
 *   - Phase 2: every enqueue is mirrored to a SQLite store so a crash mid-
 *     burst still replays after restart.
 */
import type { IncomingMessage } from "@/gateway/channels/types.ts";
import {
	wrapGatewayMessage,
	buildChannelBehaviorHint,
} from "@/gateway/channels/format.ts";
import type { QueueStore } from "@/gateway/workspace/queue-store.ts";
import { getMemoryStore } from "@/gateway/memory/store.ts";
import { getRuntime } from "@/gateway/channels/runtime.ts";
import { envFirst, envNumber } from "@/gateway/config/env.ts";

const BURST_WINDOW_MS = envNumber(
	"SKYTH_GATEWAY_BURST_WINDOW_MS",
	"CLAUDE_GATEWAY_BURST_WINDOW_MS",
	1500,
);

export type AgentTurnInput = {
	/** Text the gateway hands to the agent as the new turn. */
	text: string;
	/** The user messages folded into this turn (in arrival order). */
	userMessages: IncomingMessage[];
	/** Gateway prefaces (already wrapped with `[GATEWAY]`). */
	gatewayPrefaces: string[];
	/** Originating channel info, for behavior alignment. */
	origin: { channel: string; chatId: string };
};

export type ClaudeTurnInput = AgentTurnInput;

type TurnRunner = (input: AgentTurnInput) => Promise<void>;

interface UserItem {
	kind: "user";
	msg: IncomingMessage;
	rowId?: number;
}
interface GatewayItem {
	kind: "gateway";
	body: string;
	tag?: string;
	rowId?: number;
}

function messageDedupeKey(msg: IncomingMessage): string | null {
	if (!msg.messageId) return null;
	return `${msg.channel}:${msg.chatId}:${msg.messageId}`;
}

export class MessageRouter {
	private userQueue: UserItem[] = [];
	private gatewayStack: GatewayItem[] = [];
	private inFlight = false;
	private burstTimer: ReturnType<typeof setTimeout> | null = null;
	private runner: TurnRunner | null = null;
	private lastChannelHint: string | null = null;
	private store: QueueStore | null = null;
	private recentlyProcessedIds = new Set<string>();

	/**
	 * Attach a persistent SQLite store. Replays anything left over from a
	 * prior crash by re-hydrating the in-memory queues from pending rows.
	 */
	attachStore(store: QueueStore) {
		this.store = store;
		const rows = store.claimAll();
		for (const r of rows) {
			const payload = JSON.parse(r.payload);
			if (r.kind === "user") {
				const msg = payload as IncomingMessage;
				const key = messageDedupeKey(msg);
				if (key) this.recentlyProcessedIds.add(key);
				this.userQueue.push({ kind: "user", msg, rowId: r.id });
			} else {
				this.gatewayStack.push({
					kind: "gateway",
					body: payload.body,
					tag: r.tag ?? undefined,
					rowId: r.id,
				});
			}
		}
		// Re-claim leaves rows as 'inflight'; they'll be marked done after drain.
		if (rows.length) this.scheduleDrain();
	}

	/** Set by the gateway: how to actually invoke the agent. */
	setRunner(runner: TurnRunner) {
		this.runner = runner;
	}

	enqueueUser(msg: IncomingMessage) {
		const dedupeKey = messageDedupeKey(msg);
		if (dedupeKey) {
			if (this.recentlyProcessedIds.has(dedupeKey)) {
				console.log(`[router] skipping duplicate message: ${dedupeKey}`);
				return;
			}
			this.recentlyProcessedIds.add(dedupeKey);
			// Prune cache to avoid unbounded growth.
			if (this.recentlyProcessedIds.size > 1000) {
				const first = this.recentlyProcessedIds.values().next().value;
				if (first !== undefined) this.recentlyProcessedIds.delete(first);
			}
		}
		this.store?.pushUser(msg, msg.ts);
		this.userQueue.push({ kind: "user", msg });
		this.scheduleDrain();
	}

	/**
	 * Push a gateway-originated message. If `tag` is given, any pending entry
	 * with the same tag is dropped first (collapse).
	 */
	pushGateway(body: string, tag?: string) {
		if (tag) {
			this.gatewayStack = this.gatewayStack.filter((g) => g.tag !== tag);
		}
		this.store?.pushGateway(body, tag);
		this.gatewayStack.push({ kind: "gateway", body, tag });
		this.scheduleDrain();
	}

	stats() {
		return {
			queuedUser: this.userQueue.length,
			pendingGateway: this.gatewayStack.length,
			inFlight: this.inFlight,
			persisted: this.store?.pendingStats() ?? null,
		};
	}

	private scheduleDrain() {
		// Burst-coalesce window: wait briefly to gather rapid-fire user messages
		// before launching an agent turn. A pending turn always finishes first.
		if (this.burstTimer) clearTimeout(this.burstTimer);
		this.burstTimer = setTimeout(() => {
			this.burstTimer = null;
			void this.drain();
		}, BURST_WINDOW_MS);
	}

	private async drain() {
		if (this.inFlight) {
			// Another drain will be re-scheduled when the in-flight one completes.
			return;
		}
		if (this.userQueue.length === 0 && this.gatewayStack.length === 0) return;
		if (!this.runner) return;

		this.inFlight = true;
		const claimedRows: number[] = [];
		try {
			// Pop everything currently pending. If only gateway items exist with no
			// user, we still send a turn so the agent can react.
			const userItems = this.userQueue.splice(0, this.userQueue.length);
			const gatewayItems = this.gatewayStack.splice(
				0,
				this.gatewayStack.length,
			);

			const ragBlock = await this.buildRagPreface(userItems);
			if (ragBlock) {
				gatewayItems.unshift({ kind: "gateway", body: ragBlock, tag: "rag" });
			}
			this.recordUserMessages(userItems);

			for (const u of userItems) if (u.rowId) claimedRows.push(u.rowId);
			for (const g of gatewayItems) if (g.rowId) claimedRows.push(g.rowId);

			const turn = this.composeTurn(userItems, gatewayItems);
			if (!turn) return;
			try {
				await this.runner(turn);
				this.store?.markDone(claimedRows);
			} catch (err) {
				this.store?.releaseInflight(claimedRows);
				throw err;
			}
		} finally {
			this.inFlight = false;
			// If something arrived while we were busy, drain again.
			if (this.userQueue.length || this.gatewayStack.length) {
				this.scheduleDrain();
			}
		}
	}

	private composeTurn(
		userItems: UserItem[],
		gatewayItems: GatewayItem[],
	): AgentTurnInput | null {
		if (userItems.length === 0 && gatewayItems.length === 0) return null;

		// Tie-break: user before gateway in the same tick (gateway becomes preface).
		const origin = userItems[0]?.msg
			? { channel: userItems[0].msg.channel, chatId: userItems[0].msg.chatId }
			: { channel: "gateway", chatId: "internal" };

		// Pull the live capabilities from the actual channel so the hint matches
		// reality (e.g. Telegram supports reactions + files and caps replies at
		// 4 KB, not the 32 KB default this used to advertise).
		let liveCaps = {
			reactions: false,
			files: false,
			markdown: "full" as string,
			maxTextBytes: 32_000,
		};
		try {
			const ch = getRuntime().channelManager.get(origin.channel);
			if (ch) {
				liveCaps = {
					reactions: ch.capabilities.reactions,
					files: ch.capabilities.files,
					markdown: ch.capabilities.markdown,
					maxTextBytes: ch.capabilities.maxTextBytes,
				};
			}
		} catch {
			/* runtime not initialized in tests; fall back to defaults */
		}
		const channelHint = buildChannelBehaviorHint({
			channel: origin.channel,
			capabilities: liveCaps,
		});

		const prefaces: string[] = [];
		if (channelHint !== this.lastChannelHint) {
			prefaces.push(wrapGatewayMessage(channelHint));
			this.lastChannelHint = channelHint;
		}

		for (const g of gatewayItems) {
			prefaces.push(
				g.body.startsWith("[GATEWAY |") ? g.body : wrapGatewayMessage(g.body),
			);
		}

		let userText = "";
		if (userItems.length === 1) {
			const only = userItems[0]!;
			userText = only.msg.text;
			if (only.msg.channel === "telegram") {
				userText += `\n\n[Telegram | chat_id: ${only.msg.chatId} | msg_id: ${only.msg.messageId}]`;
			}
		} else if (userItems.length > 1) {
			const burst = userItems
				.map((u, i) => {
					let t = `${i + 1}. ${u.msg.text}`;
					if (u.msg.channel === "telegram") {
						t += `\n[Telegram | chat_id: ${u.msg.chatId} | msg_id: ${u.msg.messageId}]`;
					}
					return t;
				})
				.join("\n\n");
			prefaces.push(
				wrapGatewayMessage(
					`User sent ${userItems.length} messages in a row. They are:`,
				),
			);
			userText = burst;
		}

		const text = [...prefaces, userText].filter(Boolean).join("\n\n");
		return {
			text,
			userMessages: userItems.map((u) => u.msg),
			gatewayPrefaces: prefaces,
			origin,
		};
	}

	private async buildRagPreface(userItems: UserItem[]): Promise<string | null> {
		if (envFirst("SKYTH_GATEWAY_RAG_AUTO", "CLAUDE_GATEWAY_RAG_AUTO") === "0") {
			return null;
		}
		if (userItems.length === 0) return null;

		const query = userItems
			.map((item) => item.msg.text)
			.join("\n\n")
			.trim();
		if (query.length < 12) return null;

		try {
			return await getMemoryStore().buildRagHint(
				query,
				envNumber("SKYTH_GATEWAY_RAG_LIMIT", "CLAUDE_GATEWAY_RAG_LIMIT", 4),
			);
		} catch (err) {
			console.warn("[memory] RAG lookup failed:", err);
			return null;
		}
	}

	private recordUserMessages(userItems: UserItem[]): void {
		if (
			envFirst("SKYTH_GATEWAY_MEMORY_RECORD", "CLAUDE_GATEWAY_MEMORY_RECORD") ===
			"0"
		) {
			return;
		}
		try {
			const memory = getMemoryStore();
			for (const item of userItems) {
				memory.upsertGatewayTurn({
					channel: item.msg.channel,
					chatId: item.msg.chatId,
					userText: item.msg.text,
					userMessageId: item.msg.messageId,
					ts: item.msg.ts,
				});
			}
		} catch (err) {
			console.warn("[memory] failed to record user message:", err);
		}
	}
}
