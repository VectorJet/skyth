import chalk from "chalk";

function shortTime(d = new Date()): string {
	const pad = (n: number, w = 2) => String(n).padStart(w, "0");
	return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

export function fmtTimestamp(): string {
	return chalk.gray(shortTime());
}

function statusColor(status: number) {
	if (status >= 500) return chalk.red;
	if (status >= 400) return chalk.yellow;
	if (status >= 300) return chalk.cyan;
	if (status >= 200) return chalk.green;
	return chalk.gray;
}

function methodColor(method: string) {
	switch (method) {
		case "GET":
			return chalk.cyan;
		case "POST":
			return chalk.green;
		case "PUT":
			return chalk.yellow;
		case "PATCH":
			return chalk.yellow;
		case "DELETE":
			return chalk.red;
		default:
			return chalk.gray;
	}
}

export function fmtRequest(
	method: string,
	path: string,
	status: number,
	durationMs: number,
): string {
	const mc = methodColor(method);
	const sc = statusColor(status);
	const dur =
		durationMs > 1000
			? chalk.yellow(`${durationMs}ms`)
			: chalk.gray(`${durationMs}ms`);
	return `${fmtTimestamp()} ${mc(method.padEnd(4))} ${path} ${sc(String(status))} ${dur}`;
}

/**
 * Single-line, lossy summary of args for the console. Shows top-level scalar
 * key=value pairs and a brief count for arrays/objects. Full args are still
 * available via the debug route (see tool-call-buffer).
 */
export function fmtArgsSummary(args: unknown): string {
	if (args === undefined || args === null) return chalk.gray("—");
	if (typeof args !== "object") {
		const s = String(args);
		return chalk.gray(s.length > 60 ? s.slice(0, 60) + "…" : s);
	}
	const obj = args as Record<string, unknown>;
	const keys = Object.keys(obj);
	if (keys.length === 0) return chalk.gray("{}");

	const parts: string[] = [];
	let omitted = 0;
	for (const k of keys) {
		if (parts.join(" ").length > 80) {
			omitted = keys.length - parts.length;
			break;
		}
		parts.push(`${chalk.cyan(k)}=${fmtScalar(obj[k])}`);
	}
	if (omitted > 0) parts.push(chalk.gray(`+${omitted} more`));
	return parts.join(" ");
}

function fmtScalar(v: unknown): string {
	if (v === null) return chalk.gray("null");
	if (v === undefined) return chalk.gray("undefined");
	if (typeof v === "string") {
		const s = v.length > 30 ? v.slice(0, 30) + "…" : v;
		return chalk.green(JSON.stringify(s));
	}
	if (typeof v === "number" || typeof v === "boolean")
		return chalk.yellow(String(v));
	if (Array.isArray(v)) return chalk.gray(`[${v.length}]`);
	if (typeof v === "object")
		return chalk.gray(`{${Object.keys(v as object).length}}`);
	return chalk.gray(String(v));
}

/**
 * Format a tool invocation header in [tool][function] style with a compact
 * args summary and a debug id pointer.
 *
 *   ▶ [execute_tool][composio_search_tools] queries=[1] model="gpt-5.2" #abc123
 */
export function fmtToolInvocation(opts: {
	tool: string;
	function?: string;
	args: unknown;
	callId: string;
	marker?: string;
	source?: string;
}): string {
	const marker = chalk.cyan(opts.marker ?? "▶");
	const label = opts.function
		? `${chalk.bold("[" + opts.tool + "]")}${chalk.bold.cyan("[" + opts.function + "]")}`
		: chalk.bold("[" + opts.tool + "]");
	const summary = fmtArgsSummary(opts.args);
	const id = chalk.dim(`#${opts.callId}`);
	const src = opts.source ? chalk.dim(`(${opts.source})`) : "";
	return [marker, label, src, summary, id].filter(Boolean).join(" ");
}

/**
 * Failure line variant of fmtToolInvocation. Errors are kept on a separate
 * indented line so the header stays one line.
 */
export function fmtToolFailure(opts: {
	tool: string;
	function?: string;
	callId: string;
	message: string;
	durationMs?: number;
	source?: string;
}): string {
	const label = opts.function
		? `${chalk.bold("[" + opts.tool + "]")}${chalk.bold.cyan("[" + opts.function + "]")}`
		: chalk.bold("[" + opts.tool + "]");
	const dur =
		opts.durationMs !== undefined ? chalk.gray(`${opts.durationMs}ms`) : "";
	const id = chalk.dim(`#${opts.callId}`);
	const src = opts.source ? chalk.dim(`(${opts.source})`) : "";
	const head = [chalk.red("✗"), label, src, chalk.dim("failed"), dur, id]
		.filter(Boolean)
		.join(" ");
	return `${head}\n${fmtErrorMessage(opts.message)}\n  ${chalk.dim(`→ details: GET /debug/calls/${opts.callId}`)}`;
}

/**
 * Format a verbose error message such as the "Tool X not found. Available tools: ..."
 * blob produced by execute_tool into a multi-line, readable block.
 */
export function fmtToolError(message: string): string {
	if (!message) return chalk.red("(no message)");

	// Detect the "Tool not found" shape and render it nicely.
	const notFoundMatch = /^Tool "([^"]+)" not found\.\s*(.*)$/s.exec(message);
	if (!notFoundMatch) return chalk.red(message);

	const missingTool = notFoundMatch[1] ?? "";
	const rest = notFoundMatch[2] ?? "";
	const lines: string[] = [chalk.red(`✗ Tool "${missingTool}" not found`)];

	// Parse "X: a, b, c." sections (Available tools, Available MCP tools, ...).
	const sections = rest
		.split(/\.\s+/)
		.map((s) => s.trim())
		.filter(Boolean);
	let hint = "";
	for (const section of sections) {
		const m = /^([A-Za-z][A-Za-z ]*?):\s*(.*)$/.exec(
			section.replace(/\.$/, ""),
		);
		if (!m) {
			if (section)
				hint +=
					(hint ? " " : "") + section + (section.endsWith(".") ? "" : ".");
			continue;
		}
		const label = (m[1] ?? "").trim();
		const items = (m[2] ?? "").split(/,\s*/).filter(Boolean);
		if (items.length === 0) continue;
		lines.push(chalk.dim(`  ${label} (${items.length}):`));
		lines.push(...wrapList(items, 4, 90).map((l) => chalk.gray(l)));
	}
	if (hint) lines.push(chalk.yellow(`  → ${hint}`));
	return lines.join("\n");
}

function wrapList(items: string[], indent: number, maxWidth: number): string[] {
	const pad = " ".repeat(indent);
	const lines: string[] = [];
	let current = pad;
	for (let i = 0; i < items.length; i++) {
		const piece = items[i] + (i < items.length - 1 ? ", " : "");
		if (current.length + piece.length > maxWidth && current.trim().length > 0) {
			lines.push(current.trimEnd());
			current = pad;
		}
		current += piece;
	}
	if (current.trim().length > 0) lines.push(current.trimEnd());
	return lines;
}

/**
 * Format any Error.message for log output. Routes "Tool not found" through
 * fmtToolError; falls back to single-line red text otherwise.
 */
export function fmtErrorMessage(message: string): string {
	if (/^Tool "[^"]+" not found\./.test(message)) return fmtToolError(message);
	if (message.length <= 200) return chalk.red(message);
	return chalk.red(message.slice(0, 200) + `…(+${message.length - 200} chars)`);
}
