import { resolve } from "node:path";
import { AgentLifecycle } from "@/base/base_agent/lifecycle";
import {
	agentManifestFromObject,
	agentManifestFromPath,
} from "@/sdks/agent-sdk/manifest";
import { resolvePermissions } from "@/sdks/agent-sdk/permissions";
import type { AgentDefinition, AgentFactory } from "@/sdks/agent-sdk/types";

export function defineAgent(definition: AgentDefinition): AgentFactory {
	if (!definition || typeof definition !== "object") {
		throw new Error("defineAgent: definition is required");
	}

	const manifest =
		typeof definition.manifest === "string"
			? agentManifestFromPath(resolve(process.cwd(), definition.manifest))
			: agentManifestFromObject(definition.manifest);

	const permissions = resolvePermissions(manifest);

	return {
		definition,
		create(params) {
			return new AgentLifecycle({
				...params,
				enable_global_tools: permissions.globalToolsEnabled,
			});
		},
	};
}
