export type GatewayLogLevel = "log" | "info" | "warn" | "error" | "debug";

export interface GatewayLogEntry {
	timestamp: string;
	level: GatewayLogLevel;
	message: string;
}

const MAX_LOGS = Number(process.env.CLAUDE_GATEWAY_LOG_BUFFER_SIZE ?? 1000);
const entries: GatewayLogEntry[] = [];
let installed = false;

function stringifyArg(arg: unknown): string {
	if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
	if (typeof arg === "string") return arg;
	try {
		return JSON.stringify(arg);
	} catch {
		return String(arg);
	}
}

export function recordGatewayLog(
	level: GatewayLogLevel,
	args: unknown[],
): void {
	entries.push({
		timestamp: new Date().toISOString(),
		level,
		message: args.map(stringifyArg).join(" "),
	});
	while (entries.length > MAX_LOGS) entries.shift();
}

export function installGatewayLogCapture(): void {
	if (installed) return;
	installed = true;

	for (const level of ["log", "info", "warn", "error", "debug"] as const) {
		const original = console[level].bind(console);
		console[level] = (...args: unknown[]) => {
			recordGatewayLog(level, args);
			original(...args);
		};
	}
}

export function getGatewayLogs(
	opts: { level?: string; limit?: number; query?: string } = {},
): GatewayLogEntry[] {
	const limit = Math.max(1, Math.min(500, Number(opts.limit ?? 200)));
	const level = opts.level?.trim().toLowerCase();
	const query = opts.query?.trim().toLowerCase();
	let filtered = entries;
	if (level) filtered = filtered.filter((entry) => entry.level === level);
	if (query)
		filtered = filtered.filter((entry) =>
			entry.message.toLowerCase().includes(query),
		);
	return filtered.slice(-limit);
}
