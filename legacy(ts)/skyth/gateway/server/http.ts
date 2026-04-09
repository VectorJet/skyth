import type { MessageBus } from "@/bus/queue";
import type { GatewayClient } from "@/gateway/protocol";
import { getNodeByToken } from "@/auth/cmd/token/shared";
import type { SessionManager } from "@/session/manager";

export interface HttpHandlerDeps {
	host: string;
	port: number;
	clients: Set<GatewayClient>;
	bus: MessageBus;
	validateToken: (token: string) => boolean;
	webHandler?: (
		req: import("http").IncomingMessage,
		res: import("http").ServerResponse,
	) => void | Promise<void>;
	webChannel?: import("@/channels/web").WebChannel;
	sessions?: SessionManager;
}

export function createHttpHandler(deps: HttpHandlerDeps) {
	const { host, port, clients, bus, webHandler, webChannel, sessions } = deps;

	return async function handleHttpRequest(
		req: import("http").IncomingMessage,
		res: import("http").ServerResponse,
	): Promise<void> {
		const url = new URL(req.url ?? "/", `http://${host}:${port}`);

		if (url.pathname === "/health" || url.pathname === "/healthz") {
			res.statusCode = 200;
			res.setHeader("Content-Type", "application/json; charset=utf-8");
			res.end(
				JSON.stringify({
					status: "ok",
					clients: clients.size,
					uptime: process.uptime(),
				}),
			);
			return;
		}

		if (url.pathname === "/status") {
			res.statusCode = 200;
			res.setHeader("Content-Type", "application/json; charset=utf-8");
			res.end(
				JSON.stringify({
					clients: clients.size,
					inboundQueue: bus.inboundSize,
					outboundQueue: bus.outboundSize,
				}),
			);
			return;
		}

		if (url.pathname === "/api/onboarding/status" && req.method === "GET") {
			try {
				const { isOnboardingComplete } = await import(
					"@/api/routes/onboardingRoute"
				);
				res.statusCode = 200;
				res.setHeader("Content-Type", "application/json; charset=utf-8");
				res.end(JSON.stringify({ onboardingComplete: isOnboardingComplete() }));
			} catch (error) {
				res.statusCode = 500;
				res.setHeader("Content-Type", "application/json; charset=utf-8");
				res.end(JSON.stringify({ error: "Failed to check onboarding status" }));
			}
			return;
		}

		if (url.pathname === "/api/onboarding/metadata" && req.method === "GET") {
			try {
				const { getOnboardingMetadata } = await import(
					"@/api/routes/onboardingRoute"
				);
				const meta = await getOnboardingMetadata();
				res.statusCode = 200;
				res.setHeader("Content-Type", "application/json; charset=utf-8");
				res.end(JSON.stringify(meta));
			} catch (error) {
				res.statusCode = 500;
				res.setHeader("Content-Type", "application/json; charset=utf-8");
				res.end(JSON.stringify({ error: "Failed to fetch onboarding metadata" }));
			}
			return;
		}

		if (url.pathname === "/api/onboarding" && req.method === "POST") {
			let body = "";
			for await (const chunk of req) {
				body += chunk;
			}
			try {
				const onboardReq = JSON.parse(body);
				const { handleOnboardingRequest } = await import(
					"@/api/routes/onboardingRoute"
				);
				const onboardRes = await handleOnboardingRequest(onboardReq);
				res.statusCode = onboardRes.success ? 200 : 400;
				res.setHeader("Content-Type", "application/json; charset=utf-8");
				res.end(JSON.stringify(onboardRes));
			} catch (error) {
				res.statusCode = 400;
				res.setHeader("Content-Type", "application/json; charset=utf-8");
				res.end(
					JSON.stringify({
						success: false,
						error: error instanceof Error ? error.message : "Invalid request",
					}),
				);
			}
			return;
		}

		if (url.pathname === "/api/auth" && req.method === "POST") {
			let body = "";
			for await (const chunk of req) {
				body += chunk;
			}
			try {
				const authReq = JSON.parse(body) as {
					username: string;
					password: string;
				};
				const { handleAuthRequest } = await import("@/api/routes/authRoute");
				const authRes = await handleAuthRequest(authReq);
				res.statusCode = authRes.success ? 200 : 401;
				res.setHeader("Content-Type", "application/json; charset=utf-8");
				res.end(JSON.stringify(authRes));
			} catch {
				res.statusCode = 400;
				res.setHeader("Content-Type", "application/json; charset=utf-8");
				res.end(JSON.stringify({ success: false, error: "Invalid request" }));
			}
			return;
		}

		if (url.pathname === "/api/chat" && req.method === "POST" && webChannel) {
			const { handleChatRequest } = await import("@/api/routes/chatRoute");
			await handleChatRequest(req, res, bus, webChannel);
			return;
		}

		if (url.pathname === "/api/sessions" && req.method === "GET" && sessions) {
			const token = (req.headers.authorization || "").trim();
			const node = getNodeByToken(token);
			if (!node || node.channel !== "web") {
				res.statusCode = 401;
				res.setHeader("Content-Type", "application/json; charset=utf-8");
				res.end(JSON.stringify({ success: false, error: "Unauthorized" }));
				return;
			}
			const allSessions = await sessions.listSessionsAsync();
			const sessionList = allSessions.map((s) => ({
				id: s.key,
				name: s.name || s.key.split(":").pop() || s.key,
				updatedAt: s.updated_at,
			}));
			res.statusCode = 200;
			res.setHeader("Content-Type", "application/json; charset=utf-8");
			res.end(JSON.stringify({ success: true, sessions: sessionList }));
			return;
		}

		if (
			url.pathname === "/api/sessions/history" &&
			req.method === "GET" &&
			sessions
		) {
			const token = (req.headers.authorization || "").trim();
			const node = getNodeByToken(token);
			if (!node || node.channel !== "web") {
				res.statusCode = 401;
				res.setHeader("Content-Type", "application/json; charset=utf-8");
				res.end(JSON.stringify({ success: false, error: "Unauthorized" }));
				return;
			}
			const sessionId = String(url.searchParams.get("sessionId") ?? "").trim();
			if (!sessionId) {
				res.statusCode = 400;
				res.setHeader("Content-Type", "application/json; charset=utf-8");
				res.end(
					JSON.stringify({ success: false, error: "sessionId required" }),
				);
				return;
			}
			const session = sessions.getOrCreate(sessionId);
			const messages = session.getHistory();
			res.statusCode = 200;
			res.setHeader("Content-Type", "application/json; charset=utf-8");
			res.end(JSON.stringify({ success: true, messages }));
			return;
		}

		if (url.pathname === "/api/sessions" && req.method === "POST" && sessions) {
			const token = (req.headers.authorization || "").trim();
			const node = getNodeByToken(token);
			if (!node || node.channel !== "web") {
				res.statusCode = 401;
				res.setHeader("Content-Type", "application/json; charset=utf-8");
				res.end(JSON.stringify({ success: false, error: "Unauthorized" }));
				return;
			}
			let body = "";
			for await (const chunk of req) {
				body += chunk;
			}
			try {
				const data = JSON.parse(body);
				const sessionId = data.sessionId;
				if (!sessionId) {
					res.statusCode = 400;
					res.setHeader("Content-Type", "application/json; charset=utf-8");
					res.end(
						JSON.stringify({ success: false, error: "sessionId required" }),
					);
					return;
				}
				const session = sessions.getOrCreate(sessionId);
				res.statusCode = 200;
				res.setHeader("Content-Type", "application/json; charset=utf-8");
				res.end(JSON.stringify({ success: true, sessionId: session.key }));
			} catch {
				res.statusCode = 400;
				res.setHeader("Content-Type", "application/json; charset=utf-8");
				res.end(JSON.stringify({ success: false, error: "Invalid JSON" }));
			}
			return;
		}

		if (
			webHandler &&
			(req.method === "GET" || req.method === "POST") &&
			!url.pathname.startsWith("/api/")
		) {
			await webHandler(req, res);
			return;
		}

		if (String(req.headers.upgrade ?? "").toLowerCase() === "websocket") {
			return;
		}

		res.statusCode = 404;
		res.setHeader("Content-Type", "text/plain; charset=utf-8");
		res.end("Not Found");
	};
}
