export const regressionMeta = Object.freeze({
  id: "time-tracking.billing-dashboard-timezone-boundaries",
  area: "time-tracking",
  tier: "integration",
  tags: ["billing", "dashboard", "database", "time-tracking", "timezone"],
  description: "Proves billing periods and Dashboard effort windows use session-local calendar boundaries converted to UTC across month and DST edges.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";
import { createDisposableDatabaseFixture } from "../../test-support/disposable-database.mjs";

const fixture = await createDisposableDatabaseFixture("billing-dashboard-timezone-boundaries");
const { closeSqlite, db, initializeDatabase } = await import("../../../src/db/index.js");
const {
  buildBillingScopes,
  normalizeTimeEntries,
  summarizeProjectBillingRows,
} = await import("../../../src/modules/time-tracking/time-tracking-billing.service.js");
const { dashboardEffortDateWindow } = await import("../../../src/modules/time-tracking/time-tracking-dashboard.service.js");

const TIMEZONE = "America/Los_Angeles";
try {
  await initializeDatabase();
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

  const dstSummary = summarizeProjectBillingRows(settings, scope, scope.projects, normalizeTimeEntries([
    entry("2026-03-08T04:59:59.999Z", 10),
    entry("2026-03-08T05:00:00.000Z", 20),
    entry("2026-03-09T03:59:59.999Z", 30),
    entry("2026-03-09T04:00:00.000Z", 40),
  ]), {
    endDate: "2026-03-08",
    period: "custom",
    startDate: "2026-03-08",
  }, {
    timezone: "America/New_York",
  });
  assert.equal(
    dstSummary.totals.seconds,
    50,
    "a custom billing day must use local midnights even when the DST transition makes it 23 hours long",
  );

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

function entry(endTime, durationSeconds) {
  return {
    billable: "yes",
    client_id: "client-1",
    duration_seconds: durationSeconds,
    end_time: endTime,
    project_id: "project-1",
  };
}
