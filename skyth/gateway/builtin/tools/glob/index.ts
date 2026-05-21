import type { ToolDefinition } from "@/gateway/registries/tools/types.ts";
import { glob as nodeGlob } from "glob";
import * as fs from "fs/promises";
import * as path from "path";

const MAX_RESULTS = 100;

const DESCRIPTION = `- Fast file pattern matching tool that works with any codebase size
- Supports glob patterns like "**/*.js" or "src/**/*.ts"
- Returns matching file paths sorted by modification time
- Use this tool when you need to find files by name patterns
- When you are doing an open-ended search that may require multiple rounds of globbing and grepping, use the Task tool instead
- You have the capability to call multiple tools in a single response. It is always better to speculatively perform multiple searches as a batch that are potentially useful.`;

interface FileWithMtime {
	path: string;
	mtime: number;
}

async function getFilesWithMtime(files: string[]): Promise<FileWithMtime[]> {
	const results = await Promise.all(
		files.map(async (file) => {
			try {
				const stats = await fs.stat(file);
				return { path: file, mtime: stats.mtimeMs };
			} catch {
				return { path: file, mtime: 0 };
			}
		}),
	);
	return results;
}

export const globTool: ToolDefinition = {
	name: "glob",
	description: DESCRIPTION,
	parameters: [
		{
			name: "pattern",
			description: "The glob pattern to match files against",
			type: "string",
			required: true,
		},
		{
			name: "path",
			description:
				'The directory to search in. If not specified, the current working directory will be used. IMPORTANT: Omit this field to use the default directory. DO NOT enter "undefined" or "null" - simply omit it for the default behavior. Must be a valid directory path if provided.',
			type: "string",
			required: false,
		},
	],
	handler: async (args) => {
		const { pattern, path: searchPath } = args;
		const cwd = searchPath || process.cwd();

		try {
			// Use glob to find matching files
			const files = await nodeGlob(pattern, {
				cwd,
				absolute: true,
				nodir: true,
				dot: true,
				ignore: ["**/node_modules/**", "**/.git/**"],
			});

			// Get modification times and sort
			const filesWithMtime = await getFilesWithMtime(files);
			filesWithMtime.sort((a, b) => b.mtime - a.mtime);

			// Limit results
			const limitedFiles = filesWithMtime.slice(0, MAX_RESULTS);

			const out: Record<string, any> = {
				count: files.length,
				files: limitedFiles.map((f) => f.path),
			};
			if (files.length > MAX_RESULTS) {
				out.returned = limitedFiles.length;
				out.truncated = true;
			}
			return out;
		} catch (error: any) {
			throw new Error(`Glob search failed: ${error.message}`);
		}
	},
	metadata: {
		category: "search",
		tags: ["glob", "search", "files", "pattern"],
		version: "1.0.0",
		author: "system",
		ax: {
			summary: "Find files by path or filename glob pattern.",
			visibility: "always",
			triggerPhrases: [
				"find files",
				"list matching files",
				"glob files",
				"locate filenames",
				"show paths",
			],
			relatedTools: ["grep", "read", "read_many", "smart_search"],
			whenNotToUse: [
				"searching inside file contents",
				"reading a known file path",
				"editing files",
			],
			commonUses: [
				"Find TypeScript files",
				"Locate configs",
				"List files under a directory",
			],
			followUps: ["read_many", "read", "grep"],
			intentExamples: ["Find all index.ts files", "Show matching test files"],
		},
	},
};
