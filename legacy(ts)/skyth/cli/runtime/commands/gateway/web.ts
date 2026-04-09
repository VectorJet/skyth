import { existsSync } from "node:fs";
import { join } from "node:path";
import http from "node:http";
import { startGatewayServer } from "@/gateway/server";
import { WebChannel } from "@/channels/web";
import type { ChannelManager } from "@/channels/manager";
import type { MessageBus } from "@/bus/queue";
import type { AgentLoop } from "@/base/base_agent/runtime";
import { Config } from "@/config/schema";
import type { EmitFn } from "./utils";
import { boolFlag, strFlag } from "@/cli/runtime_helpers";
import { secureCompare, getNodeByToken } from "./trust";

export interface WebHandlerResult {
	handler:
		| ((
				req: import("http").IncomingMessage,
				res: import("http").ServerResponse,
		  ) => void | Promise<void>)
		| undefined;
	enabled: boolean;
}

const VITE_DEV_ORIGIN = "http://127.0.0.1:15173";

function createViteDevProxy(): NonNullable<WebHandlerResult["handler"]> {
	return (req, res) => {
		const proxyReq = http.request(
			VITE_DEV_ORIGIN + (req.url || "/"),
			{ method: req.method, headers: req.headers },
			(proxyRes) => {
				res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
				proxyRes.pipe(res, { end: true });
			},
		);
		proxyReq.on("error", () => {
			res.writeHead(502);
			res.end("Vite dev server not available");
		});
		req.pipe(proxyReq, { end: true });
	};
}

export async function loadWebHandler(
	emit: EmitFn,
	enableDevMode = false,
): Promise<WebHandlerResult> {
	if (enableDevMode) {
		emit(
			"event",
			"gateway",
			"web",
			`dev proxy -> ${VITE_DEV_ORIGIN}`,
			undefined,
			undefined,
			false,
			true,
		);
		return { handler: createViteDevProxy(), enabled: true };
	}
	try {
		const webPath = join(
			process.cwd(),
			"platforms",
			"web",
			"build",
			"handler.js",
		);
		if (existsSync(webPath)) {
			const web = await import(webPath);
			emit(
				"event",
				"gateway",
				"web",
				"enabled",
				undefined,
				undefined,
				false,
				true,
			);
			return { handler: web.handler, enabled: true };
		}
		emit(
			"event",
			"gateway",
			"web",
			"not found, run: cd platforms/web && bun run build",
			undefined,
			undefined,
			true,
			true,
		);
		return { handler: undefined, enabled: false };
	} catch (err) {
		emit(
			"event",
			"gateway",
			"web",
			`error: ${String(err)}`,
			undefined,
			undefined,
			true,
			true,
		);
		return { handler: undefined, enabled: false };
	}
}

export async function startGatewayWsServer(
	enableWs: boolean,
	webHandler:
		| ((
				req: import("http").IncomingMessage,
				res: import("http").ServerResponse,
		  ) => void | Promise<void>)
		| undefined,
	cfg: Config,
	port: number,
	bus: MessageBus,
	channels: ChannelManager,
	agent: AgentLoop,
	emit: EmitFn,
	flags: Record<string, unknown>,
): Promise<Awaited<ReturnType<typeof startGatewayServer>> | null> {
	if (!enableWs && !webHandler) {
		emit(
			"event",
			"gateway",
			"ws",
			"disabled (no --ws or --web)",
			undefined,
			undefined,
			false,
			true,
		);
		return null;
	}

	const gwHost = cfg.gateway.host;
	const gwPort = port;
	const enableDiscovery = boolFlag(
		flags as Record<string, string | boolean>,
		"discovery",
		true,
	);
	const gwToken =
		strFlag(flags as Record<string, string>, "gateway_token") ??
		process.env.SKYTH_GATEWAY_TOKEN;
	const webChannel = channels.getChannel("web");

	const enableDevMode = boolFlag(
		flags as Record<string, string | boolean>,
		"dev",
		false,
	);

	const gwServer = await startGatewayServer({
		host: gwHost,
		port: gwPort,
		bus,
		webChannel: webChannel instanceof WebChannel ? webChannel : undefined,
		sessions: agent.sessions,
		enableDiscovery,
		devProxyOrigin: enableDevMode ? VITE_DEV_ORIGIN : undefined,
		validateToken: (token) => {
			if (gwToken && secureCompare(token, gwToken)) return true;
			const node = getNodeByToken(token);
			return !!node;
		},
		log: {
			info: (msg) =>
				emit("event", "ws", "info", msg, undefined, undefined, false, true),
			warn: (msg) =>
				emit("event", "ws", "warn", msg, undefined, undefined, true, true),
		},
		webHandler,
	});

	if (gwServer && webChannel instanceof WebChannel) {
		webChannel.setBroadcastFn(gwServer.broadcast);
	}

	emit(
		"event",
		"gateway",
		"server",
		`${gwHost}:${gwPort}`,
		undefined,
		undefined,
		false,
		true,
	);

	return gwServer;
}
