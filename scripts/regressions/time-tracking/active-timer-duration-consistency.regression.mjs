export const regressionMeta = Object.freeze({
  id: "time-tracking.active-timer-duration-consistency",
  area: "time-tracking",
  tier: "integration",
  tags: ["database", "time-tracking", "timers"],
  description: "Proves active-timer finalization persists one authoritative seconds value with a matching hours projection, including the missing-timer fallback.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";
import { createDisposableDatabaseFixture } from "../../test-support/disposable-database.mjs";

const fixture = await createDisposableDatabaseFixture("active-timer-duration-consistency");
const { closeSqlite, db, initializeDatabase } = await import("../../../src/db/index.js");
const { createRecordId } = await import("../../../src/core/identifiers.js");
const { activeTimersService, timeEntriesRepository } = await import("../../../src/modules/time-tracking/index.js");

try {
  await initializeDatabase();
  const session = await readProtectedSession();
  const projectId = await createProject(session.workspace_id);

  const fallback = await activeTimersService.finalize("missing-slot", {
    duration_hours: "2.5000",
    end_time: "2026-08-10T14:15:00.000Z",
    project_id: projectId,
    start_time: "2026-08-10T11:45:00.000Z",
  }, session);
  const fallbackEntry = await timeEntriesRepository.readById(session.workspace_id, fallback.entry_id);
  assert.ok(fallbackEntry, "missing-timer finalization must still persist its compatibility entry");
  assert.equal(fallbackEntry.duration_seconds, "1", "missing seconds must retain the existing one-second clamp");
  assert.equal(
    fallbackEntry.duration_hours,
    "0.0003",
    "missing-timer finalization must derive hours from the clamped authoritative seconds",
  );
  assert.equal(
    Number(fallbackEntry.duration_seconds),
    Math.round(Number(fallbackEntry.duration_hours) * 3600),
    "fallback duration projections must remain numerically consistent",
  );

  const paused = await activeTimersService.save("1", {
    accumulated_elapsed_seconds: 90,
    billable: "yes",
    description: "Paused authoritative timer",
    project_id: projectId,
    timer_status: "paused",
  }, session);
  assert.equal(paused.timer.accumulated_elapsed_seconds, 90);
  const finalized = await activeTimersService.finalize("1", {
    duration_hours: "9.9999",
    duration_seconds: 7,
  }, session);
  const finalizedEntry = await timeEntriesRepository.readById(session.workspace_id, finalized.entry_id);
  assert.ok(finalizedEntry, "stored-timer finalization must persist a time entry");
  assert.equal(finalizedEntry.duration_seconds, "90", "stored active seconds must remain authoritative");
  assert.equal(finalizedEntry.duration_hours, "0.0250", "stored active seconds must derive the matching hours projection");
  assert.equal(
    await db.get(`
SELECT active_timer_id
FROM active_work_timers
WHERE workspace_id = :workspaceId
  AND user_id = :userId
  AND timer_slot = '1'
LIMIT 1;
`, {
      userId: session.user_id,
      workspaceId: session.workspace_id,
    }),
    null,
    "finalization must still remove the active timer row",
  );

  const integrity = await db.get("PRAGMA integrity_check;");
  assert.equal(integrity?.integrity_check, "ok");

  console.log("Active timer duration consistency regression passed.");
} finally {
  await closeSqlite();
  await fixture.cleanup();
}

async function createProject(workspaceId) {
  const now = new Date().toISOString();
  const projectId = createRecordId();
  await db.run(`
INSERT INTO projects (
  id,
  workspace_id,
  client_id,
  parent_project_id,
  name,
  status,
  billable,
  billing_rate,
  billing_period_type,
  billing_period_start_day,
  billing_rounding_enabled,
  billing_rounding_increment,
  task_default_priority,
  task_default_status,
  task_default_sort_order_json,
  task_default_assignee_mode,
  created_at,
  updated_at
)
VALUES (
  :projectId,
  :workspaceId,
  NULL,
  NULL,
  'Active Timer Duration Project',
  'Active',
  'yes',
  '100',
  NULL,
  NULL,
  NULL,
  NULL,
  'normal',
  'open',
  '["due_date","priority","status"]',
  'creator',
  :createdAt,
  :updatedAt
);
`, {
    createdAt: now,
    projectId,
    updatedAt: now,
    workspaceId,
  });
  return projectId;
}

async function readProtectedSession() {
  const user = await db.get(`
SELECT users.user_id, users.username, users.timezone, users.home_workspace_id, users.active_workspace_id
FROM users
WHERE users.protected_user = 'yes'
ORDER BY users.user_id
LIMIT 1;
`);
  assert.ok(user?.user_id, "protected user fixture is required");
  return {
    active_workspace_id: user.active_workspace_id || user.home_workspace_id,
    home_workspace_id: user.home_workspace_id,
    ip: "127.0.0.1",
    timezone: user.timezone || "America/New_York",
    user_id: user.user_id,
    username: user.username,
    workspace_id: user.active_workspace_id || user.home_workspace_id,
  };
}
