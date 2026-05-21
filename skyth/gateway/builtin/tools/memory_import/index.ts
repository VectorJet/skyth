import type { ToolDefinition } from "@/gateway/registries/tools/types.ts";
import { getMemoryStore } from "@/gateway/memory/store.ts";
import { memoryRootFromFilePath } from "@/gateway/memory/archive.ts";

const DESCRIPTION = `Import Claude conversation export JSON into Mew's local memory store.

Accepts either a path to a JSON file or an inline Claude conversation/export JSON value.
Use mode="reindex" after manually replacing MEMORY/raw/claude/conversations.json.`;

export const memoryImportTool: ToolDefinition = {
	name: "memory_import",
	description: DESCRIPTION,
	parameters: [
		{
			name: "filePath",
			description:
				"Path to a Claude export JSON file. Can be conversations.json or one conversation JSON.",
			type: "string",
			required: false,
		},
		{
			name: "json",
			description: "Inline Claude export JSON object or array",
			type: "object",
			required: false,
		},
		{
			name: "source",
			description: "Source label for imported data; defaults to claude_export",
			type: "string",
			required: false,
		},
		{
			name: "mode",
			description:
				"import or reindex. reindex rebuilds from workspace MEMORY/raw JSON/JSONL files.",
			type: "string",
			required: false,
		},
	],
	handler: async (args) => {
		const memory = getMemoryStore();
		const source =
			typeof args.source === "string" ? args.source : "claude_export";

		if (args.mode === "reindex") {
			const root =
				typeof args.filePath === "string" && args.filePath.trim()
					? memoryRootFromFilePath(args.filePath)
					: undefined;
			const result = memory.reindexArchive(root);
			return { ...result, stats: memory.stats() };
		}

		if (typeof args.filePath === "string" && args.filePath.trim()) {
			const result = await memory.importClaudeExportFile(args.filePath, source);
			return { ...result, stats: memory.stats() };
		}

		if (args.json && typeof args.json === "object") {
			const result = memory.importClaudeExport(args.json, source);
			return { ...result, stats: memory.stats() };
		}

		throw new Error("Provide either filePath or json.");
	},
	metadata: {
		category: "memory",
		tags: ["memory", "rag", "import", "claude-export"],
		version: "1.0.0",
		author: "system",
	},
};
