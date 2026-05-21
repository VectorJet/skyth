import {
	pruneGatewayOutput,
	pruneGatewayOutputObject,
} from "@/gateway/utils/prune-output.ts";
import {
	fmtToolFailure,
	fmtToolInvocation,
} from "@/gateway/utils/log-format.ts";
import {
	finishToolCall,
	recordToolCallStart,
} from "@/gateway/server/tool-call-buffer.ts";
import { handleChatGptFetch } from "@/gateway/meta/tools/tool_fetch.ts";
import { handleChatGptSearch } from "@/gateway/meta/tools/search.ts";

function formatNativeOrStructuredResult(id: unknown, result: any) {
	const isNativeToolResult =
		result &&
		typeof result === "object" &&
		Array.isArray((result as any).content);
	const contentText = isNativeToolResult
		? (result as any).content
				.filter(
					(item: any) => item?.type === "text" && typeof item.text === "string",
				)
				.map((item: any) => item.text)
				.join("\n") || undefined
		: undefined;
	return {
		jsonrpc: "2.0",
		id,
		result: isNativeToolResult
			? pruneGatewayOutputObject({
					...(result as Record<string, unknown>),
					structuredContent: pruneGatewayOutput(
						(result as any).structuredContent ??
							(() => {
								const { content: _content, ...rest } = result as any;
								return { ...rest, text: contentText };
							})(),
					),
				})
			: {
					structuredContent: pruneGatewayOutputObject(result),
					content: [
						{
							type: "text",
							text:
								typeof result === "string"
									? result
									: JSON.stringify(pruneGatewayOutputObject(result), null, 2),
						},
					],
				},
	};
}

function formatToolErrorResponse(
	id: unknown,
	toolName: string,
	args: any,
	errMsg: string,
	getAllTools: () => Map<string, any>,
) {
	const tools = getAllTools();
	const toolDef = tools.get(toolName);
	const innerToolName: string | undefined =
		typeof args?.tool === "string" ? args.tool : undefined;
	const innerToolDef = innerToolName
		? tools.get(innerToolName.replace(/^(mcp:|pipeline:)/, ""))
		: undefined;
	const effectiveDef = innerToolDef || toolDef;
	const effectiveName = innerToolDef ? innerToolName! : toolName;
	const effectiveArgs =
		innerToolDef && args && typeof args === "object" && "args" in args
			? (args as any).args
			: args;
	const schema = effectiveDef?.inputSchema || {
		type: "object",
		properties: {},
	};
	const description = effectiveDef?.description || "";
	const nudgeLines: string[] = [`Tool "${effectiveName}" failed: ${errMsg}`];
	const missingMatch = /Required parameter "([^"]+)" is missing/.exec(errMsg);
	if (missingMatch) {
		const missing = missingMatch[1];
		nudgeLines.push(
			`\nYou must provide the "${missing}" argument when calling "${effectiveName}".`,
			`Provided arguments: ${JSON.stringify(effectiveArgs ?? {})}`,
			`Please retry the call with all required parameters set.`,
		);
	} else {
		nudgeLines.push(
			`\nProvided arguments: ${JSON.stringify(effectiveArgs ?? {})}`,
			`Please review the tool's input schema below and retry with corrected arguments.`,
		);
	}
	if (description) nudgeLines.push(`\nTool description: ${description}`);
	nudgeLines.push(
		`\nTool input schema for "${effectiveName}":\n${JSON.stringify(schema, null, 2)}`,
	);
	return {
		jsonrpc: "2.0",
		id,
		result: {
			isError: true,
			content: [{ type: "text", text: nudgeLines.join("\n") }],
		},
	};
}

export async function handleMcpToolCall(
	id: unknown,
	params: any,
	getAllTools: () => Map<string, any>,
	callTool: (toolName: string, args: Record<string, any>) => Promise<any>,
) {
	const { name: toolName, arguments: args } = params;
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
		args: args || {},
		source: "mcp",
	});
	console.log(
		fmtToolInvocation({
			tool: toolName,
			function: innerFn,
			args: innerArgs ?? args ?? {},
			callId: rec.id,
			source: "mcp",
		}),
	);
	const callStart = Date.now();
	try {
		const result =
			toolName === "search"
				? await handleChatGptSearch(args || {})
				: toolName === "fetch"
					? await handleChatGptFetch(args || {})
					: await callTool(toolName, args || {});
		finishToolCall(rec, {
			status: "ok",
			result,
			durationMs: Date.now() - callStart,
		});
		return formatNativeOrStructuredResult(id, result);
	} catch (error: any) {
		const errMsg = error?.message || String(error) || "Internal error";
		finishToolCall(rec, {
			status: "error",
			error: errMsg,
			durationMs: Date.now() - callStart,
		});
		console.error(
			fmtToolFailure({
				tool: toolName,
				function: innerFn,
				callId: rec.id,
				message: errMsg,
				durationMs: Date.now() - callStart,
				source: "mcp",
			}),
		);
		return formatToolErrorResponse(id, toolName, args, errMsg, getAllTools);
	}
}
