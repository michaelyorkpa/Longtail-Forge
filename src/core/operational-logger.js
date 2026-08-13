// @ts-check
import { config } from "../config.js";
import { getRequestContext } from "./request-context.js";

const LEVEL_PRIORITY = Object.freeze({
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
});
const SAFE_FIELDS = new Set([
  "actionId",
  "actorUserId",
  "actorState",
  "component",
  "durationMs",
  "errorStack",
  "errorType",
  "effectiveUserId",
  "method",
  "mode",
  "outcome",
  "reasonClass",
  "requestId",
  "routeClass",
  "routeId",
  "signal",
  "source",
  "supportSessionId",
  "state",
  "statusCode",
  "workspaceId",
  "workspaceState",
]);
const SAFE_METHODS = new Set(["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]);
const SAFE_TOKEN_PATTERN = /^[a-zA-Z0-9._:-]{1,120}$/;

/** @typedef {"trace" | "debug" | "info" | "warn" | "error"} LogLevel */
/** @typedef {"debug" | "error" | "info" | "log" | "warn"} ConsoleMethod */
/** @typedef {(line: string, level: LogLevel) => void} OperationalLogWriter */
/** @typedef {{ minimumLevel?: unknown, writeLine?: OperationalLogWriter }} OperationalLoggerOptions */
/** @typedef {{ write: (level: unknown, event: unknown, fields?: Record<string, unknown>) => void, debug: (event: unknown, fields?: Record<string, unknown>) => void, error: (event: unknown, fields?: Record<string, unknown>) => void, info: (event: unknown, fields?: Record<string, unknown>) => void, trace: (event: unknown, fields?: Record<string, unknown>) => void, warn: (event: unknown, fields?: Record<string, unknown>) => void }} OperationalLogger */

/** @param {OperationalLoggerOptions} [options] @returns {Readonly<OperationalLogger>} */
function createOperationalLogger(options = {}) {
  const minimumLevel = normalizeLevel(options.minimumLevel || config.logLevel);
  const writeLine = options.writeLine || defaultWriteLine;

  /** @param {unknown} level @param {unknown} event @param {Record<string, unknown>} [fields] */
  function write(level, event, fields = {}) {
    const normalizedLevel = normalizeLevel(level);
    if (LEVEL_PRIORITY[normalizedLevel] < LEVEL_PRIORITY[minimumLevel]) {
      return;
    }

    const record = {
      timestamp: new Date().toISOString(),
      level: normalizedLevel,
      event: normalizeEvent(event),
      ...normalizeSafeFields(fields),
    };
    writeLine(`${JSON.stringify(record)}\n`, normalizedLevel);
  }

  return Object.freeze({
    debug: (event, fields) => write("debug", event, fields),
    error: (event, fields) => write("error", event, fields),
    info: (event, fields) => write("info", event, fields),
    trace: (event, fields) => write("trace", event, fields),
    warn: (event, fields) => write("warn", event, fields),
    write,
  });
}

const operationalLogger = createOperationalLogger();

/** @param {{ environment?: string, logger?: OperationalLogger }} [options] */
function createRequestLoggingMiddleware(options = {}) {
  const environment = options.environment || config.environment;
  const logger = options.logger || operationalLogger;

  /** @param {import("../types/route-contracts.js").RouteRequest} request @param {import("../types/route-contracts.js").RouteResponse} response @param {import("../types/route-contracts.js").RouteNext} next */
  return function requestLoggingMiddleware(request, response, next) {
    if (environment !== "production") {
      next();
      return;
    }

    const startedAt = process.hrtime.bigint();
    response.once("finish", () => {
      const durationMs = Number((process.hrtime.bigint() - startedAt) / 1_000_000n);
      const context = getRequestContext(request);
      logger.info("http.request.completed", {
        durationMs,
        method: normalizeMethod(request.method),
        requestId: context.requestId,
        statusCode: response.statusCode,
      });
    });
    next();
  };
}

/** @param {{ environment?: string, logger?: OperationalLogger }} [options] */
function installProductionConsoleBridge(options = {}) {
  const environment = options.environment || config.environment;
  if (environment !== "production") {
    return () => {};
  }

  const logger = options.logger || operationalLogger;
  const original = {
    debug: console.debug,
    error: console.error,
    info: console.info,
    log: console.log,
    warn: console.warn,
  };

  /** @type {Record<ConsoleMethod, Exclude<LogLevel, "trace">>} */
  const consoleLevels = {
    debug: "debug",
    error: "error",
    info: "info",
    log: "info",
    warn: "warn",
  };
  for (const [method, level] of /** @type {[ConsoleMethod, Exclude<LogLevel, "trace">][]} */ (Object.entries(consoleLevels))) {
    console[method] = (.../** @type {unknown[]} */ values) => {
      const source = readSafeConsoleSource(values[0]);
      logger.write(level, "console.output", source ? { source } : {});
    };
  }

  return () => {
    Object.assign(console, original);
  };
}

/**
 * @param {Record<string, unknown>} fields
 * @returns {Record<string, unknown>}
 */
function normalizeSafeFields(fields) {
  /** @type {Record<string, unknown>} */
  const normalized = {};

  for (const [key, value] of Object.entries(fields || {})) {
    if (!SAFE_FIELDS.has(key)) {
      continue;
    }

    if (key === "durationMs" || key === "statusCode") {
      if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
        normalized[key] = value;
      }
      continue;
    }

    if (key === "method") {
      normalized[key] = normalizeMethod(value);
      continue;
    }

    if (key === "errorStack") {
      const stack = normalizeSafeStack(value);
      if (stack.length > 0) {
        normalized[key] = stack;
      }
      continue;
    }

    const text = String(value || "").trim();
    if (text && SAFE_TOKEN_PATTERN.test(text)) {
      normalized[key] = text;
    }
  }

  return normalized;
}

/** @param {unknown} value @returns {string[]} */
function normalizeSafeStack(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .slice(0, 8)
    .map((frame) => String(frame || "").trim())
    .filter((frame) => SAFE_TOKEN_PATTERN.test(frame));
}

/** @param {unknown} value */
function normalizeEvent(value) {
  const event = String(value || "operational.unknown").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{0,119}$/.test(event) ? event : "operational.unknown";
}

/** @param {unknown} value @returns {LogLevel} */
function normalizeLevel(value) {
  const level = String(value || "info").trim().toLowerCase();
  return level === "trace" || level === "debug" || level === "warn" || level === "error"
    ? level
    : "info";
}

/** @param {unknown} value */
function normalizeMethod(value) {
  const method = String(value || "").trim().toUpperCase();
  return SAFE_METHODS.has(method) ? method : "OTHER";
}

/** @param {unknown} value */
function readSafeConsoleSource(value) {
  const match = /^\[([a-z0-9][a-z0-9-]{0,39})\]/i.exec(String(value || ""));
  return match?.[1]?.toLowerCase() || "";
}

/**
 * @param {string | Uint8Array} line
 * @param {LogLevel} level
 */
function defaultWriteLine(line, level) {
  const stream = level === "error" || level === "warn" ? process.stderr : process.stdout;
  stream.write(line);
}

export {
  createOperationalLogger,
  createRequestLoggingMiddleware,
  installProductionConsoleBridge,
  operationalLogger,
};
