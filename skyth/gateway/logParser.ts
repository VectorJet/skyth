import chalk from "chalk";

export interface SourceLocation {
	function: string;
	file: string;
	line: number;
}

export interface LogEntry {
	time: string;
	level: "TRACE" | "DEBUG" | "INFO" | "WARN" | "ERROR";
	source?: SourceLocation;
	msg: string;
	[key: string]: unknown;
}

const LEVEL_COLORS: Record<string, (text: string) => string> = {
	TRACE: (t) => chalk.gray(t),
	DEBUG: (t) => chalk.blue(t),
	INFO: (t) => chalk.green(t),
	WARN: (t) => chalk.yellow(t),
	ERROR: (t) => chalk.red(t),
};

function formatTimestamp(time: string): string {
	const date = new Date(time);
	if (isNaN(date.getTime())) return time;
	return chalk.dim(date.toISOString().replace("T", " ").replace("Z", " UTC"));
}

function truncateFunction(func: string, maxLen = 40): string {
	if (func.length <= maxLen) return func;
	const parts = func.split(".");
	if (parts.length < 2) return func.slice(0, maxLen - 3) + "...";
	return "..." + parts.slice(-2).join(".");
}

function formatSource(source: SourceLocation): string {
	const func = truncateFunction(source.function);
	const file = source.file.split("/").pop() || source.file;
	const line = chalk.dim(`:${source.line}`);
	return `${chalk.cyan(func)} ${chalk.dim(file)}${line}`;
}

function formatMessage(msg: string): string {
	return msg.replace(/\\n/g, "\n").replace(/\\t/g, "\t");
}

export function parseLogLine(line: string): string | null {
	let entry: LogEntry;
	try {
		entry = JSON.parse(line);
	} catch {
		// Not JSON, skip non-JSON lines
		return null;
	}

	if (!entry.level) return null;

	const level = entry.level.toUpperCase();
	const colorFn = LEVEL_COLORS[level] || chalk.white;
	const levelStr = colorFn(`[${level.padEnd(5)}]`);

	const parts: string[] = [];

	// Skip timestamp for cleaner output
	parts.push(levelStr);

	if (entry.source) {
		parts.push(formatSource(entry.source));
	}

	if (entry.msg) {
		parts.push(chalk.white(formatMessage(entry.msg)));
	}

	return parts.join(" ");
}

export function parseLogStream(input: string): string[] {
	const lines = input.split("\n").filter((l) => l.trim());
	return lines.map(parseLogLine).filter((l): l is string => l !== null);
}
