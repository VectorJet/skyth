import { PROTOCOL_VERSION } from "@/gateway/server/config";

export function createMcpHeadersMiddleware(getSessionId: () => string | null) {
	return async (c: any, next: any) => {
		await next();
		if (c.res.headers.get("MCP-Protocol-Version") === null) {
			c.res.headers.set("MCP-Protocol-Version", PROTOCOL_VERSION);
		}
		const sessionId = getSessionId();
		if (sessionId && c.res.headers.get("Mcp-Session-Id") === null) {
			c.res.headers.set("Mcp-Session-Id", sessionId);
		}
	};
}
