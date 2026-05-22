/**
 * Channel subsystem entry point. Boots the workspace + channel manager +
 * router + Telegram channel + Web channel and wires them into the gateway.
 *
 * Phase 2 additions:
 *   - Persistent SQLite queue (queue-store.ts) attached to MessageRouter so
 *     a crash mid-burst replays after restart.
 *   - HEARTBEAT.md watcher that pushes agent acks back through the router.
 *   - Per-chat workspace binding so each Telegram chat / web tab gets its
 *     own sandbox.
 *   - Web channel acts as the web runner via WS bridge to the existing
 *     chrome-extension relay.
 */
import { ChannelManager } from "@/gateway/channels/manager.ts";
import { Config } from "@/config/schema";
import {
	WorkspaceManager,
	HeartbeatWriter,
} from "@/gateway/workspace/index.ts";
import { WebChannel } from "@/gateway/channels/web/web-channel.ts";
import { HeartbeatWatcher } from "@/gateway/workspace/heartbeat-watcher.ts";
import { loadAndRegisterCommands } from "@/gateway/channels/telegram/commands/index.ts";
import { setRuntime } from "@/gateway/channels/runtime.ts";
import { setEnvCompatibility } from "@/gateway/config/env.ts";
import {
	createDurableStores,
	type DurableStores,
	type DurableQueueStore,
} from "@/gateway/durable/index.ts";
import {
	createChannelTurnRunner,
	type AgentTurnRunner,
} from "@/gateway/channels/agent-runner.ts";
import { createConfiguredChannels } from "@/gateway/channels/configured.ts";

export interface ChannelSubsystem {
	channelManager: ChannelManager;
	workspaceManager: WorkspaceManager;
	heartbeat: HeartbeatWriter;
	heartbeatWatcher: HeartbeatWatcher;
	queueStore: DurableQueueStore;
	defaultWorkspaceRoot: string;
}

export interface ChannelSubsystemOptions {
	agentRunner?: AgentTurnRunner;
	preferWebBridge?: boolean;
	skippedAgentChannels?: string[];
	durableStores?: DurableStores;
	config?: Config;
}

export async function startChannelSubsystem(
	options: ChannelSubsystemOptions = {},
): Promise<ChannelSubsystem> {
	const channelManager = new ChannelManager();
	const workspaceManager = new WorkspaceManager();
	channelManager.bindWorkspaces(workspaceManager);

	// Provision the default workspace immediately. Per-chat workspaces are
	// created lazily as channels see new chats.
	const defaultWs = await workspaceManager.get("default");

	// Make the workspace root visible to MCP manifests via env substitution.
	setEnvCompatibility(
		"SKYTH_GATEWAY_FILESYSTEM_ROOT",
		"CLAUDE_GATEWAY_FILESYSTEM_ROOT",
		defaultWs.root,
	);

	setRuntime({ channelManager, workspaceManager });

	const durableStores = options.durableStores ?? (await createDurableStores());
	await durableStores.stateTransitions
		.record({
			domain: "gateway",
			to: "channel_subsystem_starting",
			reason: "startChannelSubsystem",
		})
		.catch((err) => console.warn("[quasar] state transition failed:", err));

	const queueStore = durableStores.queue;
	await channelManager.router.attachStore(queueStore);
	channelManager.router.attachMemory(durableStores.memory);

	// Register configured channels. Config is already hydrated by loadConfig(),
	// including Quasar-backed redacted channel secrets.
	const configured = options.config
		? createConfiguredChannels(options.config)
		: createConfiguredChannels(new Config());
	for (const channel of configured.channels) {
		channelManager.register(channel);
	}
	for (const name of configured.unsupportedEnabled) {
		console.warn(
			`[channels] ${name} is enabled but no gateway adapter is wired yet`,
		);
	}
	for (const reason of configured.misconfiguredEnabled) {
		console.warn(
			`[channels] ${reason}; check ~/.skyth/channels/*.json and Quasar secrets`,
		);
	}
	const web = channelManager.get("web");
	if (!web || !("isConnected" in web) || !("pickTab" in web)) {
		throw new Error("web channel is required for channel subsystem boot");
	}
	const webBridge = web as WebChannel;
	const telegram = channelManager.get("telegram");

	// Discover slash commands and publish them to Telegram.
	if (telegram) {
		await loadAndRegisterCommands(telegram);
		const publisher = telegram as { publishCommands?: () => Promise<void> };
		await publisher.publishCommands?.();
	}

	channelManager.router.setRunner(
		createChannelTurnRunner(channelManager, {
			agentRunner: options.agentRunner,
			web: webBridge,
			preferWebBridge: options.preferWebBridge,
			skippedAgentChannels: [
				...(options.skippedAgentChannels ?? []),
				...configured.skippedAgentChannels,
			],
		}),
	);

	// Heartbeat against the default workspace + watcher so agent acks flow
	// back as gateway messages.
	const heartbeat = new HeartbeatWriter(defaultWs, () => ({
		router: channelManager.router.stats(),
		channels: channelManager.list().map((c) => c.name),
		web_connected: webBridge.isConnected(),
	}));
	heartbeat.start();
	void durableStores.heartbeat
		.append("gateway_channel_subsystem_started", `workspace=${defaultWs.root}`)
		.catch((err) => console.warn("[quasar] heartbeat append failed:", err));

	const heartbeatWatcher = new HeartbeatWatcher(
		defaultWs,
		channelManager.router,
	);
	await heartbeatWatcher.start();

	await channelManager.startAll();
	await durableStores.stateTransitions
		.record({
			domain: "gateway",
			from: "channel_subsystem_starting",
			to: "channel_subsystem_started",
			reason: "channels started",
			metadata: { channels: channelManager.list().map((c) => c.name) },
		})
		.catch((err) => console.warn("[quasar] state transition failed:", err));

	return {
		channelManager,
		workspaceManager,
		heartbeat,
		heartbeatWatcher,
		queueStore,
		defaultWorkspaceRoot: defaultWs.root,
	};
}
