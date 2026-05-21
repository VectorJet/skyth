import type { SlashCommand } from "@/gateway/channels/types.ts";
import { getRuntime } from "@/gateway/channels/runtime.ts";
import { RagIndex } from "@/gateway/workspace/rag.ts";

/**
 * `/rag <query>` — runs BM25 search over the per-chat workspace index and
 * pushes the top hits back into the router as a `[GATEWAY]` preface so the
 * next Claude turn sees the retrieved context.
 *
 * `/rag --rebuild` re-indexes the workspace before searching.
 */
export default {
	name: "rag",
	description: "Run a workspace BM25 search (--rebuild to re-index)",
	handler: async ({ msg, args, reply }) => {
		const rt = getRuntime();
		const wsId = `${msg.channel}:${msg.chatId}`;
		const ws = await rt.workspaceManager.get(wsId);
		const rag = new RagIndex(ws);

		let query = args.trim();
		let rebuild = false;
		if (query.startsWith("--rebuild")) {
			rebuild = true;
			query = query.slice("--rebuild".length).trim();
		}

		if (rebuild) {
			const n = await rag.rebuild();
			await reply(`[GATEWAY] re-indexed ${n} chunks in ${ws.root}`);
			if (!query) return;
		}

		if (!query) {
			return reply(
				"[GATEWAY] usage: /rag <query>  (use --rebuild to re-index)",
			);
		}

		let hits = await rag.search(query, 5);
		if (hits.length === 0) {
			// First-time use: build implicitly, then retry once.
			const n = await rag.rebuild();
			hits = await rag.search(query, 5);
			if (hits.length === 0) {
				return reply(
					`[GATEWAY] no matches for "${query}" (indexed ${n} chunks)`,
				);
			}
		}

		const summary = hits
			.map(
				(h, i) =>
					`${i + 1}. [${h.score.toFixed(2)}] ${h.chunk.file}#${h.chunk.start}\n   ${h.chunk.text.slice(0, 240).replace(/\s+/g, " ")}`,
			)
			.join("\n");

		rt.channelManager.router.pushGateway(
			`RAG hits for "${query}":\n${summary}`,
			"rag",
		);
		await reply(`[GATEWAY] fed ${hits.length} hits to Claude.`);
	},
} satisfies SlashCommand;
