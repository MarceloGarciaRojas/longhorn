import type { AppEnvironment, LogLevel } from "@/src/config/app-config";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const SENSITIVE_KEY =
  /authorization|cookie|password|passphrase|secret|token|api[_-]?key|card|cvv/i;

const SENSITIVE_VALUE =
  /^(?:bearer\s+|-----BEGIN .*PRIVATE KEY-----|gh[pousr]_|sk-)/i;

export type LogSink = (line: string, level: LogLevel) => void;

export interface LoggerContext {
  environment: AppEnvironment | "unknown";
  service: string;
  correlationId?: string;
  minimumLevel: LogLevel;
}

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

function sanitize(
  value: unknown,
  key = "",
  depth = 0,
  seen = new WeakSet<object>(),
): unknown {
  if (SENSITIVE_KEY.test(key)) {
    return "[REDACTED]";
  }
  if (typeof value === "string") {
    return SENSITIVE_VALUE.test(value) ? "[REDACTED]" : value;
  }
  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (value instanceof Error) {
    return { name: value.name };
  }
  if (depth >= 4) {
    return "[MAX_DEPTH]";
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item, key, depth + 1, seen));
  }
  if (typeof value === "object") {
    if (seen.has(value)) {
      return "[CIRCULAR]";
    }
    seen.add(value);
    return Object.fromEntries(
      Object.entries(value).map(([nestedKey, nestedValue]) => [
        nestedKey,
        sanitize(nestedValue, nestedKey, depth + 1, seen),
      ]),
    );
  }
  return String(value);
}

function defaultSink(line: string, level: LogLevel): void {
  const method = level === "debug" ? "debug" : level;
  console[method](line);
}

export function createLogger(
  context: LoggerContext,
  sink: LogSink = defaultSink,
): Logger {
  function write(
    level: LogLevel,
    message: string,
    fields: Record<string, unknown> = {},
  ): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[context.minimumLevel]) {
      return;
    }

    const sanitizedFields = sanitize(fields);
    const safeFields =
      sanitizedFields &&
      typeof sanitizedFields === "object" &&
      !Array.isArray(sanitizedFields)
        ? (sanitizedFields as Record<string, unknown>)
        : {};
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      environment: context.environment,
      service: context.service,
      ...(context.correlationId
        ? { correlation_id: context.correlationId }
        : {}),
      ...safeFields,
    };
    sink(JSON.stringify(entry), level);
  }

  return {
    debug: (message, fields) => write("debug", message, fields),
    info: (message, fields) => write("info", message, fields),
    warn: (message, fields) => write("warn", message, fields),
    error: (message, fields) => write("error", message, fields),
  };
}
