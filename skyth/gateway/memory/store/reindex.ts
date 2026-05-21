import {
	listMemoryArchiveFiles,
	readArchiveJson,
	readArchiveJsonl,
	DEFAULT_MEMORY_ROOT,
} from "@/gateway/memory/archive.ts";
import type { MemoryStoreContext } from "@/gateway/memory/store/context.ts";
import type { GatewayTurnRecord } from "@/gateway/memory/store/types.ts";
import { claudeConversationsFromExport } from "@/gateway/memory/store/types.ts";
import {
	prepareArchiveReindex,
	rebuildFts,
	checkpointWal,
} from "@/gateway/memory/store/persistence.ts";
import { importClaudeExport } from "@/gateway/memory/store/imports.ts";
import { upsertGatewayTurn } from "@/gateway/memory/store/gateway-turns.ts";

export function reindexArchive(
	ctx: MemoryStoreContext,
	root: string = DEFAULT_MEMORY_ROOT,
): {
	root: string;
	files: number;
	indexedFiles: number;
	skippedFiles: number;
	conversations: number;
	messages: number;
	chunks: number;
	gatewayTurns: number;
} {
	const files = listMemoryArchiveFiles(root);
	let indexedFiles = 0;
	let skippedFiles = 0;
	let conversationCount = 0;
	let messageCount = 0;
	let chunkCount = 0;
	let gatewayTurns = 0;
	const seenConversationIds = new Set<string>();

	const tx = ctx.db.transaction(() => {
		prepareArchiveReindex(ctx);

		for (const file of files) {
			if (file.relativePath.endsWith(".jsonl")) {
				for (const item of readArchiveJsonl(file)) {
					if (!item || typeof item !== "object") continue;
					const record = item as GatewayTurnRecord & { type?: string };
					if (
						record.type === "gateway_turn" ||
						record.userText ||
						record.assistantText
					) {
						const result = upsertGatewayTurn(ctx, {
							channel: String(record.channel ?? "gateway"),
							chatId: String(record.chatId ?? "chat"),
							userText:
								typeof record.userText === "string"
									? record.userText
									: undefined,
							assistantText:
								typeof record.assistantText === "string"
									? record.assistantText
									: undefined,
							userMessageId:
								typeof record.userMessageId === "string"
									? record.userMessageId
									: undefined,
							traceId:
								typeof record.traceId === "string" ? record.traceId : undefined,
							ts: typeof record.ts === "number" ? record.ts : undefined,
							source: file.source,
							archiveRaw: false,
							skipFts: true,
							replaceExisting: false,
						});
						gatewayTurns++;
						messageCount += result.messages;
						chunkCount += result.chunks;
					}
				}
				continue;
			}

			const parsed = readArchiveJson(file);
			const conversations = claudeConversationsFromExport(parsed);
			const freshConversations = conversations.filter((conversation) => {
				const id = `claude:${conversation.uuid}`;
				if (seenConversationIds.has(id)) return false;
				seenConversationIds.add(id);
				return true;
			});
			if (freshConversations.length === 0) {
				skippedFiles++;
				continue;
			}
			const result = importClaudeExport(ctx, freshConversations, file.source, {
				archiveRaw: false,
				skipFts: true,
				replaceExisting: false,
			});
			indexedFiles++;
			conversationCount += result.conversations;
			messageCount += result.messages;
			chunkCount += result.chunks;
		}

		rebuildFts(ctx);
	});
	tx();

	checkpointWal(ctx);

	return {
		root,
		files: files.length,
		indexedFiles,
		skippedFiles,
		conversations: conversationCount,
		messages: messageCount,
		chunks: chunkCount,
		gatewayTurns,
	};
}
