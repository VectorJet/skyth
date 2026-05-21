import type { ToolDefinition } from "@/gateway/registries/tools/types.ts";
import { requireSkillRegistry } from "@/gateway/meta/support/skill_registry.ts";

export const useSkillTool: ToolDefinition = {
	name: "use_skill",
	description: `Load a registered agent skill's instructions and optional resources.

After calling this, follow the returned SKILL.md instructions for the current task. This is also what execute_tool uses for skill:<name>.`,
	parameters: [
		{
			name: "name",
			description: "Registered skill name to load.",
			type: "string",
			required: true,
		},
		{
			name: "resourcePaths",
			description:
				"Optional array of skill-relative resource paths to load with the skill.",
			type: "array",
			required: false,
		},
		{
			name: "maxInstructionsChars",
			description:
				"Maximum SKILL.md instruction characters to return. Defaults to 18000 to avoid channel hangs.",
			type: "number",
			required: false,
		},
		{
			name: "task",
			description:
				"Optional current task summary, echoed back with the loaded skill.",
			type: "string",
			required: false,
		},
	],
	handler: async (args) => {
		const registry = requireSkillRegistry();
		const name = String(args.name || "");
		const resourcePaths = Array.isArray(args.resourcePaths)
			? args.resourcePaths.map(String)
			: [];
		const maxInstructionsChars = Number(args.maxInstructionsChars ?? 18_000);
		const skill = await registry.use(name, resourcePaths, {
			maxInstructionsChars,
		});
		return {
			task: args.task || null,
			activation: `Skill ${skill.name} loaded. Follow the SKILL.md instructions for the user's task. Load listed resources only when needed.`,
			skill: {
				name: skill.name,
				description: skill.description,
				path: skill.path,
				skillFile: skill.skillFile,
				frontmatter: skill.frontmatter,
				instructions: skill.instructions,
				instructionsTruncated: skill.instructionsTruncated,
				instructionsLength: skill.instructionsLength,
				resources: skill.resources,
				loadedResources: skill.loadedResources || {},
			},
		};
	},
	metadata: {
		category: "skills",
		tags: ["skills", "registry", "use", "activate"],
		version: "1.0.0",
		author: "system",
	},
};
