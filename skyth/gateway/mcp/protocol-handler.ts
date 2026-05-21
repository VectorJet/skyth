import type { Hono } from "hono";
import { DEFAULT_HOST, PROTOCOL_VERSION } from "@/gateway/server/config";
import type { SessionManager } from "@/gateway/mcp/session";
import type { SSEManager } from "@/gateway/mcp/sse-manager";
import { chatGptSearchTool } from "@/gateway/meta/tools/search.ts";
import { chatGptFetchTool } from "@/gateway/meta/tools/tool_fetch.ts";
import { handleMcpToolCall } from "@/gateway/mcp/tool-call.ts";

const SERVER_INSTRUCTIONS =
	"This MCP gateway provides searchable Claude Gateway memory and tool access. For ChatGPT connectors, use search to find relevant indexed conversations, then fetch to retrieve the selected conversation content.";

const genericOutputSchema = {
	type: "object",
	additionalProperties: true,
};

export function registerMcpProtocolRoutes(
	app: Hono,
	sessionManager: SessionManager,
	sseManager: SSEManager,
	getAllTools: () => Map<string, any>,
	callTool: (toolName: string, args: Record<string, any>) => Promise<any>,
) {
	// 1. Unified MCP protocol endpoint (Legacy compatibility)
	app.all("/mcp", async (c) => {
		const method = c.req.method;
		if (method === "GET") return handleSse(c);
		if (method === "POST") return handleMessages(c);
		return c.text("Method not allowed", 405);
	});

	// 2. Dedicated SSE endpoint
	app.get("/mcp/sse", (c) => handleSse(c));
	app.get("/sse", (c) => handleSse(c, "/messages"));
	app.post("/sse", (c) => handleMessages(c));

	// 3. Dedicated Messages endpoint
	app.post("/mcp/messages", (c) => handleMessages(c));
	app.post("/messages", (c) => handleMessages(c));

	// 4. MCP Status/Health check (Human-readable)
	app.get("/mcp", (c) => {
		return c.json({
			status: "ok",
			transport: "Streamable HTTP / SSE",
			protocolVersion: PROTOCOL_VERSION,
			endpoints: {
				sse: "/mcp/sse",
				messages: "/mcp/messages",
			},
			host: c.req.header("host"),
			headers: {
				"mcp-session-id": c.req.header("Mcp-Session-Id"),
				accept: c.req.header("Accept"),
			},
		});
	});

	async function handleSse(c: any, messagesPath = "/mcp/messages") {
		const accept = c.req.header("Accept") || "";
		const host = c.req.header("host") || DEFAULT_HOST;
		// zrok uses https for the public endpoint
		const protocol = host.includes("zrok.io") ? "https" : "http";

		console.log(
			`[MCP] Incoming SSE connection (Host: ${host}, Accept: ${accept})`,
		);

		// Support standard SSE and wildcard accepts
		if (
			accept !== "*/*" &&
			!accept.includes("text/event-stream") &&
			accept !== ""
		) {
			console.warn(
				`[MCP] Rejecting SSE request with invalid Accept: ${accept}`,
			);
			return c.text("Not Acceptable", 406);
		}

		// Initialize session if not exists
		if (!sessionManager.hasSession()) {
			sessionManager.createSession();
		}
		const activeSessionId = sessionManager.getSessionId()!;

		const stream = new ReadableStream({
			start(controller) {
				sseManager.addClient(controller);
				const encoder = new TextEncoder();

				// Mandatory MCP SSE handshake: send the POST endpoint
				// Provide the absolute URL to ensure Claude's backend can reach it
				const endpointUrl = `${protocol}://${host}${messagesPath}?sessionId=${activeSessionId}`;
				controller.enqueue(
					encoder.encode(`event: endpoint\ndata: ${endpointUrl}\n\n`),
				);
				console.log(`[MCP] Sent endpoint event: ${endpointUrl}`);

				const keepAlive = setInterval(() => {
					try {
						// Standard MCP keepalive is a comment
						controller.enqueue(encoder.encode(`: \n\n`));
					} catch (e) {
						clearInterval(keepAlive);
						sseManager.removeClient(controller);
					}
				}, 15000);

				c.req.raw.signal?.addEventListener("abort", () => {
					console.log(
						`[MCP] SSE connection closed for session ${activeSessionId}`,
					);
					clearInterval(keepAlive);
					sseManager.removeClient(controller);
					try {
						controller.close();
					} catch (e) {}
				});
			},
		});

		return new Response(stream, {
			headers: {
				"Content-Type": "text/event-stream",
				"Cache-Control": "no-cache",
				Connection: "keep-alive",
				"X-Accel-Buffering": "no",
				"MCP-Protocol-Version": PROTOCOL_VERSION,
				"Mcp-Session-Id": activeSessionId,
				"Access-Control-Allow-Origin": "*",
			},
		});
	}

	async function handleMessages(c: any) {
		const querySessionId = c.req.query("sessionId");
		const headerSessionId = c.req.header("Mcp-Session-Id");
		const sessionId = headerSessionId || querySessionId;

		try {
			const rawBody = await c.req.text();
			if (!rawBody.trim()) {
				console.log(
					`[MCP] Empty message probe (Session: ${sessionId || "none"})`,
				);
				return new Response(null, { status: 204 });
			}

			const body = JSON.parse(rawBody);
			const { jsonrpc, id, method: rpcMethod, params } = body;

			console.log(
				`[MCP] Message: ${rpcMethod} (id: ${id}, Session: ${sessionId || "none"})`,
			);

			// Handle initialize request
			if (rpcMethod === "initialize") {
				// Ensure session exists
				if (!sessionManager.hasSession()) {
					sessionManager.createSession();
				}
				const activeSessionId = sessionManager.getSessionId()!;

				const response = {
					jsonrpc: "2.0",
					id,
					result: {
						protocolVersion: PROTOCOL_VERSION,
						capabilities: {
							tools: {
								listChanged: true,
							},
							resources: {
								subscribe: true,
								listChanged: true,
							},
							prompts: {
								listChanged: true,
							},
							logging: {},
						},
						instructions: SERVER_INSTRUCTIONS,
						serverInfo: {
							name: "mcp-gateway",
							version: "1.0.0",
						},
					},
				};
				console.log(
					`[MCP] Initialization complete for protocol ${PROTOCOL_VERSION} (Session: ${activeSessionId})`,
				);

				// Explicitly set the session header in the response
				c.header("Mcp-Session-Id", activeSessionId);
				c.header("MCP-Protocol-Version", PROTOCOL_VERSION);

				return c.json(response);
			}

			// Handle tools/list request
			if (rpcMethod === "tools/list") {
				const tools = getAllTools();
				const toolsList = [
					chatGptSearchTool,
					chatGptFetchTool,
					...Array.from(tools.values()).map((tool) => ({
						name: tool.name,
						description: tool.description || "",
						inputSchema: tool.inputSchema || { type: "object", properties: {} },
						outputSchema: tool.outputSchema || genericOutputSchema,
					})),
				];

				const response = {
					jsonrpc: "2.0",
					id,
					result: {
						tools: toolsList,
					},
				};
				console.log(`[MCP] Returned ${toolsList.length} tools`);
				return c.json(response);
			}

			if (rpcMethod === "tools/call") {
				return c.json(
					await handleMcpToolCall(id, params, getAllTools, callTool),
				);
			}

			// Handle notifications (no response needed)
			if (rpcMethod?.startsWith("notifications/")) {
				console.log(`[MCP] Received notification: ${rpcMethod}`);
				return new Response(null, { status: 204 });
			}

			// Generic success for other methods to avoid hangs
			return c.json({
				jsonrpc: "2.0",
				id,
				result: {},
			});
		} catch (error: any) {
			console.error(`[MCP] Parse error: ${error.message}`);
			return c.json(
				{
					jsonrpc: "2.0",
					error: {
						code: -32700,
						message: "Parse error",
					},
				},
				400,
			);
		}
	}
}
