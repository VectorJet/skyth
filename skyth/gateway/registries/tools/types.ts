export interface ToolParameter {
	name: string;
	description: string;
	type: "string" | "number" | "boolean" | "object" | "array";
	required?: boolean;
	default?: any;
	enum?: any[];
	properties?: Record<string, ToolParameter>; // For nested objects
	items?: ToolParameter; // For arrays
}

export interface ToolExample {
	description: string;
	arguments: Record<string, any>;
}

export type ToolVisibility =
	| "always"
	| "suggested"
	| "discoverable"
	| "hidden"
	| "blocked";

export interface ToolAxMetadata {
	/** Short one-line capability summary for compact maps and search results. */
	summary?: string;
	/** Human-facing AX category; falls back to metadata.category. */
	category?: string;
	/** Visibility tier used by compact maps, suggestions, and discovery. */
	visibility?: ToolVisibility;
	/** Natural phrases that should strongly activate this tool in discovery. */
	triggerPhrases?: string[];
	/** Nearby tools that are commonly useful before/after this one. */
	relatedTools?: string[];
	/** Negative guidance used to down-rank the tool for mismatched tasks. */
	whenNotToUse?: string[];
	/** Common use cases shown in compact context when helpful. */
	commonUses?: string[];
	/** Useful follow-up tools or actions after this tool runs. */
	followUps?: string[];
	/** Example user intents this tool is meant to satisfy. */
	intentExamples?: string[];
}

export interface ToolDefinition {
	name: string;
	description: string;
	parameters: ToolParameter[];
	handler: (args: Record<string, any>) => Promise<any>;
	examples?: ToolExample[];
	metadata?: {
		category?: string;
		tags?: string[];
		version?: string;
		author?: string;
		ax?: ToolAxMetadata;
		summary?: string;
		visibility?: ToolVisibility;
		triggerPhrases?: string[];
		relatedTools?: string[];
		whenNotToUse?: string[];
		commonUses?: string[];
		followUps?: string[];
		intentExamples?: string[];
	};
}

export interface ToolExecutionResult {
	success: boolean;
	result?: any;
	error?: string;
	executionTime?: number;
}

export interface ToolRegistryOptions {
	validateSchemas?: boolean;
	allowOverride?: boolean;
}

export interface RegisteredTool {
	definition: ToolDefinition;
	registeredAt: Date;
	source: "custom" | "mcp" | "builtin" | "pipeline";
}
