import type {
	CapabilityRunner,
	RunContext,
} from "@/gateway/core/contracts/index.ts";
import type { SkillRegistry } from "@/gateway/registries/skills/index.ts";

export class SkillRunner implements CapabilityRunner<Record<string, any>, any> {
	readonly kind = "skill" as const;

	constructor(private registry: SkillRegistry) {}

	assertAvailable(name: string): void {
		const skillName = name.replace(/^skill:/, "");
		if (!this.registry.hasSkill(skillName)) {
			throw new Error(
				`Skill "${skillName}" not found. Available skills: ${this.registry.listSkillNames().join(", ")}`,
			);
		}
	}

	async run(
		name: string,
		args: Record<string, any> = {},
		_context?: RunContext,
	): Promise<any> {
		const skillName = name.replace(/^skill:/, "");
		this.assertAvailable(skillName);
		const loaded = await this.registry.use(
			skillName,
			Array.isArray(args.resourcePaths) ? args.resourcePaths.map(String) : [],
			{ maxInstructionsChars: Number(args.maxInstructionsChars ?? 18_000) },
		);
		return {
			task: args.task || null,
			activation: `Skill ${loaded.name} loaded. Follow the SKILL.md instructions for the user's task.`,
			skill: loaded,
		};
	}
}
