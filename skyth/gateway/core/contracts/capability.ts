export type CapabilityKind = "tool" | "pipeline" | "skill" | "mcp" | "agent";

export type CapabilityId = `${CapabilityKind}:${string}` | string;

export interface CapabilitySummary {
	kind: CapabilityKind;
	name: string;
	id: CapabilityId;
	source?: string;
	description?: string;
	metadata?: Record<string, unknown>;
}
