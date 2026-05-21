import type { ToolDefinition } from "@/gateway/registries/tools/types.ts";
import * as fs from "fs/promises";
import * as path from "path";
import {
	parsePatch,
	deriveNewContentsFromChunks,
} from "@/gateway/builtin/tools/apply_patch/patch.ts";
import type { Hunk } from "@/gateway/builtin/tools/apply_patch/patch.ts";

const DESCRIPTION = `Applies a structured patch (unified diff or file operations) to the codebase.
The patch should be in the "open-source patch format" with markers like *** Begin Patch and *** End Patch.

Supported operations:
- *** Add File: <path>
- *** Delete File: <path>
- *** Update File: <path>
- *** Move to: <new_path> (within Update File)

The tool returns a summary of changed files, insertions, and deletions.
Use dryRun: true to verify the patch without applying it.`;

export const applyPatchTool: ToolDefinition = {
	name: "apply_patch",
	description: DESCRIPTION,
	parameters: [
		{
			name: "patchText",
			description: "The full patch text that describes all changes to be made",
			type: "string",
			required: true,
		},
		{
			name: "dryRun",
			description: "If true, verify the patch without applying changes",
			type: "boolean",
			required: false,
			default: false,
		},
	],
	handler: async (args) => {
		const { patchText, dryRun = false } = args;

		try {
			const { hunks } = parsePatch(patchText);
			if (hunks.length === 0) {
				throw new Error("No hunks found in patch");
			}

			const results: Array<{
				path: string;
				type: string;
				insertions: number;
				deletions: number;
				content?: string;
				movePath?: string;
			}> = [];

			for (const hunk of hunks) {
				const filePath = path.resolve(process.cwd(), hunk.path);

				switch (hunk.type) {
					case "add": {
						const content = hunk.contents || "";
						const lines = content.split("\n").length;
						results.push({
							path: hunk.path,
							type: "add",
							insertions: lines,
							deletions: 0,
							content,
						});
						break;
					}
					case "delete": {
						const originalText = await fs.readFile(filePath, "utf-8");
						const lines = originalText.split("\n").length;
						results.push({
							path: hunk.path,
							type: "delete",
							insertions: 0,
							deletions: lines,
						});
						break;
					}
					case "update": {
						const originalText = await fs.readFile(filePath, "utf-8");
						const { content: newContent } = deriveNewContentsFromChunks(
							hunk.path,
							hunk.chunks || [],
							originalText,
						);

						// Simple line-based diff calculation
						const oldLines = originalText.split("\n");
						const newLines = newContent.split("\n");

						// This is a very rough approximation of insertions/deletions
						// In a real implementation, you'd use a proper diff algorithm
						results.push({
							path: hunk.path,
							type: hunk.move_path ? "move" : "update",
							insertions: Math.max(0, newLines.length - oldLines.length),
							deletions: Math.max(0, oldLines.length - newLines.length),
							content: newContent,
							movePath: hunk.move_path,
						});
						break;
					}
				}
			}

			if (!dryRun) {
				for (const res of results) {
					const fullPath = path.resolve(process.cwd(), res.path);
					if (res.type === "delete") {
						await fs.unlink(fullPath);
					} else if (res.type === "add" || res.type === "update") {
						await fs.mkdir(path.dirname(fullPath), { recursive: true });
						await fs.writeFile(fullPath, res.content!);
					} else if (res.type === "move") {
						const fullMovePath = path.resolve(process.cwd(), res.movePath!);
						await fs.mkdir(path.dirname(fullMovePath), { recursive: true });
						await fs.writeFile(fullMovePath, res.content!);
						await fs.unlink(fullPath);
					}
				}
			}

			const changed = results.map((r) => r.path);
			const totalInsertions = results.reduce((sum, r) => sum + r.insertions, 0);
			const totalDeletions = results.reduce((sum, r) => sum + r.deletions, 0);

			return {
				success: true,
				changed,
				insertions: totalInsertions,
				deletions: totalDeletions,
				dryRun,
				summary: `Applied ${hunks.length} hunks across ${changed.length} files (${totalInsertions} insertions, ${totalDeletions} deletions).`,
			};
		} catch (error: any) {
			throw new Error(`Failed to apply patch: ${error.message}`);
		}
	},
	examples: [
		{
			description: "Apply a patch to update a file",
			arguments: {
				patchText:
					"*** Begin Patch\n*** Update File: src/index.ts\n@@ -1,3 +1,3 @@\n-old line\n+new line\n*** End Patch",
			},
		},
	],
	metadata: {
		category: "edit",
		tags: ["patch", "diff", "apply"],
		version: "1.0.0",
		author: "system",
		ax: {
			summary:
				"Apply structured unified-diff style changes across one or more files.",
			visibility: "always",
			triggerPhrases: [
				"apply a patch",
				"patch files",
				"multi file edit",
				"change several files",
				"unified diff",
			],
			relatedTools: ["read_many", "grep", "edit", "changes_summary"],
			whenNotToUse: [
				"single exact string replacement",
				"reading files only",
				"running tests",
			],
			commonUses: [
				"Multi-file code changes",
				"Add or delete files",
				"Dry-run a patch before applying",
			],
			followUps: ["changes_summary", "bash", "tool_lint"],
			intentExamples: [
				"Patch these TypeScript files",
				"Apply this diff",
				"Make coordinated edits across files",
			],
		},
	},
};
