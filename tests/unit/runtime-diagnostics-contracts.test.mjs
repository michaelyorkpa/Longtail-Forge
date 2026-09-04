import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const service = read("src/services/runtime-diagnostics.service.js");
const routes = read("src/routes/runtime-diagnostics.routes.js");
const consumer = read("public/js/workspace-settings.js");
const contracts = read("src/types/browser-contracts.d.ts");
const securityOwner = read("scripts/admin-job-observability-regression.mjs");

/** @param {string} source @param {string} opener @param {string} [closer] */
function functionBody(source, opener, closer = "\n}\n") {
  const start = source.indexOf(opener);
  assert.notEqual(start, -1, opener + " must exist");
  const end = source.indexOf(closer, start);
  return source.slice(start, end === -1 ? source.length : end);
}

/** @param {string} name */
function declaredInterface(name) {
  const at = contracts.search(new RegExp("export interface " + name + "(?: extends \\w+)? \\{"));
  assert.notEqual(at, -1, name + " must be declared");
  return contracts.slice(at, contracts.indexOf("\n}", at));
}

/** @param {string} name */
function declaredMembers(name) {
  return [...declaredInterface(name).matchAll(/^ {2}(\w+)\??:/gm)].map((entry) => entry[1]).sort();
}

/**
 * The member names of one section of a producer literal, read at its own indent.
 * @param {string} source @param {string} opener @param {string} closer @param {number} indent
 */
function producerMembers(source, opener, closer, indent) {
  const start = source.indexOf(opener);
  assert.notEqual(start, -1, opener + " must exist in the producer");
  const end = source.indexOf(closer, start + opener.length);
  assert.notEqual(end, -1, "the section opened by " + opener + " must close");
  const body = source.slice(start + opener.length, end);
  return [...body.matchAll(new RegExp("^ {" + indent + "}(\\w+)[:,]", "gm"))].map((entry) => entry[1]).sort();
}

/** @param {string} name */
function declaredUnion(name) {
  const alias = contracts.slice(contracts.indexOf("export type " + name + " ="));
  assert.ok(alias.startsWith("export type "), name + " must be declared");
  return [...alias.slice(0, alias.indexOf(";")).matchAll(/"([a-z_-]+)"/g)].map((entry) => entry[1]).sort();
}

/** The shipped reader block, instantiated from the page's own source. */
function shippedReader() {
  const start = consumer.indexOf("  /** The three scopes the path shapers answer.");
  const end = consumer.indexOf("  function renderRuntimeDiagnosticsLoading() {");
  assert.ok(start !== -1 && end > start, "the reader block must exist above the diagnostics loader");
  return new Function(consumer.slice(start, end) + `
    return {
      readRuntimeDiagnosticsResponse,
      tables: {
        health: RUNTIME_HEALTH_STATUSES,
        scanner: SCANNER_HEALTH_STATUSES,
        scopes: RUNTIME_PATH_SCOPES,
        workerStates: RUNTIME_WORKER_STATES,
      },
    };`)();
}

const location = (overrides = {}) => ({
  display: "<data-dir>/longtail.sqlite",
  redacted: false,
  relativeTo: "data-dir",
  ...overrides,
});

const diagnostics = (overrides = {}) => ({
  app: { name: "Longtail Forge", version: "0.33.33" },
  data: { directoryLocation: location({ display: "./data", relativeTo: "app-root" }) },
  database: {
    fileLocation: location(),
    health: { fileWritable: true, status: "ok" },
    provider: "sqlite",
    sqlite: {
      busyTimeoutMs: 5000,
      cacheSizeKib: 2048,
      foreignKeysEnabled: true,
      journalMode: "wal",
      mmapSizeBytes: null,
      synchronous: "normal",
      tempStore: "memory",
    },
  },
  features: { supportView: { enabled: false } },
  runtime: { configurationWarnings: [], deploymentMode: "single", environment: "production" },
  scanner: { health: { available: null, status: "disabled", warning: "" }, mode: "none" },
  storage: {
    health: { available: true, status: "ok" },
    provider: "local",
    rootLocation: location({ display: "<data-dir>/files", relativeTo: "data-dir" }),
  },
  worker: {
    mode: "inline",
    status: {
      claimedCount: 0,
      completedCount: 4,
      deadCount: 0,
      failedCount: 1,
      lastClaimedCount: 0,
      lastErrorAt: null,
      lastPollAt: "2026-09-04T05:00:00.000Z",
      lastRunAt: "2026-09-04T05:00:00.000Z",
      lastSuccessAt: "2026-09-04T05:00:00.000Z",
      lockTtlSeconds: 300,
      pollIntervalMs: 5000,
      registeredJobTypes: ["notifications.deliver"],
      running: false,
      startedAt: "2026-09-04T04:00:00.000Z",
      state: "idle",
      stoppedAt: null,
      timerActive: true,
      workerId: "default",
    },
  },
  ...overrides,
});

/** @param {Record<string, unknown>} patch */
const withSection = (patch) => diagnostics(patch);

const readBody = functionBody(service, "async function read(session) {");
const topLevel = readBody.slice(readBody.indexOf("  return {"));

describe("the runtime diagnostics route and its authorization", () => {
  it("delegates to the traced producer under no-store, and wraps it by name", () => {
    const route = functionBody(routes, 'runtimeDiagnosticsRoutes.get("/runtime-diagnostics"', "\n}));");
    assert.match(route, /const diagnostics = await runtimeDiagnosticsService\.read\(request\.session\);/,
      "the route must call the traced producer with the session");
    assert.match(route, /response\.setHeader\("Cache-Control", "no-store"\);/,
      "a runtime readout must not be cached");
    assert.match(route, /response\.status\(200\)\.json\(\{ diagnostics \}\);/,
      "the envelope must wrap the readout by name");
    assert.deepEqual(declaredMembers("BrowserRuntimeDiagnosticsResponse"), ["diagnostics"],
      "so the declared envelope is exactly one member");
  });

  it("is workspace-scoped before the handler runs", () => {
    assert.match(routes, /import \{ workspaceAsyncRoute as asyncRoute \} from "\.\.\/utils\/http\.js";/,
      "the route must use the workspace async route wrapper");
  });

  it("asserts the manage right before it reads any health at all", () => {
    assert.match(readBody, /await permissionsService\.assertCan\(session, REQUIRED_PERMISSION, \{\n {4}operation: "read",\n {4}workspace_id: session\.workspace_id,\n {2}\}\);/,
      "the readout must assert the required permission in the session's own workspace");
    assert.match(service, /const REQUIRED_PERMISSION = "workspace_settings\.manage";/,
      "and that permission must be workspace settings management");
    const asserted = readBody.indexOf("assertCan");
    assert.notEqual(asserted, -1, "the readout must assert the required permission");
    assert.ok(asserted < readBody.indexOf("readSafeDatabaseHealth()"),
      "and it must come before the first health read");
  });
});

describe("the diagnostics producer", () => {
  it("reconstructs eight sections by name and spreads nothing at its top level", () => {
    const sections = [...topLevel.matchAll(/^ {4}(\w+): \{/gm)].map((entry) => entry[1]).sort();
    assert.deepEqual(
      sections,
      ["app", "data", "database", "features", "runtime", "scanner", "storage", "worker"],
      "the readout must carry exactly its eight sections",
    );
    assert.ok(!/^ {4}\.\.\./m.test(topLevel), "a spread would make the exact membership unearned");
    assert.deepEqual(declaredMembers("BrowserRuntimeDiagnostics"), sections,
      "and the declaration must mirror the producer");
  });

  it("reconstructs each section the page reads, member by member", () => {
    // Compared against the producer's own literal rather than against a list written here: a
    // declaration checked against a hand-copied list confirms itself, and a break that removed
    // `directoryLocation` from the producer passed until this read the producer instead.
    for (const [declaration, opener, closer, indent, source] of [
      ["BrowserRuntimeEnvironmentDiagnostics", "    runtime: {", "\n    },", 6, topLevel],
      ["BrowserRuntimeDatabaseDiagnostics", "    database: {", "\n    },", 6, topLevel],
      ["BrowserRuntimeDataDiagnostics", "    data: {", "\n    },", 6, topLevel],
      ["BrowserRuntimeStorageDiagnostics", "    storage: {", "\n    },", 6, topLevel],
      ["BrowserRuntimeScannerDiagnostics", "    scanner: {", "\n    },", 6, topLevel],
      ["BrowserRuntimeWorkerDiagnostics", "    worker: {", "\n    },", 6, topLevel],
      ["BrowserRuntimeSqliteDiagnostics", "      sqlite: {", "\n      },", 8, topLevel],
      ["BrowserRuntimeWorkerStatus", "      status: {", "\n      },", 8, topLevel],
      ["BrowserRuntimePathLocation", "function redactedPathLocation(resolvedPath) {\n  return {", "\n  };", 4, service],
    ]) {
      assert.deepEqual(
        declaredMembers(String(declaration)),
        producerMembers(String(source), String(opener), String(closer), Number(indent)),
        declaration + " must declare exactly what the producer writes",
      );
    }
  });

  it("absorbs provider extensibility by reconstructing what an adapter answered", () => {
    const storage = functionBody(service, "async function readSafeStorageHealth() {");
    assert.match(storage, /const health = await adapter\.health\(\);/,
      "the storage adapter is asked for its own health");
    assert.match(storage, /return \{\n {6}available: health\?\.ok !== false,\n {6}provider: safeText\(health\?\.provider \|\| provider\),/,
      "but only the members this service names are taken from it");
    assert.match(topLevel, /storage: \{\n {6}provider: storageHealth\.provider,\n {6}health: \{\n {8}available: storageHealth\.available,\n {8}status: storageHealth\.status,\n {6}\},/,
      "and the readout narrows them again by name, so no adapter member reaches the browser");
  });

  it("leaves the two sections nothing reads unnamed, and says why", () => {
    const declared = declaredInterface("BrowserRuntimeDiagnostics");
    assert.match(declared, /\n {2}app: unknown;/, "app is declared but not named out");
    assert.match(declared, /\n {2}features: unknown;/, "and neither is features");
    const at = contracts.indexOf("export interface BrowserRuntimeDiagnostics {");
    const doc = contracts.slice(contracts.lastIndexOf("/**", at), at).replace(/\n \* ?/g, " ");
    assert.match(doc, /A consumer, not the producer's generosity, earns a contract/,
      "the contract must say why an unread section stays opaque");
    assert.ok(!consumer.includes("diagnostics.features"),
      "and the page must not read the section this child left opaque");
  });
});

describe("the paths this readout is allowed to disclose", () => {
  it("shows every path against a placeholder rather than resolved", () => {
    for (const shaper of [
      "function safeStorageRootLocation(rootDir) {",
      "function safeDatabaseFileLocation(databaseFile) {",
      "function safeDataDirectoryLocation(dataDir) {",
    ]) {
      const body = functionBody(service, shaper);
      assert.match(body, /relativeSafePath\(/, shaper + " must describe the path relative to a known root");
      assert.match(body, /redactedPathLocation\(resolved\)/, shaper + " must fall through to redaction");
      assert.doesNotMatch(body, /display: resolved\b/, shaper + " must never display the resolved path");
    }
  });

  it("reduces a path outside the deployment to a placeholder and a basename", () => {
    assert.match(
      functionBody(service, "function redactedPathLocation(resolvedPath) {"),
      /return \{\n {4}display: joinSafePath\("<redacted>", path\.basename\(resolvedPath\)\),\n {4}redacted: true,\n {4}relativeTo: "outside-app-root",\n {2}\};/,
      "an outside path must be reduced to <redacted> plus its basename",
    );
  });

  it("closes the scope vocabulary at the three the shapers write", () => {
    const produced = [...new Set([...service.matchAll(/relativeTo: "([a-z-]+)"/g)].map((entry) => entry[1]))].sort();
    assert.deepEqual(produced, ["app-root", "data-dir", "outside-app-root"],
      "the shapers must write exactly three scopes");
    assert.deepEqual(declaredUnion("BrowserRuntimePathScope"), produced,
      "and the declared scope must be exactly those");
    assert.deepEqual([...shippedReader().tables.scopes].sort(), produced,
      "and so must the table the reader validates against");
  });

  it("declares no member that names a secret, an environment value or a raw path", () => {
    for (const section of [
      "BrowserRuntimeDiagnostics", "BrowserRuntimeDatabaseDiagnostics", "BrowserRuntimeSqliteDiagnostics",
      "BrowserRuntimeStorageDiagnostics", "BrowserRuntimeScannerDiagnostics", "BrowserRuntimeWorkerStatus",
      "BrowserRuntimeEnvironmentDiagnostics", "BrowserRuntimePathLocation",
    ]) {
      assert.doesNotMatch(
        declaredInterface(section),
        /secret|token|password|credential|apiKey|accessKey|signedUrl|storageKey|localRoot|rootDir|databaseFile|process\.env/i,
        section + " must not name an internal or secret-bearing value",
      );
    }
  });

  it("leaves secret scanning to the owner that already does it", () => {
    assert.match(securityOwner, /assert\.doesNotMatch\(runtimeDiagnosticsSource, \/payload_json\|dedupe_key\|process\\\.env\|storageKey\|signedUrl\|clamdHost\|clamscanPath\|masterKey\/i/,
      "the durable owner must still scan the diagnostics service for internals");
    assert.match(securityOwner, /assert\.doesNotMatch\(workspaceSettingsScript, \/payload_json\|dedupe_key\|dedupeKey\|storageKey\|signedUrl\|localRoot\|CLAMD\|CLAMSCAN\|masterKey\|process\\\.env\/i/,
      "and the browser script this child edits");
  });
});

describe("the health vocabularies, scanned from their producers", () => {
  it("closes the scanner status at the producer's own allowed set", () => {
    const body = functionBody(service, "function safeScannerStatus(status, available) {");
    const allowed = [...body.matchAll(/"([a-z_]+)"/g)].map((entry) => entry[1]);
    const produced = [...new Set(allowed)].sort();
    assert.deepEqual(produced, ["disabled", "ok", "pass_through", "unavailable", "unknown"],
      "the scanner status must be exactly the words this normaliser can answer");
    assert.match(body, /const allowedStatuses = new Set\(\["disabled", "ok", "pass_through", "unavailable", "unknown"\]\);/,
      "and that set must be the producer's own, not a list assembled here");
    assert.deepEqual(declaredUnion("BrowserScannerHealthStatus"), produced,
      "the declaration must close over the scanned set");
    assert.deepEqual([...shippedReader().tables.scanner].sort(), produced,
      "and so must the reader's table");
  });

  it("closes the reachability status at the two both safe readers write", () => {
    const produced = [...new Set([
      ...[...functionBody(service, "async function readSafeDatabaseHealth() {").matchAll(/status: "([a-z]+)"/g)].map((e) => e[1]),
      ...(
        [...functionBody(service, "async function readSafeStorageHealth() {").matchAll(/status: ([^,\n]+)/g)]
          .map((e) => e[1]).join(" ").match(/"[a-z]+"/g) || []
      ).map((word) => word.replaceAll('"', "")),
    ])].sort();
    assert.deepEqual(produced, ["ok", "unavailable"],
      "a safe reader either reached its subject or did not");
    assert.deepEqual(declaredUnion("BrowserRuntimeHealthStatus"), produced,
      "and the declared status must be exactly those two");
  });

  it("closes the worker state at the runner's own status type", () => {
    const runner = read("src/types/framework-contracts.d.ts");
    const declared = runner.slice(runner.indexOf("export interface JobWorkerStatus {"));
    const stateLine = declared.slice(0, declared.indexOf("\n}")).match(/state: ([^;]+);/);
    assert.ok(stateLine, "the runner's status type must declare a state");
    const produced = (stateLine[1].match(/"[a-z]+"/g) || [])
      .map((word) => word.replaceAll('"', "")).sort();
    assert.deepEqual(produced, ["disabled", "idle", "running", "stopped"],
      "the worker state must be exactly what the runner declares");
    assert.deepEqual(declaredUnion("BrowserRuntimeWorkerState"), produced,
      "and the browser union must match it");
    assert.deepEqual([...shippedReader().tables.workerStates].sort(), produced,
      "and so must the reader's table");
  });

  it("keeps the worker counters out of the Jobs Status contracts", () => {
    const declared = declaredInterface("BrowserRuntimeWorkerStatus");
    assert.doesNotMatch(declared, /BrowserJobStatusCounts|BrowserJobReadout|BrowserJobFailureSummary/,
      "process counters are not durable workspace job counts");
    const at = contracts.indexOf("export interface BrowserRuntimeWorkerStatus {");
    const doc = contracts.slice(contracts.lastIndexOf("/**", at), at).replace(/\n \* ?/g, " ");
    assert.match(doc, /This is not `\/api\/jobs\/status`/,
      "and the contract must say so, having been split from it deliberately");
  });
});

describe("the shipped reader, run against real bodies", () => {
  const { readRuntimeDiagnosticsResponse } = shippedReader();

  it("accepts a real readout", () => {
    const result = readRuntimeDiagnosticsResponse({ diagnostics: diagnostics() });
    assert.ok(result, "a real readout must be accepted");
    assert.equal(result.database.provider, "sqlite", "and keep its sections");
    assert.equal(result.worker.status.registeredJobTypes.length, 1, "including the worker's job types");
  });

  it("accepts a deployment that is genuinely in trouble", () => {
    const unhealthy = withSection({
      database: {
        fileLocation: location({ display: "<redacted>/longtail.sqlite", redacted: true, relativeTo: "outside-app-root" }),
        health: { fileWritable: false, status: "unavailable" },
        provider: "sqlite",
        sqlite: {
          busyTimeoutMs: null, cacheSizeKib: null, foreignKeysEnabled: false,
          journalMode: "", mmapSizeBytes: null, synchronous: "", tempStore: "",
        },
      },
      storage: { health: { available: false, status: "unavailable" }, provider: "s3", rootLocation: null },
      scanner: { health: { available: false, status: "unavailable", warning: "Scanner health is unavailable." }, mode: "clamav" },
      runtime: { configurationWarnings: ["Review the deployment mode."], deploymentMode: "cluster", environment: "development" },
    });
    const result = readRuntimeDiagnosticsResponse({ diagnostics: unhealthy });
    assert.ok(result, "an unreachable database, an unavailable store and a failing scanner are real answers");
    assert.equal(result.storage.rootLocation, null, "a provider with no local root really has none");
    assert.equal(result.database.health.status, "unavailable", "and an unreachable database says so");
  });

  it("accepts every scanner status the normaliser can answer, including the healthy silent ones", () => {
    for (const status of ["disabled", "ok", "pass_through", "unavailable", "unknown"]) {
      assert.ok(
        readRuntimeDiagnosticsResponse({ diagnostics: withSection({
          scanner: { health: { available: null, status, warning: "" }, mode: "none" },
        }) }),
        status + " is a real scanner answer",
      );
    }
  });

  it("accepts every worker state the runner declares", () => {
    for (const state of ["disabled", "idle", "running", "stopped"]) {
      const base = diagnostics();
      assert.ok(
        readRuntimeDiagnosticsResponse({ diagnostics: withSection({
          worker: { mode: base.worker.mode, status: { ...base.worker.status, state } },
        }) }),
        state + " is a real worker state",
      );
    }
  });

  it("refuses a body that is not this producer's envelope", () => {
    for (const bad of [null, undefined, 7, "diagnostics", [], {}, { diagnostics: null }, { diagnostics: [] }, { diagnostics: "ok" }]) {
      assert.equal(readRuntimeDiagnosticsResponse(bad), null, "an unusable diagnostics body must be refused");
    }
  });

  it("refuses a readout missing any section the page renders", () => {
    for (const key of ["data", "database", "runtime", "scanner", "storage", "worker"]) {
      /** @type {Record<string, unknown>} */
      const body = diagnostics();
      delete body[key];
      assert.equal(readRuntimeDiagnosticsResponse({ diagnostics: body }), null,
        "a missing " + key + " section is not a section with nothing to report");
    }
  });

  it("ignores the two sections it deliberately left opaque", () => {
    for (const value of [undefined, null, 7, "none", { anything: true }, []]) {
      assert.ok(readRuntimeDiagnosticsResponse({ diagnostics: withSection({ app: value, features: value }) }),
        "a section no consumer reads must not decide whether the readout is readable");
    }
  });

  it("refuses a status word outside its producer's vocabulary", () => {
    const base = diagnostics();
    for (const status of ["degraded", "", null, "OK"]) {
      assert.equal(
        readRuntimeDiagnosticsResponse({ diagnostics: withSection({
          database: { ...base.database, health: { fileWritable: true, status } },
        }) }),
        null,
        "a database status this reader has not seen must be refused: " + String(status),
      );
      assert.equal(
        readRuntimeDiagnosticsResponse({ diagnostics: withSection({
          scanner: { health: { available: null, status, warning: "" }, mode: "none" },
        }) }),
        null,
        "and so must a scanner one: " + String(status),
      );
    }
    assert.equal(
      readRuntimeDiagnosticsResponse({ diagnostics: withSection({
        worker: { mode: "inline", status: { ...base.worker.status, state: "starting" } },
      }) }),
      null,
      "and a worker state the runner never declares",
    );
  });

  it("refuses a path location that is not one the shapers build", () => {
    const base = diagnostics();
    for (const bad of [
      undefined, null, "./data", {},
      location({ relativeTo: "home" }),
      location({ relativeTo: null }),
      location({ redacted: "yes" }),
      location({ display: null }),
    ]) {
      assert.equal(
        readRuntimeDiagnosticsResponse({ diagnostics: withSection({ data: { directoryLocation: bad } }) }),
        null,
        "a location the page would warn from must be one this producer built",
      );
      assert.equal(
        readRuntimeDiagnosticsResponse({ diagnostics: withSection({
          database: { ...base.database, fileLocation: bad },
        }) }),
        null,
        "and so must the database file location",
      );
    }
  });

  it("refuses malformed pragmas rather than rendering them as unavailable", () => {
    const base = diagnostics();
    for (const patch of [
      { journalMode: null }, { synchronous: 7 }, { tempStore: undefined },
      { busyTimeoutMs: "5000" }, { cacheSizeKib: {} }, { foreignKeysEnabled: "yes" },
    ]) {
      assert.equal(
        readRuntimeDiagnosticsResponse({ diagnostics: withSection({
          database: { ...base.database, sqlite: { ...base.database.sqlite, ...patch } },
        }) }),
        null,
        "a malformed pragma must make the readout unreadable, not blank",
      );
    }
    assert.ok(
      readRuntimeDiagnosticsResponse({ diagnostics: withSection({
        database: { ...base.database, sqlite: { ...base.database.sqlite, busyTimeoutMs: null, cacheSizeKib: null } },
      }) }),
      "but a pragma the reader could not look up really is null",
    );
  });

  it("refuses worker status members that are not what the runner reports", () => {
    const base = diagnostics();
    /** @param {Record<string, unknown>} patch */
    const worker = (patch) => readRuntimeDiagnosticsResponse({ diagnostics: withSection({
      worker: { mode: "inline", status: { ...base.worker.status, ...patch } },
    }) });
    for (const patch of [
      { workerId: null }, { running: "no" }, { timerActive: 1 },
      { completedCount: "4" }, { pollIntervalMs: null }, { lastPollAt: 7 },
      { registeredJobTypes: "notifications.deliver" }, { registeredJobTypes: [7] },
    ]) {
      assert.equal(worker(patch), null, "a malformed worker member must refuse the readout");
    }
    assert.ok(worker({ lastErrorAt: null, startedAt: null, stoppedAt: null }),
      "but a worker that has not started, stopped or failed really reports nulls");
  });

  it("refuses configuration warnings that are not text", () => {
    for (const bad of ["a warning", null, [7], [{}]]) {
      assert.equal(
        readRuntimeDiagnosticsResponse({ diagnostics: withSection({
          runtime: { configurationWarnings: bad, deploymentMode: "single", environment: "production" },
        }) }),
        null,
        "the page renders these directly, so each must be text",
      );
    }
    assert.ok(
      readRuntimeDiagnosticsResponse({ diagnostics: withSection({
        runtime: { configurationWarnings: [], deploymentMode: "single", environment: "production" },
      }) }),
      "and an empty list is a real answer",
    );
  });

  it("answers the producer's own readout rather than a rebuilt one", () => {
    const wire = diagnostics({ aFutureSection: 1 });
    const result = readRuntimeDiagnosticsResponse({ diagnostics: wire });
    assert.ok(result, "an unrecognised section must not refuse the readout");
    assert.equal(result, wire, "and a vouched readout is passed on by identity, not copied");
  });
});

describe("the workspace settings consumer", () => {
  const load = functionBody(consumer, "  async function loadRuntimeDiagnostics(", "\n  }\n");
  const render = functionBody(consumer, "  function renderRuntimeDiagnostics(diagnostics) {", "\n  }\n");
  const warnings = functionBody(consumer, "  function readRuntimeDiagnosticWarnings(diagnostics) {", "\n  }\n");

  it("no longer defaults an unreadable readout to an empty one", () => {
    assert.ok(!consumer.includes("result.diagnostics || {}"), "the raw readout default must be gone");
    for (const dead of [
      "diagnostics.database || {}", "database.sqlite || {}", "diagnostics.data || {}",
      "diagnostics.storage || {}", "diagnostics.scanner || {}", "diagnostics.worker || {}",
      "worker.status || {}",
    ]) {
      assert.ok(!consumer.includes(dead), dead + " is dead once the readout is vouched for");
    }
    assert.ok(!warnings.includes("Array.isArray(diagnostics.runtime?.configurationWarnings)"),
      "and so is the warnings container test");
  });

  it("reads the response through the vouching reader", () => {
    assert.match(load, /const diagnostics = readRuntimeDiagnosticsResponse\(\n\s+await requireApi\(\)\.getJson\("\/api\/runtime-diagnostics", \{ cache: "no-store" \}\),\n\s+\);/,
      "the readout must be read through its reader");
    assert.match(load, /throw new Error\("The runtime diagnostics readout could not be read\./,
      "and an unreadable readout must be refused rather than rendered");
  });

  it("refuses before anything is rendered, into the readout's existing error state", () => {
    const refusal = load.indexOf("could not be read.");
    assert.notEqual(refusal, -1, "an unreadable readout must be refused");
    assert.ok(refusal < load.indexOf("renderRuntimeDiagnostics(diagnostics)"),
      "the refusal must come before the render");
    assert.ok(refusal < load.indexOf("} catch (error) {"), "and land in the existing catch");
    assert.match(load, /\} catch \(error\) \{\n\s+renderRuntimeDiagnosticsError\(error\);/,
      "which is the page's own diagnostics failure path");
    assert.match(
      functionBody(consumer, "  function renderRuntimeDiagnosticsError(error) {", "\n  }\n"),
      /createRuntimeDiagnosticItem\("Runtime", "Unavailable"\)/,
      "and that path says the readout is unavailable rather than showing an empty deployment",
    );
  });

  it("still renders every section it always rendered", () => {
    for (const label of [
      "Database Provider", "SQLite Journal", "Foreign Keys", "Database File", "Data Directory",
      "Storage Provider", "Storage Status", "Local Storage Root", "Scanner Mode", "Scanner Status",
      "Worker Mode", "Worker State", "Worker Timer", "Registered Job Types",
    ]) {
      assert.ok(render.includes(`"${label}"`), label + " must still be rendered");
    }
  });

  it("still warns about a redacted path, from the vouched scope", () => {
    assert.match(warnings, /database\.fileLocation\.relativeTo === "outside-app-root" \|\| diagnostics\.data\.directoryLocation\.relativeTo === "outside-app-root"/,
      "the redacted-path warning must read the scope directly now that it is vouched for");
  });

  it("leaves the jobs readout to its own child", () => {
    assert.match(consumer, /const jobs = readJobStatusResponse\(/,
      "the jobs readout belongs to 0.33.33.38.4.8.4 and is untouched here");
  });
});
