import type { Hono } from "hono";
import { type TabManager, TAB_PROFILES } from "@/gateway/tabs/tab-manager";
import type { SSEManager } from "@/gateway/mcp/sse-manager";
import type { MetaToolsManager } from "@/gateway/meta/tools/index.ts";

export function registerTabRoutes(
	app: Hono,
	tabManager: TabManager,
	sseManager: SSEManager,
	metaToolsManager: MetaToolsManager,
) {
	app.post("/tabs/active", async (c) => {
		try {
			const body = await c.req.json();
			const tabName = body.tabName;
			if (tabName && TAB_PROFILES[tabName]) {
				tabManager.setActiveTab(tabName);
				metaToolsManager.setActiveTab(tabName);
				console.log(`[Gateway] Active tab changed to: ${tabName}`);
				sseManager.notifyToolsListChanged();
				return c.json({ success: true, activeTab: tabName });
			}
			return c.json({ success: false, error: "Invalid tab name" }, 400);
		} catch (e: any) {
			return c.json({ success: false, error: e.message }, 400);
		}
	});
}
