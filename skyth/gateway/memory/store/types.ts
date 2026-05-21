export type Sender = "human" | "assistant" | "system" | string;

export interface ClaudeExportConversation {
	uuid?: string;
	name?: string;
	summary?: string;
	created_at?: string;
	updated_at?: string;
	account?: { uuid?: string };
	current_leaf_message_uuid?: string;
	chat_messages?: ClaudeExportMessage[];
	model?: string | null;
}

export interface ClaudeExportMessage {
	uuid?: string;
	sender?: Sender;
	text?: string;
	content?: Array<{ type?: string; text?: string; [key: string]: unknown }>;
	created_at?: string;
	updated_at?: string;
	attachments?: unknown[];
	files?: unknown[];
	parent_message_uuid?: string | null;
}

export function isClaudeConversation(
	value: unknown,
): value is ClaudeExportConversation {
	return !!(
		value &&
		typeof value === "object" &&
		typeof (value as ClaudeExportConversation).uuid === "string" &&
		Array.isArray((value as ClaudeExportConversation).chat_messages)
	);
}

export function claudeConversationsFromExport(
	input: unknown,
): ClaudeExportConversation[] {
	const value =
		input &&
		typeof input === "object" &&
		Array.isArray((input as { conversations?: unknown }).conversations)
			? (input as { conversations: unknown[] }).conversations
			: Array.isArray(input)
				? input
				: [input];

	return value.filter(isClaudeConversation);
}

export interface GatewayTurnRecord {
	channel: string;
	chatId: string;
	userText?: string;
	assistantText?: string;
	userMessageId?: string;
	traceId?: string;
	ts?: number;
	source?: string;
	archiveRaw?: boolean;
	skipFts?: boolean;
	replaceExisting?: boolean;
}

export interface MemorySearchHit {
	chunkId: string;
	conversationId: string;
	threadId: string;
	messageId: string;
	provider: string;
	title: string;
	sender: string;
	createdAt: string | null;
	rank: number;
	score: number;
	text: string;
	snippet: string;
}

export interface ClaudeSessionMetadata {
	uuid?: string;
	name?: string;
	summary?: string;
	model?: string | null;
	created_at?: string;
	updated_at?: string;
}

export interface SessionSearchHit {
	threadId: string;
	conversationId: string;
	title: string;
	summary: string;
	model: string | null;
	createdAt: string | null;
	updatedAt: string | null;
	messageCount: number;
	chunkCount: number;
	score: number;
	matchReason: string;
}

export interface ThreadMessageView {
	index: number;
	messageId: string;
	externalUuid: string;
	sender: string;
	createdAt: string | null;
	updatedAt: string | null;
	text: string;
}

export interface ThreadReadResult {
	threadId: string;
	conversationId: string;
	title: string;
	summary: string;
	createdAt: string | null;
	updatedAt: string | null;
	totalMessages: number;
	returnedMessages: number;
	range: { start: number; end: number };
	messages: ThreadMessageView[];
}

export interface ThreadSearchHit {
	chunkId: string;
	messageId: string;
	messageIndex: number | null;
	sender: string;
	createdAt: string | null;
	score: number;
	text: string;
	snippet: string;
}

export interface ThreadHandoffResult {
	handoffId: string;
	threadId: string;
	conversationId: string;
	path: string;
	chars: number;
}

export interface EmbedMemoryOptions {
	provider?: EmbeddingProvider;
	model?: string;
	dim?: number;
	batchSize?: number;
	limit?: number;
}

export interface EmbedMemoryResult {
	provider: string;
	model: string;
	dim: number;
	scanned: number;
	embedded: number;
	skipped: number;
}

export interface EmbeddingSearchConfig {
	provider: EmbeddingProvider;
	model: string;
	dim: number;
	count: number;
}

export type EmbeddingProvider = "auto" | "gemini" | "modal" | "local";
export type ConcreteEmbeddingProvider = Exclude<EmbeddingProvider, "auto">;
