import type { ToolDefinition } from "@/sdks/agent-sdk/types";

export function defineTool(definition: ToolDefinition): ToolDefinition {
  if (!definition.name?.trim()) throw new Error("defineTool: name is required");
  if (!definition.description?.trim()) throw new Error("defineTool: description is required");
  if (typeof definition.execute !== "function") throw new Error("defineTool: execute function is required");
  return definition;
}
