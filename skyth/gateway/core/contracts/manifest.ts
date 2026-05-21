import type { CapabilityKind } from "@/gateway/core/contracts/capability.ts";
import type { ToolAxMetadata } from "@/gateway/registries/tools/types.ts";

export interface CapabilityManifest {
	name: string;
	description: string;
	kind?: CapabilityKind;
	version?: string;
	author?: string;
	category?: string;
	tags?: string[];
	entry?: string;
	ax?: ToolAxMetadata;
	permissions?: string[];
}
