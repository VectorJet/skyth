import type { ToolDefinition } from "@/gateway/registries/tools/types.ts";
import * as fs from "fs/promises";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const DESCRIPTION = `Returns a comprehensive status of the current workspace.
Includes current directory, git branch, dirty files, recent commits, detected ecosystems, and available scripts.
Use this to orient yourself when starting a new task or session.`;

async function getGitStatus(root: string) {
	try {
		const { stdout: branch } = await execAsync(
			"git rev-parse --abbrev-ref HEAD",
			{ cwd: root },
		);
		const { stdout: status } = await execAsync("git status --short", {
			cwd: root,
		});
		const { stdout: recent } = await execAsync("git log -n 3 --oneline", {
			cwd: root,
		});

		return {
			branch: branch.trim(),
			dirtyFiles: status
				.trim()
				.split("\n")
				.filter((l) => l.length > 0),
			recentCommits: recent
				.trim()
				.split("\n")
				.filter((l) => l.length > 0),
		};
	} catch (error) {
		return { branch: undefined, dirtyFiles: [], recentCommits: [] };
	}
}

export const workspaceStatusTool: ToolDefinition = {
	name: "workspace_status",
	description: DESCRIPTION,
	parameters: [],
	handler: async (args) => {
		const root = process.cwd();

		try {
			const entries = await fs.readdir(root);
			const topLevel = new Set(entries);

			const git = await getGitStatus(root);

			const ecosystems: string[] = [];
			if (topLevel.has("package.json")) ecosystems.push("Node.js");
			if (topLevel.has("pyproject.toml") || topLevel.has("requirements.txt"))
				ecosystems.push("Python");
			if (topLevel.has("go.mod")) ecosystems.push("Go");
			if (topLevel.has("Cargo.toml")) ecosystems.push("Rust");

			let packageManager;
			let scripts: string[] = [];
			if (topLevel.has("package.json")) {
				const pkg = JSON.parse(
					await fs.readFile(path.join(root, "package.json"), "utf-8"),
				);
				if (topLevel.has("bun.lock") || topLevel.has("bun.lockb"))
					packageManager = "bun";
				else if (topLevel.has("pnpm-lock.yaml")) packageManager = "pnpm";
				else if (topLevel.has("yarn.lock")) packageManager = "yarn";
				else if (topLevel.has("package-lock.json")) packageManager = "npm";

				if (pkg.scripts) {
					scripts = Object.keys(pkg.scripts);
				}
			}

			return {
				success: true,
				cwd: root,
				git,
				ecosystems,
				packageManager,
				scripts,
				summary: `Currently in ${root} on branch ${git.branch || "unknown"}. Found ${git.dirtyFiles.length} dirty files.`,
			};
		} catch (error: any) {
			throw new Error(`Failed to get workspace status: ${error.message}`);
		}
	},
	examples: [
		{
			description: "Get the current workspace status",
			arguments: {},
		},
	],
	metadata: {
		category: "discovery",
		tags: ["workspace", "status", "git", "env"],
		version: "1.0.0",
		author: "system",
		ax: {
			summary:
				"Report current workspace, git branch, dirty files, ecosystem, and scripts.",
			visibility: "always",
			triggerPhrases: [
				"workspace status",
				"git status",
				"dirty files",
				"current branch",
				"project scripts",
			],
			relatedTools: ["repo_map", "changes_summary", "bash"],
			whenNotToUse: [
				"deep code search",
				"reading file contents",
				"editing files",
			],
			commonUses: [
				"Check clean working tree",
				"See package manager and scripts",
				"Confirm current repo",
			],
			followUps: ["changes_summary", "repo_map", "bash"],
			intentExamples: [
				"Are there uncommitted changes?",
				"What workspace are we in?",
			],
		},
	},
};
