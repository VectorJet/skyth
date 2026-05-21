import type {
	ToolAxMetadata,
	ToolVisibility,
} from "@/gateway/registries/tools/types.ts";

export interface PipelineParameter {
	name: string;
	description: string;
	type: "string" | "number" | "boolean" | "object" | "array";
	required?: boolean;
	default?: any;
	enum?: any[];
}

export interface PipelineDefinition {
	name: string;
	description: string;
	parameters: PipelineParameter[];
	handler: (args: Record<string, any>) => Promise<any>;
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

export interface PipelineRun {
	runId: string;
	pipelineName: string;
	status: "pending" | "running" | "completed" | "failed";
	input: Record<string, any>;
	output?: any;
	error?: string;
	startedAt: Date;
	completedAt?: Date;
	duration?: number;
}

export interface PipelineRegistryOptions {
	validateSchemas?: boolean;
	allowOverride?: boolean;
}

export interface RegisteredPipeline {
	definition: PipelineDefinition;
	registeredAt: Date;
	source: string;
}
