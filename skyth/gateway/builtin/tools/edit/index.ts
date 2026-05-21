import type { ToolDefinition } from "@/gateway/registries/tools/types.ts";
import * as fs from "fs/promises";

const DESCRIPTION = `Performs exact string replacements in files. 

Usage:
- You must use your \`Read\` tool at least once in the conversation before editing. This tool will error if you attempt an edit without reading the file. 
- When editing text from Read tool output, ensure you preserve the exact indentation (tabs/spaces) as it appears AFTER the line number prefix. The line number prefix format is: line number + colon + space (e.g., \`1: \`). Everything after that space is the actual file content to match. Never include any part of the line number prefix in the oldString or newString.
- ALWAYS prefer editing existing files in the codebase. NEVER write new files unless explicitly required.
- Only use emojis if the user explicitly requests it. Avoid adding emojis to files unless asked.
- The edit will FAIL if \`oldString\` is not found in the file with an error "oldString not found in content".
- The edit will FAIL if \`oldString\` is found multiple times in the file with an error "Found multiple matches for oldString. Provide more surrounding lines in oldString to identify the correct match." Either provide a larger string with more surrounding context to make it unique or use \`replaceAll\` to change every instance of \`oldString\`. 
- Use \`replaceAll\` for replacing and renaming strings across the file. This parameter is useful if you want to rename a variable for instance.`;

export const editTool: ToolDefinition = {
	name: "edit",
	description: DESCRIPTION,
	parameters: [
		{
			name: "filePath",
			description: "The absolute path to the file to modify",
			type: "string",
			required: true,
		},
		{
			name: "oldString",
			description: "The text to replace",
			type: "string",
			required: true,
		},
		{
			name: "newString",
			description:
				"The text to replace it with (must be different from oldString)",
			type: "string",
			required: true,
		},
		{
			name: "replaceAll",
			description: "Replace all occurrences of oldString (default false)",
			type: "boolean",
			required: false,
		},
	],
	handler: async (args) => {
		const { filePath, oldString, newString, replaceAll = false } = args;

		if (oldString === newString) {
			throw new Error("oldString and newString must be different");
		}

		try {
			// Read the file
			const content = await fs.readFile(filePath, "utf8");

			// Check if oldString exists
			if (!content.includes(oldString)) {
				throw new Error("oldString not found in content");
			}

			// Count occurrences
			const occurrences = content.split(oldString).length - 1;

			if (occurrences > 1 && !replaceAll) {
				throw new Error(
					`Found multiple matches for oldString (${occurrences} occurrences). Provide more surrounding lines in oldString to identify the correct match, or use replaceAll to change every instance.`,
				);
			}

			// Perform replacement
			let newContent: string;
			if (replaceAll) {
				newContent = content.split(oldString).join(newString);
			} else {
				newContent = content.replace(oldString, newString);
			}

			// Write the file
			await fs.writeFile(filePath, newContent, "utf8");

			// Get file stats
			const stats = await fs.stat(filePath);

			return {
				path: filePath,
				size: stats.size,
				lines: newContent.split("\n").length,
				replacements: replaceAll ? occurrences : 1,
			};
		} catch (error: any) {
			throw new Error(`Failed to edit file: ${error.message}`);
		}
	},
	metadata: {
		category: "file",
		tags: ["edit", "file", "replace"],
		version: "1.0.0",
		author: "system",
		ax: {
			summary: "Make exact string replacements in an existing file.",
			visibility: "always",
			triggerPhrases: [
				"edit a file",
				"replace text",
				"modify existing file",
				"rename in file",
				"small code change",
			],
			relatedTools: ["read", "read_many", "grep", "apply_patch"],
			whenNotToUse: [
				"creating a new file from scratch",
				"large multi-file patch",
				"running commands",
			],
			commonUses: [
				"Small targeted edits",
				"Rename a variable",
				"Fix one block after reading it",
			],
			followUps: ["grep", "changes_summary", "bash"],
			intentExamples: [
				"Replace this block",
				"Change this option",
				"Fix this function in one file",
			],
		},
	},
};
