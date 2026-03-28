import { join } from "node:path";
import { MemoryStore } from "@/base/base_agent/memory/store";
import { MessageBus } from "@/bus/queue";
import { ChannelManager } from "@/channels/manager";
import type { AgentLoop } from "@/base/base_agent/runtime";
import { Config } from "@/config/schema";
import { CronService } from "@/cron/service";
import {
	isChannelDeliveryTarget,
	loadAllActiveChannelTargets,
	loadLastActiveChannelTarget,
	type DeliveryTarget,
} from "@/cli/gateway_delivery";
import { getDataDir } from "@/config/loader";

export async function initializeGatewayServices(
	cfg: Config,
): Promise<{
	cron: CronService;
	memory: MemoryStore;
	bus: MessageBus;
	channels: ChannelManager;
}> {
	const cronStore = join(getDataDir(), "cron", "jobs.json");
	const cron = new CronService(cronStore);
	const bus = new MessageBus();
	const memory = new MemoryStore(cfg.workspace_path);
	const channels = new ChannelManager(cfg, bus);

	// Note: MessageBus and ChannelManager don't have explicit start methods
	// They are initialized in their constructors

	return { cron, memory, bus, channels };
}

export function loadChannelTargets(cfg: Config): {
	lastActiveTarget: DeliveryTarget | undefined;
	channelTargets: Map<string, DeliveryTarget & { ts: number }>;
} {
	const lastActiveTarget = loadLastActiveChannelTarget(cfg.workspace_path);
	const channelTargets = loadAllActiveChannelTargets(cfg.workspace_path);
	return { lastActiveTarget, channelTargets };
}

export function setupAgentRefs(
	agent: AgentLoop,
	lastActiveTargetRef: { current: DeliveryTarget | undefined },
	channelTargetsRef: { current: Map<string, DeliveryTarget & { ts: number }> },
): void {
	agent.updateChannelTargets(channelTargetsRef.current);
}