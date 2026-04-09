import { randomUUID } from "node:crypto";
import type { WebSocket, WebSocketServer } from "ws";
import type {
	GatewayClient,
	GatewayFrame,
	GatewayRequestFrame,
} from "@/gateway/protocol";
import { HANDSHAKE_TIMEOUT_MS, MAX_PAYLOAD_BYTES } from "@/gateway/protocol";

interface WsConnectionParams {
	wss: WebSocketServer;
	clients: Set<GatewayClient>;
	gatewayMethods: string[];
	validateToken: (token: string) => boolean;
	handleRequest: (
		method: string,
		params: unknown,
		client: GatewayClient,
	) => Promise<unknown>;
	onDisconnect?: (client: GatewayClient) => void;
	log: {
		info: (msg: string) => void;
		warn: (msg: string) => void;
	};
}

function send(socket: WebSocket, obj: unknown): void {
	try {
		socket.send(JSON.stringify(obj));
	} catch {
		/* connection may already be closing */
	}
}

function isValidFrame(data: unknown): data is GatewayFrame {
	if (typeof data !== "object" || data === null) return false;
	const frame = data as Record<string, unknown>;
	return (
		frame.type === "request" ||
		frame.type === "response" ||
		frame.type === "event"
	);
}

export function attachWsConnectionHandler(params: WsConnectionParams): void {
	const {
		wss,
		clients,
		gatewayMethods,
		validateToken,
		handleRequest,
		onDisconnect,
		log,
	} = params;

	wss.on("connection", (socket: WebSocket) => {
		const connId = randomUUID();
		let client: GatewayClient | null = null;
		let closed = false;

		log.info(`ws open conn=${connId}`);

		const connectNonce = randomUUID();
		send(socket, {
			type: "event",
			event: "connect.challenge",
			payload: { nonce: connectNonce, ts: Date.now() },
		});

		const handshakeTimer = setTimeout(() => {
			if (!client) {
				log.warn(`handshake timeout conn=${connId}`);
				close();
			}
		}, HANDSHAKE_TIMEOUT_MS);

		function close(code = 1000, reason?: string): void {
			if (closed) return;
			closed = true;
			clearTimeout(handshakeTimer);
			if (client) {
				clients.delete(client);
				onDisconnect?.(client);
			}
			try {
				socket.close(code, reason);
			} catch {
				/* already closed */
			}
			log.info(`ws close conn=${connId} code=${code}`);
		}

		socket.once("error", (err) => {
			log.warn(`ws error conn=${connId}: ${String(err)}`);
			close();
		});

		socket.once("close", () => {
			close();
		});

		socket.on("message", async (raw) => {
			if (closed) return;

			const bytes =
				typeof raw === "string"
					? Buffer.byteLength(raw, "utf8")
					: (raw as Buffer).length;
			if (bytes > MAX_PAYLOAD_BYTES) {
				log.warn(`payload too large conn=${connId} bytes=${bytes}`);
				send(socket, {
					type: "response",
					id: "0",
					error: { code: -32001, message: "payload too large" },
				});
				return;
			}

			let frame: GatewayFrame;
			try {
				frame = JSON.parse(
					typeof raw === "string" ? raw : raw.toString("utf8"),
				);
			} catch {
				log.warn(`malformed frame conn=${connId}`);
				return;
			}

			if (!isValidFrame(frame)) {
				log.warn(`invalid frame type conn=${connId}`);
				return;
			}

			// Pre-auth: only accept connect.auth requests
			if (!client) {
				if (frame.type !== "request") return;
				const req = frame as GatewayRequestFrame;

				if (req.method !== "connect.auth") {
					send(socket, {
						type: "response",
						id: req.id,
						error: { code: -32002, message: "authentication required" },
					});
					return;
				}

				const authParams = req.params as { token?: string } | undefined;
				const token = authParams?.token;

				if (!token) {
					log.warn(`auth failed: no token provided conn=${connId}`);
					send(socket, {
						type: "response",
						id: req.id,
						error: { code: -32003, message: "no token provided" },
					});
					close(4001, "no-token");
					return;
				}

				const isValid = validateToken(token);
				if (!isValid) {
					log.warn(`auth failed conn=${connId}`);
					send(socket, {
						type: "response",
						id: req.id,
						error: { code: -32003, message: "invalid token" },
					});
					close(4001, "auth-failed");
					return;
				}

				clearTimeout(handshakeTimer);
				client = {
					connId,
					socket,
					authenticatedAt: Date.now(),
					role: "client",
					metadata: { auth_token: token },
				};
				clients.add(client);

				send(socket, {
					type: "response",
					id: req.id,
					result: { status: "ok" },
				});
				send(socket, {
					type: "event",
					event: "connect.ok",
					payload: { connId, methods: gatewayMethods },
				});

				log.info(`authenticated conn=${connId}`);
				return;
			}

			// Post-auth: handle request frames
			if (frame.type === "request") {
				const req = frame as GatewayRequestFrame;

				try {
					const result = await handleRequest(req.method, req.params, client);
					send(socket, {
						type: "response",
						id: req.id,
						result,
					});
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					send(socket, {
						type: "response",
						id: req.id,
						error: { code: -32000, message },
					});
				}
			}
		});
	});
}
