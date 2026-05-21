import type { CapabilityKind } from "@/gateway/core/contracts/capability.ts";

export type SourceKind = "builtin" | "workspace" | "temporary" | "generated";
export type TrustLevel = "trusted" | "local" | "generated" | "untrusted";

export interface LoadSource {
	kind: SourceKind;
	root: string;
	writable: boolean;
	trustLevel: TrustLevel;
	capabilities: CapabilityKind[];
	label?: string;
}
