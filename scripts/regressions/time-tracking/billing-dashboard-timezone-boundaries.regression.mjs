export const regressionMeta = Object.freeze({
  id: "time-tracking.billing-dashboard-timezone-boundaries",
  area: "time-tracking",
  tier: "integration",
  tags: ["billing", "dashboard", "database", "time-tracking", "timezone"],
  description: "Proves billing periods and Dashboard effort windows use session-local calendar boundaries converted to UTC across month and DST edges.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";
import { workspaceSessionFixture } from "../../test-support/session-fixtures.mjs";

/** @typedef {import("../../../src/types/http-contracts.js").WorkspaceRequestSession} TasksSession */
import { createDisposableDatabaseFixture } from "../../test-support/disposable-database.mjs";

const fixture = await createDisposableDatabaseFixture("billing-dashboard-timezone-boundaries");
const { closeSqlite, db, initializeDatabase } = await import("../../../src/db/index.js");
const {
  buildBillingScopes,
  normalizeTimeEntries,
  summarizeProjectBillingRows,
  timeTrackingBillingService,
} = await import("../../../src/modules/time-tracking/time-tracking-billing.service.js");
const { dashboardEffortDateWindow } = await import("../../../src/modules/time-tracking/time-tracking-dashboard.service.js");

const TIMEZONE = "America/Los_Angeles";
try {
  await initializeDatabase();
  const invalidTimezoneSession = await readProtectedSession();
  invalidTimezoneSession.timezone = "Not/A_Timezone";
  const invalidTimezoneDashboard = await timeTrackingBillingService.readDashboardBillingSummary(invalidTimezoneSession);
  assert.ok(
    Array.isArray(invalidTimezoneDashboard.chartPoints),
    "an unsupported persisted session timezone must use the canonical fallback instead of crashing billing",
  );

  const settings = {
    billingPeriod: { type: "calendarMonth", startDay: 1 },
    billingRounding: { enabled: false, increment: "nearestQuarterHour" },
    defaultBillingRate: "100",
    workspaceName: "Timezone Boundary Workspace",
    workspaceType: "business",
  };
  const [scope] = buildBillingScopes({
    workspaceProjects: [],
    clients: [{
      billable: "yes",
      billing_rate: "100",
      id: "client-1",
      name: "Timezone Client",
      projects: [{
        billable: "yes",
        billing_period: { type: "calendarMonth", startDay: 1 },
        billing_rate: "100",
        id: "project-1",
        name: "Timezone Project",
        parent_project_id: "",
        status: "Active",
      }],
      status: "Active",
    }],
  }, settings);
  const entries = normalizeTimeEntries([
    entry("2026-02-01T07:59:59.999Z", 10),
    entry("2026-02-01T08:00:00.000Z", 20),
    entry("2026-03-01T07:59:59.999Z", 30),
    entry("2026-03-01T08:00:00.000Z", 40),
  ]);
  const summary = summarizeProjectBillingRows(settings, scope, scope.projects, entries, {
    period: "current",
  }, {
    timezone: TIMEZONE,
    today: new Date("2026-03-01T01:00:00.000Z"),
  });

  assert.equal(
    summary.totals.seconds,
    50,
    "the current billing month must follow the session-local February boundary rather than the server timezone",
  );

  const billingBoundaryCases = [
    {
      end: "2026-04-01T04:00:00.000Z",
      expectedHours: 743,
      label: "spring-forward current month",
      query: { period: "current" },
      start: "2026-03-01T05:00:00.000Z",
      today: new Date("2026-03-15T12:00:00.000Z"),
    },
    {
      end: "2026-04-01T04:00:00.000Z",
      expectedHours: 743,
      label: "spring-forward last month",
      query: { period: "last" },
      start: "2026-03-01T05:00:00.000Z",
      today: new Date("2026-04-15T12:00:00.000Z"),
    },
    {
      end: "2026-03-09T04:00:00.000Z",
      expectedHours: 23,
      label: "spring-forward custom day",
      query: { endDate: "2026-03-08", period: "custom", startDate: "2026-03-08" },
      start: "2026-03-08T05:00:00.000Z",
    },
    {
      end: "2026-12-01T05:00:00.000Z",
      expectedHours: 721,
      label: "fall-back current month",
      query: { period: "current" },
      start: "2026-11-01T04:00:00.000Z",
      today: new Date("2026-11-15T12:00:00.000Z"),
    },
    {
      end: "2026-12-01T05:00:00.000Z",
      expectedHours: 721,
      label: "fall-back last month",
      query: { period: "last" },
      start: "2026-11-01T04:00:00.000Z",
      today: new Date("2026-12-15T12:00:00.000Z"),
    },
    {
      end: "2026-11-02T05:00:00.000Z",
      expectedHours: 25,
      label: "fall-back custom day",
      query: { endDate: "2026-11-01", period: "custom", startDate: "2026-11-01" },
      start: "2026-11-01T04:00:00.000Z",
    },
  ];
  billingBoundaryCases.forEach((boundaryCase) => {
    assertBillingBoundaryCase(settings, scope, boundaryCase);
  });

  assert.deepEqual(
    dashboardEffortDateWindow(new Date("2026-03-01T00:30:00.000Z"), "UTC"),
    {
      today: "2026-03-01",
      todayStart: "2026-03-01T00:00:00.000Z",
      windowEnd: "2026-03-02T00:00:00.000Z",
      windowStart: "2026-02-23T00:00:00.000Z",
    },
    "the Dashboard UTC window must retain exact inclusive-start/exclusive-end dates",
  );
  assert.deepEqual(
    dashboardEffortDateWindow(new Date("2026-03-08T12:00:00.000Z"), "America/New_York"),
    {
      today: "2026-03-08",
      todayStart: "2026-03-08T05:00:00.000Z",
      windowEnd: "2026-03-09T04:00:00.000Z",
      windowStart: "2026-03-02T05:00:00.000Z",
    },
    "the Dashboard seven-day window must follow session-local midnight across the spring DST change",
  );

  const integrity = await db.get("PRAGMA integrity_check;");
  assert.equal(integrity?.integrity_check, "ok");

  console.log("Billing and Dashboard timezone boundary regression passed.");
} finally {
  await closeSqlite();
  await fixture.cleanup();
}

/** @param {string} endTime @param {number} durationSeconds */
function entry(endTime, durationSeconds) {
  return {
    billable: "yes",
    client_id: "client-1",
    duration_seconds: durationSeconds,
    end_time: endTime,
    project_id: "project-1",
  };
}

/**
 * @param {Record<string, unknown>} settings
 * @param {import("../../../src/types/time-tracking-contracts.js").BillingScope} scope
 * @param {{ label: string, start: string, end: string, today?: Date, query: Record<string, unknown>, expectedHours: number }} boundaryCase
 */
function assertBillingBoundaryCase(settings, scope, boundaryCase) {
  const start = new Date(boundaryCase.start);
  const end = new Date(boundaryCase.end);
  const entries = normalizeTimeEntries([
    entry(new Date(start.getTime() - 1).toISOString(), 10),
    entry(boundaryCase.start, 20),
    entry(new Date(end.getTime() - 1).toISOString(), 30),
    entry(boundaryCase.end, 40),
  ]);
  assert.equal(
    entries[1].endTime.toISOString(),
    boundaryCase.start,
    `${boundaryCase.label} must preserve the stored absolute instant`,
  );
  const summary = summarizeProjectBillingRows(settings, scope, scope.projects, entries, boundaryCase.query, {
    timezone: "America/New_York",
    ...(boundaryCase.today ? { today: boundaryCase.today } : {}),
  });
  assert.equal(
    (end.getTime() - start.getTime()) / 3_600_000,
    boundaryCase.expectedHours,
    `${boundaryCase.label} must span the expected UTC hours`,
  );
  assert.equal(
    summary.totals.seconds,
    50,
    `${boundaryCase.label} must include its start and exclude its end`,
  );
}

async function readProtectedSession() {
  const user = await db.get(`
SELECT users.user_id, users.username, users.timezone, users.home_workspace_id, users.active_workspace_id
FROM users
WHERE users.protected_user = 'yes'
ORDER BY users.user_id
LIMIT 1;
`);
  return workspaceSessionFixture({
    active_workspace_id: user?.active_workspace_id || user?.home_workspace_id,
    home_workspace_id: user?.home_workspace_id,
    ip_address: "127.0.0.1",
    timezone: user?.timezone || "America/New_York",
    user_id: user?.user_id,
    username: user?.username,
    workspace_id: user?.active_workspace_id || user?.home_workspace_id,
  });
}
