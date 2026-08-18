/* global fetch */

import assert from "node:assert/strict";
import http from "node:http";
import { performance } from "node:perf_hooks";
import { chromium } from "@playwright/test";
import { loadRuntimeEnvFile } from "../src/runtime-env.js";

loadRuntimeEnvFile();

const { createApp } = await import("../src/core/app.js");
const { closeSqlite, initializeDatabase, querySql } = await import("../src/db/index.js");
const { readSqliteStatementCount } = await import("../src/db/sqlite.js");
const { createSession, deleteSession } = await import("../src/security/sessions.js");

/** @typedef {{ count: string | number }} CountRow */
/** @typedef {{ user_id: string, username: string, timezone: string | null, home_workspace_id: string, active_workspace_id: string | null }} ProtectedDashboardUser */
/** @typedef {import("node:http").Server} HttpServer */
/** @typedef {import("node:http").RequestListener} HttpRequestListener */
/** @typedef {{ bytes: number, elapsedMs: number, statements: number }} DashboardRouteSample */
/** @typedef {{ firstFetchFromNavigationStartMs: number, loadEventToFirstFetchGapMs: number }} DashboardClientMetrics */
/** @typedef {"ok" | "warn" | "exceeds"} DashboardRouteStatus */
/** @typedef {{ bytes: number, medianMs: number, rangeMs: [number, number], statements: { minimum: number, maximum: number } }} DashboardSampleSummary */

const SAMPLE_COUNT = 7;
const DASHBOARD_ENDPOINTS = Object.freeze({
  dashboardSummary: "/api/tasks/dashboard-summary",
  effortSummary: "/api/time-tracking/dashboard/effort-summary",
});

/** @type {import("@playwright/test").Browser | null} */
let browser = null;
/** @type {HttpServer | null} */
let server = null;
let sessionId = "";

try {
  await initializeDatabase();
  const users = /** @type {ReadonlyArray<ProtectedDashboardUser>} */ (
    /** @type {unknown} */ (await querySql(`
SELECT user_id, username, timezone, home_workspace_id, active_workspace_id
FROM users
WHERE protected_user = 'yes'
LIMIT 1;
`))
  );
  const user = users[0];

  if (!user) {
    throw new Error("Dashboard measurement requires the protected local operator account.");
  }

  const taskCount = readCount(
    /** @type {ReadonlyArray<CountRow>} */ (/** @type {unknown} */ (await querySql("SELECT COUNT(*) AS count FROM tasks;"))),
  );
  const timeEntryCount = readCount(
    /** @type {ReadonlyArray<CountRow>} */ (/** @type {unknown} */ (await querySql("SELECT COUNT(*) AS count FROM time_entries;"))),
  );
  const workspaceCount = readCount(
    /** @type {ReadonlyArray<CountRow>} */ (/** @type {unknown} */ (await querySql("SELECT COUNT(*) AS count FROM workspaces;"))),
  );
  const today = localDateKey(new Date(), user.timezone || "UTC");
  const calendarRange = dashboardCalendarRange(today);
  const endpoints = {
    ...DASHBOARD_ENDPOINTS,
    calendar: `/api/tasks/calendar?start=${calendarRange.start}&end=${calendarRange.end}&statuses=open%2Cin_progress%2Cblocked`,
  };

  const session = await createSession({
    ...user,
    active_workspace_id: user.active_workspace_id || user.home_workspace_id,
  });
  sessionId = /** @type {{ sessionId: string }} */ (session).sessionId;
  server = await createDashboardServer();

  const port = listenerPort(server);
  const baseUrl = `http://127.0.0.1:${port}`;
  const headers = { cookie: `longtail_forge_session=${sessionId}` };
  /** @type {(url: string) => Promise<DashboardRouteSample>} */
  const measure = async (url) => {
    const statementStart = readSqliteStatementCount();
    const timeStart = performance.now();
    const response = await fetch(baseUrl + url, { headers });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`${url} returned HTTP ${response.status}.`);
    }

    return {
      bytes: Buffer.byteLength(text),
      elapsedMs: performance.now() - timeStart,
      statements: readSqliteStatementCount() - statementStart,
    };
  };

  for (const url of Object.values(endpoints)) {
    await measure(url);
  }

  /** @type {Record<string, DashboardSampleSummary>} */
  const endpointResults = {};
  for (const [name, url] of Object.entries(endpoints)) {
    /** @type {DashboardRouteSample[]} */
    const samples = [];
    for (let index = 0; index < SAMPLE_COUNT; index += 1) {
      samples.push(await measure(url));
    }
    endpointResults[name] = summarizeSamples(samples);
  }

  browser = await chromium.launch();
  const context = await browser.newContext();
  await context.addCookies([{
    name: "longtail_forge_session",
    url: baseUrl,
    value: sessionId,
  }]);
  const page = await context.newPage();
  await page.goto(`${baseUrl}/dashboard.html`, { waitUntil: "load" });
  await page.waitForFunction(() => {
    const targetPaths = new Set([
      "/api/tasks/dashboard-summary",
      "/api/tasks/calendar",
      "/api/time-tracking/dashboard/effort-summary",
    ]);
    return new Set(
      performance.getEntriesByType("resource")
        .map((entry) => new URL(entry.name).pathname)
        .filter((path) => targetPaths.has(path)),
    ).size === targetPaths.size;
  });
  const client = /** @type {DashboardClientMetrics} */ (await page.evaluate(() => {
    const targets = new Set([
      "/api/tasks/dashboard-summary",
      "/api/tasks/calendar",
      "/api/time-tracking/dashboard/effort-summary",
    ]);
    const getEntriesByType = /** @type {(entryType: string) => Array<{ name: string, startTime: number, entryType: string }> } */ (performance.getEntriesByType);
    const navigation = getEntriesByType("navigation")[0];
    const loadEventEnd = navigation && navigation.entryType === "navigation"
      ? /** @type {{ loadEventEnd: number }} */ (/** @type {unknown} */ (navigation)).loadEventEnd
      : 0;
    const firstFetchStart = Math.min(...getEntriesByType("resource")
      .filter((entry) => targets.has(new URL(entry.name).pathname))
      .map((entry) => entry.startTime));
    return {
      firstFetchFromNavigationStartMs: firstFetchStart,
      loadEventToFirstFetchGapMs: firstFetchStart - loadEventEnd,
    };
  }));

  console.log(JSON.stringify({
    anchor: "Today()",
    client: roundNumbers(client),
    endpoints: endpointResults,
    sampleCount: SAMPLE_COUNT,
    seed: {
      contract: "development-data-v2",
      tasks: taskCount,
      timeEntries: timeEntryCount,
      workspaces: workspaceCount,
    },
    today,
  }, null, 2));
} finally {
  if (browser) {
    await browser.close();
  }

  if (server) {
    await closeDashboardServer(server);
  }

  if (sessionId) {
    await deleteSession(sessionId);
  }

  await closeSqlite();
}

/**
 * @param {ReadonlyArray<CountRow>} rows
 * @returns {number}
 */
function readCount(rows) {
  return Number(rows[0]?.count || 0);
}

/**
 * @param {DashboardRouteSample[]} samples
 * @returns {DashboardSampleSummary}
 */
function summarizeSamples(samples) {
  const elapsed = samples.map((sample) => sample.elapsedMs).sort((left, right) => left - right);
  const statements = samples.map((sample) => sample.statements);
  const minElapsed = elapsed[0] ?? 0;
  const maxElapsed = elapsed.at(-1) ?? 0;
  const medianElapsed = elapsed[Math.floor(elapsed.length / 2)] ?? 0;
  return {
    bytes: samples[0].bytes,
    medianMs: Number(medianElapsed.toFixed(1)),
    rangeMs: [
      Number(minElapsed.toFixed(1)),
      Number(maxElapsed.toFixed(1)),
    ],
    statements: {
      maximum: Math.max(...statements),
      minimum: Math.min(...statements),
    },
  };
}

/**
 * @param {string} today
 * @returns {{ end: string, start: string }}
 */
function dashboardCalendarRange(today) {
  const date = new Date(`${today}T12:00:00`);
  const monthStart = new Date(date.getFullYear(), date.getMonth(), 1, 12);
  const rangeStart = new Date(monthStart);
  rangeStart.setDate(monthStart.getDate() - monthStart.getDay());
  const rangeEnd = new Date(rangeStart);
  rangeEnd.setDate(rangeStart.getDate() + 41);
  return {
    end: localDateKey(rangeEnd),
    start: localDateKey(rangeStart),
  };
}

/**
 * @param {Date} date
 * @param {string} [timezone]
 * @returns {string}
 */
function localDateKey(date, timezone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  const parts = /** @type {Record<string, string>} */ (Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      day: "2-digit",
      month: "2-digit",
      timeZone: timezone,
      year: "numeric",
    }).formatToParts(date).map((part) => [part.type, part.value]),
  ));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * @param {Record<string, number>} values
 * @returns {Record<string, number>}
 */
function roundNumbers(values) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [
    key,
    Number(value.toFixed(1)),
  ]));
}

/**
 * @param {import("node:http").Server} listener
 * @returns {number}
 */
function listenerPort(listener) {
  const address = listener.address();
  assert.ok(typeof address === "object" && address !== null, "Dashboard server should return an address object.");
  return address.port;
}

/**
 * @returns {Promise<HttpServer>}
 */
function createDashboardServer() {
  return new Promise((resolve) => {
    const instance = http.createServer(/** @type {HttpRequestListener} */ (/** @type {unknown} */ (createApp())));
    instance.listen(0, "127.0.0.1", () => resolve(instance));
  });
}

/**
 * @param {HttpServer} serverInstance
 * @returns {Promise<void>}
 */
function closeDashboardServer(serverInstance) {
  return new Promise((resolve, reject) => {
    serverInstance.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
