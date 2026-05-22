export type AgentTier = "generalist" | "specialist" | "subagent";

export interface AgentModelPreferences {
	primary?: string;
	fallbacks?: string[];
}

export interface AgentDefinition {
	id: string;
	name: string;
	role: string;
	tier: AgentTier;
	description?: string;
	toolAllowlist?: string[];
	children?: string[];
	modelPreferences?: AgentModelPreferences;
	maxSteps?: number;
	temperature?: number;
	systemPrompt?: string;
}

export class BaseAgent {
	readonly id: string;
	readonly name: string;
	readonly role: string;
	readonly tier: AgentTier;
	readonly description?: string;
	readonly toolAllowlist: string[];
	readonly children: string[];
	readonly modelPreferences: AgentModelPreferences;
	readonly maxSteps?: number;
	readonly temperature?: number;
	private readonly prompt?: string;

	constructor(definition: AgentDefinition) {
		this.id = definition.id;
		this.name = definition.name;
		this.role = definition.role;
		this.tier = definition.tier;
		this.description = definition.description;
		this.toolAllowlist = definition.toolAllowlist ?? [];
		this.children = definition.children ?? [];
		this.modelPreferences = definition.modelPreferences ?? {};
		this.maxSteps = definition.maxSteps;
		this.temperature = definition.temperature;
		this.prompt = definition.systemPrompt;
	}

	buildSystemPrompt(): string {
		if (this.prompt?.trim()) return this.prompt.trim();
		const lines = [
			`# ${this.name}`,
			"",
			`Role: ${this.role}`,
			`Tier: ${this.tier}`,
		];
		if (this.description) lines.push("", this.description);
		return lines.join("\n");
	}

	canUseTool(name: string): boolean {
		if (this.toolAllowlist.length === 0) return true;
		return this.toolAllowlist.includes(name);
	}

	canSpawn(agentId: string): boolean {
		return this.children.includes(agentId);
	}
}
