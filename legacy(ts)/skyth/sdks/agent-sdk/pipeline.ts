import type { PipelineDefinition } from "@/sdks/agent-sdk/types";

export function definePipeline(
	definition: PipelineDefinition,
): PipelineDefinition {
	if (!definition.name?.trim())
		throw new Error("definePipeline: name is required");
	if (!Array.isArray(definition.steps) || definition.steps.length === 0) {
		throw new Error("definePipeline: at least one step is required");
	}
	return definition;
}
