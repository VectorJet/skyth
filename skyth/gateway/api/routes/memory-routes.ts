import type { Hono } from "hono";
import { getMemoryStore } from "@/gateway/memory/store.ts";
import { archiveStats } from "@/gateway/memory/archive.ts";

export function registerMemoryRoutes(app: Hono) {
	app.get("/memory/stats", (c) => {
		return c.json(getMemoryStore().stats());
	});

	app.post("/memory/search", async (c) => {
		const body = await c.req.json().catch(() => ({}));
		const query = String(body.query ?? "").trim();
		if (!query)
			return c.json({ success: false, error: "query is required" }, 400);
		const limit = typeof body.limit === "number" ? body.limit : 5;
		const mode =
			body.mode === "semantic" || body.mode === "bm25" ? body.mode : "auto";
		return c.json({
			success: true,
			mode,
			hits: await getMemoryStore().searchAuto(query, limit, mode),
		});
	});

	app.post("/memory/import/claude-conversation", async (c) => {
		const body = await c.req.json();
		const result = getMemoryStore().upsertClaudeConversation(
			body,
			"claude_live",
		);
		return c.json({
			success: true,
			...result,
			stats: getMemoryStore().stats(),
		});
	});

	app.post("/sessions/sync", async (c) => {
		const body = await c.req.json().catch(() => ({}));
		const sessions = Array.isArray(body?.sessions)
			? body.sessions
			: Array.isArray(body?.data)
				? body.data
				: [];
		const result = getMemoryStore().upsertClaudeSessionMetadata(sessions);
		return c.json({
			success: true,
			...result,
			stats: getMemoryStore().stats(),
		});
	});

	app.post("/sessions/search", async (c) => {
		const body = await c.req.json().catch(() => ({}));
		const result = await getMemoryStore().searchSessions({
			query: typeof body.query === "string" ? body.query : undefined,
			limit: typeof body.limit === "number" ? body.limit : undefined,
			sort: typeof body.sort === "string" ? body.sort : undefined,
		});
		return c.json({ success: true, sessions: result });
	});

	app.post("/memory/import/claude-export", async (c) => {
		const body = await c.req.json();
		const source =
			typeof body?.source === "string" ? body.source : "claude_export";
		const payload = body?.conversations ?? body;
		const result = getMemoryStore().importClaudeExport(payload, source);
		return c.json({
			success: true,
			...result,
			stats: getMemoryStore().stats(),
		});
	});

	app.get("/memory/archive", (c) => {
		return c.json({ success: true, archive: archiveStats() });
	});

	app.post("/memory/reindex", async (c) => {
		const body = await c.req.json().catch(() => ({}));
		const root =
			typeof body?.root === "string" && body.root.trim()
				? body.root
				: undefined;
		const result = getMemoryStore().reindexArchive(root);
		return c.json({
			success: true,
			...result,
			stats: getMemoryStore().stats(),
		});
	});

	app.post("/memory/embed", async (c) => {
		const body = await c.req.json().catch(() => ({}));
		const provider =
			body.provider === "gemini" ||
			body.provider === "modal" ||
			body.provider === "local"
				? body.provider
				: "auto";
		const result = await getMemoryStore().embedMissingChunks({
			provider,
			model: typeof body.model === "string" ? body.model : undefined,
			dim: typeof body.dim === "number" ? body.dim : undefined,
			batchSize:
				typeof body.batchSize === "number" ? body.batchSize : undefined,
			limit: typeof body.limit === "number" ? body.limit : undefined,
		});
		return c.json({
			success: true,
			...result,
			stats: getMemoryStore().stats(),
		});
	});
}
