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

const STARTUP_PREFIXES = [
  "Starting skyth gateway on port",
  "Workspace:",
  "Model:",
  "Cron jobs:",
  "Enabled channels:",
  "Gateway runtime loop started.",
  "Gateway stopped.",
];

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

function detectComponent(message: string): string | undefined {
  const m = message.match(/^\[([a-z0-9_-]+)\]/i);
  return m?.[1]?.toLowerCase();
}

function isStartupMessage(message: string): boolean {
  return STARTUP_PREFIXES.some((prefix) => message.startsWith(prefix));
}

function isNoisyInfo(message: string): boolean {
  if (/^\[[a-z0-9_-]+\]\sreceived\s\d+\supdate/i.test(message)) return true;
  if (message.startsWith("[gateway] inbound received:")) return true;
  if (message.startsWith("[gateway] outbound queued:")) return true;
  if (message.startsWith("[gateway] outbound sent:")) return true;
  return false;
}

function shouldPrint(message: string, level: LogLevel, options: GatewayLoggerOptions): boolean {
  if (isStartupMessage(message)) return true;
  if (level === "error") return true;

  const component = detectComponent(message);
  if (!options.printLogs) {
    // Keep only startup summary and errors when runtime logs are disabled.
    return false;
  }

  // With printLogs enabled, keep info logs but hide high-frequency traces unless verbose.
  if (!options.verbose && component && isNoisyInfo(message)) {
    return false;
  }

  return true;
}

function formatMessage(message: string, level: LogLevel, options: GatewayLoggerOptions): string {
  const useColor = shouldUseColor();
  const component = detectComponent(message);

  let decorated = message;
  if (component && useColor) {
    const componentColor =
      component === "gateway" ? 36
      : component === "telegram" ? 34
      : component === "whatsapp" ? 32
      : component === "discord" ? 35
      : component === "cron" ? 33
      : 37;
    decorated = message.replace(`[${component}]`, color(componentColor, `[${component}]`));
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
    if (!shouldPrint(message, level, options)) return;
    const formatted = formatMessage(message, level, options);
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

