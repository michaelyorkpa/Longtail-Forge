/* global fetch */

import http from "node:http";
import { performance } from "node:perf_hooks";
import { chromium } from "@playwright/test";
import { loadRuntimeEnvFile } from "../src/runtime-env.js";

loadRuntimeEnvFile();

const { createApp } = await import("../src/core/app.js");
const { closeSqlite, initializeDatabase, querySql } = await import("../src/db/index.js");
const { readSqliteStatementCount } = await import("../src/db/sqlite.js");
const { createSession, deleteSession } = await import("../src/security/sessions.js");

const SAMPLE_COUNT = 7;
const DASHBOARD_ENDPOINTS = Object.freeze({
  dashboardSummary: "/api/tasks/dashboard-summary",
  effortSummary: "/api/time-tracking/dashboard/effort-summary",
});

let browser = null;
let server = null;
let sessionId = "";

try {
  await initializeDatabase();
  const user = (await querySql(`
SELECT user_id, username, timezone, home_workspace_id, active_workspace_id
FROM users
WHERE protected_user = 'yes'
LIMIT 1;
`))[0];
  if (!user) {
    throw new Error("Dashboard measurement requires the protected local operator account.");
  }

  const taskCount = Number((await querySql("SELECT COUNT(*) AS count FROM tasks;"))[0]?.count || 0);
  const timeEntryCount = Number((await querySql("SELECT COUNT(*) AS count FROM time_entries;"))[0]?.count || 0);
  const workspaceCount = Number((await querySql("SELECT COUNT(*) AS count FROM workspaces;"))[0]?.count || 0);
  const today = localDateKey(new Date(), user.timezone);
  const calendarRange = dashboardCalendarRange(today);
  const endpoints = {
    ...DASHBOARD_ENDPOINTS,
    calendar: `/api/tasks/calendar?start=${calendarRange.start}&end=${calendarRange.end}&statuses=open%2Cin_progress%2Cblocked`,
  };

  const session = await createSession({
    ...user,
    active_workspace_id: user.active_workspace_id || user.home_workspace_id,
  });
  sessionId = session.sessionId;
  server = await new Promise((resolve) => {
    const instance = http.createServer(/** @type {import("node:http").RequestListener} */ (/** @type {unknown} */ (createApp())));
    instance.listen(0, "127.0.0.1", () => resolve(instance));
  });

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const headers = { cookie: `longtail_forge_session=${sessionId}` };
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

  const endpointResults = {};
  for (const [name, url] of Object.entries(endpoints)) {
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
  const client = await page.evaluate(() => {
    const targets = new Set([
      "/api/tasks/dashboard-summary",
      "/api/tasks/calendar",
      "/api/time-tracking/dashboard/effort-summary",
    ]);
    const navigation = performance.getEntriesByType("navigation")[0];
    const firstFetchStart = Math.min(...performance.getEntriesByType("resource")
      .filter((entry) => targets.has(new URL(entry.name).pathname))
      .map((entry) => entry.startTime));
    return {
      firstFetchFromNavigationStartMs: firstFetchStart,
      loadEventToFirstFetchGapMs: firstFetchStart - navigation.loadEventEnd,
    };
  });

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
    await new Promise((resolve) => server.close(resolve));
  }
  if (sessionId) {
    await deleteSession(sessionId);
  }
  await closeSqlite();
}

function summarizeSamples(samples) {
  const elapsed = samples.map((sample) => sample.elapsedMs).sort((left, right) => left - right);
  const statements = samples.map((sample) => sample.statements);
  return {
    bytes: samples[0].bytes,
    medianMs: Number(elapsed[Math.floor(elapsed.length / 2)].toFixed(1)),
    rangeMs: [
      Number(elapsed[0].toFixed(1)),
      Number(elapsed.at(-1).toFixed(1)),
    ],
    statements: {
      maximum: Math.max(...statements),
      minimum: Math.min(...statements),
    },
  };
}

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

function localDateKey(date, timezone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: timezone,
    year: "numeric",
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function roundNumbers(values) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [
    key,
    Number(value.toFixed(1)),
  ]));
}
