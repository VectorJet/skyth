import * as fs from "fs/promises";
import * as path from "path";
import type {
	CreateSkillInput,
	LoadedSkill,
	RegisteredSkill,
	SkillDefinition,
	SkillRegistryOptions,
	SkillResourceContent,
} from "@/gateway/registries/skills/types.ts";
import {
	SkillLoader,
	safeSkillRelativePath,
} from "@/gateway/registries/skills/loader.ts";

const MAX_RESOURCE_CHARS = Number(
	process.env.CLAUDE_GATEWAY_SKILL_RESOURCE_MAX_CHARS ?? 60_000,
);
const MAX_INSTRUCTIONS_CHARS = Number(
	process.env.CLAUDE_GATEWAY_SKILL_INSTRUCTIONS_MAX_CHARS ?? 18_000,
);

function truncate(
	content: string,
	maxChars: number,
): { content: string; truncated: boolean } {
	if (content.length <= maxChars) return { content, truncated: false };
	return {
		content:
			content.slice(0, maxChars) + `\n... (truncated to ${maxChars} chars)`,
		truncated: true,
	};
}

export class SkillRegistry {
	private skills = new Map<string, RegisteredSkill>();
	private options: Required<SkillRegistryOptions>;

	constructor(
		private loader: SkillLoader = new SkillLoader(),
		options: SkillRegistryOptions = {},
	) {
		this.options = { allowOverride: options.allowOverride ?? true };
	}

	get root(): string {
		return this.loader.root;
	}

	register(definition: SkillDefinition, source: string): void {
		if (
			!definition.name ||
			!definition.description ||
			!definition.path ||
			!definition.skillFile
		) {
			throw new Error("Skill must have name, description, path, and skillFile");
		}
		if (this.skills.has(definition.name) && !this.options.allowOverride) {
			throw new Error(`Skill "${definition.name}" is already registered`);
		}
		this.skills.set(definition.name, {
			definition,
			registeredAt: new Date(),
			source,
		});
		console.log(
			`[SkillRegistry] Registered skill: ${definition.name} (source: ${source})`,
		);
	}

	unregister(name: string): boolean {
		const deleted = this.skills.delete(name);
		if (deleted) console.log(`[SkillRegistry] Unregistered skill: ${name}`);
		return deleted;
	}

	getSkill(name: string): RegisteredSkill | undefined {
		return this.skills.get(name);
	}
	hasSkill(name: string): boolean {
		return this.skills.has(name);
	}
	getAllSkills(): Map<string, RegisteredSkill> {
		return new Map(this.skills);
	}
	listSkillNames(): string[] {
		return Array.from(this.skills.keys()).sort();
	}

	async reload(): Promise<void> {
		this.skills.clear();
		await this.loader.loadAllSkills(this);
	}

	async create(input: CreateSkillInput): Promise<SkillDefinition> {
		const skill = await this.loader.createSkill(input);
		this.register(skill, "workspace");
		return skill;
	}

	async use(
		name: string,
		resourcePaths: string[] = [],
		opts: { maxInstructionsChars?: number } = {},
	): Promise<LoadedSkill> {
		const registered = this.getSkill(name);
		if (!registered)
			throw new Error(
				`Skill "${name}" not found. Available skills: ${this.listSkillNames().join(", ")}`,
			);
		const skill = registered.definition;
		const rawInstructions = await this.loader.readSkillInstructions(skill);
		const maxInstructionsChars = Math.max(
			1_000,
			Number(opts.maxInstructionsChars ?? MAX_INSTRUCTIONS_CHARS),
		);
		const clippedInstructions = truncate(rawInstructions, maxInstructionsChars);
		const loadedResources: Record<string, SkillResourceContent> = {};
		for (const raw of resourcePaths) {
			const rel = safeSkillRelativePath(raw);
			if (!skill.resources.includes(rel))
				throw new Error(`Resource not found in skill ${skill.name}: ${rel}`);
			const full = path.join(skill.path, rel);
			const stat = await fs.stat(full);
			const clipped = truncate(
				await fs.readFile(full, "utf8"),
				MAX_RESOURCE_CHARS,
			);
			loadedResources[rel] = {
				path: rel,
				content: clipped.content,
				size: stat.size,
				truncated: clipped.truncated,
			};
		}
		return {
			...skill,
			instructions: clippedInstructions.content,
			instructionsTruncated: clippedInstructions.truncated,
			instructionsLength: rawInstructions.length,
			loadedResources,
		};
	}

	getStats() {
		return { totalSkills: this.skills.size, root: this.root };
	}
}
