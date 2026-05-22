import { envFirst } from "@/gateway/config/env.ts";

export const DEFAULT_URL =
	envFirst("SKYTH_GATEWAY_EXT_WS", "CLAUDE_GATEWAY_EXT_WS") ??
	"ws://127.0.0.1:52027";

export const RELAY_TYPE = "gateway-turn";
export const NEW_THREAD_TYPE = "gateway-new-thread";
export const NEW_THREAD_RESULT_TYPE = "gateway-new-thread-result";
export const INCOMING_TYPE = "web-incoming";
export const RESPONSE_TYPE = "skyth-response";
export const LEGACY_RESPONSE_TYPE = "claude-response";

export function relayListenPort(): number {
	const raw = envFirst(
		"SKYTH_GATEWAY_WEB_RELAY_PORT",
		"CLAUDE_GATEWAY_WEB_RELAY_PORT",
	);
	if (raw === undefined || raw.trim() === "") return 52027;
	const parsed = Number(raw);
	if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
		throw new Error(
			"SKYTH_GATEWAY_WEB_RELAY_PORT must be an integer port in the range 1..65535",
		);
	}
	return parsed;
}
