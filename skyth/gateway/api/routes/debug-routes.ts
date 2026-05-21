import type { Hono } from "hono";
import type { MetaToolsManager } from "@/gateway/meta/tools/index.ts";
import type { TabManager } from "@/gateway/tabs/tab-manager";
import { getGatewayLogs } from "@/gateway/server/log-buffer.ts";
import {
	getToolCall,
	listToolCalls,
} from "@/gateway/server/tool-call-buffer.ts";

export function registerDebugRoutes(
	app: Hono,
	metaToolsManager: MetaToolsManager,
	tabManager: TabManager,
	sseClientCount: () => number,
	getSessionId: () => string | null,
	getDisabledTools: () => string[],
) {
	app.get("/debug", (c) => {
		const stats = metaToolsManager.getStats();
		return c.json({
			activeTab: tabManager.getActiveTab(),
			activeTabProfile: metaToolsManager.getActiveTabProfile(),
			allTabProfiles: metaToolsManager.getAllTabProfiles(),
			sseClients: sseClientCount(),
			mcpSessionId: getSessionId(),
			tabProfiles: Object.keys(tabManager.getAllProfiles()),
			disabledTools: getDisabledTools(),
			metaTools: stats.metaTools,
			internalTools: stats.tools,
			pipelines: stats.pipelines,
		});
	});

	app.get("/debug/logs", (c) => {
		return c.json({
			logs: getGatewayLogs({
				level: c.req.query("level"),
				query: c.req.query("query"),
				limit: Number(c.req.query("limit") ?? 200),
			}),
		});
	});

	// List recent tool calls (compact metadata only)
	app.get("/debug/calls", (c) => {
		const status = c.req.query("status") as
			| "pending"
			| "ok"
			| "error"
			| undefined;
		const calls = listToolCalls({
			tool: c.req.query("tool"),
			status,
			limit: Number(c.req.query("limit") ?? 100),
		}).map((r) => ({
			id: r.id,
			timestamp: r.timestamp,
			tool: r.tool,
			function: r.function,
			status: r.status,
			durationMs: r.durationMs,
			source: r.source,
			error: r.error,
		}));
		return c.json({ count: calls.length, calls });
	});

	// Full payload for a single tool call (args + result/error)
	app.get("/debug/calls/:id", (c) => {
		const rec = getToolCall(c.req.param("id"));
		if (!rec)
			return c.json({ success: false, error: "call id not found" }, 404);
		return c.json(rec);
	});

	// Health check endpoint
	app.get("/health", (c) => {
		const stats = metaToolsManager.getStats();

		return c.json({
			status: "ok",
			timestamp: new Date().toISOString(),
			metaTools: stats.metaTools,
			internalTools: stats.tools,
			pipelines: stats.pipelines,
			mcpServers: stats.mcpServers,
		});
	});
}
