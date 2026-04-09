import { generateSessionId } from "@/utils/helpers";
import type { SessionMessage } from "./types";

export class Session {
	id: string;
	readonly key: string;
	name: string = "";
	messages: SessionMessage[] = [];
	createdAt: Date = new Date();
	updatedAt: Date = new Date();
	metadata: Record<string, any> = {};
	lastConsolidated = 0;

	private _cachedContextSize?: number;
	private _cachedMessageCount?: number;

	constructor(key: string, id?: string) {
		this.id = id ?? generateSessionId();
		this.key = key;
	}

	estimateContextSize(): number {
		if (
			this._cachedContextSize !== undefined &&
			this._cachedMessageCount === this.messages.length
		) {
			return this._cachedContextSize;
		}

		let size = 0;
		for (const msg of this.messages) {
			const content =
				typeof msg.content === "string"
					? msg.content
					: JSON.stringify(msg.content);
			size += content.length;
			if (msg.tool_calls) {
				size += JSON.stringify(msg.tool_calls).length;
			}
		}

		this._cachedContextSize = size;
		this._cachedMessageCount = this.messages.length;
		return size;
	}

	estimateTokenCount(): number {
		return Math.ceil(this.estimateContextSize() / 4);
	}

	addMessage(
		role: string,
		content: string,
		extra: Record<string, any> = {},
	): void {
		this.messages.push({
			role,
			content,
			timestamp: new Date().toISOString(),
			...extra,
		});
		this.updatedAt = new Date();
	}

	getHistory(maxMessages = 500): SessionMessage[] {
		return this.messages.slice(-maxMessages).map((m) => {
			const out: SessionMessage = { role: m.role, content: m.content ?? "" };
			for (const key of ["tool_calls", "tool_call_id", "name"]) {
				if (key in m) out[key] = m[key];
			}
			return out;
		});
	}

	clear(): void {
		this.messages = [];
		this.lastConsolidated = 0;
		this.updatedAt = new Date();
	}
}
