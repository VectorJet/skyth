import type { ToolDefinition } from "@/gateway/registries/tools/types.ts";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const DESCRIPTION = `Generates a summary of changes in the current workspace compared to a base (default HEAD).
It returns a human-readable list of changed files, insertion/deletion counts, and a high-level summary.
Use this before committing or when you need to understand your current progress relative to the last commit.`;

export const changesSummaryTool: ToolDefinition = {
	name: "changes_summary",
	description: DESCRIPTION,
	parameters: [
		{
			name: "base",
			description:
				"The base commit/branch to compare against (defaults to HEAD)",
			type: "string",
			required: false,
			default: "HEAD",
		},
	],
	handler: async (args) => {
		const { base = "HEAD" } = args;

		try {
			// Get short stats
			const { stdout: diffStat } = await execAsync(`git diff --stat ${base}`);

			// Get list of changed files with more detail
			const { stdout: diffFiles } = await execAsync(
				`git diff --name-status ${base}`,
			);

			const fileSummaries = diffFiles
				.trim()
				.split("\n")
				.filter((l) => l.length > 0)
				.map((line) => {
					const [status, filePath] = line.split(/\s+/);
					let type = "Modified";
					if (status === "A") type = "Added";
					else if (status === "D") type = "Deleted";
					else if (status === "R") type = "Renamed";

					return { path: filePath, status: type };
				});

			// Include untracked files; git diff does not show these.
			const { stdout: statusShort } = await execAsync("git status --short");
			const trackedPaths = new Set(fileSummaries.map((f) => f.path));
			const untracked = statusShort
				.trim()
				.split("\n")
				.filter((line) => line.startsWith("?? "))
				.map((line) => line.slice(3).trim())
				.filter(Boolean)
				.filter((filePath) => !trackedPaths.has(filePath))
				.map((filePath) => ({ path: filePath, status: "Untracked" }));

			const files = [...fileSummaries, ...untracked];
			const summaryLines = diffStat.trim().split("\n").filter(Boolean);
			const overall = summaryLines[summaryLines.length - 1];

			return {
				files,
				stat: diffStat.trim(),
				untracked: untracked.length,
				summary: `Compared to ${base}: ${overall || "No tracked changes."}${untracked.length ? ` ${untracked.length} untracked file(s).` : ""}`,
			};
		} catch (error: any) {
			// Handle the case where there is no git repo or no changes
			if (error.message.includes("not a git repository")) {
				throw new Error("Current workspace is not a git repository");
			}

			return {
				files: [],
				summary: "No changes detected or error running git diff.",
			};
		}
	},
	examples: [
		{
			description: "Summarize changes since the last commit",
			arguments: {
				base: "HEAD",
			},
		},
	],
	metadata: {
		category: "git",
		tags: ["git", "diff", "summary", "changes"],
		version: "1.0.0",
		author: "system",
		ax: {
			summary:
				"Summarize workspace changes compared with git HEAD or another base.",
			visibility: "always",
			triggerPhrases: [
				"summarize changes",
				"what changed",
				"git diff summary",
				"review modifications",
				"changes since head",
			],
			relatedTools: ["workspace_status", "bash", "apply_patch"],
			whenNotToUse: [
				"checking current branch only",
				"editing files",
				"searching code",
			],
			commonUses: [
				"Review edits before committing",
				"Explain dirty files",
				"Validate patch impact",
			],
			followUps: ["bash", "tool_lint"],
			intentExamples: ["Summarize our edits", "What files changed?"],
		},
	},
};
