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
import {
	WorkspaceManager,
	HeartbeatWriter,
} from "@/gateway/workspace/index.ts";
import { TelegramChannel } from "@/gateway/channels/telegram/telegram-channel.ts";
import { WebChannel } from "@/gateway/channels/web/web-channel.ts";
import { HeartbeatWatcher } from "@/gateway/workspace/heartbeat-watcher.ts";
import { loadAndRegisterCommands } from "@/gateway/channels/telegram/commands/index.ts";
import { setRuntime } from "@/gateway/channels/runtime.ts";
import type { AgentTurnInput } from "@/gateway/channels/queue.ts";
import { setEnvCompatibility } from "@/gateway/config/env.ts";
import {
	createDurableStores,
	type DurableQueueStore,
} from "@/gateway/durable/index.ts";

export interface ChannelSubsystem {
	channelManager: ChannelManager;
	workspaceManager: WorkspaceManager;
	heartbeat: HeartbeatWriter;
	heartbeatWatcher: HeartbeatWatcher;
	queueStore: DurableQueueStore;
	defaultWorkspaceRoot: string;
}

export async function startChannelSubsystem(
	fallbackRunner?: (turn: AgentTurnInput) => Promise<void>,
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

	const durableStores = createDurableStores();
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

	// Register channels.
	const telegram = new TelegramChannel();
	const web = new WebChannel();
	channelManager.register(telegram);
	channelManager.register(web);

	// Discover slash commands and publish them to Telegram.
	await loadAndRegisterCommands(telegram);
	await telegram.publishCommands();

	// Real web runner: prefer the web channel when
	// connected; otherwise fall back to the supplied stub. The web channel
	// sends the turn into the active conversation and awaits the response so
	// we can mirror it back to the originating channel.
	//
	// Telegram-origin turns are skipped here: the Rust relay
	// (src/shared/handler/relay/body.rs) already injects each Telegram message
	// into the active web assistant directly via build_telegram_forward_js.
	// Re-injecting from the gateway would cause the message to appear twice
	// conversation (once with the Rust `time:` annotation, once with the
	// gateway's burst-coalesced batch). The gateway still does useful work for
	// those messages — slash command interception, memory recording,
	// RAG hint generation — it just doesn't re-forward the user text.
	channelManager.router.setRunner(async (turn) => {
		if (turn.origin.channel === "telegram") {
			console.log(
				`[runner] skip injection for telegram-origin turn (Rust relay handles it) chatId=${turn.origin.chatId}`,
			);
			return;
		}
		if (web.isConnected()) {
			try {
				const targetTab =
					turn.origin.channel === "web" ? turn.origin.chatId : web.pickTab();
				const reply = await web.sendAndAwaitResponse(targetTab, turn.text);
				// Mirror the assistant reply back to the originating channel.
				if (turn.origin.channel !== "web" && turn.userMessages.length > 0) {
					const u = turn.userMessages[0]!;
					await channelManager.send(u.channel, u.chatId, reply, {
						fromGateway: false,
					});
				}
				return;
			} catch (err) {
				console.warn("[runner] web bridge failed, falling back:", err);
			}
		}
		if (fallbackRunner) await fallbackRunner(turn);
	});

	// Heartbeat against the default workspace + watcher so agent acks flow
	// back as gateway messages.
	const heartbeat = new HeartbeatWriter(defaultWs, () => ({
		router: channelManager.router.stats(),
		channels: channelManager.list().map((c) => c.name),
		web_connected: web.isConnected(),
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
