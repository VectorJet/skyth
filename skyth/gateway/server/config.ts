export const PROTOCOL_VERSION = "2025-11-25";
export const DEFAULT_HOST =
	process.env.SKYTH_GATEWAY_HOST ??
	process.env.CLAUDE_GATEWAY_HOST ??
	"skyth-gateway.local";
export const PORT = Number(process.env.SKYTH_GATEWAY_PORT ?? 52000);
