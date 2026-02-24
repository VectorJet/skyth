type LogLevel = "info" | "warn" | "error";

interface GatewayLoggerOptions {
  printLogs: boolean;
  verbose: boolean;
}

interface ConsoleSnapshot {
  log: typeof console.log;
  warn: typeof console.warn;
  error: typeof console.error;
}

type ParsedEvent = {
  kind: "event" | "heartbeat" | "cron";
  scope: string;
  action: string;
  summary: string;
};

function shouldUseColor(): boolean {
  if (process.env.NO_COLOR) return false;
  return Boolean(process.stdout.isTTY);
}

function color(code: number, value: string): string {
  return `\u001b[${code}m${value}\u001b[0m`;
}

function timestamp(): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const ms = String(now.getMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${ms}`;
}

function parseEventLine(message: string): ParsedEvent | null {
  const m = message.match(/^\[(event|heartbeat|cron)\]\[([a-z0-9_-]+)\]\s+([a-z0-9_-]+)(?:\s+(.*))?$/i);
  if (!m) return null;
  return {
    kind: m[1]!.toLowerCase() as ParsedEvent["kind"],
    scope: m[2]!.toLowerCase(),
    action: m[3]!.toLowerCase(),
    summary: String(m[4] ?? "").replace(/\s+/g, " ").trim(),
  };
}

function summarizeFallback(message: string): string {
  const compact = message
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!compact) return "log";
  return compact.slice(0, 15);
}

function shouldPrint(event: ParsedEvent | null, level: LogLevel, options: GatewayLoggerOptions): boolean {
  if (level === "error") return true;
  if (!event) return options.printLogs;
  if (options.printLogs) return true;
  // When runtime logs are disabled, keep gateway lifecycle visibility only.
  return event.scope === "gateway" && (event.action === "start" || event.action === "stop" || event.action === "abort");
}

function formatMessage(message: string, level: LogLevel, event: ParsedEvent | null, options: GatewayLoggerOptions): string {
  const useColor = shouldUseColor();

  const normalized = event
    ? `[${event.kind}][${event.scope}] ${event.action}${event.summary ? ` ${event.summary}` : ""}`
    : `[event][runtime] ${level} ${summarizeFallback(message)}`;

  let decorated = normalized;
  if (useColor) {
    const kindColor =
      event?.kind === "heartbeat" ? 32
      : event?.kind === "cron" ? 33
      : 36;
    const scopeColor =
      event?.scope === "gateway" ? 36
      : event?.scope === "telegram" ? 34
      : event?.scope === "agent" ? 35
      : 37;

    decorated = decorated
      .replace(/\[(event|heartbeat|cron)\]/i, (m) => color(kindColor, m))
      .replace(/\[[a-z0-9_-]+\]/i, (m) => color(scopeColor, m));
  }

  if (useColor) {
    if (level === "warn") decorated = color(33, decorated);
    if (level === "error") decorated = color(31, decorated);
  }

  if (options.verbose) {
    const ts = useColor ? color(90, `[${timestamp()}]`) : `[${timestamp()}]`;
    return `${ts} ${decorated}`;
  }

  return decorated;
}

export function installGatewayLogger(options: GatewayLoggerOptions): () => void {
  const original: ConsoleSnapshot = {
    log: console.log,
    warn: console.warn,
    error: console.error,
  };

  const emit = (level: LogLevel, sink: (...args: any[]) => void, args: any[]): void => {
    const message = String(args[0] ?? "");
    const event = parseEventLine(message);
    if (!shouldPrint(event, level, options)) return;
    const formatted = formatMessage(message, level, event, options);
    sink(formatted, ...args.slice(1));
  };

  console.log = (...args: any[]) => emit("info", original.log, args);
  console.warn = (...args: any[]) => emit("warn", original.warn, args);
  console.error = (...args: any[]) => emit("error", original.error, args);

  return () => {
    console.log = original.log;
    console.warn = original.warn;
    console.error = original.error;
  };
}
