import type { SkillRegistry } from "@/gateway/registries/skills/index.ts";

let skillRegistry: SkillRegistry | null = null;

export function setSkillRegistry(registry: SkillRegistry) {
	skillRegistry = registry;
}

export function requireSkillRegistry(): SkillRegistry {
	if (!skillRegistry) throw new Error("Skill registry not initialized");
	return skillRegistry;
}
