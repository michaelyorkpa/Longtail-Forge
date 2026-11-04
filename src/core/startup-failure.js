// The closed classification `application.startup.failed` reports when production startup fails.
//
// An operator reading the journal after a host restart needs to know which startup step failed and
// why, without a raw exception message: those can carry paths, hostnames, or configuration values.
// So the event names only a stage from a fixed list and a reason from a fixed list, derived from the
// error's system or SQLite code, or that of its cause. The message is never read.

/** @typedef {"configuration" | "public-demo" | "runtime-paths" | "storage" | "scanner" | "database" | "migrations" | "application"} StartupFailureStage */
/** @typedef {"missing" | "permission-denied" | "no-space" | "unreachable" | "timeout" | "corrupt" | "busy" | "cannot-open" | "unavailable" | "failed"} StartupFailureReason */

/** @type {readonly StartupFailureStage[]} */
const STARTUP_FAILURE_STAGES = Object.freeze([
  "configuration", "public-demo", "runtime-paths", "storage", "scanner", "database", "migrations", "application",
]);

/** @type {readonly StartupFailureReason[]} */
const STARTUP_FAILURE_REASONS = Object.freeze([
  "missing", "permission-denied", "no-space", "unreachable", "timeout", "corrupt", "busy", "cannot-open", "unavailable", "failed",
]);

/** @type {ReadonlyMap<string, StartupFailureReason>} */
const CODE_REASONS = new Map([
  ["ENOENT", "missing"],
  ["ENOTDIR", "missing"],
  ["EACCES", "permission-denied"],
  ["EPERM", "permission-denied"],
  ["EROFS", "permission-denied"],
  ["SQLITE_READONLY", "permission-denied"],
  ["ENOSPC", "no-space"],
  ["EDQUOT", "no-space"],
  ["SQLITE_FULL", "no-space"],
  ["ECONNREFUSED", "unreachable"],
  ["ECONNRESET", "unreachable"],
  ["EHOSTUNREACH", "unreachable"],
  ["ENETUNREACH", "unreachable"],
  ["EADDRNOTAVAIL", "unreachable"],
  ["EAI_AGAIN", "unreachable"],
  ["ENOTFOUND", "unreachable"],
  ["ETIMEDOUT", "timeout"],
  ["SQLITE_CORRUPT", "corrupt"],
  ["SQLITE_NOTADB", "corrupt"],
  ["SQLITE_BUSY", "busy"],
  ["SQLITE_LOCKED", "busy"],
  ["SQLITE_CANTOPEN", "cannot-open"],
]);

/**
 * The reason for a failure at a stage: the first known code on the error or its cause chain, or the
 * stage's default. A scanner that does not answer reports no code, so it reads as unavailable.
 * @param {StartupFailureStage} stage
 * @param {unknown} error
 * @returns {StartupFailureReason}
 */
function classifyStartupFailureReason(stage, error) {
  let current = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth += 1) {
    const code = "code" in current && typeof current.code === "string" ? current.code : "";
    // SQLite's extended codes, such as SQLITE_CORRUPT_VTAB, carry their primary code as a prefix.
    const reason = CODE_REASONS.get(code) ?? CODE_REASONS.get(code.replace(/_[A-Z0-9]+$/, ""));
    if (reason) return reason;
    current = "cause" in current ? current.cause : undefined;
  }
  return stage === "scanner" ? "unavailable" : "failed";
}

/** @param {unknown} error */
function readStartupErrorType(error) {
  if (error && typeof error === "object" && "name" in error && error.name) return String(error.name);
  return "Error";
}

/**
 * Write the bounded failure event: the stage, the reason, and the error's type, and nothing else.
 * @param {{ error: (event: unknown, fields?: Record<string, unknown>) => void }} logger
 * @param {StartupFailureStage} stage
 * @param {unknown} error
 */
function logStartupFailure(logger, stage, error) {
  logger.error("application.startup.failed", {
    component: STARTUP_FAILURE_STAGES.includes(stage) ? stage : "application",
    errorType: readStartupErrorType(error),
    reasonClass: classifyStartupFailureReason(stage, error),
  });
}

export {
  STARTUP_FAILURE_REASONS,
  STARTUP_FAILURE_STAGES,
  classifyStartupFailureReason,
  logStartupFailure,
  readStartupErrorType,
};
