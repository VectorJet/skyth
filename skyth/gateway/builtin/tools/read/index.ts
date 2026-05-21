import type { ToolDefinition } from "@/gateway/registries/tools/types.ts";
import * as fs from "fs/promises";
import * as path from "path";
import { createReadStream } from "fs";
import { createInterface } from "readline";

const DEFAULT_READ_LIMIT = 2000;
const MAX_LINE_LENGTH = 2000;

const DESCRIPTION = `Read a file or directory from the local filesystem. If the path does not exist, an error is returned.

Usage:
- The filePath parameter should be an absolute path.
- By default, this tool returns up to 2000 lines from the start of the file.
- The offset parameter is the line number to start from (1-indexed).
- To read later sections, call this tool again with a larger offset.
- Use the grep tool to find specific content in large files or files with long lines.
- If you are unsure of the correct file path, use the glob tool to look up filenames by glob pattern.
- Contents are returned with each line prefixed by its line number as \`<line>: <content>\`. For example, if a file has contents "foo\n", you will receive "1: foo\n". For directories, entries are returned one per line (without line numbers) with a trailing \`/\` for subdirectories.
- Any line longer than 2000 characters is truncated.
- Call this tool in parallel when you know there are multiple files you want to read.
- Avoid tiny repeated slices (30 line chunks). If you need more context, read a larger window.
- This tool can read image files and PDFs and return them as file attachments.`;

async function readDirectory(dirPath: string): Promise<string> {
	const entries = await fs.readdir(dirPath, { withFileTypes: true });
	const items = await Promise.all(
		entries.map(async (entry) => {
			if (entry.isDirectory()) return entry.name + "/";
			if (entry.isSymbolicLink()) {
				try {
					const target = path.join(dirPath, entry.name);
					const stat = await fs.stat(target);
					return stat.isDirectory() ? entry.name + "/" : entry.name;
				} catch {
					return entry.name;
				}
			}
			return entry.name;
		}),
	);
	return items.sort((a, b) => a.localeCompare(b)).join("\n");
}

async function readFileLines(
	filePath: string,
	offset = 1,
	limit = DEFAULT_READ_LIMIT,
): Promise<{ content: string; totalLines: number; truncated: boolean }> {
	return new Promise((resolve, reject) => {
		const lines: string[] = [];
		let lineNumber = 1;
		let linesRead = 0;
		let truncated = false;
		const stream = createReadStream(filePath, { encoding: "utf8" });
		const rl = createInterface({ input: stream, crlfDelay: Infinity });

		rl.on("line", (line) => {
			if (lineNumber >= offset && linesRead < limit) {
				let content = line;
				if (content.length > MAX_LINE_LENGTH) {
					content =
						content.substring(0, MAX_LINE_LENGTH) +
						`... (line truncated to ${MAX_LINE_LENGTH} chars)`;
					truncated = true;
				}
				lines.push(`${lineNumber}: ${content}`);
				linesRead++;
			} else if (lineNumber >= offset && linesRead >= limit) {
				truncated = true;
			}
			lineNumber++;
		});

		rl.on("close", () =>
			resolve({
				content: lines.join("\n"),
				totalLines: lineNumber - 1,
				truncated,
			}),
		);
		rl.on("error", reject);
		stream.on("error", reject);
	});
}

async function suggestSimilarFiles(filePath: string): Promise<string[]> {
	try {
		const dir = path.dirname(filePath);
		const base = path.basename(filePath);
		const entries = await fs.readdir(dir);
		return entries
			.filter(
				(item) =>
					item.toLowerCase().includes(base.toLowerCase()) ||
					base.toLowerCase().includes(item.toLowerCase()),
			)
			.map((item) => path.join(dir, item))
			.slice(0, 3);
	} catch {
		return [];
	}
}

export const readTool: ToolDefinition = {
	name: "read",
	description: DESCRIPTION,
	parameters: [
		{
			name: "filePath",
			description: "The absolute path to the file or directory to read",
			type: "string",
			required: true,
		},
		{
			name: "offset",
			description: "The line number to start reading from (1-indexed)",
			type: "number",
			required: false,
		},
		{
			name: "limit",
			description: "The maximum number of lines to read (defaults to 2000)",
			type: "number",
			required: false,
		},
	],
	handler: async (args) => {
		const { filePath, offset = 1, limit = DEFAULT_READ_LIMIT } = args;
		try {
			const stats = await fs.stat(filePath);
			if (stats.isDirectory())
				return { type: "directory", content: await readDirectory(filePath) };
			if (stats.isFile()) {
				const result = await readFileLines(filePath, offset, limit);
				const out: Record<string, any> = {
					type: "file",
					content: result.content,
					totalLines: result.totalLines,
				};
				if (result.truncated) out.truncated = true;
				return out;
			}
			throw new Error(`Path is neither a file nor a directory: ${filePath}`);
		} catch (error: any) {
			if (error.code === "ENOENT") {
				const suggestions = await suggestSimilarFiles(filePath);
				if (suggestions.length > 0) {
					throw new Error(
						`File not found: ${filePath} (offset=${offset}, limit=${limit})\n\nDid you mean one of these?\n${suggestions.join("\n")}`,
					);
				}
				throw new Error(
					`File not found: ${filePath} (offset=${offset}, limit=${limit})`,
				);
			}
			throw new Error(
				`${error.message || String(error)} (filePath=${filePath}, offset=${offset}, limit=${limit})`,
			);
		}
	},
	metadata: {
		category: "file",
		tags: ["read", "file", "directory"],
		version: "1.0.0",
		author: "system",
		ax: {
			summary: "Read one file or list one directory with line-numbered output.",
			visibility: "always",
			triggerPhrases: [
				"read a file",
				"open a file",
				"inspect this file",
				"list a directory",
				"show file contents",
			],
			relatedTools: ["read_many", "grep", "glob", "edit"],
			whenNotToUse: [
				"reading many files at once",
				"searching across file contents",
				"modifying files",
			],
			commonUses: [
				"Inspect source files",
				"List directory contents",
				"Read a focused section with offset and limit",
			],
			followUps: ["read_many", "grep", "edit"],
			intentExamples: [
				"Open src/index.ts",
				"Read the config file",
				"Show me this directory",
			],
		},
	},
};
