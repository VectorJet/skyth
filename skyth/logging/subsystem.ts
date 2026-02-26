export type SubsystemLogger = {
  subsystem: string;
  isEnabled: (level: LogLevel, target?: "any" | "console" | "file") => boolean;
  trace: (message: string, meta?: Record<string, unknown>) => void;
  debug: (message: string, meta?: Record<string, unknown>) => void;
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
  fatal: (message: string, meta?: Record<string, unknown>) => void;
  raw: (message: string) => void;
  child: (name: string) => SubsystemLogger;
};

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal" | "silent";

const LOG_LEVELS: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  fatal: 5,
  silent: 6,
};

function isLevelEnabled(level: LogLevel): boolean {
  const envLevel = (process.env.SKYTH_LOG_LEVEL ?? "info").toLowerCase() as LogLevel;
  const minLevel = LOG_LEVELS[envLevel] ?? LOG_LEVELS.info;
  return LOG_LEVELS[level] >= minLevel;
}

function formatMessage(subsystem: string, level: LogLevel, message: string): string {
  const timestamp = new Date().toISOString().slice(11, 19);
  return `[${timestamp}] [${subsystem}] ${message}`;
}

function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  const fullMessage = meta ? `${message} ${JSON.stringify(meta)}` : message;
  const logFn = level === "error" || level === "fatal" ? console.error : console.log;
  logFn(fullMessage);
}

export function createSubsystemLogger(subsystem: string): SubsystemLogger {
  return {
    subsystem,
    isEnabled: (level) => isLevelEnabled(level),
    trace: (message, meta) => log("trace", formatMessage(subsystem, "trace", message), meta),
    debug: (message, meta) => log("debug", formatMessage(subsystem, "debug", message), meta),
    info: (message, meta) => log("info", formatMessage(subsystem, "info", message), meta),
    warn: (message, meta) => log("warn", formatMessage(subsystem, "warn", message), meta),
    error: (message, meta) => log("error", formatMessage(subsystem, "error", message), meta),
    fatal: (message, meta) => log("fatal", formatMessage(subsystem, "fatal", message), meta),
    raw: (message) => log("info", message),
    child: (name) => createSubsystemLogger(`${subsystem}/${name}`),
  };
}
