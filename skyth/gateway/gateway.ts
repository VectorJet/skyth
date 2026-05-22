import { Hono } from "hono";
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
import { setEnvCompatibility } from "@/gateway/config/env";
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

	// Initialize registries
	const {
		mcpRegistry,
		toolRegistry,
		pipelineRegistry,
		metaToolsManager,
		runtimeServices,
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
	async function callTool(toolName: string, args: Record<string, any>) {
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
	const channels = await startChannelSubsystem();
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

// Export for external use (index.ts)
export async function startGateway() {
	return await start();
}

// For Bun.serve - use when running gateway.ts directly
if (import.meta.main) {
	await start();
}
