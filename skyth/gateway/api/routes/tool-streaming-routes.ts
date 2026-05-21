import type { Hono } from "hono";
import type { StdioToHttpsConverter } from "@/gateway/converters/index.ts";
import {
	fmtToolInvocation,
	fmtToolFailure,
} from "@/gateway/utils/log-format.ts";
import {
	recordToolCallStart,
	finishToolCall,
} from "@/gateway/server/tool-call-buffer.ts";

export function registerToolStreamingRoutes(
	app: Hono,
	callTool: (toolName: string, args: Record<string, any>) => Promise<any>,
) {
	// Execute a tool with streaming response
	app.post("/tools/:toolName/stream", async (c) => {
		const toolName = c.req.param("toolName");

		try {
			const body = await c.req.json();
			const args = body.arguments || body.args || {};

			const innerFn =
				toolName === "execute_tool" && typeof args?.tool === "string"
					? args.tool
					: undefined;
			const innerArgs =
				innerFn && args && typeof args === "object" && "args" in args
					? (args as any).args
					: args;
			const rec = recordToolCallStart({
				tool: toolName,
				function: innerFn,
				args,
				source: "stream",
			});
			console.log(
				fmtToolInvocation({
					tool: toolName,
					function: innerFn,
					args: innerArgs ?? args,
					callId: rec.id,
					source: "stream",
				}),
			);

			const start = Date.now();
			try {
				// Create a streaming response
				const { StdioToHttpsConverter } = await import(
					"@/gateway/converters/index.ts"
				);
				const chunkCounts: Record<string, number> = {};
				const stream = await StdioToHttpsConverter.convertToStream(
					async () => {
						return await callTool(toolName, args);
					},
					(chunk) => {
						chunkCounts[chunk.type] = (chunkCounts[chunk.type] ?? 0) + 1;
					},
				);
				finishToolCall(rec, {
					status: "ok",
					result: { streamed: true, chunks: chunkCounts },
					durationMs: Date.now() - start,
				});
				return StdioToHttpsConverter.createStreamingResponse(stream);
			} catch (innerErr: any) {
				finishToolCall(rec, {
					status: "error",
					error: innerErr?.message || String(innerErr),
					durationMs: Date.now() - start,
				});
				console.error(
					fmtToolFailure({
						tool: toolName,
						function: innerFn,
						callId: rec.id,
						message: innerErr?.message || String(innerErr),
						durationMs: Date.now() - start,
						source: "stream",
					}),
				);
				throw innerErr;
			}
		} catch (error: any) {
			// outer parse/setup error

			return c.json(
				{
					success: false,
					tool: toolName,
					error: error.message || "Unknown error",
				},
				500,
			);
		}
	});
}
