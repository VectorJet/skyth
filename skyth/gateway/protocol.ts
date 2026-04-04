import type { WebSocket } from "ws";

export const HANDSHAKE_TIMEOUT_MS = 10_000;
export const MAX_PAYLOAD_BYTES = 4 * 1024 * 1024;

export interface GatewayRequestFrame {
	type: "request";
	id: string;
	method: string;
	params?: unknown;
}

export interface GatewayResponseFrame {
	type: "response";
	id: string;
	result?: unknown;
	error?: { code: number; message: string };
}

export interface GatewayEventFrame {
	type: "event";
	event: string;
	payload?: unknown;
}

export type GatewayFrame =
	| GatewayRequestFrame
	| GatewayResponseFrame
	| GatewayEventFrame;

export interface GatewayClient {
	connId: string;
	socket: WebSocket;
	authenticatedAt: number | null;
	role: string;
	metadata: Record<string, unknown>;
}
