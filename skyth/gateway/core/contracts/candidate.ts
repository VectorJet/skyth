import type { CapabilityKind } from "@/gateway/core/contracts/capability.ts";
import type { LoadSource } from "@/gateway/core/contracts/source.ts";

export interface LoadCandidate {
	kind: CapabilityKind;
	name: string;
	source: LoadSource;
	root: string;
	manifestPath?: string;
	entryPath?: string;
	files: string[];
	metadata?: Record<string, unknown>;
}
