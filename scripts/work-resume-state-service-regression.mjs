import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-work-resume-state-service-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-work-resume-state-service.db");
process.env.SUPER_ADMIN_PASSWORD = "Work-Resume-State-Service-Test-Password-123!";

const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const {
  registerResumeStateReadResolver,
  resetResumeStateReadResolvers,
} = await import("../src/services/work-resume-state-read-checks.js");
const { workResumeStateService } = await import("../src/services/work-resume-state.service.js");

try {
  await initializeDatabase();
  const session = await readSeedSession();
  const resolverState = new Map();

  resetResumeStateReadResolvers();
  registerResumeStateReadResolver("tasks", "task", async ({ recordId }) => (
    resolverState.get(recordId) || { readable: true, status: "active" }
  ));

  await assertUpsertNormalizesAndGuardsWorkspace(session);
  await assertDismissalClearsAfterNewProducerUpdate(session);
  await assertReadGuardsHideUnsafeRows(session, resolverState);
  await assertRemoveForRecordDeletesAllUserRows(session);

  console.log("Work resume state service regression passed.");
} finally {
  resetResumeStateReadResolvers();
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertUpsertNormalizesAndGuardsWorkspace(session) {
  const taskId = `resume-task-${randomUUID()}`;
  const longTitle = "Storage".repeat(80);
  const saved = await workResumeStateService.upsertResumeState(session, {
    metadata: { source: "regression" },
    moduleId: "tasks",
    nextAction: "Call the client with the next step.",
    recordId: taskId,
    recordType: "task",
    resumeRankHint: 2500,
    title: longTitle,
  });

  assert.equal(saved.workspace_id, session.workspace_id);
  assert.equal(saved.user_id, session.user_id);
  assert.equal(saved.module_id, "tasks");
  assert.equal(saved.record_type, "task");
  assert.equal(saved.record_id, taskId);
  assert.equal(saved.title_snapshot.length, 240, "title snapshots should be length-limited");
  assert.equal(saved.resume_rank_hint, 1000, "rank hints should be bounded");
  assert.equal(saved.metadata_json, JSON.stringify({ source: "regression" }));

  await assert.rejects(
    () => workResumeStateService.upsertResumeState(session, {
      moduleId: "tasks",
      recordId: randomUUID(),
      recordType: "task",
      userId: randomUUID(),
    }),
    /current user workspace/,
  );

  await assert.rejects(
    () => workResumeStateService.upsertResumeState(session, {
      moduleId: "missing-module",
      recordId: randomUUID(),
      recordType: "thing",
    }),
    /module is not registered/,
  );
}

async function assertDismissalClearsAfterNewProducerUpdate(session) {
  const taskId = `dismissal-task-${randomUUID()}`;
  const firstWorkedAt = "2026-06-13T13:00:00.000Z";
  const saved = await workResumeStateService.upsertResumeState(session, {
    lastWorkedAt: firstWorkedAt,
    moduleId: "tasks",
    recordId: taskId,
    recordType: "task",
    title: "Dismissal candidate",
  });

  assert.equal((await workResumeStateService.listResumeState(session)).items.some((item) => item.record_id === taskId), true);

  await workResumeStateService.dismissResumeState(session, saved.resume_state_id);

  assert.equal((await workResumeStateService.listResumeState(session)).items.some((item) => item.record_id === taskId), false);

  await workResumeStateService.upsertResumeState(session, {
    lastWorkedAt: firstWorkedAt,
    moduleId: "tasks",
    recordId: taskId,
    recordType: "task",
    title: "Dismissal candidate unchanged",
  });

  assert.equal((await workResumeStateService.listResumeState(session)).items.some((item) => item.record_id === taskId), false);

  await workResumeStateService.upsertResumeState(session, {
    lastWorkedAt: "2026-06-13T14:00:00.000Z",
    moduleId: "tasks",
    recordId: taskId,
    recordType: "task",
    title: "Dismissal candidate refreshed",
  });

  const listed = await workResumeStateService.listResumeState(session);
  const refreshed = listed.items.find((item) => item.record_id === taskId);
  assert.ok(refreshed, "a newer producer update should make a dismissed row eligible again");
  assert.equal(refreshed.dismissed_at, "");
}

async function assertReadGuardsHideUnsafeRows(session, resolverState) {
  const deniedTaskId = `denied-task-${randomUUID()}`;
  const completedTaskId = `completed-task-${randomUUID()}`;
  const disabledTaskId = `disabled-task-${randomUUID()}`;

  resolverState.set(deniedTaskId, { readable: false });
  resolverState.set(completedTaskId, { readable: true, status: "completed" });
  resolverState.set(disabledTaskId, { readable: true, status: "active" });

  await workResumeStateService.upsertResumeState(session, {
    moduleId: "tasks",
    recordId: deniedTaskId,
    recordType: "task",
    title: "Hidden denied task",
  });
  await workResumeStateService.upsertResumeState(session, {
    moduleId: "tasks",
    recordId: completedTaskId,
    recordType: "task",
    statusSnapshot: "completed",
    title: "Historical completed task",
  });
  await workResumeStateService.upsertResumeState(session, {
    moduleId: "tasks",
    recordId: disabledTaskId,
    recordType: "task",
    title: "Disabled module task",
  });

  const leftOffBeforeDisable = await workResumeStateService.listResumeState(session, { mode: "left_off", limit: 100 });
  assert.equal(leftOffBeforeDisable.items.some((item) => item.record_id === deniedTaskId), false);
  assert.equal(leftOffBeforeDisable.items.some((item) => item.record_id === completedTaskId), false);

  const recentBeforeDisable = await workResumeStateService.listResumeState(session, { mode: "recent", limit: 100 });
  assert.equal(recentBeforeDisable.items.some((item) => item.record_id === completedTaskId), true);

  await runSql(`
UPDATE workspace_modules
SET status = 'disabled',
    disabled_at = '2026-06-13T15:00:00.000Z'
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND module_id = 'tasks';
`);

  const leftOffAfterDisable = await workResumeStateService.listResumeState(session, { mode: "left_off", limit: 100 });
  assert.equal(leftOffAfterDisable.items.some((item) => item.record_id === disabledTaskId), false);

  const recentAfterDisable = await workResumeStateService.listResumeState(session, { mode: "recent", limit: 100 });
  assert.equal(recentAfterDisable.items.some((item) => item.record_id === disabledTaskId), true);

  await runSql(`
UPDATE workspace_modules
SET status = 'enabled',
    disabled_at = NULL
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND module_id = 'tasks';
`);
}

async function assertRemoveForRecordDeletesAllUserRows(session) {
  const taskId = `cleanup-task-${randomUUID()}`;
  const otherUserId = randomUUID();
  const now = new Date().toISOString();

  await runSql(`
INSERT INTO users (user_id, home_workspace_id, username, display_name, password, protected_user, active_workspace_id)
VALUES (${sqlText(otherUserId)}, ${sqlText(session.workspace_id)}, ${sqlText(`${otherUserId}@example.test`)}, 'Other User', 'x', 'no', ${sqlText(session.workspace_id)});

INSERT INTO user_workspaces (user_workspace_id, user_id, workspace_id, status, created_at, updated_at)
VALUES (${sqlText(randomUUID())}, ${sqlText(otherUserId)}, ${sqlText(session.workspace_id)}, 'active', ${sqlText(now)}, ${sqlText(now)});
`);

  await workResumeStateService.upsertResumeState(session, {
    moduleId: "tasks",
    recordId: taskId,
    recordType: "task",
    title: "Cleanup row",
  });

  await runSql(`
INSERT INTO work_resume_state (
  resume_state_id,
  workspace_id,
  user_id,
  module_id,
  record_type,
  record_id,
  title_snapshot,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(randomUUID())},
  ${sqlText(session.workspace_id)},
  ${sqlText(otherUserId)},
  'tasks',
  'task',
  ${sqlText(taskId)},
  'Other user cleanup row',
  ${sqlText(now)},
  ${sqlText(now)}
);
`);

  await workResumeStateService.removeResumeStateForRecord(session.workspace_id, "tasks", "task", taskId);

  const rows = await querySql(`
SELECT resume_state_id
FROM work_resume_state
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND module_id = 'tasks'
  AND record_type = 'task'
  AND record_id = ${sqlText(taskId)};
`);

  assert.deepEqual(rows, []);
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
