import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createOperationalLogger } from "../../src/core/operational-logger.js";
import {
  STARTUP_FAILURE_REASONS,
  STARTUP_FAILURE_STAGES,
  classifyStartupFailureReason,
  logStartupFailure,
} from "../../src/core/startup-failure.js";

/** @param {string} code @param {string} [message] */
function systemError(code, message = `${code}: /var/lib/longtail-forge/secret-path 172.30.31.1:3310`) {
  return Object.assign(new Error(message), { code });
}

/** @param {(logger: ReturnType<typeof createOperationalLogger>) => void} emit */
function emitted(emit) {
  /** @type {string[]} */
  const lines = [];
  const logger = createOperationalLogger({ minimumLevel: "trace", writeLine: (line) => { lines.push(String(line)); } });
  emit(logger);
  expect(lines).toHaveLength(1);
  return JSON.parse(lines[0]);
}

describe("startup failure classification", () => {
  it.each([
    ["ENOENT", "missing"],
    ["EACCES", "permission-denied"],
    ["EROFS", "permission-denied"],
    ["ENOSPC", "no-space"],
    ["ECONNREFUSED", "unreachable"],
    ["EADDRNOTAVAIL", "unreachable"],
    ["ETIMEDOUT", "timeout"],
    ["SQLITE_CORRUPT", "corrupt"],
    ["SQLITE_CORRUPT_VTAB", "corrupt"],
    ["SQLITE_BUSY", "busy"],
    ["SQLITE_CANTOPEN", "cannot-open"],
    ["SQLITE_READONLY", "permission-denied"],
  ])("maps %s to %s", (code, reason) => {
    expect(classifyStartupFailureReason("database", systemError(code))).toBe(reason);
  });

  it("reads a known code from the cause chain", () => {
    const wrapped = new Error("Database could not open", { cause: new Error("inner", { cause: systemError("SQLITE_CANTOPEN") }) });
    expect(classifyStartupFailureReason("database", wrapped)).toBe("cannot-open");
  });

  it("falls back to the stage's default, never to the message", () => {
    expect(classifyStartupFailureReason("scanner", new Error("ECONNREFUSED 172.30.31.1:3310"))).toBe("unavailable");
    expect(classifyStartupFailureReason("migrations", new Error("ENOENT"))).toBe("failed");
    expect(classifyStartupFailureReason("database", systemError("SOMETHING_NEW"))).toBe("failed");
    expect(classifyStartupFailureReason("storage", "a thrown string")).toBe("failed");
  });

  it("emits only the stage, the reason, and the error type, with no message, path, or address", () => {
    const record = emitted((logger) => logStartupFailure(logger, "scanner", systemError("EADDRNOTAVAIL")));
    expect(record).toMatchObject({ event: "application.startup.failed", level: "error", component: "scanner", reasonClass: "unreachable", errorType: "Error" });
    const text = JSON.stringify(record);
    for (const secret of ["secret-path", "172.30.31.1", "3310", "/var/lib", "message"]) expect(text).not.toContain(secret);
    expect(Object.keys(record).sort()).toEqual(["component", "errorType", "event", "level", "reasonClass", "timestamp"]);
  });

  it("keeps every emitted stage and reason inside the logger's safe token form", () => {
    for (const value of [...STARTUP_FAILURE_STAGES, ...STARTUP_FAILURE_REASONS]) expect(value).toMatch(/^[a-z][a-z-]*$/);
    const unknownStage = /** @type {import("../../src/core/startup-failure.js").StartupFailureStage} */ (/** @type {unknown} */ ("not-a-stage"));
    const record = emitted((logger) => logStartupFailure(logger, unknownStage, new Error("x")));
    expect(record.component).toBe("application");
  });

  it("is what production startup reports, at every stage boundary", () => {
    const source = readFileSync("src/core/app.js", "utf8");
    expect(source).toContain("logStartupFailure(operationalLogger, stage, error);");
    expect(source).not.toMatch(/"application\.startup\.failed"/);
    for (const stage of ["public-demo", "runtime-paths", "storage", "scanner", "database", "application"]) {
      expect(source).toContain(`stage = "${stage}";`);
    }
    expect(source).toContain('if (event.id === "database.run-migrations") stage = event.status === "started" ? "migrations" : "database";');
  });
});
