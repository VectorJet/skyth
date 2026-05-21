import type { ToolDefinition } from "@/gateway/registries/tools/types.ts";
import { requireSkillRegistry } from "@/gateway/meta/support/skill_registry.ts";

export const listSkillsTool: ToolDefinition = {
	name: "list_skills",
	description: `List registered agent skills from the SkillRegistry.

Use this to discover installed skills, their trigger descriptions, backing paths, and bundled resources. Pass a query to filter by name, description, or resource path.`,
	parameters: [
		{
			name: "query",
			description:
				"Optional case-insensitive filter over skill name, description, and resource paths",
			type: "string",
			required: false,
		},
		{
			name: "includeInstructions",
			description:
				"If true, include SKILL.md body text. Defaults to false; use use_skill for normal activation.",
			type: "boolean",
			required: false,
			default: false,
		},
	],
	handler: async (args) => {
		const registry = requireSkillRegistry();
		const query = String(args.query || "")
			.trim()
			.toLowerCase();
		const includeInstructions = Boolean(args.includeInstructions ?? false);
		const all = Array.from(registry.getAllSkills().values());
		const filtered = query
			? all.filter(({ definition }) =>
					[
						definition.name,
						definition.description,
						...definition.resources,
					].some((value) => value.toLowerCase().includes(query)),
				)
			: all;

		const skills = [];
		for (const registered of filtered.sort((a, b) =>
			a.definition.name.localeCompare(b.definition.name),
		)) {
			const base: Record<string, any> = {
				name: registered.definition.name,
				description: registered.definition.description,
				source: registered.source,
				registeredAt: registered.registeredAt.toISOString(),
				path: registered.definition.path,
				skillFile: registered.definition.skillFile,
				resources: registered.definition.resources,
			};
			if (includeInstructions) {
				const loaded = await registry.use(registered.definition.name, [], {
					maxInstructionsChars: 12_000,
				});
				base.instructions = loaded.instructions;
				base.instructionsTruncated = loaded.instructionsTruncated;
				base.instructionsLength = loaded.instructionsLength;
			}
			skills.push(base);
		}

		return { count: skills.length, root: registry.root, skills };
	},
	metadata: {
		category: "skills",
		tags: ["skills", "registry", "list"],
		version: "1.0.0",
		author: "system",
	},
};
