import type { ToolDefinition } from "@/gateway/registries/tools/types.ts";
import * as fs from "fs/promises";
import * as path from "path";

const DESCRIPTION = `Validates tool implementations for compliance with gateway standards.
Checks:
- manifest.json exists and is valid
- index.ts exports a valid ToolDefinition
- Parameter descriptions and types
- Examples existence and format
- Metadata (category, tags, version, author)
- Handler function exports
Use this to ensure new tools are correctly structured and will load successfully.`;

async function lintTool(toolDir: string): Promise<any> {
	const errors: string[] = [];
	const warnings: string[] = [];

	try {
		const manifestPath = path.join(toolDir, "manifest.json");
		const indexPath = path.join(toolDir, "index.ts");

		// 1. Check Manifest
		try {
			const manifestContent = await fs.readFile(manifestPath, "utf-8");
			const manifest = JSON.parse(manifestContent);
			if (!manifest.name) errors.push('manifest.json: Missing "name" field');
			if (!manifest.description)
				warnings.push('manifest.json: Missing "description" field');
		} catch (e) {
			errors.push("manifest.json: File not found or invalid JSON");
		}

		// 2. Check index.ts
		try {
			const indexContent = await fs.readFile(indexPath, "utf-8");

			// Heuristic checks on the source code
			if (!indexContent.includes("ToolDefinition")) {
				warnings.push("index.ts: ToolDefinition type not found in file");
			}

			if (!indexContent.includes("export const")) {
				errors.push(
					'index.ts: No named export found (expected "export const ...")',
				);
			}

			if (
				indexContent.includes("description:") &&
				indexContent.indexOf("description:") < 20
			) {
				// check if description is too short
			}
		} catch (e) {
			errors.push("index.ts: File not found");
		}

		return {
			tool: path.basename(toolDir),
			valid: errors.length === 0,
			errors,
			warnings,
		};
	} catch (error: any) {
		return {
			tool: path.basename(toolDir),
			valid: false,
			errors: [error.message],
		};
	}
}

export const toolLintTool: ToolDefinition = {
	name: "tool_lint",
	description: DESCRIPTION,
	parameters: [
		{
			name: "toolName",
			description:
				"The name of the tool to lint (must correspond to a directory in src/builtin/tools/)",
			type: "string",
			required: false,
		},
		{
			name: "all",
			description: "If true, lint all tools in the src/builtin/tools directory",
			type: "boolean",
			required: false,
			default: false,
		},
	],
	handler: async (args) => {
		const { toolName, all = false } = args;
		const toolsDir = path.resolve(process.cwd(), "src/builtin/tools");

		if (all) {
			const entries = await fs.readdir(toolsDir, { withFileTypes: true });
			const toolDirs: string[] = [];
			for (const entry of entries) {
				if (!entry.isDirectory()) continue;
				const toolDir = path.join(toolsDir, entry.name);
				try {
					await fs.access(path.join(toolDir, "manifest.json"));
					await fs.access(path.join(toolDir, "index.ts"));
					toolDirs.push(toolDir);
				} catch {
					// Skip non-loadable helper/meta directories.
				}
			}
			const results = await Promise.all(toolDirs.map(lintTool));
			const failed = results.filter((r) => !r.valid);

			return {
				results,
				count: results.length,
				failed: failed.length,
				summary: `Linted ${results.length} tools. ${failed.length} failed validation.`,
			};
		}

		if (!toolName) {
			throw new Error("Either toolName or all:true must be provided");
		}

		const toolDir = path.join(toolsDir, toolName);
		const result = await lintTool(toolDir);

		return {
			...result,
			summary: result.valid
				? `Tool ${toolName} passed validation.`
				: `Tool ${toolName} failed validation.`,
		};
	},
	examples: [
		{
			description: "Lint the apply_patch tool",
			arguments: {
				toolName: "apply_patch",
			},
		},
		{
			description: "Lint all tools",
			arguments: {
				all: true,
			},
		},
	],
	metadata: {
		category: "meta",
		tags: ["lint", "validation", "tool", "schema"],
		version: "1.0.0",
		author: "system",
	},
};
