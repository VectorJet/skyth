import { createServer, request as httpRequest, type Server as HttpServer } from "node:http";
import { WebSocketServer } from "ws";
import type { MessageBus } from "@/bus/queue";
import type { GatewayClient } from "@/gateway/protocol";
import { MAX_PAYLOAD_BYTES } from "@/gateway/protocol";
import { attachWsConnectionHandler } from "@/gateway/ws-connection";
import {
	startBonjourAdvertiser,
	type BonjourAdvertiser,
} from "@/gateway/discovery";
import { WebChannel } from "@/channels/web";
import type { SessionManager } from "@/session/manager";
import {
	createSessionsHandlers,
	createToolsHandlers,
	createAgentsHandlers,
	createModelsHandlers,
	createConfigHandlers,
	createChannelsHandlers,
	createCronHandlers,
	createHealthHandlers,
	createExecApprovalHandlers,
	createEventHandlers,
	createEventEmitter,
} from "@/gateway/handlers";

import type { ToolRegistry } from "@/registries/tool_registry";
import type { AgentRegistry } from "@/registries/agent_registry";
import type { ChannelManager } from "@/channels/manager";
import type { CronService } from "@/cron/service";
import type { EventEmitter } from "@/gateway/handlers/events";

import { GATEWAY_METHODS, createBroadcast, createNodeGetter } from "./utils";
import { createHttpHandler } from "./http";
import { createRequestHandler } from "./handlers";

export interface GatewayServerOpts {
	host: string;
	port: number;
	bus: MessageBus;
	webChannel?: WebChannel;
	sessions?: SessionManager;
	toolRegistry?: ToolRegistry;
	agentRegistry?: AgentRegistry;
	channelManager?: ChannelManager;
	cronService?: CronService;
	validateToken: (token: string) => boolean;
	enableDiscovery?: boolean;
	/** When set, non-gateway WebSocket upgrades are proxied to this origin (e.g. Vite HMR). */
	devProxyOrigin?: string;
	log: {
		info: (msg: string) => void;
		warn: (msg: string) => void;
	};
	webHandler?: (
		req: import("http").IncomingMessage,
		res: import("http").ServerResponse,
	) => void | Promise<void>;
}

export interface GatewayServer {
	httpServer: HttpServer;
	wss: WebSocketServer;
	clients: Set<GatewayClient>;
	broadcast: (event: string, payload?: unknown) => void;
	events: EventEmitter;
	close: () => Promise<void>;
}

export async function startGatewayServer(
	opts: GatewayServerOpts,
): Promise<GatewayServer> {
	const { host, port, bus, validateToken, log } = opts;
	const clients = new Set<GatewayClient>();
	let bonjourAdvertiser: BonjourAdvertiser | null = null;

	const httpHandler = createHttpHandler({
		host,
		port,
		clients,
		bus,
		validateToken,
		webHandler: opts.webHandler,
		webChannel: opts.webChannel,
		sessions: opts.sessions,
	});

	const httpServer = createServer(httpHandler);

	const wss = new WebSocketServer({
		noServer: true,
		maxPayload: MAX_PAYLOAD_BYTES,
	});

	httpServer.on("upgrade", (req, socket, head) => {
		const pathname = req.url || "/";
		const isGatewayWs = pathname === "/ws" || pathname.startsWith("/ws?");

		if (!isGatewayWs && opts.devProxyOrigin) {
			const target = new URL(opts.devProxyOrigin);
			const proxyReq = httpRequest({
				hostname: target.hostname,
				port: target.port,
				path: pathname,
				method: req.method,
				headers: req.headers,
			});
			proxyReq.on("upgrade", (_proxyRes, proxySocket, proxyHead) => {
				socket.write(
					`HTTP/1.1 101 Switching Protocols\r\n` +
						Object.entries(_proxyRes.headers)
							.map(([k, v]) => `${k}: ${v}`)
							.join("\r\n") +
						"\r\n\r\n",
				);
				if (proxyHead.length) socket.write(proxyHead);
				proxySocket.pipe(socket);
				socket.pipe(proxySocket);
			});
			proxyReq.on("error", () => socket.destroy());
			proxyReq.end();
			return;
		}

		wss.handleUpgrade(req, socket, head, (ws) => {
			wss.emit("connection", ws, req);
		});
	});

	const getAuthenticatedNode = createNodeGetter("auth_token");

	// Create session handlers with dependencies
	const sessionsHandlers = createSessionsHandlers({
		sessions: opts.sessions!,
		getAuthenticatedNode,
	});

	// Create tools handlers if tool registry is available
	const toolsHandlers = opts.toolRegistry
		? createToolsHandlers({
				toolRegistry: opts.toolRegistry,
				getAuthenticatedNode,
			})
		: null;

	// Create agents handlers if agent registry is available
	const agentsHandlers = opts.agentRegistry
		? createAgentsHandlers({
				agentRegistry: opts.agentRegistry,
				getAuthenticatedNode,
			})
		: null;

	// Create models handlers (requires model state management)
	let selectedModel: string | null = null;
	const modelsHandlers = createModelsHandlers({
		getAuthenticatedNode,
		getSelectedModel: () => selectedModel,
		setSelectedModel: (model: string) => {
			selectedModel = model;
		},
	});

	// Create config handlers
	const configHandlers = createConfigHandlers({
		getAuthenticatedNode,
	});

	// Create channels handlers if channel manager is available
	const channelsHandlers = opts.channelManager
		? createChannelsHandlers({
				channelManager: opts.channelManager,
				getAuthenticatedNode,
			})
		: null;

	// Create cron handlers if cron service is available
	const cronHandlers = opts.cronService
		? createCronHandlers({
				cronService: opts.cronService,
				getAuthenticatedNode,
			})
		: null;

	// Create health handlers
	const healthHandlers = createHealthHandlers({
		bus,
		channelManager: opts.channelManager,
		cronService: opts.cronService,
		sessions: opts.sessions,
		clients,
		getAuthenticatedNode,
	});

	// Create broadcast function
	const broadcast = createBroadcast(clients);

	// Create exec-approvals handlers
	const execApprovalHandlers = createExecApprovalHandlers({
		broadcast,
		getAuthenticatedNode,
	});

	// Create event handlers
	const eventHandlers = createEventHandlers({
		broadcast,
		clients,
		getAuthenticatedNode,
	});

	// Create the request handler
	const handleRequest = createRequestHandler(
		{ bus, clients, validateToken, getAuthenticatedNode },
		{
			sessionsHandlers,
			toolsHandlers,
			agentsHandlers,
			modelsHandlers,
			configHandlers,
			channelsHandlers,
			cronHandlers,
			healthHandlers,
			execApprovalHandlers,
			eventHandlers,
		},
	);

	attachWsConnectionHandler({
		wss,
		clients,
		gatewayMethods: [...GATEWAY_METHODS],
		validateToken,
		handleRequest,
		onDisconnect: (client) => {
			log.info(`client disconnected conn=${client.connId}`);
		},
		log,
	});

	await new Promise<void>((resolve, reject) => {
		httpServer.once("error", reject);
		httpServer.listen(port, host, () => {
			httpServer.removeListener("error", reject);
			resolve();
		});
	});

	log.info(`gateway server listening on ${host}:${port}`);

	if (opts.enableDiscovery !== false) {
		try {
			bonjourAdvertiser = await startBonjourAdvertiser({
				gatewayPort: port,
			});
		} catch (err) {
			log.warn(`bonjour advertising failed: ${String(err)}`);
		}
	}

	const close = async () => {
		if (bonjourAdvertiser) {
			await bonjourAdvertiser.stop();
		}
		for (const client of clients) {
			try {
				client.socket.close(1001, "server-shutdown");
			} catch {
				/* ignore */
			}
		}
		clients.clear();
		wss.close();
		await new Promise<void>((resolve) => {
			httpServer.close(() => resolve());
		});
		log.info("gateway server stopped");
	};

	// Create event emitter for other components to use
	const events = createEventEmitter(broadcast);

	return { httpServer, wss, clients, broadcast, events, close };
}

// Re-export types and constants
export { GATEWAY_METHODS } from "./utils";
