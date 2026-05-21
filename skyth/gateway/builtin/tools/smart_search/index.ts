import type { ToolDefinition } from "@/gateway/registries/tools/types.ts";
import * as fs from "fs/promises";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const DESCRIPTION = `A composite search tool that combines globbing and grepping to find relevant code.
It takes a search query and returns ranked file snippets with context.
Use this for high-level discovery when you know what you are looking for but not where it is.`;

async function search(query: string, root: string, include: string = "*") {
	try {
		// Escape query for grep
		const escapedQuery = query.replace(/[\\^$*.[\]{}()|+?]/g, "\\$&");

		// Use ripgrep if available, otherwise fallback to grep
		let command = `grep -rIl "${escapedQuery}" "${root}" --include="${include}" | head -n 20`;
		try {
			await execAsync("rg --version");
			command = `rg -l "${escapedQuery}" "${root}" -g "${include}" | head -n 20`;
		} catch (e) {}

		const { stdout: filesOutput } = await execAsync(command);
		const files = filesOutput
			.trim()
			.split("\n")
			.filter((f) => f.length > 0);

		const results = [];
		for (const file of files) {
			const { stdout: context } = await execAsync(
				`grep -C 2 -n "${escapedQuery}" "${file}" | head -n 10`,
			);
			results.push({
				file: path.relative(process.cwd(), file),
				matches: context.trim().split("\n"),
			});
		}

		return results;
	} catch (error) {
		return [];
	}
}

export const smartSearchTool: ToolDefinition = {
	name: "smart_search",
	description: DESCRIPTION,
	parameters: [
		{
			name: "query",
			description: "The search term or regex to look for",
			type: "string",
			required: true,
		},
		{
			name: "root",
			description:
				"The directory to search in (defaults to current working directory)",
			type: "string",
			required: false,
		},
		{
			name: "include",
			description: 'Glob pattern for files to include (e.g., "*.ts")',
			type: "string",
			required: false,
			default: "*",
		},
	],
	handler: async (args) => {
		const { query, include = "*" } = args;
		const root = args.root
			? path.resolve(process.cwd(), args.root)
			: process.cwd();

		try {
			const results = await search(query, root, include);

			return {
				count: results.length,
				results,
				summary: `Found matches in ${results.length} files.`,
			};
		} catch (error: any) {
			throw new Error(`Failed to perform smart search: ${error.message}`);
		}
	},
	examples: [
		{
			description: "Search for tool registration logic",
			arguments: {
				query: "registerTool",
				include: "*.ts",
			},
		},
	],
	metadata: {
		category: "search",
		tags: ["search", "grep", "glob", "discovery"],
		version: "1.0.0",
		author: "system",
		ax: {
			summary:
				"Combine filename and content search to find relevant code quickly.",
			visibility: "always",
			triggerPhrases: [
				"smart search",
				"find relevant code",
				"search codebase",
				"locate implementation",
				"where is this implemented",
			],
			relatedTools: ["grep", "glob", "read_many", "repo_map"],
			whenNotToUse: ["known exact file path", "editing files", "running tests"],
			commonUses: [
				"Find code by concept",
				"Locate files and matching lines together",
				"Explore unfamiliar implementations",
			],
			followUps: ["read_many", "grep", "edit"],
			intentExamples: [
				"Find where routing is implemented",
				"Locate tool registry code",
			],
		},
	},
};
