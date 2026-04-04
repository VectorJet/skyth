import type { MessageSendRecord } from "@/base/base_agent/tools/context";

export class HandoffController {
	private hints = new Map<
		string,
		{
			sourceKey: string;
			sourceChannel: string;
			sourceChatId: string;
			expiresAt: number;
		}
	>();

	constructor(private stickyMergeTtlMs: number) {}

	note(records: MessageSendRecord[], emit: (kind: any, scope: string, action: string, summary: string) => void, channelTargets: Map<string, { channel: string; chatId: string }>): void {
		if (!records.length) return;
		const expiresAt = Date.now() + this.stickyMergeTtlMs;
		for (const record of records) {
			const sourceChannel = String(record.sourceChannel ?? "").trim();
			const sourceChatId = String(record.sourceChatId ?? "").trim();
			const targetChannel = String(record.targetChannel ?? "").trim();
			const targetChatId = String(record.targetChatId ?? "").trim();
			if (!sourceChannel || !sourceChatId || !targetChannel || !targetChatId)
				continue;
			if (sourceChannel === targetChannel && sourceChatId === targetChatId)
				continue;

			const sourceKey = `${sourceChannel}:${sourceChatId}`;
			const targetKey = `${targetChannel}:${targetChatId}`;
			this.hints.set(targetKey, {
				sourceKey,
				sourceChannel,
				sourceChatId,
				expiresAt,
			});
			emit("handoff", "session", "queue", `${sourceKey} -> ${targetKey}`);
			channelTargets.set(targetChannel, {
				channel: targetChannel,
				chatId: targetChatId,
			});
		}
	}

	take(targetKey: string, emit: (kind: any, scope: string, action: string, summary: string) => void):
		| {
				sourceKey: string;
				sourceChannel: string;
				sourceChatId: string;
		  }
		| undefined {
		const entry = this.hints.get(targetKey);
		if (!entry) return undefined;
		this.hints.delete(targetKey);
		if (entry.expiresAt <= Date.now()) {
			emit(
				"handoff",
				"session",
				"expire",
				`${entry.sourceKey} -> ${targetKey}`,
			);
			return undefined;
		}
		emit(
			"handoff",
			"session",
			"consume",
			`${entry.sourceKey} -> ${targetKey}`,
		);
		return {
			sourceKey: entry.sourceKey,
			sourceChannel: entry.sourceChannel,
			sourceChatId: entry.sourceChatId,
		};
	}
}
