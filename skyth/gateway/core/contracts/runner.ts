import type { CapabilityKind } from "@/gateway/core/contracts/capability.ts";
import type { LoadSource } from "@/gateway/core/contracts/source.ts";

export interface RunContext {
	source?: LoadSource;
	activeTab?: string;
	workspaceRoot?: string;
	requestId?: string;
	userId?: string;
	permissions?: string[];
	signal?: AbortSignal;
}

export interface CapabilityRunner<
	TArgs = Record<string, unknown>,
	TResult = unknown,
> {
	kind: CapabilityKind;
	run(name: string, args: TArgs, context?: RunContext): Promise<TResult>;
}
