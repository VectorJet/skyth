import type { PiTool } from "@/pi/types";

interface SkythToolDefinition {
	type?: string;
	function?: {
		name?: string;
		description?: string;
		parameters?: unknown;
	};
}

const EMPTY_OBJECT_SCHEMA = {
	type: "object",
	properties: {},
	additionalProperties: false,
};

/**
 * Convert Skyth OpenAI-function-style tool definitions to Pi `Tool[]`.
 *
 * Skyth shape (from `ToolRegistry.getDefinitions`):
 *   { type: "function", function: { name, description, parameters: <jsonSchema> } }
 *
 * Pi shape:
 *   { name, description, parameters: TSchema }
 *
 * TypeBox `TSchema` is structurally a JSON Schema object at runtime, so the
 * `parameters` payload passes through unchanged. When/if Skyth needs to emit
 * TypeBox `Type.*` builders directly, swap this in place.
 */
export function toPiTools(
	definitions: Array<Record<string, unknown>>,
): PiTool[] {
	const out: PiTool[] = [];
	for (const raw of definitions as SkythToolDefinition[]) {
		const fn = raw.function;
		if (!fn?.name) continue;
		out.push({
			name: fn.name,
			description: fn.description ?? "",
			parameters: (fn.parameters ?? EMPTY_OBJECT_SCHEMA) as PiTool["parameters"],
		});
	}
	return out;
}
