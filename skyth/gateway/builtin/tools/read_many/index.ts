import type { ToolDefinition } from "@/gateway/registries/tools/types.ts";
import * as fs from "fs/promises";
import * as path from "path";

const DEFAULT_READ_LIMIT = 500;
const MAX_LINE_LENGTH = 1000;

const DESCRIPTION = `Reads multiple files from the local filesystem in a single call.
Returns a structured JSON array containing the content and metadata for each file.
Use this instead of multiple 'read' calls to reduce latency and context overhead.
Files that cannot be read will include an error message in their entry instead of failing the entire tool call.`;

async function readFile(filePath: string, limit: number): Promise<any> {
	try {
		const absolutePath = path.resolve(process.cwd(), filePath);
		const stats = await fs.stat(absolutePath);

		if (stats.isDirectory()) {
			return { path: filePath, error: "Path is a directory, not a file" };
		}

		const content = await fs.readFile(absolutePath, "utf-8");
		const lines = content.split("\n");
		const totalLines = lines.length;

		const resultLines = lines.slice(0, limit);
		let truncated = totalLines > limit;

		const formattedContent = resultLines
			.map((line, index) => {
				let displayLine = line;
				if (displayLine.length > MAX_LINE_LENGTH) {
					displayLine =
						displayLine.substring(0, MAX_LINE_LENGTH) + "... (line truncated)";
					truncated = true;
				}
				return `${index + 1}: ${displayLine}`;
			})
			.join("\n");

		return {
			path: filePath,
			content: formattedContent,
			totalLines,
			truncated,
		};
	} catch (error: any) {
		return {
			path: filePath,
			error: error.message || String(error),
		};
	}
}

export const readManyTool: ToolDefinition = {
	name: "read_many",
	description: DESCRIPTION,
	parameters: [
		{
			name: "filePaths",
			description: "An array of absolute or relative file paths to read",
			type: "array",
			required: true,
			items: {
				name: "filePath",
				description: "Path to a file",
				type: "string",
				required: true,
			},
		},
		{
			name: "limit",
			description:
				"The maximum number of lines to read per file (defaults to 500)",
			type: "number",
			required: false,
			default: 500,
		},
	],
	handler: async (args) => {
		const { filePaths, limit = DEFAULT_READ_LIMIT } = args;

		if (!Array.isArray(filePaths)) {
			throw new Error("filePaths must be an array");
		}

		const results = await Promise.all(filePaths.map((p) => readFile(p, limit)));

		return {
			files: results,
			count: results.filter((r) => !r.error).length,
			total: filePaths.length,
		};
	},
	examples: [
		{
			description: "Read package.json and tsconfig.json simultaneously",
			arguments: {
				filePaths: ["package.json", "tsconfig.json"],
			},
		},
	],
	metadata: {
		category: "file",
		tags: ["read", "batch", "bulk"],
		version: "1.0.0",
		author: "system",
		ax: {
			summary: "Read several files in one call to reduce tool overhead.",
			visibility: "always",
			triggerPhrases: [
				"read multiple files",
				"read many files",
				"inspect several files",
				"load these files",
				"compare files",
			],
			relatedTools: ["read", "grep", "glob", "edit", "apply_patch"],
			whenNotToUse: [
				"reading one file only",
				"searching unknown filenames",
				"editing files",
			],
			commonUses: [
				"Load related source files",
				"Compare implementations",
				"Gather context before editing",
			],
			followUps: ["edit", "apply_patch", "grep"],
			intentExamples: [
				"Read these three files",
				"Load all relevant modules",
				"Inspect related source files together",
			],
		},
	},
};
