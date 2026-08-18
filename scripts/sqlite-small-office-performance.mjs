#!/usr/bin/env node
/* global fetch */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";

/** @typedef {import("node:http").Server} HttpServer */
/** @typedef {(fixtures: PerformanceFixtures) => string} RoutePathBuilder */
/** @typedef {(body: unknown) => number | null} RouteCounter */
/** @typedef {"app-shell-bootstrap" | "tasks-list" | "task-detail" | "notes-list" | "note-detail" | "files-browse" | "search" | "notifications" | "workbench-bootstrap"} RouteId */
/** @typedef {{ id: RouteId, label: string, path: string | RoutePathBuilder, targetMs: number, warnMs: number, count: RouteCounter, session?: "notification" }} RouteTarget */
/** @typedef {({ user_id: string, username: string, timezone: string | null, home_workspace_id: string, active_workspace_id: string | null })} SeedUser */
/** @typedef {readonly SeedUser[]} ProtectedUserRows */
/** @typedef {({ count: string | number })} CountRow */
/** @typedef {{ user_id: string, username: string, timezone: string | null, home_workspace_id: string, active_workspace_id: string | null, notification_count: string | number }} NotificationUser */
/** @typedef {{ sessionId: string }} SessionRecord */
/** @typedef {{ user_id: string, username: string, timezone: string | null, home_workspace_id: string, active_workspace_id: string | null, ip_address: string }} SeedSessionUser */
/** @typedef {{ appSession: SessionRecord, notificationSession: SessionRecord, noteId: string, taskId: string }} PerformanceFixtures */
/** @typedef {{ database?: string, failOnWarn?: boolean, help?: boolean, iterations?: number, json?: boolean, keepDatabase?: boolean, profile?: string, provider?: string, warmups?: number }} ScriptOptions */
/** @typedef {"ok" | "warn" | "exceeds"} RouteStatus */
/** @typedef {{ body?: unknown, cookie?: string }} ApiRequestOptions */
/** @typedef {{ body: unknown, bytes: number, status: number }} ApiResponse */
/** @typedef {{ get: (url: string, options?: ApiRequestOptions) => Promise<ApiResponse> }} ApiClient */
/** @typedef {{ api: ApiClient, fixtures: PerformanceFixtures, iterations: number, warmups: number }} MeasureRoutesParams */
/** @typedef {{ database: string, options: Required<ScriptOptions>, runtimeDir: string }} ScaleSeedArguments */
/** @typedef {{ id: "app-shell-bootstrap" | "tasks-list" | "task-detail" | "notes-list" | "note-detail" | "files-browse" | "search" | "notifications" | "workbench-bootstrap", label: string, path: string, method?: string, targetMs: number, warnMs: number, status: "ok" | "warn" | "exceeds", statusCode: number, returned: number | null, bytes: number, samplesMs: number[], avgMs: number, maxMs: number, minMs: number, p95Ms: number }} RouteMeasurement */
/** @typedef {typeof import("../src/db/index.js")} DatabaseModule */
/** @typedef {typeof import("../src/security/sessions.js")} SessionModule */
/** @typedef {{ profile: string, generatedAt: string, database: string, provider: string, iterations: number, warmups: number, targetNote: string, routes: RouteMeasurement[], exceededWarnCount: number }} BenchmarkReport */

const DEFAULT_PROFILE = "sqlite-small-office-50";
const DEFAULT_PROVIDER = "sqlite";
const DEFAULT_ITERATIONS = 3;
const DEFAULT_WARMUPS = 1;
const DEFAULT_PASSWORD = "Scale-Seed-Password-123!";
const TARGET_NOTE = "Local development hardware sanity targets; see docs/sqlite-small-office-mode.md.";

/** @type {ReadonlyArray<RouteTarget>} */
const ROUTE_TARGETS = Object.freeze([
  Object.freeze({
    id: "app-shell-bootstrap",
    label: "App shell bootstrap",
    path: "/api/app-shell/bootstrap",
    targetMs: 750,
    warnMs: 1500,
    count: countNavigation,
  }),
  Object.freeze({
    id: "tasks-list",
    label: "Tasks list",
    path: "/api/tasks?limit=50",
    targetMs: 900,
    warnMs: 1800,
    count: countTasks,
  }),
  Object.freeze({
    id: "task-detail",
    label: "Task detail",
    path: /** @type {RoutePathBuilder} */ ((fixtures) => `/api/tasks/${encodeURIComponent(fixtures.taskId)}`),
    targetMs: 450,
    warnMs: 900,
    count: countTaskDetail,
  }),
  Object.freeze({
    id: "notes-list",
    label: "Notes list",
    path: "/api/notes?limit=50",
    targetMs: 900,
    warnMs: 1800,
    count: countNotes,
  }),
  Object.freeze({
    id: "note-detail",
    label: "Note detail",
    path: /** @type {RoutePathBuilder} */ ((fixtures) => `/api/notes/${encodeURIComponent(fixtures.noteId)}`),
    targetMs: 450,
    warnMs: 900,
    count: countNoteDetail,
  }),
  Object.freeze({
    id: "files-browse",
    label: "Files browse",
    path: "/api/files/attachments?status=all&limit=50",
    targetMs: 1200,
    warnMs: 2400,
    count: countAttachments,
  }),
  Object.freeze({
    id: "search",
    label: "Search",
    path: "/api/search?recordType=task&limit=25",
    targetMs: 1200,
    warnMs: 2400,
    count: countSearch,
  }),
  Object.freeze({
    id: "notifications",
    label: "Notifications",
    path: "/api/notifications?limit=50",
    targetMs: 750,
    warnMs: 1500,
    count: countNotifications,
    session: "notification",
  }),
  Object.freeze({
    id: "workbench-bootstrap",
    label: "Workbench",
    path: "/api/workbench/bootstrap",
    targetMs: 1000,
    warnMs: 2000,
    count: countWorkbenchCards,
  }),
]);

/** @type {(() => Promise<void>) | null} */
let closeSqlite = null;
/** @type {HttpServer | null} */
let server = null;
let tempDir = "";
let shouldRemoveTempDir = false;

try {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printUsage();
    process.exit(0);
  }

  validateOptions(options);

  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-sqlite-small-office-performance-"));
  shouldRemoveTempDir = !options.keepDatabase;
  const database = options.database || path.join(
    tempDir,
    `longtail-forge-${options.profile}.disposable.db`,
  );

  runScaleSeed({ database, options, runtimeDir: tempDir });
  configureRuntime({ database, options, runtimeDir: tempDir });

  const appModule = await import("../src/core/app.js");
  const db = await import("../src/db/index.js");
  const sessions = await import("../src/security/sessions.js");
  closeSqlite = db.closeSqlite;

  await db.initializeDatabase();
  const fixtures = await readFixtures(db, sessions);
  server = await listen(appModule.createApp());
  const api = createApi(`http://127.0.0.1:${listenerPort(server)}`);
  const results = await measureRoutes({
    api,
    fixtures,
    iterations: options.iterations,
    warmups: options.warmups,
  });
  const report = {
    generatedAt: new Date().toISOString(),
    profile: options.profile,
    provider: options.provider,
    database,
    iterations: options.iterations,
    warmups: options.warmups,
    targetNote: TARGET_NOTE,
    routes: results,
    exceededWarnCount: results.filter((result) => result.status === "exceeds").length,
  };

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }

  if (options.failOnWarn && report.exceededWarnCount > 0) {
    throw new Error(`${report.exceededWarnCount} route(s) exceeded warning thresholds.`);
  }
} catch (error) {
  const failure = /** @type {{ stack?: string, message?: string }} */ (error);
  console.error(failure.stack || failure.message || error);
  process.exitCode = 1;
} finally {
  if (server) {
    await closeServer(server);
  }

  if (closeSqlite) {
    await closeSqlite();
  }

  if (tempDir && shouldRemoveTempDir) {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

/**
 * @param {string[]} argv
 * @returns {Required<ScriptOptions>}
 */
function parseArgs(argv) {
  /** @type {Required<ScriptOptions>} */
  const options = {
    database: "",
    failOnWarn: false,
    help: false,
    iterations: DEFAULT_ITERATIONS,
    json: false,
    keepDatabase: false,
    profile: DEFAULT_PROFILE,
    provider: DEFAULT_PROVIDER,
    warmups: DEFAULT_WARMUPS,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--json") {
      options.json = true;
      continue;
    }

    if (arg === "--keep-database") {
      options.keepDatabase = true;
      continue;
    }

    if (arg === "--fail-on-warn") {
      options.failOnWarn = true;
      continue;
    }

    if (arg === "--profile") {
      options.profile = requireValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--provider") {
      options.provider = requireValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--database") {
      options.database = requireValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--iterations") {
      options.iterations = Number.parseInt(requireValue(argv, index, arg), 10);
      index += 1;
      continue;
    }

    if (arg === "--warmups") {
      options.warmups = Number.parseInt(requireValue(argv, index, arg), 10);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

/**
 * @param {string[]} argv
 * @param {number} index
 * @param {string} arg
 * @returns {string}
 */
function requireValue(argv, index, arg) {
  const value = argv[index + 1];

  if (!value || value.startsWith("--")) {
    throw new Error(`${arg} requires a value.`);
  }

  return value;
}

/**
 * @param {Required<ScriptOptions>} options
 * @returns {void}
 */
function validateOptions(options) {
  if (options.provider !== "sqlite") {
    throw new Error("SQLite small-office performance runs currently require --provider sqlite.");
  }

  if (!Number.isInteger(options.iterations) || options.iterations < 1 || options.iterations > 25) {
    throw new Error("--iterations must be an integer from 1 to 25.");
  }

  if (!Number.isInteger(options.warmups) || options.warmups < 0 || options.warmups > 10) {
    throw new Error("--warmups must be an integer from 0 to 10.");
  }
}

/**
 * @param {{ database: string, options: Required<ScriptOptions>, runtimeDir: string }} args
 * @returns {void}
 */
function runScaleSeed(args) {
  /** @type {ScaleSeedArguments} */
  const { database, options, runtimeDir } = args;
  const result = spawnSync(process.execPath, [
    "scripts/seed-scale.mjs",
    "--profile",
    options.profile,
    "--provider",
    options.provider,
    "--database",
    database,
    "--json",
  ], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: cleanEnv({
      LONGTAIL_DATABASE_FILE: database,
      LONGTAIL_DATABASE_PROVIDER: options.provider,
      LONGTAIL_DATA_DIR: runtimeDir,
      LONGTAIL_ENV: "test",
      SUPER_ADMIN_PASSWORD: process.env.SUPER_ADMIN_PASSWORD || DEFAULT_PASSWORD,
    }),
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
}

/**
 * @param {ScaleSeedArguments} args
 * @returns {void}
 */
function configureRuntime(args) {
  /** @type {ScaleSeedArguments} */
  const { database, options, runtimeDir } = args;
  process.env.LONGTAIL_DATABASE_FILE = database;
  process.env.LONGTAIL_DATABASE_PROVIDER = options.provider;
  process.env.LONGTAIL_DATA_DIR = runtimeDir;
  process.env.LONGTAIL_ENV = process.env.LONGTAIL_ENV || "test";
  process.env.SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || DEFAULT_PASSWORD;
}

/**
 * @param {DatabaseModule} db
 * @param {SessionModule} sessions
 * @returns {Promise<PerformanceFixtures>}
 */
async function readFixtures(db, sessions) {
  const protectedUsers = /** @type {ProtectedUserRows} */ (
    /** @type {unknown} */ (await db.querySql(`
SELECT user_id, username, timezone, home_workspace_id, active_workspace_id
FROM users
WHERE protected_user = 'yes'
LIMIT 1;
`))
  );
  const protectedUser = protectedUsers[0];

  assert.ok(protectedUser, "seeded database should include a protected user");

  const workspaceId = protectedUser.active_workspace_id || protectedUser.home_workspace_id;
  const taskRows = /** @type {{ task_id: string }[]} */ (
    /** @type {unknown} */ (await db.querySql(`
SELECT task_id
FROM tasks
WHERE workspace_id = ${db.sqlText(workspaceId)}
ORDER BY task_id ASC
LIMIT 1;
`))
  );
  const noteRows = /** @type {{ note_id: string }[]} */ (
    /** @type {unknown} */ (await db.querySql(`
SELECT note_id
FROM notes
WHERE workspace_id = ${db.sqlText(workspaceId)}
  AND security_mode = 'normal'
ORDER BY note_id ASC
LIMIT 1;
`))
  );

  assert.ok(taskRows[0], "seeded database should include a task detail fixture");
  assert.ok(noteRows[0], "seeded database should include a normal note detail fixture");

  const notificationUser = await readNotificationUser(db);

  return {
    appSession: await createSeedSession(sessions, protectedUser),
    notificationSession: await createSeedSession(sessions, notificationUser || protectedUser),
    noteId: noteRows[0].note_id,
    taskId: taskRows[0].task_id,
  };
}

/**
 * @param {DatabaseModule} db
 * @returns {Promise<NotificationUser | null>}
 */
async function readNotificationUser(db) {
  const rows = /** @type {NotificationUser[]} */ (
    /** @type {unknown} */ (await db.querySql(`
SELECT users.user_id, users.username, users.timezone, users.home_workspace_id, users.active_workspace_id, COUNT(*) AS notification_count
FROM notifications
INNER JOIN users
  ON users.user_id = notifications.recipient_user_id
GROUP BY users.user_id, users.username, users.timezone, users.home_workspace_id, users.active_workspace_id
HAVING COUNT(*) > 0
ORDER BY COUNT(*) DESC, users.username
LIMIT 1;
`))
  );

  return rows[0] || null;
}

/**
 * @param {SessionModule} sessions
 * @param {SeedUser} user
 * @returns {Promise<SessionRecord>}
 */
async function createSeedSession(sessions, user) {
  return sessions.createSession({
    active_workspace_id: user.active_workspace_id || user.home_workspace_id,
    home_workspace_id: user.home_workspace_id,
    ip_address: "127.0.0.1",
    timezone: user.timezone || "America/New_York",
    user_id: user.user_id,
    username: user.username,
  });
}

/**
 * @param {MeasureRoutesParams} params
 */
async function measureRoutes(params) {
  const { api, fixtures, iterations, warmups } = /** @type {MeasureRoutesParams} */ (params);
  /** @type {RouteMeasurement[]} */
  const results = [];

  for (const route of ROUTE_TARGETS) {
    const pathValue = typeof route.path === "function" ? route.path(fixtures) : route.path;
    const cookie = route.session === "notification"
      ? fixtures.notificationSession.sessionId
      : fixtures.appSession.sessionId;

    for (let warmup = 0; warmup < warmups; warmup += 1) {
      const warmupResponse = await api.get(pathValue, { cookie });
      assert.equal(warmupResponse.status, 200, `${route.label} warmup returned ${warmupResponse.status}: ${previewBody(warmupResponse.body)}`);
    }

    const samples = [];
    /** @type {ApiResponse | null} */
    let lastResponse = null;

    for (let iteration = 0; iteration < iterations; iteration += 1) {
      const startedAt = performance.now();
      const response = await api.get(pathValue, { cookie });
      const durationMs = performance.now() - startedAt;

      assert.equal(response.status, 200, `${route.label} returned ${response.status}: ${previewBody(response.body)}`);
      samples.push(durationMs);
      lastResponse = response;
    }

    const summary = summarizeSamples(samples);
    results.push({
      id: route.id,
      label: route.label,
      method: "GET",
      path: pathValue,
      targetMs: route.targetMs,
      warnMs: route.warnMs,
      status: routeStatus(summary.p95Ms, route.targetMs, route.warnMs),
      statusCode: lastResponse?.status || 0,
      returned: route.count(lastResponse?.body),
      bytes: lastResponse?.bytes || 0,
      samplesMs: samples.map(roundMs),
      ...summary,
    });
  }

  return results;
}

/**
 * @param {number[]} samples
 * @returns {{ avgMs: number, maxMs: number, minMs: number, p95Ms: number }}
 */
function summarizeSamples(samples) {
  const sorted = [...samples].sort((left, right) => left - right);
  const total = samples.reduce((sum, sample) => sum + sample, 0);
  const p95Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);

  return {
    avgMs: roundMs(total / samples.length),
    maxMs: roundMs(sorted[sorted.length - 1]),
    minMs: roundMs(sorted[0]),
    p95Ms: roundMs(sorted[p95Index]),
  };
}

/**
 * @param {number} p95Ms
 * @param {number} targetMs
 * @param {number} warnMs
 * @returns {RouteStatus}
 */
function routeStatus(p95Ms, targetMs, warnMs) {
  if (p95Ms > warnMs) {
    return "exceeds";
  }

  if (p95Ms > targetMs) {
    return "warn";
  }

  return "ok";
}

/**
 * @param {string} baseUrl
 * @returns {{ get: (url: string, options?: ApiRequestOptions) => Promise<ApiResponse> }}
 */
function createApi(baseUrl) {
  return {
    get: (url, options = {}) => request(baseUrl, "GET", url, options),
  };
}

/**
 * @param {string} baseUrl
 * @param {"GET"} method
 * @param {string} url
 * @param {ApiRequestOptions} options
 * @returns {Promise<ApiResponse>}
 */
async function request(baseUrl, method, url, options = {}) {
  const headers = {};

  if (options.cookie) {
    headers.Cookie = `longtail_forge_session=${options.cookie}`;
  }

  const response = await fetch(`${baseUrl}${url}`, {
    headers,
    method,
    redirect: "manual",
  });
  const text = await response.text();
  let body = null;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  return {
    body,
    bytes: Buffer.byteLength(text, "utf8"),
    status: response.status,
  };
}

/**
 * @param {unknown} app
 * @returns {Promise<HttpServer>}
 */
function listen(app) {
  return new Promise((resolve) => {
    const appServer = http.createServer(/** @type {import("node:http").RequestListener} */ (/** @type {unknown} */ (app)));
    appServer.listen(0, "127.0.0.1", () => resolve(appServer));
  });
}

/**
 * @param {HttpServer} appServer
 * @returns {number}
 */
function listenerPort(appServer) {
  const address = appServer.address();
  assert.ok(typeof address === "object" && address !== null, "Performance server should return an address object.");
  return address.port;
}

/**
 * @param {HttpServer} appServer
 * @returns {Promise<void>}
 */
function closeServer(appServer) {
  return new Promise((resolve, reject) => {
    appServer.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

/**
 * @param {Record<string, string | undefined>} overrides
 * @returns {NodeJS.ProcessEnv}
 */
function cleanEnv(overrides = {}) {
  /** @type {NodeJS.ProcessEnv} */
  const env = { ...process.env, ...overrides };
  delete env.LTF_REGRESSION_BASELINE_DB;
  return env;
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function countArray(value) {
  return Array.isArray(value) ? value.length : null;
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function countObject(value) {
  return value && typeof value === "object" ? 1 : null;
}

/**
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
function bodyRecord(value) {
  return typeof value === "object" && value !== null
    ? /** @type {Record<string, unknown>} */ (value)
    : {};
}

/**
 * @param {unknown} body
 * @returns {number | null}
 */
function countNavigation(body) {
  return countArray(bodyRecord(body).navigation);
}

/**
 * @param {unknown} body
 * @returns {number | null}
 */
function countTasks(body) {
  return countArray(bodyRecord(body).tasks);
}

/**
 * @param {unknown} body
 * @returns {number | null}
 */
function countTaskDetail(body) {
  return countObject(bodyRecord(body).task);
}

/**
 * @param {unknown} body
 * @returns {number | null}
 */
function countNotes(body) {
  return countArray(bodyRecord(body).notes);
}

/**
 * @param {unknown} body
 * @returns {number | null}
 */
function countNoteDetail(body) {
  return countObject(bodyRecord(body).note);
}

/**
 * @param {unknown} body
 * @returns {number | null}
 */
function countAttachments(body) {
  return countArray(bodyRecord(body).attachments);
}

/**
 * @param {unknown} body
 * @returns {number | null}
 */
function countSearch(body) {
  return countArray(bodyRecord(body).results);
}

/**
 * @param {unknown} body
 * @returns {number | null}
 */
function countNotifications(body) {
  return countArray(bodyRecord(body).notifications);
}

/**
 * @param {unknown} body
 * @returns {number | null}
 */
function countWorkbenchCards(body) {
  const registry = bodyRecord(body).registry;
  return countArray(registry && typeof registry === "object" ? bodyRecord(registry).workbenchCards : undefined);
}

/**
 * @param {unknown} body
 * @returns {string}
 */
function previewBody(body) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return text?.slice(0, 400) || "";
}

/**
 * @param {number} value
 * @returns {number}
 */
function roundMs(value) {
  return Math.round(value * 100) / 100;
}

/**
 * @param {BenchmarkReport} report
 */
function printReport(report) {
  console.log(`SQLite small-office performance (${report.profile})`);
  console.log(`Database: ${report.database}`);
  console.log(`Iterations: ${report.iterations}; warmups: ${report.warmups}`);
  console.log(TARGET_NOTE);
  console.log("");
  console.log(formatTable(report.routes));

  if (report.exceededWarnCount > 0) {
    console.log("");
    console.log(`${report.exceededWarnCount} route(s) exceeded warning thresholds. Investigate indexes, route shape, or move beyond SQLite assumptions before treating this as supported production shape.`);
  }
}

/**
 * @param {RouteMeasurement[]} rows
 * @returns {string}
 */
function formatTable(rows) {
  const headers = ["route", "p95", "avg", "target", "warn", "status", "rows", "bytes"];
  const body = rows.map((row) => [
    row.id,
    `${row.p95Ms}ms`,
    `${row.avgMs}ms`,
    `${row.targetMs}ms`,
    `${row.warnMs}ms`,
    row.status,
    String(row.returned ?? ""),
    String(row.bytes),
  ]);
  const widths = headers.map((header, index) => Math.max(
    header.length,
    ...body.map((row) => row[index].length),
  ));
  const lines = [
    formatTableRow(headers, widths),
    formatTableRow(widths.map((width) => "-".repeat(width)), widths),
    ...body.map((row) => formatTableRow(row, widths)),
  ];

  return lines.join("\n");
}

/**
 * @param {string[]} columns
 * @param {number[]} widths
 * @returns {string}
 */
function formatTableRow(columns, widths) {
  return columns
    .map((column, index) => column.padEnd(widths[index]))
    .join("  ");
}

function printUsage() {
  console.log(`
Usage: node scripts/sqlite-small-office-performance.mjs [options]

Options:
  --profile <name>       Scale seed profile. Defaults to ${DEFAULT_PROFILE}.
  --provider <provider>  Database provider. Only sqlite is supported here.
  --database <path>      Disposable SQLite database path. Defaults to a temp file.
  --iterations <count>   Timed iterations per route, 1-25. Defaults to ${DEFAULT_ITERATIONS}.
  --warmups <count>      Untimed warmups per route, 0-10. Defaults to ${DEFAULT_WARMUPS}.
  --json                 Print machine-readable JSON only.
  --keep-database        Keep the generated temp database and runtime directory.
  --fail-on-warn         Exit non-zero if any route exceeds its warning threshold.
  --help                 Show this help.
`);
}
