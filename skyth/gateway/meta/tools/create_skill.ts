import type { ToolDefinition } from "@/gateway/registries/tools/types.ts";
import { requireSkillRegistry } from "@/gateway/meta/support/skill_registry.ts";

export const createSkillTool: ToolDefinition = {
	name: "create_skill",
	description: `Create or update an agent skill through the SkillRegistry.

Skills are first-class registry entries backed by SKILLS/<name>/SKILL.md. The registry reloads the created skill immediately so it can be used as skill:<name> or with use_skill.`,
	parameters: [
		{
			name: "name",
			description: "Skill name. It is normalized to a safe slug.",
			type: "string",
			required: true,
		},
		{
			name: "description",
			description: "Trigger description for SKILL.md frontmatter.",
			type: "string",
			required: true,
		},
		{
			name: "body",
			description:
				"Markdown body for SKILL.md after frontmatter. A minimal template is generated if omitted.",
			type: "string",
			required: false,
		},
		{
			name: "overwrite",
			description: "Allow replacing an existing skill. Defaults to false.",
			type: "boolean",
			required: false,
			default: false,
		},
		{
			name: "extraFiles",
			description:
				"Optional object mapping skill-relative resource paths to UTF-8 contents.",
			type: "object",
			required: false,
		},
	],
	handler: async (args) => {
		const registry = requireSkillRegistry();
		const skill = await registry.create({
			name: String(args.name || ""),
			description: String(args.description || ""),
			body: args.body == null ? undefined : String(args.body),
			overwrite: Boolean(args.overwrite ?? false),
			extraFiles:
				args.extraFiles && typeof args.extraFiles === "object"
					? args.extraFiles
					: undefined,
		});
		return {
			name: skill.name,
			description: skill.description,
			path: skill.path,
			skillFile: skill.skillFile,
			resources: skill.resources,
			message: `Skill ${skill.name} registered. Execute it with execute_tool({ tool: "skill:${skill.name}", args: { task: "..." } }) or load it with use_skill.`,
		};
	},
	metadata: {
		category: "skills",
		tags: ["skills", "registry", "create"],
		version: "1.0.0",
		author: "system",
	},
};
