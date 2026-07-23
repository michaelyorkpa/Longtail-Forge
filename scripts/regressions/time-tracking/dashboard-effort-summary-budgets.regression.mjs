export const regressionMeta = Object.freeze({
  id: "time-tracking.dashboard-effort-summary-budgets",
  area: "time-tracking",
  tier: "focused",
  tags: ["dashboard", "payload", "performance", "permissions", "query-count"],
  description: "Pins the Time Tracking Dashboard effort summary to indexed seven-day SQL aggregates, three authorized rows, request-memoized settings, and constant statement/payload budgets as historical entries grow.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDisposableDatabaseFixture } from "../../test-support/disposable-database.mjs";

const fixture = await createDisposableDatabaseFixture("dashboard-effort-summary-budgets");
const root = process.cwd();
const dashboardSource = readFileSync(`${root}/src/modules/time-tracking/time-tracking-dashboard.service.js`, "utf8");
const repositorySource = readFileSync(`${root}/src/modules/time-tracking/time-entries.repo.js`, "utf8");
const schemaSource = readFileSync(`${root}/src/db/schema/current.sql`, "utf8");
const timeEntriesServiceSource = readFileSync(`${root}/src/modules/time-tracking/time-entries.service.js`, "utf8");
const activeTimersServiceSource = readFileSync(`${root}/src/modules/time-tracking/active-timers.service.js`, "utf8");

const { db } = await import("../../../src/core/database.js");
const { closeSqlite, initializeDatabase, querySql } = await import("../../../src/db/index.js");
const { readSqliteStatementCount } = await import("../../../src/db/sqlite.js");
const { permissionsService } = await import("../../../src/core/permissions.js");
const { settingsRepository } = await import("../../../src/repositories/settings.repo.js");
const { timeEntriesRepository } = await import("../../../src/modules/time-tracking/time-entries.repo.js");
const { timeTrackingDashboardService } = await import("../../../src/modules/time-tracking/time-tracking-dashboard.service.js");
const { normalizeUtcIso } = await import("../../../src/utils/timezones.js");

const TIMEZONE = "America/New_York";
const WINDOW_DAYS = 7;
const ROW_LIMIT = 3;

let originalFilterReadableTimeEntries = null;

try {
  assert.doesNotMatch(dashboardSource, /timeEntriesService\.list/, "effort-summary must not use the full time-entry list path");
  assert.doesNotMatch(dashboardSource, /tagsService/, "effort-summary must not load or decorate time-entry tags");
  assert.match(repositorySource, /SUM\(duration_seconds\)/, "effort-summary totals must be aggregated in SQL");
  assert.match(repositorySource, /ORDER BY end_time DESC, entry_id DESC\s+LIMIT :limit/, "recent rows must be ordered and limited in SQL");
  assert.match(dashboardSource, /readWorkspaceSettings\(session\.workspace_id, session\)/, "dashboard settings must use the request memo");
  assert.match(timeEntriesServiceSource, /async function list[\s\S]*readWorkspaceSettings\(session\.workspace_id, session\)/, "time-entry list settings must use the request memo");
  assert.match(activeTimersServiceSource, /async function shapeTimerPayloads[\s\S]*readWorkspaceSettings\(session\.workspace_id, session\)/, "timer shaping settings must use the request memo");
  assert.match(
    schemaSource,
    /CREATE INDEX idx_time_entries_workspace_end\s+ON time_entries \(workspace_id, end_time\);/,
    "the existing workspace/end-time index must remain available to the bounded dashboard read",
  );

  await initializeDatabase();
  const session = await readSeedSession();
  const today = localDateKey(new Date(), TIMEZONE);
  const recentEntries = [
    entryFixture(session, "recent-1", today, "13:00", 900),
    entryFixture(session, "recent-2", today, "11:00", 600),
    entryFixture(session, "recent-3", addDaysKey(today, -1), "16:00", 1800),
    entryFixture(session, "recent-4", addDaysKey(today, -2), "10:00", 1200),
    entryFixture(session, "recent-5", addDaysKey(today, -6), "09:00", 300),
  ];
  await insertEntries(recentEntries);
  await insertHistoricalEntries(session, today, 30, 20);

  const plan = await db.query(`
EXPLAIN QUERY PLAN
SELECT entry_id
FROM time_entries
WHERE workspace_id = :workspaceId
  AND end_time >= :windowStart
  AND end_time < :windowEnd
ORDER BY end_time DESC, entry_id DESC
LIMIT :limit;
`, {
    limit: ROW_LIMIT,
    windowEnd: normalizeUtcIso(`${addDaysKey(today, 1)}T00:00:00.000`, TIMEZONE),
    windowStart: normalizeUtcIso(`${addDaysKey(today, -(WINDOW_DAYS - 1))}T00:00:00.000`, TIMEZONE),
    workspaceId: session.workspace_id,
  });
  assert.ok(
    plan.some((row) => /idx_time_entries_workspace_end/.test(String(row.detail || ""))),
    `bounded recent-row query must use idx_time_entries_workspace_end; plan was ${JSON.stringify(plan)}`,
  );

  const expected = await readLegacyExpectedSummary(session, today);
  await timeTrackingDashboardService.readDashboardEffortSummary(freshSession(session));

  let authorizedRowCount = -1;
  originalFilterReadableTimeEntries = permissionsService.filterReadableTimeEntries;
  permissionsService.filterReadableTimeEntries = async (requestSession, entries) => {
    authorizedRowCount = entries.length;
    return originalFilterReadableTimeEntries(requestSession, entries);
  };

  const small = await measureSummary(freshSession(session));
  assert.deepEqual(summaryFacts(small.body), expected, "bounded aggregation must match the previous full-scan output");
  assert.equal(authorizedRowCount, ROW_LIMIT, "only the three displayed time-entry rows should reach authorization");
  assert.ok(small.statements <= 14, `effort-summary issued ${small.statements} statements; budget is 14`);
  assert.ok(small.bytes <= 2800, `effort-summary payload was ${small.bytes} bytes; budget is 2800`);

  const prewarmedSession = freshSession(session);
  await settingsRepository.readWorkspaceSettings(prewarmedSession.workspace_id, prewarmedSession);
  const prewarmed = await measureSummary(prewarmedSession);
  assert.equal(
    small.statements - prewarmed.statements,
    1,
    "a fresh effort-summary request should issue exactly one physical workspace-settings query",
  );

  await insertHistoricalEntries(session, today, 90, 500);
  authorizedRowCount = -1;
  const grown = await measureSummary(freshSession(session));
  assert.deepEqual(summaryFacts(grown.body), expected, "historical volume must not change seven-day totals or recent rows");
  assert.equal(authorizedRowCount, ROW_LIMIT, "historical volume must not increase the authorized row set");
  assert.equal(grown.statements, small.statements, "statement count must remain constant as historical time-entry volume grows");
  assert.equal(grown.bytes, small.bytes, "payload size must remain constant as historical time-entry volume grows");

  const integrity = await querySql("PRAGMA integrity_check;");
  assert.equal(integrity[0]?.integrity_check, "ok");

  console.log("dashboard effort-summary budgets regression passed.");
} finally {
  if (originalFilterReadableTimeEntries) {
    permissionsService.filterReadableTimeEntries = originalFilterReadableTimeEntries;
  }
  await closeSqlite();
  await fixture.cleanup();
}

async function measureSummary(session) {
  const before = readSqliteStatementCount();
  const body = await timeTrackingDashboardService.readDashboardEffortSummary(session);
  return {
    body,
    bytes: JSON.stringify(body).length,
    statements: readSqliteStatementCount() - before,
  };
}

async function readSeedSession() {
  const user = (await querySql(`
SELECT user_id, username, timezone, home_workspace_id, active_workspace_id
FROM users
WHERE protected_user = 'yes'
LIMIT 1;
`))[0];
  assert.ok(user, "fresh database should seed a protected super admin");

  return {
    home_workspace_id: user.home_workspace_id,
    ip: "127.0.0.1",
    timezone: TIMEZONE,
    user_id: user.user_id,
    username: user.username,
    workspace_id: user.active_workspace_id || user.home_workspace_id,
  };
}

function freshSession(session) {
  return { ...session };
}

function entryFixture(session, entryId, dateKey, time, durationSeconds) {
  const endTime = normalizeUtcIso(`${dateKey}T${time}:00.000`, TIMEZONE);
  const startTime = new Date(Date.parse(endTime) - durationSeconds * 1000).toISOString();
  return {
    billable: "yes",
    client_id: "budget-client",
    client_name: "Budget Client",
    description: `Budget entry ${entryId}`,
    duration_hours: (durationSeconds / 3600).toFixed(4),
    duration_seconds: durationSeconds,
    end_time: endTime,
    entry_id: entryId,
    invoice_status: "unbilled",
    project_id: "budget-project",
    project_name: "Budget Project",
    start_time: startTime,
    task_id: null,
    user_id: session.user_id,
    workspace_id: session.workspace_id,
  };
}

async function insertEntries(entries) {
  for (const entry of entries) {
    await timeEntriesRepository.create(entry);
  }
}

async function insertHistoricalEntries(session, today, daysAgo, count) {
  const dateKey = addDaysKey(today, -daysAgo);
  const entries = Array.from({ length: count }, (_, index) => entryFixture(
    session,
    `historical-${daysAgo}-${String(index).padStart(4, "0")}`,
    dateKey,
    "12:00",
    60 + (index % 10),
  ));
  await insertEntries(entries);
}

async function readLegacyExpectedSummary(session, today) {
  const windowStart = addDaysKey(today, -(WINDOW_DAYS - 1));
  const recentEntries = (await timeEntriesRepository.readAll(session.workspace_id))
    .filter((entry) => {
      const dateKey = localDateKey(new Date(entry.end_time), TIMEZONE);
      return dateKey >= windowStart && dateKey <= today;
    })
    .sort((left, right) => (
      Date.parse(right.end_time) - Date.parse(left.end_time) ||
      String(right.entry_id).localeCompare(String(left.entry_id))
    ));

  return {
    entriesCount: recentEntries.length,
    rowIds: recentEntries.slice(0, ROW_LIMIT).map((entry) => entry.entry_id),
    todaySeconds: recentEntries
      .filter((entry) => localDateKey(new Date(entry.end_time), TIMEZONE) === today)
      .reduce((total, entry) => total + Number(entry.duration_seconds || 0), 0),
    totalSeconds: recentEntries.reduce((total, entry) => total + Number(entry.duration_seconds || 0), 0),
  };
}

function summaryFacts(summary) {
  return {
    entriesCount: summary.recentTime.entriesCount,
    rowIds: summary.recentTime.rows.map((row) => row.id),
    todaySeconds: summary.recentTime.todaySeconds,
    totalSeconds: summary.recentTime.totalSeconds,
  };
}

function localDateKey(date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: TIMEZONE,
    year: "numeric",
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDaysKey(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
