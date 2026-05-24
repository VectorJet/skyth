import { join } from "node:path";
import { existsSync } from "node:fs";
import {
	createHttpServer,
	createLoggingMiddleware,
} from "@/gateway/server/http-server";
import { createMcpHeadersMiddleware } from "@/gateway/server/middleware";
import { installGatewayLogCapture } from "@/gateway/server/log-buffer";
import { PORT } from "@/gateway/server/config";
import { SessionManager } from "@/gateway/mcp/session";
import { SSEManager } from "@/gateway/mcp/sse-manager";
import { TabManager } from "@/gateway/tabs/tab-manager";
import { registerOAuthRoutes } from "@/gateway/auth/oauth-routes";
import { registerMcpProtocolRoutes } from "@/gateway/mcp/protocol-handler";
import { registerToolRoutes } from "@/gateway/api/routes/tool-routes";
import { registerToolStreamingRoutes } from "@/gateway/api/routes/tool-streaming-routes";
import { registerServerRoutes } from "@/gateway/api/routes/server-routes";
import { registerPipelineRoutes } from "@/gateway/api/routes/pipeline-routes";
import { registerMemoryRoutes } from "@/gateway/api/routes/memory-routes";
import { registerOnboardingRoutes } from "@/gateway/api/routes/onboarding-routes";
import { registerTabRoutes } from "@/gateway/tabs/tab-routes";
import { registerDebugRoutes } from "@/gateway/api/routes/debug-routes";
import { initializeRegistries } from "@/gateway/lifecycle/initialization";
import { setupGracefulShutdown } from "@/gateway/lifecycle/shutdown";
import { printStartupInfo } from "@/gateway/lifecycle/startup-info";
import { startChannelSubsystem } from "@/gateway/channels/index";
import { WorkspaceManager } from "@/gateway/workspace/index";
import {
	envFirst,
	setEnvCompatibility,
	SKYTH_HOME,
} from "@/gateway/config/env";
import { loadConfig } from "@/config/loader";
import type { AgentTurnInput } from "@/gateway/channels/queue";
import { createDurableStores } from "@/gateway/durable/index";
import { startSubagentAnnouncementBridge } from "@/gateway/channels/subagent-announcements";
import { buildGatewayAgentSession } from "@/gateway/lifecycle/agent-session-boot";
import { ensureQuasarDaemon } from "@/quasar/daemon";
import { QuasarClient } from "@/quasar/client";
// import { executeToolDirect } from '@/gateway/meta/tools/execute_tool';

// Direct Composio app-action exposure is currently paused. Composio's own
// meta-tools are exposed through MetaToolsManager instead.
// function toInputSchema(tool: any): any { ... }
// function isDirectlyExposedComposioTool(tool: any): boolean {
//   return Boolean(tool?.definition?.metadata?.tags?.includes('composio'));
// }

// Start the gateway
async function start() {
	installGatewayLogCapture();
	console.log("Starting Skyth MCP Gateway...");
	await startQuasarBeforeGatewayBoot();
	const config = loadConfig();

	// Provision the default workspace BEFORE registries initialize so the
	// filesystem MCP manifest can substitute the workspace root.
	const earlyWorkspaces = new WorkspaceManager();
	const defaultWs = await earlyWorkspaces.get("default");
	setEnvCompatibility(
		"SKYTH_GATEWAY_FILESYSTEM_ROOT",
		"CLAUDE_GATEWAY_FILESYSTEM_ROOT",
		defaultWs.root,
	);
	console.log(`[workspace] default workspace at ${defaultWs.root}`);

	// Create HTTP server
	const app = createHttpServer();

	// Initialize managers
	const sessionManager = new SessionManager();
	const sseManager = new SSEManager();
	const tabManager = new TabManager();
	const disabledTools = new Set<string>();

	// Add logging middleware
	app.use("/*", createLoggingMiddleware());

	// Add MCP headers middleware
	app.use(
		"/*",
		createMcpHeadersMiddleware(() => sessionManager.getSessionId()),
	);

	// Initialize Quasar-backed durability before MCP servers are launched.
	const durableStores = await createDurableStores();

	// Initialize registries
	const {
		mcpRegistry,
		metaToolsManager,
		runtimeServices,
		toolRuntime,
		delegationServices,
	} = await initializeRegistries();

	// Helper function to get all tools for MCP (only meta-tools)
	function getAllTools() {
		const allTools = new Map();

		// Get meta-tools (ONLY these are exposed - all internal tools, MCP tools, and pipelines go through them)
		const metaTools = metaToolsManager.getMetaTools();
		for (const [name, tool] of metaTools.entries()) {
			if (!disabledTools.has(name)) {
				allTools.set(name, tool);
			}
		}

		// Direct Composio app-action tools are paused; Composio meta-tools are
		// included above as normal gateway meta-tools.

		return allTools;
	}

	// Helper function to call exposed gateway tools.
	async function callTool(toolName: string, args: Record<string, unknown>) {
		if (metaToolsManager.getMetaTools().has(toolName)) {
			return await metaToolsManager.executeMetaTool(toolName, args);
		}
		// Direct Composio app-action tools are paused.
		return await metaToolsManager.executeMetaTool(toolName, args);
	}

	// Register all routes
	registerOAuthRoutes(app);
	registerMcpProtocolRoutes(
		app,
		sessionManager,
		sseManager,
		getAllTools,
		callTool,
	);
	registerToolRoutes(
		app,
		metaToolsManager,
		sseManager,
		disabledTools,
		getAllTools,
		callTool,
	);
	registerToolStreamingRoutes(app, callTool);
	registerServerRoutes(app, mcpRegistry);
	registerPipelineRoutes(app, metaToolsManager);
	registerMemoryRoutes(app);
	registerOnboardingRoutes(app);
	registerTabRoutes(app, tabManager, sseManager, metaToolsManager);
	metaToolsManager.attachWatcher(runtimeServices.watchers, () =>
		sseManager.notifyToolsListChanged(),
	);
	metaToolsManager.startToolHotReload(() =>
		sseManager.notifyToolsListChanged(),
	);
	metaToolsManager.startMetaHotReload(() =>
		sseManager.notifyToolsListChanged(),
	);

	registerDebugRoutes(
		app,
		metaToolsManager,
		tabManager,
		() => sseManager.getClientCount(),
		() => sessionManager.getSessionId(),
		() => Array.from(disabledTools),
	);

	// Setup graceful shutdown
	await setupGracefulShutdown(mcpRegistry);

	// Channel subsystem: workspace, queue, Telegram + Web channels, slash cmds.
	// Phase 2's real Claude runner is wired inside startChannelSubsystem via
	// WebChannel.sendAndAwaitResponse(). Do not pass the old fallback stub here:
	// it leaks stale "relay not wired" acknowledgements whenever the web bridge
	// is temporarily unavailable or a turn is intentionally skipped.
	const { agentSession, subagentBus } = await buildGatewayAgentSession({
		durableStores,
		toolRuntime,
		delegationServices,
		workspaceRoot: defaultWs.root,
		config,
	});
	const channels = await startChannelSubsystem({
		agentRunner: async (turn: AgentTurnInput, channelManager) => {
			let reply: string | null = null;
			for await (const event of agentSession.run({
				text: turn.text,
				threadId: `${turn.origin.channel}:${turn.origin.chatId}`,
				surface: turn.origin.channel,
				metadata: { origin: turn.origin },
			})) {
				if (event.type === "model_complete") reply = event.text;
				if (event.type === "run_finish" && typeof event.output === "string") {
					reply = event.output;
				}
			}
			if (reply && turn.userMessages.length > 0) {
				const first = turn.userMessages[0];
				if (first) {
					await channelManager.send(first.channel, first.chatId, reply, {
						fromGateway: false,
					});
				}
			}
		},
		preferWebBridge: process.env.SKYTH_GATEWAY_RUNNER === "web",
		durableStores,
		config,
	});
	startSubagentAnnouncementBridge(subagentBus, channels.channelManager.router);
	console.log(
		`[channels] subsystem online (channels: ${channels.channelManager
			.list()
			.map((c) => c.name)
			.join(", ")})`,
	);

	// Print startup info
	printStartupInfo();

	// Start Bun.serve
	Bun.serve({
		port: PORT,
		fetch: app.fetch,
	});

	return app;
}

async function startQuasarBeforeGatewayBoot(): Promise<void> {
	const socketPath =
		envFirst("SKYTH_QUASAR_SOCKET", "QUASAR_SOCKET") ??
		join(SKYTH_HOME, "quasar.sock");
	try {
		await ensureQuasarDaemon(socketPath);
		console.log(`[quasar] daemon ready at ${socketPath}`);
		await unlockQuasarForGateway(socketPath);
	} catch (error) {
		console.warn("[quasar] daemon startup failed:", error);
	}
}

async function unlockQuasarForGateway(socketPath: string): Promise<void> {
	const client = new QuasarClient({ socketPath });
	const status = await client.status();
	const authDbPath = join(SKYTH_HOME, "auth.quasardb");
	if (!shouldUnlockQuasarForGateway(status.auth_initialized, existsSync(authDbPath)))
		return;

	const envPasswordB64 =
		envFirst("SKYTH_QUASAR_PASSWORD_B64", "QUASAR_PASSWORD_B64") ??
		plainPasswordToB64(envFirst("SKYTH_QUASAR_PASSWORD", "QUASAR_PASSWORD"));
	if (envPasswordB64) {
		await client.unlock(envPasswordB64);
		console.log("[quasar] unlocked from environment");
		return;
	}

	if (!process.stdin.isTTY) {
		console.warn(
			"[quasar] unlock password not available; set SKYTH_QUASAR_PASSWORD_B64 for headless gateway startup",
		);
		return;
	}

	const { password, isCancel } = await import("@clack/prompts");
	const value = await password({
		message: "Unlock Quasar superuser password",
		mask: "\u25A3",
	});
	if (isCancel(value) || !String(value ?? "").trim()) {
		console.warn("[quasar] unlock skipped; redacted secrets will not hydrate");
		return;
	}
	const passwordB64 = plainPasswordToB64(String(value));
	if (!passwordB64) return;
	await client.unlock(passwordB64);
	console.log("[quasar] unlocked");
}

export function plainPasswordToB64(value?: string): string | undefined {
	const trimmed = value?.trim();
	if (!trimmed) return undefined;
	return Buffer.from(trimmed, "utf8").toString("base64");
}

export function shouldUnlockQuasarForGateway(
	authInitialized: boolean,
	authDbExists: boolean,
): boolean {
	return authInitialized || authDbExists;
}

// Export for external use (index.ts)
export async function startGateway() {
	return await start();
}

// For Bun.serve - use when running gateway.ts directly
if (import.meta.main) {
	await start();
}
