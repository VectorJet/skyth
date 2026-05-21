import type {
	ToolAxMetadata,
	ToolVisibility,
} from "@/gateway/registries/tools/types.ts";

export interface SkillDefinition {
	name: string;
	description: string;
	path: string;
	skillFile: string;
	frontmatter: Record<string, string>;
	resources: string[];
	ax?: ToolAxMetadata;
}

export interface LoadedSkill extends SkillDefinition {
	instructions: string;
	instructionsTruncated?: boolean;
	instructionsLength?: number;
	loadedResources?: Record<string, SkillResourceContent>;
}

export interface SkillResourceContent {
	path: string;
	content: string;
	size: number;
	truncated: boolean;
}

export interface RegisteredSkill {
	definition: SkillDefinition;
	registeredAt: Date;
	source: string;
}

export interface SkillRegistryOptions {
	allowOverride?: boolean;
}

export interface CreateSkillInput {
	name: string;
	description: string;
	body?: string;
	overwrite?: boolean;
	extraFiles?: Record<string, string>;
	ax?: ToolAxMetadata;
}

export type SkillVisibility = ToolVisibility;
