import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-work-resume-state-closeout-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-work-resume-state-closeout.db");
process.env.SUPER_ADMIN_PASSWORD = "Work-Resume-State-Closeout-Test-Password-123!";

const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { modulesService } = await import("../src/core/modules/modules.service.js");
const { workspacesRepository } = await import("../src/repositories/workspaces.repo.js");
const { activeTimersRepository } = await import("../src/modules/time-tracking/active-timers.repo.js");
const { listsService } = await import("../src/modules/lists/lists.service.js");
const { notesService } = await import("../src/modules/notes/notes.service.js");
const { tasksService } = await import("../src/modules/tasks/tasks.service.js");
const { workResumeStateService } = await import("../src/services/work-resume-state.service.js");
const {
  registerResumeStateReadResolver,
  resetResumeStateReadResolvers,
} = await import("../src/services/work-resume-state-read-checks.js");
const {
  resetResumeStateProducersForTests,
} = await import("../src/services/work-resume-state-producers.js");
const {
  registerInitialResumeStateProducerEventHandlers,
  resetInitialResumeStateProducersForTests,
} = await import("../src/services/work-resume-state-initial-producers.js");

try {
  await initializeDatabase();
  const session = await readSeedSession();
  const resolverState = new Map();

  resetResumeStateReadResolvers();
  resetResumeStateProducersForTests();
  resetInitialResumeStateProducersForTests();
  registerInitialResumeStateProducerEventHandlers();
  registerResumeStateReadResolver("tasks", "task", async ({ recordId }) => (
    resolverState.get(recordId) || { readable: true, status: "active" }
  ));

  await assertWorkspaceBoundary(session);
  await assertReadAndLifecycleGuards(session, resolverState);
  await assertPrivateAndSecureNotesDoNotLeak(session);
  await assertListProducerDoesNotGrantLinkedTargetLabels(session);
  await assertInitialProducersWriteDeterministicRows(session);
  await assertDismissalRefreshBoundary(session);

  console.log("Work resume state closeout regression passed.");
} finally {
  resetResumeStateReadResolvers();
  resetResumeStateProducersForTests();
  resetInitialResumeStateProducersForTests();
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertWorkspaceBoundary(session) {
  const otherWorkspace = await workspacesRepository.createWorkspace({
    ownerUser: {
      user_id: session.user_id,
    },
    workspaceName: "Other Resume Workspace",
    workspaceType: "business",
  });
  const otherWorkspaceRecordId = `other-workspace-row-${randomUUID()}`;
  const now = new Date().toISOString();

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
  ${sqlText(otherWorkspace.workspaceId)},
  ${sqlText(session.user_id)},
  'tasks',
  'task',
  ${sqlText(otherWorkspaceRecordId)},
  'Other workspace resume row',
  ${sqlText(now)},
  ${sqlText(now)}
);
`);

  const listed = await workResumeStateService.listResumeState(session, { mode: "recent", limit: 100 });
  assert.equal(listed.items.some((item) => item.record_id === otherWorkspaceRecordId), false);
}

async function assertReadAndLifecycleGuards(session, resolverState) {
  const activeId = `closeout-active-${randomUUID()}`;
  const deniedId = `closeout-denied-${randomUUID()}`;
  const deletedId = `closeout-deleted-${randomUUID()}`;
  const completedId = `closeout-completed-${randomUUID()}`;
  const archivedId = `closeout-archived-${randomUUID()}`;
  const finalizedId = `closeout-finalized-${randomUUID()}`;
  const disabledId = `closeout-disabled-${randomUUID()}`;

  resolverState.set(activeId, { readable: true, status: "active" });
  resolverState.set(deniedId, { readable: false });
  resolverState.set(deletedId, { deleted: true, readable: true, status: "deleted" });
  resolverState.set(completedId, { completed: true, readable: true, status: "completed" });
  resolverState.set(archivedId, { archived: true, readable: true, status: "archived" });
  resolverState.set(finalizedId, { finalized: true, readable: true, status: "finalized" });
  resolverState.set(disabledId, { readable: true, status: "active" });

  for (const recordId of [activeId, deniedId, deletedId, completedId, archivedId, finalizedId, disabledId]) {
    await workResumeStateService.upsertResumeState(session, {
      lastActionType: "task.updated",
      moduleId: "tasks",
      recordId,
      recordType: "task",
      statusSnapshot: resolverState.get(recordId).status || "active",
      title: `Closeout ${recordId}`,
    });
  }

  let leftOff = await workResumeStateService.listResumeState(session, { mode: "left_off", limit: 100 });
  assert.equal(leftOff.items.some((item) => item.record_id === activeId), true);
  assert.equal(leftOff.items.some((item) => item.record_id === deniedId), false);
  assert.equal(leftOff.items.some((item) => item.record_id === deletedId), false);
  assert.equal(leftOff.items.some((item) => item.record_id === completedId), false);
  assert.equal(leftOff.items.some((item) => item.record_id === archivedId), false);
  assert.equal(leftOff.items.some((item) => item.record_id === finalizedId), false);

  await runSql(`
UPDATE workspace_modules
SET status = 'disabled',
    disabled_at = '2026-06-13T20:00:00.000Z'
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND module_id = 'tasks';
`);

  leftOff = await workResumeStateService.listResumeState(session, { mode: "left_off", limit: 100 });
  assert.equal(leftOff.items.some((item) => item.record_id === disabledId), false);

  await runSql(`
UPDATE workspace_modules
SET status = 'enabled',
    disabled_at = NULL
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND module_id = 'tasks';
`);
}

async function assertPrivateAndSecureNotesDoNotLeak(session) {
  const privateNoteId = `private-closeout-note-${randomUUID()}`;
  const secureNoteId = `secure-closeout-note-${randomUUID()}`;
  const activeNoteId = `active-closeout-note-${randomUUID()}`;

  await modulesService.emitInternalEvent("note.created", noteEvent(session, {
    body_excerpt: "private body excerpt must not leak",
    note_id: privateNoteId,
    security_mode: "normal",
    title: "Private closeout note title",
    visibility: "private",
  }));
  await modulesService.emitInternalEvent("note.created", noteEvent(session, {
    body_excerpt: "secure body excerpt must not leak",
    encryption_auth_tag: "unsafe auth tag",
    encryption_nonce: "unsafe nonce",
    note_id: secureNoteId,
    security_mode: "secure",
    secure_payload: "encrypted blob",
    title: "Secure closeout note title",
    visibility: "internal",
  }));
  await notesService.create({
    body_markdown: "Active note body text must not become resume metadata.",
    library_bucket: "active_work",
    note_id: activeNoteId,
    title: "Active closeout note",
    visibility: "internal",
  }, session);

  assert.equal(await rawResumeRowCount(session, privateNoteId), 0);
  assert.equal(await rawResumeRowCount(session, secureNoteId), 0);

  const activeRows = await querySql(`
SELECT title_snapshot, metadata_json
FROM work_resume_state
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND record_id = ${sqlText(activeNoteId)};
`);
  assert.equal(activeRows.length, 1);
  assert.equal(activeRows[0].title_snapshot, "Active closeout note");
  assert.equal(activeRows[0].metadata_json.includes("body"), false);
  assert.equal(activeRows[0].metadata_json.includes("secure"), false);
  assert.equal(activeRows[0].metadata_json.includes("encrypt"), false);
}

async function assertListProducerDoesNotGrantLinkedTargetLabels(session) {
  const listId = `closeout-list-${randomUUID()}`;
  await listsService.create({
    list_id: listId,
    list_type: "shopping",
    title: "Closeout resume list",
  }, session);

  await modulesService.emitInternalEvent("lists.link.created", {
    metadata: {
      list_id: listId,
      source_url: `lists.html?list=${encodeURIComponent(listId)}`,
      target_id: `hidden-target-${randomUUID()}`,
      target_label: "Hidden linked task title",
      target_title: "Hidden linked note title",
      target_type: "task",
      title: "Closeout resume list",
    },
    moduleId: "lists",
    recordId: `closeout-list-link-${randomUUID()}`,
    recordType: "list_link",
    session,
  });

  const rows = await querySql(`
SELECT metadata_json
FROM work_resume_state
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND record_id = ${sqlText(listId)}
LIMIT 1;
`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].metadata_json.includes("Hidden linked"), false);
  assert.equal(rows[0].metadata_json.includes("target_label"), false);
}

async function assertInitialProducersWriteDeterministicRows(session) {
  const taskId = `deterministic-task-${randomUUID()}`;
  const timerId = `deterministic-timer-${randomUUID()}`;

  await tasksService.create({
    next_action: "Confirm deterministic producer state.",
    task_id: taskId,
    title: "Deterministic producer task",
  }, session);
  await activeTimersRepository.upsert({
    active_timer_id: timerId,
    accumulated_elapsed_seconds: 15,
    client_id: "",
    description: "Deterministic manual timer",
    last_active_start_time: "2026-06-13T20:30:00.000Z",
    project_id: "",
    timer_slot: "8",
    timer_status: "running",
    user_id: session.user_id,
    workspace_id: session.workspace_id,
  });
  await modulesService.emitInternalEvent("timer.started", {
    metadata: {
      active_timer_id: timerId,
      accumulated_elapsed_seconds: 15,
      source_type: "manual",
      timer_slot: "8",
      timer_status: "running",
    },
    moduleId: "time-tracking",
    recordId: timerId,
    recordType: "active_work_timer",
    session,
  });

  const listed = await workResumeStateService.listResumeState(session, { mode: "recent", limit: 100 });
  const task = listed.items.find((item) => item.record_id === taskId);
  const timer = listed.items.find((item) => item.record_id === timerId);

  assert.equal(task?.module_id, "tasks");
  assert.equal(task?.record_type, "task");
  assert.equal(task?.next_action, "Confirm deterministic producer state.");
  assert.equal(timer?.module_id, "time-tracking");
  assert.equal(timer?.record_type, "active_work_timer");
  assert.equal(timer?.status_snapshot, "active");
}

async function assertDismissalRefreshBoundary(session) {
  const recordId = `closeout-dismiss-${randomUUID()}`;
  const saved = await workResumeStateService.upsertResumeState(session, {
    lastWorkedAt: "2026-06-13T21:00:00.000Z",
    moduleId: "tasks",
    recordId,
    recordType: "task",
    title: "Dismiss closeout task",
  });

  await workResumeStateService.dismissResumeState(session, saved.resume_state_id);
  assert.equal((await workResumeStateService.listResumeState(session, { mode: "left_off", limit: 100 }))
    .items.some((item) => item.record_id === recordId), false);

  await workResumeStateService.upsertResumeState(session, {
    lastWorkedAt: "2026-06-13T21:05:00.000Z",
    moduleId: "tasks",
    recordId,
    recordType: "task",
    title: "Dismiss closeout task refreshed",
  });

  assert.equal((await workResumeStateService.listResumeState(session, { mode: "left_off", limit: 100 }))
    .items.some((item) => item.record_id === recordId), true);
}

function noteEvent(session, metadata) {
  return {
    metadata: {
      library_bucket: "active_work",
      status: "active",
      ...metadata,
    },
    moduleId: "notes",
    recordId: metadata.note_id,
    recordType: "note",
    session,
  };
}

async function rawResumeRowCount(session, recordId) {
  const rows = await querySql(`
SELECT COUNT(*) AS count
FROM work_resume_state
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND record_id = ${sqlText(recordId)};
`);

  return Number(rows[0]?.count) || 0;
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
