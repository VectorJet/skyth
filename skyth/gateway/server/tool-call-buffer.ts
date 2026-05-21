/**
 * Stores full payloads of recent tool calls so the console can show a single
 * compact line per call and the full args/result/error can be fetched on
 * demand via the debug route.
 */

export type ToolCallStatus = "pending" | "ok" | "error";

export interface ToolCallRecord {
	id: string;
	timestamp: string;
	tool: string;
	function?: string; // wrapped tool name when tool === 'execute_tool'
	status: ToolCallStatus;
	durationMs?: number;
	args: unknown;
	result?: unknown;
	error?: string;
	source: "http" | "mcp" | "stream";
}

const MAX = Number(process.env.CLAUDE_GATEWAY_CALL_BUFFER_SIZE ?? 500);
const records: ToolCallRecord[] = [];
const byId = new Map<string, ToolCallRecord>();
let counter = 0;

function nextId(): string {
	counter = (counter + 1) % 0xffff;
	return (
		Date.now().toString(36).slice(-4) + counter.toString(36).padStart(3, "0")
	);
}

export function recordToolCallStart(input: {
	tool: string;
	function?: string;
	args: unknown;
	source: ToolCallRecord["source"];
}): ToolCallRecord {
	const rec: ToolCallRecord = {
		id: nextId(),
		timestamp: new Date().toISOString(),
		tool: input.tool,
		function: input.function,
		status: "pending",
		args: input.args,
		source: input.source,
	};
	records.push(rec);
	byId.set(rec.id, rec);
	while (records.length > MAX) {
		const evicted = records.shift();
		if (evicted) byId.delete(evicted.id);
	}
	return rec;
}

export function finishToolCall(
	rec: ToolCallRecord,
	outcome:
		| { status: "ok"; result: unknown; durationMs: number }
		| { status: "error"; error: string; durationMs: number },
): void {
	rec.status = outcome.status;
	rec.durationMs = outcome.durationMs;
	if (outcome.status === "ok") rec.result = outcome.result;
	else rec.error = outcome.error;
}

export function getToolCall(id: string): ToolCallRecord | undefined {
	return byId.get(id);
}

export function listToolCalls(
	opts: { limit?: number; tool?: string; status?: ToolCallStatus } = {},
): ToolCallRecord[] {
	const limit = Math.max(1, Math.min(500, Number(opts.limit ?? 100)));
	let out = records;
	if (opts.tool)
		out = out.filter((r) => r.tool === opts.tool || r.function === opts.tool);
	if (opts.status) out = out.filter((r) => r.status === opts.status);
	return out.slice(-limit);
}
