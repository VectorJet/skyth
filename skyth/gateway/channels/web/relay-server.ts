import { spawn } from "node:child_process";
import { envFirst } from "@/gateway/config/env.ts";
import { relayListenPort } from "@/gateway/channels/web/constants.ts";

export function startWebRelayServer(): void {
	const relayPath = envFirst(
		"SKYTH_GATEWAY_RELAY_PATH",
		"CLAUDE_GATEWAY_RELAY_PATH",
	);
	if (relayPath) {
		console.log("[web] Starting relay server from:", relayPath);
		const child = spawn("bun", [relayPath], {
			detached: true,
			stdio: "ignore",
		});
		child.unref();
	} else if (
		envFirst(
			"SKYTH_GATEWAY_TELEGRAM_POLLING",
			"CLAUDE_GATEWAY_TELEGRAM_POLLING",
		) !== "0"
	) {
		const port = relayListenPort();
		try {
			const { WebSocketServer } = require("ws");
			const wss = new WebSocketServer({ port });
			wss.on("connection", (ws: any) => {
				ws.send(JSON.stringify({ type: "gateway-hello", role: "gateway" }));
			});
			console.log(`[web] Relay server started on ws://127.0.0.1:${port}`);
		} catch (err) {
			console.error(`[web] failed to start relay server on port ${port}:`, err);
		}
	}
}
