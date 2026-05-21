/**
 * Tiny runtime locator so command modules (loaded dynamically) can reach the
 * channel manager + workspace manager without circular imports.
 */
import type { ChannelManager } from "@/gateway/channels/manager.ts";
import type { WorkspaceManager } from "@/gateway/workspace/index.ts";

export interface ChannelRuntime {
	channelManager: ChannelManager;
	workspaceManager: WorkspaceManager;
}

let current: ChannelRuntime | null = null;

export function setRuntime(rt: ChannelRuntime) {
	current = rt;
	(globalThis as any).runtime = rt;
}
export function getRuntime(): ChannelRuntime {
	if (!current) throw new Error("Channel runtime not initialized");
	return current;
}
