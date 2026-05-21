import type { ToolDefinition } from "@/gateway/registries/tools/types.ts";
import * as fs from "fs/promises";
import * as path from "path";

const DESCRIPTION = `Writes a file to the local filesystem.

Usage:
- This tool will overwrite the existing file if there is one at the provided path.
- If this is an existing file, you MUST use the Read tool first to read the file's contents. This tool will fail if you did not read the file first.
- ALWAYS prefer editing existing files in the codebase. NEVER write new files unless explicitly required.
- NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.
- Only use emojis if the user explicitly requests it. Avoid writing emojis to files unless asked.`;

export const writeTool: ToolDefinition = {
	name: "write",
	description: DESCRIPTION,
	parameters: [
		{
			name: "filePath",
			description:
				"The absolute path to the file to write (must be absolute, not relative)",
			type: "string",
			required: true,
		},
		{
			name: "content",
			description: "The content to write to the file",
			type: "string",
			required: true,
		},
	],
	handler: async (args) => {
		const { filePath, content } = args;

		if (!path.isAbsolute(filePath)) {
			throw new Error("filePath must be an absolute path.");
		}

		try {
			// Ensure the directory exists
			const dir = path.dirname(filePath);
			await fs.mkdir(dir, { recursive: true });

			// Write the file
			await fs.writeFile(filePath, content, "utf8");

			// Get file stats
			const stats = await fs.stat(filePath);

			return {
				path: filePath,
				size: stats.size,
				lines: content.split("\n").length,
			};
		} catch (error: any) {
			throw new Error(`Failed to write file: ${error.message}`);
		}
	},
	metadata: {
		category: "file",
		tags: ["write", "file", "create"],
		version: "1.0.0",
		author: "system",
		ax: {
			summary:
				"Create or overwrite a file when a full replacement is intended.",
			visibility: "suggested",
			triggerPhrases: [
				"write a file",
				"create a file",
				"overwrite file",
				"save content to file",
			],
			relatedTools: ["read", "edit", "apply_patch"],
			whenNotToUse: [
				"small edits to an existing file",
				"patching code after reading",
				"searching files",
			],
			commonUses: [
				"Create new generated files",
				"Write complete file content",
				"Save artifacts in workspace",
			],
			followUps: ["read", "changes_summary"],
			intentExamples: [
				"Create this new config file",
				"Write the complete output to disk",
			],
		},
	},
};
