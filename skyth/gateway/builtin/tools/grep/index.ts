import type { ToolDefinition } from "@/gateway/registries/tools/types.ts";
import { spawn } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";

const MAX_RESULTS = 100;
const MAX_LINE_LENGTH = 2000;

const DESCRIPTION = `- Fast content search tool that works with any codebase size
- Searches file contents using regular expressions
- Supports full regex syntax (eg. "log.*Error", "function\\s+\\w+", etc.)
- Filter files by pattern with the include parameter (eg. "*.js", "*.{ts,tsx}")
- Returns file paths and line numbers with at least one match sorted by modification time
- Use this tool when you need to find files containing specific patterns
- If you need to identify/count the number of matches within files, use the Bash tool with \`rg\` (ripgrep) directly. Do NOT use \`grep\`.
- When you are doing an open-ended search that may require multiple rounds of globbing and grepping, use the Task tool instead`;

interface GrepMatch {
	file: string;
	line: number;
	content: string;
	mtime: number;
}

async function searchWithRipgrep(
	pattern: string,
	searchPath: string,
	include?: string,
): Promise<GrepMatch[]> {
	return new Promise((resolve, reject) => {
		const args = [
			"--json",
			"--line-number",
			"--no-heading",
			"--max-columns",
			MAX_LINE_LENGTH.toString(),
			"--max-count",
			"1", // Only first match per file
		];

		if (include) {
			args.push("--glob", include);
		}

		args.push("--", pattern, searchPath);

		const proc = spawn("rg", args, {
			cwd: searchPath,
		});

		let stdout = "";
		let stderr = "";

		proc.stdout?.on("data", (data) => {
			stdout += data.toString();
		});

		proc.stderr?.on("data", (data) => {
			stderr += data.toString();
		});

		proc.on("error", (error) => {
			// ripgrep not found, fallback to basic grep
			reject(new Error(`ripgrep not available: ${error.message}`));
		});

		proc.on("close", (code) => {
			if (code !== 0 && code !== 1) {
				// code 1 means no matches, which is ok
				reject(new Error(`ripgrep failed: ${stderr}`));
				return;
			}

			const matches: GrepMatch[] = [];
			const lines = stdout.split("\n").filter(Boolean);

			for (const line of lines) {
				try {
					const data = JSON.parse(line);
					if (data.type === "match") {
						matches.push({
							file: data.data.path.text,
							line: data.data.line_number,
							content: data.data.lines.text.trim(),
							mtime: 0, // Will be filled later
						});
					}
				} catch {
					// Skip invalid JSON lines
				}
			}

			resolve(matches);
		});
	});
}

async function addMtimes(matches: GrepMatch[]): Promise<GrepMatch[]> {
	return Promise.all(
		matches.map(async (match) => {
			try {
				const stats = await fs.stat(match.file);
				return { ...match, mtime: stats.mtimeMs };
			} catch {
				return match;
			}
		}),
	);
}

export const grepTool: ToolDefinition = {
	name: "grep",
	description: DESCRIPTION,
	parameters: [
		{
			name: "pattern",
			description: "The regex pattern to search for in file contents",
			type: "string",
			required: true,
		},
		{
			name: "include",
			description:
				'File pattern to include in the search (e.g. "*.js", "*.{ts,tsx}")',
			type: "string",
			required: false,
		},
		{
			name: "path",
			description:
				"The directory to search in. Defaults to the current working directory.",
			type: "string",
			required: false,
		},
	],
	handler: async (args) => {
		const { pattern, include, path: searchPath } = args;
		const cwd = searchPath || process.cwd();

		try {
			let matches = await searchWithRipgrep(pattern, cwd, include);

			// Add modification times
			matches = await addMtimes(matches);

			// Sort by modification time (newest first)
			matches.sort((a, b) => b.mtime - a.mtime);

			// Limit results
			const limitedMatches = matches.slice(0, MAX_RESULTS);

			// Group by file
			const fileMap = new Map<string, GrepMatch[]>();
			for (const match of limitedMatches) {
				if (!fileMap.has(match.file)) {
					fileMap.set(match.file, []);
				}
				fileMap.get(match.file)!.push(match);
			}

			const out: Record<string, any> = {
				count: matches.length,
				files: Array.from(fileMap.entries()).map(([file, fileMatches]) => ({
					file,
					matches: fileMatches.map((m) => ({
						line: m.line,
						content: m.content,
					})),
				})),
			};
			if (matches.length > MAX_RESULTS) {
				out.returned = limitedMatches.length;
				out.truncated = true;
			}
			return out;
		} catch (error: any) {
			throw new Error(`Grep search failed: ${error.message}`);
		}
	},
	metadata: {
		category: "search",
		tags: ["grep", "search", "regex", "content"],
		version: "1.0.0",
		author: "system",
		ax: {
			summary: "Search file contents with regular expressions.",
			visibility: "always",
			triggerPhrases: [
				"search file contents",
				"grep for text",
				"find references",
				"find usages",
				"regex search",
			],
			relatedTools: ["glob", "read", "read_many", "smart_search"],
			whenNotToUse: [
				"finding files by filename only",
				"reading known files directly",
				"web search",
			],
			commonUses: [
				"Find symbol references",
				"Locate config keys",
				"Search for TODOs or errors",
			],
			followUps: ["read", "read_many", "edit"],
			intentExamples: [
				"Find all usages of this function",
				"Search for a string in the repo",
			],
		},
	},
};
