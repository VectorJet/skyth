import type { ModuleManifest } from "@/base/base_agent/manifest/manifest";

export interface RegisteredAgent {
	manifest: ModuleManifest;
	root: string;
	manifestPath: string;
	source: "builtin" | "user" | "external";
	parentAgentId?: string;
}

export interface AgentRegistryOptions {
	allowOverride?: boolean;
	failOnBuiltinError?: boolean;
}
