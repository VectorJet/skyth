import type { MemoryStore } from "@/base/base_agent/memory/store";
import type { MessageBus } from "@/bus/queue";
import type { ChannelManager } from "@/channels/manager";
import { Config } from "@/config/schema";
import type { CronService } from "@/cron/service";
import type { EmitFn } from "./utils";

export interface GatewayDeps {
	memory: MemoryStore;
	bus: MessageBus;
	channels: ChannelManager;
	cron: CronService;
	cfg: Config;
	emit: EmitFn;
}

export interface GatewayRefs {
	runningRef: { current: boolean };
	lastActiveTargetRef: { current: string | null };
	channelTargetsRef: { current: Map<string, string> };
}

export type { EmitFn };
