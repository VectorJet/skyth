import type { ToolDefinition } from "@/gateway/registries/tools/types.ts";
import * as fs from "fs/promises";
import * as path from "path";

const DESCRIPTION = `Fetches project-specific recipes, guidelines, or troubleshooting steps for various tasks.
Use this to understand standard procedures in the current workspace, such as how to run tests, deploy, or handle specific common errors.
Runbooks are stored as markdown files in .gemini/runbooks/`;

async function getRunbook(name: string): Promise<string> {
	const runbookPath = path.join(
		process.cwd(),
		".gemini",
		"runbooks",
		`${name}.md`,
	);
	try {
		return await fs.readFile(runbookPath, "utf-8");
	} catch (error) {
		throw new Error(`Runbook "${name}" not found in .gemini/runbooks/`);
	}
}

export const runbookTool: ToolDefinition = {
	name: "runbook",
	description: DESCRIPTION,
	parameters: [
		{
			name: "name",
			description:
				'The name of the runbook to fetch (e.g., "testing", "onboarding")',
			type: "string",
			required: false,
		},
		{
			name: "list",
			description: "If true, list all available runbooks",
			type: "boolean",
			required: false,
			default: false,
		},
	],
	handler: async (args) => {
		const { name, list = false } = args;
		const runbooksDir = path.resolve(process.cwd(), ".gemini/runbooks");

		if (list) {
			try {
				const entries = await fs.readdir(runbooksDir);
				const runbooks = entries
					.filter((e) => e.endsWith(".md"))
					.map((e) => e.replace(".md", ""));
				return {
					runbooks,
					summary: `Found ${runbooks.length} runbooks.`,
				};
			} catch (error) {
				return { runbooks: [], summary: "No runbooks directory found." };
			}
		}

		if (!name) {
			throw new Error("Either name or list:true must be provided");
		}

		const content = await getRunbook(name);

		return {
			name,
			content,
			summary: `Successfully fetched runbook: ${name}`,
		};
	},
	examples: [
		{
			description: "List all available runbooks",
			arguments: {
				list: true,
			},
		},
		{
			description: 'Fetch the "testing" runbook',
			arguments: {
				name: "testing",
			},
		},
	],
	metadata: {
		category: "documentation",
		tags: ["runbook", "recipe", "guide", "docs"],
		version: "1.0.0",
		author: "system",
		ax: {
			summary:
				"Fetch project-specific recipes, guides, and troubleshooting runbooks.",
			visibility: "suggested",
			triggerPhrases: [
				"runbook",
				"project guide",
				"recipe",
				"how do we do this here",
				"troubleshooting steps",
			],
			relatedTools: ["repo_map", "read_many", "smart_search"],
			whenNotToUse: [
				"general web documentation",
				"editing files directly",
				"running commands",
			],
			commonUses: [
				"Find project conventions",
				"Follow known recipes",
				"Look up troubleshooting steps",
			],
			followUps: ["read_many", "bash"],
			intentExamples: [
				"Find the runbook for releases",
				"How does this project handle testing?",
			],
		},
	},
};
