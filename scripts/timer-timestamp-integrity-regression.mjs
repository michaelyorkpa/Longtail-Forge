import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-timer-timestamp-integrity-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-timer-timestamp-integrity.db");
process.env.SUPER_ADMIN_PASSWORD = "Timer-Timestamp-Test-Password-123!";

const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { activeTimersService } = await import("../src/modules/time-tracking/active-timers.service.js");
const { reportingService } = await import("../src/services/reporting.service.js");

try {
  await initializeDatabase();
  const session = await readSeedSession();
  const { clientId, projectId } = await createClientProject(session.workspace_id);

  await assertPausedTimerFinalizesWithFactTimestamps(session, clientId, projectId);
  await assertRunningTimerAddsCurrentActiveSegment(session, projectId);

  console.log("Timer timestamp integrity regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertPausedTimerFinalizesWithFactTimestamps(session, clientId, projectId) {
  const timerStartedAt = "2026-06-12T10:00:00.000Z";
  const falsifiedEnd = "2026-06-12T10:02:00.000Z";
  const falsifiedStart = "2026-06-12T10:01:00.000Z";

  await activeTimersService.save("1", {
    accumulated_elapsed_seconds: 120,
    billable: "yes",
    description: "Paused timestamp integrity",
    project_id: projectId,
    timer_status: "paused",
  }, session);
  await setTimerFacts(session.workspace_id, session.user_id, "1", {
    accumulatedSeconds: 120,
    createdAt: timerStartedAt,
    lastActiveStartTime: null,
    status: "paused",
  });

  const result = await activeTimersService.finalize("1", {
    duration_seconds: 60,
    end_time: falsifiedEnd,
    project_id: projectId,
    start_time: falsifiedStart,
  }, session);
  const entry = await readTimeEntry(session.workspace_id, result.entry_id);

  assert.equal(entry.start_time, timerStartedAt);
  assert.equal(Number(entry.duration_seconds), 120);
  assert.notEqual(entry.end_time, falsifiedEnd);
  assert.notEqual(entry.start_time, new Date(new Date(entry.end_time).getTime() - Number(entry.duration_seconds) * 1000).toISOString());

  const report = await reportingService.readProjectSummary(session, {
    projectIds: projectId,
    scopeId: clientId,
  });
  const row = report.rows.find((item) => item.project.id === projectId);

  assert.equal(row?.rawSeconds, 120);
}

async function assertRunningTimerAddsCurrentActiveSegment(session, projectId) {
  const timerStartedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const lastActiveStartTime = new Date(Date.now() - 30 * 1000).toISOString();

  await activeTimersService.save("2", {
    accumulated_elapsed_seconds: 120,
    billable: "yes",
    description: "Running timestamp integrity",
    last_active_start_time: lastActiveStartTime,
    project_id: projectId,
    timer_status: "running",
  }, session);
  await setTimerFacts(session.workspace_id, session.user_id, "2", {
    accumulatedSeconds: 120,
    createdAt: timerStartedAt,
    lastActiveStartTime,
    status: "running",
  });

  const result = await activeTimersService.finalize("2", {
    duration_seconds: 120,
    end_time: "2026-06-12T10:02:00.000Z",
    project_id: projectId,
    start_time: "2026-06-12T10:00:00.000Z",
  }, session);
  const entry = await readTimeEntry(session.workspace_id, result.entry_id);

  assert.equal(entry.start_time, timerStartedAt);
  assert.ok(Number(entry.duration_seconds) >= 149, "running timer should include the current active segment");
  assert.ok(Number(entry.duration_seconds) <= 155, "running timer active segment should not include paused wall-clock time");
}

async function setTimerFacts(workspaceId, userId, timerSlot, facts) {
  await runSql(`
UPDATE active_work_timers
SET
  accumulated_elapsed_seconds = ${Number(facts.accumulatedSeconds) || 0},
  created_at = ${sqlText(facts.createdAt)},
  last_active_start_time = ${facts.lastActiveStartTime ? sqlText(facts.lastActiveStartTime) : "NULL"},
  timer_status = ${sqlText(facts.status)}
WHERE workspace_id = ${sqlText(workspaceId)}
  AND user_id = ${sqlText(userId)}
  AND timer_slot = ${sqlText(timerSlot)};
`);
}

async function readTimeEntry(workspaceId, entryId) {
  const rows = await querySql(`
SELECT entry_id, start_time, end_time, duration_seconds
FROM time_entries
WHERE workspace_id = ${sqlText(workspaceId)}
  AND entry_id = ${sqlText(entryId)}
LIMIT 1;
`);

  assert.ok(rows[0], "finalized time entry should exist");
  return rows[0];
}

async function createClientProject(workspaceId) {
  const now = new Date().toISOString();
  const clientId = randomUUID();
  const projectId = randomUUID();

  await runSql(`
INSERT INTO clients (
  id,
  workspace_id,
  parent_client_id,
  name,
  status,
  billable,
  billing_rate,
  billing_period_type,
  billing_period_start_day,
  billing_rounding_enabled,
  billing_rounding_increment,
  billing_contact_name,
  billing_contact_email,
  billing_contact_alternate_name,
  billing_contact_alternate_email,
  billing_contact_phone_number,
  billing_contact_alternate_phone_number,
  billing_contact_street_address_1,
  billing_contact_street_address_2,
  billing_contact_city,
  billing_contact_state,
  billing_contact_zip_code,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(clientId)},
  ${sqlText(workspaceId)},
  NULL,
  'Timer Timestamp Client',
  'Active',
  'yes',
  '100',
  NULL,
  NULL,
  NULL,
  NULL,
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  ${sqlText(now)},
  ${sqlText(now)}
);

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
  created_at,
  updated_at
)
VALUES (
  ${sqlText(projectId)},
  ${sqlText(workspaceId)},
  ${sqlText(clientId)},
  NULL,
  'Timer Timestamp Project',
  'Active',
  'yes',
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  'normal',
  'open',
  '["due_date","priority","status"]',
  ${sqlText(now)},
  ${sqlText(now)}
);
`);

  return { clientId, projectId };
}

async function readSeedSession() {
  const rows = await querySql(`
SELECT users.user_id, users.username, users.timezone, users.home_workspace_id, users.active_workspace_id
FROM users
WHERE users.protected_user = 'yes'
LIMIT 1;
`);
  const user = rows[0];

  assert.ok(user, "fresh database should seed a protected super admin");

  return {
    home_workspace_id: user.home_workspace_id,
    ip: "127.0.0.1",
    timezone: user.timezone || "America/New_York",
    user_id: user.user_id,
    username: user.username,
    workspace_id: user.active_workspace_id || user.home_workspace_id,
  };
}
