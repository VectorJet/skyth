import type { AgentManifest } from "@/sdks/agent-sdk/manifest";

export interface AgentPermissions {
	globalToolsEnabled: boolean;
	delegationRequiredForGlobals: boolean;
}

export function resolvePermissions(manifest: AgentManifest): AgentPermissions {
	const globalToolsEnabled = Boolean(manifest.global_tools === true);
	return {
		globalToolsEnabled,
		delegationRequiredForGlobals: !globalToolsEnabled,
	};
}
