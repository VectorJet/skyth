/**
 * Watches HEARTBEAT.md for changes to its `## Agent ack` section and pushes
 * a gateway notification into the router whenever the agent updates it. This
 * gives the gateway a back-channel for liveness without polling: the next
 * agent turn (or the operator) sees the new ack as a `[GATEWAY]` preface.
 *
 * The watcher also produces a tiny rolling summary so a long-lived workspace
 * doesn't grow unbounded — older ack lines beyond MAX_ACK_LINES are folded
 * into a `(summary: N earlier acks)` placeholder.
 */
import { watch } from "fs";
import { readFile, writeFile } from "fs/promises";
import type { Workspace } from "@/gateway/workspace/index.ts";
import type { MessageRouter } from "@/gateway/channels/queue.ts";

const MAX_ACK_LINES = 50;
const ACK_HEADINGS = ["## Agent ack", "## Claude ack"];

export class HeartbeatWatcher {
	private fsWatcher: ReturnType<typeof watch> | null = null;
	private lastAck: string = "";
	private debounce: ReturnType<typeof setTimeout> | null = null;

	constructor(
		private workspace: Workspace,
		private router: MessageRouter,
	) {}

	async start() {
		this.lastAck = await this.readAck();
		try {
			this.fsWatcher = watch(this.workspace.heartbeatPath(), () =>
				this.onChange(),
			);
		} catch (err) {
			console.warn("[heartbeat-watcher] failed to watch:", err);
		}
	}

	stop() {
		if (this.debounce) clearTimeout(this.debounce);
		this.fsWatcher?.close();
		this.fsWatcher = null;
	}

	private onChange() {
		if (this.debounce) clearTimeout(this.debounce);
		this.debounce = setTimeout(() => void this.diff(), 200);
	}

	private async readAck(): Promise<string> {
		try {
			const body = await readFile(this.workspace.heartbeatPath(), "utf8");
			const heading = ACK_HEADINGS.find((item) => body.includes(item));
			return heading ? (body.split(heading)[1]?.trim() ?? "") : "";
		} catch {
			return "";
		}
	}

	private async diff() {
		const current = await this.readAck();
		if (current === this.lastAck) return;
		const added = current.startsWith(this.lastAck)
			? current.slice(this.lastAck.length).trim()
			: current;
		this.lastAck = current;
		if (added) {
			this.router.pushGateway(
				`Agent updated HEARTBEAT.md ack:\n${added.slice(0, 1500)}`,
				"heartbeat-ack",
			);
		}
		await this.summarize(current);
	}

	private async summarize(currentAck: string) {
		const lines = currentAck.split("\n").filter(Boolean);
		if (lines.length <= MAX_ACK_LINES) return;
		const keep = lines.slice(-MAX_ACK_LINES);
		const summary = `_(summary: ${lines.length - MAX_ACK_LINES} earlier acks folded)_`;
		try {
			const body = await readFile(this.workspace.heartbeatPath(), "utf8");
			const heading =
				ACK_HEADINGS.find((item) => body.includes(item)) ?? "## Agent ack";
			const head = body.split(heading)[0] ?? "";
			const newBody = `${head}${heading}\n${summary}\n${keep.join("\n")}\n`;
			await writeFile(this.workspace.heartbeatPath(), newBody);
		} catch {}
	}
}
