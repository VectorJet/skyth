export type ToolScope = "agent" | "global" | "workspace" | "pipeline" | "app";

export interface ToolMetadata {
	name: string;
	description: string;
	author?: string;
	version?: string;
	sourcePath: string;
	source: ToolScope;
	entrypoint: string;
	requirements?: {
		bins?: string[];
		env?: string[];
	};
}

export interface ToolEntry {
	id: string;
	metadata: ToolMetadata;
	sourceCode?: string;
}
