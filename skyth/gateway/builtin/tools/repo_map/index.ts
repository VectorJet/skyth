import type { ToolDefinition } from "@/gateway/registries/tools/types.ts";
import * as fs from "fs/promises";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const DESCRIPTION = `Generates a compressed overview of the codebase architecture.
It identifies entrypoints, dependency files, ecosystems, and returns a directory structure summary.
Use this for orientation in new or large codebases.`;

const IGNORED_DIRS = new Set([
	".git",
	"node_modules",
	"__pycache__",
	".venv",
	"dist",
	"build",
	".next",
	"target",
	"vendor",
]);

const STRUCTURE_LIMIT = 200;

const DEPENDENCY_FILES = [
	"package.json",
	"package-lock.json",
	"bun.lock",
	"bun.lockb",
	"pnpm-lock.yaml",
	"yarn.lock",
	"requirements.txt",
	"pyproject.toml",
	"go.mod",
	"Cargo.toml",
	"Gemfile",
	"build.gradle",
	"build.gradle.kts",
	"pom.xml",
	"composer.json",
];

async function getStructure(
	root: string,
	maxDepth: number,
): Promise<{ lines: string[]; truncated: boolean }> {
	const lines: string[] = [];
	let truncated = false;

	async function visit(dir: string, depth: number) {
		if (depth >= maxDepth || lines.length >= STRUCTURE_LIMIT) {
			if (lines.length >= STRUCTURE_LIMIT) truncated = true;
			return;
		}

		try {
			const entries = await fs.readdir(dir, { withFileTypes: true });
			const sorted = entries
				.filter((e) => !IGNORED_DIRS.has(e.name))
				.sort(
					(a, b) =>
						Number(b.isDirectory()) - Number(a.isDirectory()) ||
						a.name.localeCompare(b.name),
				);

			for (const entry of sorted) {
				if (lines.length >= STRUCTURE_LIMIT) {
					truncated = true;
					return;
				}

				lines.push(
					`${"  ".repeat(depth)}${entry.name}${entry.isDirectory() ? "/" : ""}`,
				);
				if (entry.isDirectory()) {
					await visit(path.join(dir, entry.name), depth + 1);
				}
			}
		} catch (error) {
			// Ignore directory read errors
		}
	}

	await visit(root, 0);
	return { lines, truncated };
}

async function getGitInfo(root: string) {
	try {
		const { stdout: branch } = await execAsync(
			"git rev-parse --abbrev-ref HEAD",
			{ cwd: root },
		);
		const { stdout: head } = await execAsync("git rev-parse HEAD", {
			cwd: root,
		});
		return { branch: branch.trim(), head: head.trim() };
	} catch (error) {
		return { branch: undefined, head: undefined };
	}
}

export const repoMapTool: ToolDefinition = {
	name: "repo_map",
	description: DESCRIPTION,
	parameters: [
		{
			name: "root",
			description:
				"The root directory to inspect (defaults to current working directory)",
			type: "string",
			required: false,
		},
		{
			name: "depth",
			description: "Maximum structure depth to include (defaults to 3)",
			type: "number",
			required: false,
			default: 3,
		},
	],
	handler: async (args) => {
		const root = args.root
			? path.resolve(process.cwd(), args.root)
			: process.cwd();
		const depth = args.depth || 3;

		try {
			const entries = await fs.readdir(root);
			const topLevel = new Set(entries);

			const gitInfo = await getGitInfo(root);
			const { lines, truncated } = await getStructure(root, depth);

			const ecosystems: string[] = [];
			if (topLevel.has("package.json")) ecosystems.push("Node.js");
			if (topLevel.has("pyproject.toml") || topLevel.has("requirements.txt"))
				ecosystems.push("Python");
			if (topLevel.has("go.mod")) ecosystems.push("Go");
			if (topLevel.has("Cargo.toml")) ecosystems.push("Rust");

			const dependencyFiles = DEPENDENCY_FILES.filter((f) => topLevel.has(f));

			let packageManager;
			if (topLevel.has("bun.lock") || topLevel.has("bun.lockb"))
				packageManager = "bun";
			else if (topLevel.has("pnpm-lock.yaml")) packageManager = "pnpm";
			else if (topLevel.has("yarn.lock")) packageManager = "yarn";
			else if (topLevel.has("package-lock.json")) packageManager = "npm";

			return {
				success: true,
				root,
				branch: gitInfo.branch,
				head: gitInfo.head,
				ecosystems,
				packageManager,
				dependencyFiles,
				structure: lines,
				truncated,
				summary: `Analyzed repository at ${root}. Found ${ecosystems.length} ecosystems and ${dependencyFiles.length} dependency files.`,
			};
		} catch (error: any) {
			throw new Error(`Failed to map repository: ${error.message}`);
		}
	},
	examples: [
		{
			description: "Generate a map of the current repository",
			arguments: {
				depth: 2,
			},
		},
	],
	metadata: {
		category: "discovery",
		tags: ["repo", "map", "overview", "structure"],
		version: "1.0.0",
		author: "system",
		ax: {
			summary: "Generate a compact architectural map of a repository.",
			visibility: "always",
			triggerPhrases: [
				"map the repo",
				"understand the codebase",
				"project structure",
				"architecture overview",
				"skim repository",
			],
			relatedTools: ["workspace_status", "glob", "read_many", "smart_search"],
			whenNotToUse: [
				"reading specific known files",
				"searching exact content",
				"editing files",
			],
			commonUses: [
				"Initial project orientation",
				"Identify important folders",
				"Summarize repo structure",
			],
			followUps: ["read_many", "smart_search", "workspace_status"],
			intentExamples: [
				"Get context on this repo",
				"Show me the project layout",
			],
		},
	},
};
