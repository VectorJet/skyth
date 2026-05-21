import type { ToolDefinition } from "@/gateway/registries/tools/types.ts";
import { getMemoryStore } from "@/gateway/memory/store.ts";

const DESCRIPTION = `Backfill semantic embeddings for Mew conversation memory.

Defaults to provider="auto": Gemini for Gemini models, Modal for Gemma models, then local Gemma as the final fallback.`;

export const memoryEmbedTool: ToolDefinition = {
	name: "memory_embed",
	description: DESCRIPTION,
	parameters: [
		{
			name: "provider",
			description:
				"Embedding provider: auto, gemini, modal, or local. Defaults to auto.",
			type: "string",
			required: false,
		},
		{
			name: "model",
			description:
				"Embedding model. Defaults to google/embeddinggemma-300m unless provider is explicitly gemini.",
			type: "string",
			required: false,
		},
		{
			name: "dim",
			description: "Output dimensions. Defaults to 768.",
			type: "number",
			required: false,
		},
		{
			name: "batchSize",
			description: "Number of chunks per embedding batch. Defaults to 32.",
			type: "number",
			required: false,
		},
		{
			name: "limit",
			description:
				"Maximum chunks to embed in this run. Defaults high enough for full backfill.",
			type: "number",
			required: false,
		},
	],
	handler: async (args) => {
		const memory = getMemoryStore();
		const provider =
			args.provider === "gemini" ||
			args.provider === "modal" ||
			args.provider === "local"
				? args.provider
				: "auto";
		const result = await memory.embedMissingChunks({
			provider,
			model: typeof args.model === "string" ? args.model : undefined,
			dim: typeof args.dim === "number" ? args.dim : undefined,
			batchSize:
				typeof args.batchSize === "number" ? args.batchSize : undefined,
			limit: typeof args.limit === "number" ? args.limit : undefined,
		});
		return { ...result, stats: memory.stats() };
	},
	metadata: {
		category: "memory",
		tags: [
			"memory",
			"rag",
			"embedding",
			"semantic-search",
			"embeddinggemma",
			"modal",
			"gemini",
		],
		version: "1.0.0",
		author: "system",
	},
};
