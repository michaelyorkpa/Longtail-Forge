/* global fetch */

export const regressionMeta = Object.freeze({
  id: "dashboard.hot-endpoint-budgets",
  area: "dashboard",
  tier: "focused",
  tags: ["budgets", "dashboard", "payload", "performance", "query-count", "timing"],
  description: "Pins HTTP timing, statement-count, and payload budgets for the three Dashboard data routes and proves unrelated Task/time-entry growth does not expand their steady-state cost.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";
import http from "node:http";
import { performance } from "node:perf_hooks";
import { requireRow } from "../../test-support/database-row-assertions.mjs";
import { workspaceSessionFixture } from "../../test-support/session-fixtures.mjs";

/** @typedef {import("../../../src/types/http-contracts.js").WorkspaceRequestSession} TasksSession */
import { createDisposableDatabaseFixture } from "../../test-support/disposable-database.mjs";

const fixture = await createDisposableDatabaseFixture("dashboard-hot-endpoint-budgets");

const { createApp } = await import("../../../src/core/app.js");
const { db } = await import("../../../src/core/database.js");
const { closeSqlite, initializeDatabase, querySql } = await import("../../../src/db/index.js");
const { readSqliteStatementCount } = await import("../../../src/db/sqlite.js");
const { tasksService } = await import("../../../src/modules/tasks/tasks.service.js");
const { timeEntriesRepository } = await import("../../../src/modules/time-tracking/time-entries.repo.js");
const { createSession } = await import("../../../src/security/sessions.js");
const { normalizeUtcIso } = await import("../../../src/utils/timezones.js");

/** @typedef {"calendar" | "dashboardSummary" | "effortSummary"} EndpointName */
/** @typedef {{ bytes: number, milliseconds: number, statements: number }} EndpointBudget */
/** @typedef {{ bytes: number, milliseconds: number, statements: number }} EndpointMeasurement */
/** @typedef {Record<EndpointName, EndpointMeasurement>} EndpointMeasurements */

/** @type {Readonly<Record<EndpointName, EndpointBudget>>} */
const ENDPOINT_BUDGETS = Object.freeze({
  calendar: { bytes: 131072, milliseconds: 500, statements: 24 },
  dashboardSummary: { bytes: 65536, milliseconds: 500, statements: 24 },
  effortSummary: { bytes: 4096, milliseconds: 500, statements: 20 },
});
const TIMEZONE = "America/New_York";

/** @type {import("node:http").Server | null} */
let server = null;

try {
  await initializeDatabase();
  const session = await readSeedSession();
  const today = localDateKey(new Date(), TIMEZONE);
  const range = dashboardCalendarRange(today);
  await seedVisibleRows(session, today, range);

  const httpSession = await createSession({
    active_workspace_id: session.workspace_id,
    home_workspace_id: session.home_workspace_id,
    timezone: session.timezone,
    user_id: session.user_id,
    username: session.username,
  });
  /** @type {import("node:http").Server} */
  const listening = await new Promise((resolve) => {
    const instance = http.createServer(createApp());
    instance.listen(0, "127.0.0.1", () => resolve(instance));
  });
  server = listening;
  const address = listening.address();
  assert.ok(address && typeof address === "object", "the budget fixture server should bind a TCP port");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const headers = { cookie: `longtail_forge_session=${httpSession.sessionId}` };
  const endpoints = {
    dashboardSummary: "/api/tasks/dashboard-summary",
    calendar: `/api/tasks/calendar?start=${range.start}&end=${range.end}&statuses=open%2Cin_progress%2Cblocked`,
    effortSummary: "/api/time-tracking/dashboard/effort-summary",
  };

  await warmEndpoints(baseUrl, headers, endpoints);
  const small = await measureEndpoints(baseUrl, headers, endpoints);
  assertBudgets(small, "small");

  await seedUnrelatedGrowth(session, today);
  await warmEndpoints(baseUrl, headers, endpoints);
  const grown = await measureEndpoints(baseUrl, headers, endpoints);
  assertBudgets(grown, "grown");

  for (const name of /** @type {EndpointName[]} */ (Object.keys(endpoints))) {
    assert.ok(
      grown[name].statements - small[name].statements <= 2,
      `${name} grew from ${small[name].statements} to ${grown[name].statements} statements after unrelated data growth`,
    );
    assert.ok(
      grown[name].bytes - small[name].bytes <= (name === "dashboardSummary" ? 96 : 0),
      `${name} payload grew from ${small[name].bytes} to ${grown[name].bytes} bytes after unrelated data growth`,
    );
    assert.ok(
      grown[name].milliseconds <= Math.max(ENDPOINT_BUDGETS[name].milliseconds, small[name].milliseconds * 3 + 25),
      `${name} timing scaled from ${small[name].milliseconds.toFixed(1)}ms to ${grown[name].milliseconds.toFixed(1)}ms`,
    );
  }

  const integrity = await querySql("PRAGMA integrity_check;");
  assert.equal(integrity[0]?.integrity_check, "ok");

  console.log("Dashboard hot endpoint budgets regression passed.");
} finally {
  if (server) {
    const listeningServer = server;
    await new Promise((resolve) => listeningServer.close(() => resolve(undefined)));
  }
  await closeSqlite();
  await fixture.cleanup();
}

/**
 * @param {string} baseUrl
 * @param {Record<string, string>} headers
 * @param {Record<EndpointName, string>} endpoints
 * @returns {Promise<EndpointMeasurements>}
 */
async function measureEndpoints(baseUrl, headers, endpoints) {
  /** @type {Partial<EndpointMeasurements>} */
  const results = {};
  for (const [name, url] of Object.entries(endpoints)) {
    const samples = [];
    for (let index = 0; index < 3; index += 1) {
      samples.push(await measureEndpoint(baseUrl, headers, url));
    }
    samples.sort((left, right) => left.milliseconds - right.milliseconds);
    results[/** @type {EndpointName} */ (name)] = {
      ...samples[1],
      statements: Math.max(...samples.map((sample) => sample.statements)),
    };
  }
  return /** @type {EndpointMeasurements} */ (results);
}

/**
 * @param {string} baseUrl
 * @param {Record<string, string>} headers
 * @param {string} url
 * @returns {Promise<EndpointMeasurement>}
 */
async function measureEndpoint(baseUrl, headers, url) {
  const statementStart = readSqliteStatementCount();
  const timeStart = performance.now();
  const response = await fetch(baseUrl + url, { headers });
  const text = await response.text();
  const milliseconds = performance.now() - timeStart;
  assert.equal(response.status, 200, `${url} should return 200`);
  JSON.parse(text);
  return {
    bytes: Buffer.byteLength(text),
    milliseconds,
    statements: readSqliteStatementCount() - statementStart,
  };
}

/** @param {string} baseUrl @param {Record<string, string>} headers @param {Record<EndpointName, string>} endpoints */
async function warmEndpoints(baseUrl, headers, endpoints) {
  for (const url of Object.values(endpoints)) {
    await measureEndpoint(baseUrl, headers, url);
  }
}

/** @param {EndpointMeasurements} results @param {string} label */
function assertBudgets(results, label) {
  for (const [name, result] of /** @type {[EndpointName, EndpointMeasurement][]} */ (Object.entries(results))) {
    const budget = ENDPOINT_BUDGETS[name];
    assert.ok(result.statements <= budget.statements, `${label} ${name} issued ${result.statements} statements; budget is ${budget.statements}`);
    assert.ok(result.bytes <= budget.bytes, `${label} ${name} returned ${result.bytes} bytes; budget is ${budget.bytes}`);
    assert.ok(result.milliseconds <= budget.milliseconds, `${label} ${name} took ${result.milliseconds.toFixed(1)}ms; budget is ${budget.milliseconds}ms`);
  }
}

async function readSeedSession() {
  const user = (await querySql(`
SELECT user_id, username, timezone, home_workspace_id, active_workspace_id
FROM users
WHERE protected_user = 'yes'
LIMIT 1;
`))[0];
  return workspaceSessionFixture(requireRow(user, "fresh database should seed a protected super admin"));
}

/** @param {TasksSession} session @param {string} today @param {{ start: string, end: string }} range */
async function seedVisibleRows(session, today, range) {
  for (let index = 0; index < 12; index += 1) {
    await tasksService.create({
      due_date: addDaysKey(range.start, 3 + index),
      priority: index % 3 === 0 ? "high" : "normal",
      title: `Dashboard visible Task ${index}`,
    }, session);
  }

  for (let index = 0; index < 6; index += 1) {
    await timeEntriesRepository.create(entryFixture(
      session,
      `dashboard-visible-entry-${index}`,
      addDaysKey(today, -(index % 6)),
      600 + index,
    ));
  }
}

/** @param {TasksSession} session @param {string} today */
async function seedUnrelatedGrowth(session, today) {
  const now = new Date().toISOString();
  await db.transaction(async (transaction) => {
    for (let index = 0; index < 400; index += 1) {
      await transaction.run(`
INSERT INTO tasks (
  task_id, workspace_id, title, status, priority, due_date, source_type,
  created_by_user_id, updated_by_user_id, completed_at, completed_by_user_id,
  created_at, updated_at
)
VALUES (
  :taskId, :workspaceId, :title, 'complete', 'normal', :dueDate, 'manual',
  :userId, :userId, :now, :userId, :now, :now
);
`, {
        dueDate: addDaysKey(today, -120),
        now,
        taskId: `dashboard-terminal-growth-${index}`,
        title: `Dashboard terminal growth Task ${index}`,
        userId: session.user_id,
        workspaceId: session.workspace_id,
      });
    }
  });

  for (let index = 0; index < 500; index += 1) {
    await timeEntriesRepository.create(entryFixture(
      session,
      `dashboard-historical-entry-${index}`,
      addDaysKey(today, -120),
      60 + (index % 60),
    ));
  }
}

/** @param {TasksSession} session @param {string} entryId @param {string} dateKey @param {number} durationSeconds */
function entryFixture(session, entryId, dateKey, durationSeconds) {
  const endTime = normalizeUtcIso(`${dateKey}T12:00:00.000`, TIMEZONE);
  return {
    billable: "yes",
    client_id: null,
    client_name: "",
    description: entryId,
    duration_hours: (durationSeconds / 3600).toFixed(4),
    duration_seconds: durationSeconds,
    end_time: endTime,
    entry_id: entryId,
    invoice_status: "unbilled",
    project_id: null,
    project_name: "",
    start_time: new Date(Date.parse(endTime) - durationSeconds * 1000).toISOString(),
    task_id: null,
    user_id: session.user_id,
    workspace_id: session.workspace_id,
  };
}

/** @param {string} today @returns {{ start: string, end: string }} */
function dashboardCalendarRange(today) {
  const monthStart = `${today.slice(0, 7)}-01`;
  const weekday = new Date(`${monthStart}T12:00:00.000Z`).getUTCDay();
  const start = addDaysKey(monthStart, -weekday);
  return { end: addDaysKey(start, 41), start };
}

/** @param {Date} date @param {string} timezone @returns {string} */
function localDateKey(date, timezone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: timezone,
    year: "numeric",
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** @param {string} dateKey @param {number} days @returns {string} */
function addDaysKey(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
