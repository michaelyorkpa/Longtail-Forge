import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-work-resume-state-producer-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-work-resume-state-producer.db");
process.env.SUPER_ADMIN_PASSWORD = "Work-Resume-State-Producer-Test-Password-123!";

const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { modulesService } = await import("../src/core/modules/modules.service.js");
const {
  registerResumeStateReadResolver,
  resetResumeStateReadResolvers,
} = await import("../src/services/work-resume-state-read-checks.js");
const { workResumeStateService } = await import("../src/services/work-resume-state.service.js");
const {
  registerResumeStateProducer,
  registerResumeStateProducerEventHandlers,
  resetResumeStateProducersForTests,
} = await import("../src/services/work-resume-state-producers.js");

try {
  await initializeDatabase();
  const session = await readSeedSession();

  resetResumeStateReadResolvers();
  resetResumeStateProducersForTests();
  registerResumeStateReadResolver("tasks", "task", async () => ({ readable: true, status: "active" }));

  await assertEventSubscriptionWritesCurrentUserResumeState(session);
  await assertDisabledModuleProducerNoops(session);
  await assertProducerCanRemoveRows(session);

  console.log("Work resume state producer regression passed.");
} finally {
  resetResumeStateReadResolvers();
  resetResumeStateProducersForTests();
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}
async function assertEventSubscriptionWritesCurrentUserResumeState(session) {
  const taskId = `event-task-${randomUUID()}`;

  registerResumeStateProducer({
    buildPayload: ({ event, summary }) => ({
      lastWorkedAt: event.emitted_at,
      metadata: {
        body_markdown: "Unsafe body text",
        safe_context: "visible",
      },
      nextAction: "Review the event-generated next step.",
      recordId: event.record_id,
      title: summary.recordLabel,
    }),
    events: ["task.updated"],
    id: "test.task-updated",
    moduleId: "tasks",
    recordType: "task",
  });
  registerResumeStateProducerEventHandlers();

  await modulesService.emitInternalEvent("task.updated", {
    metadata: {
      record_url: `tasks.html?task=${encodeURIComponent(taskId)}`,
    },
    moduleId: "tasks",
    newValue: {
      status: "open",
      title: "Event Resume Task",
    },
    previousValue: {
      status: "blocked",
      title: "Event Resume Task",
    },
    recordId: taskId,
    recordType: "task",
    session,
  });

  const listed = await workResumeStateService.listResumeState(session, { limit: 100 });
  const item = listed.items.find((candidate) => candidate.record_id === taskId);

  assert.ok(item, "registered producer should upsert resume state from a safe event");
  assert.equal(item.module_id, "tasks");
  assert.equal(item.record_type, "task");
  assert.equal(item.title_snapshot, "Event Resume Task");
  assert.equal(item.next_action, "Review the event-generated next step.");
  assert.equal(item.source_url, `tasks.html?task=${encodeURIComponent(taskId)}`);
  assert.equal(item.metadata.safe_context, "visible");
  assert.equal(item.metadata.body_markdown, undefined);
  const changedContext = /** @type {Record<string, unknown>} */ (item.metadata.changed_context);
  assert.equal(changedContext.label, "Status updated");
}

async function assertDisabledModuleProducerNoops(session) {
  const taskId = `disabled-producer-task-${randomUUID()}`;

  await runSql(`
UPDATE workspace_modules
SET status = 'disabled',
    disabled_at = '2026-06-13T16:00:00.000Z'
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND module_id = 'tasks';
`);

  await modulesService.emitInternalEvent("task.updated", {
    moduleId: "tasks",
    newValue: { title: "Disabled Producer Task" },
    recordId: taskId,
    recordType: "task",
    session,
  });

  const rows = await querySql(`
SELECT resume_state_id
FROM work_resume_state
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND record_id = ${sqlText(taskId)};
`);

  assert.deepEqual(rows, [], "producer should no-op while the source module is disabled");

  await runSql(`
UPDATE workspace_modules
SET status = 'enabled',
    disabled_at = NULL
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND module_id = 'tasks';
`);
}

async function assertProducerCanRemoveRows(session) {
  const taskId = `remove-producer-task-${randomUUID()}`;

  await workResumeStateService.upsertResumeState(session, {
    moduleId: "tasks",
    recordId: taskId,
    recordType: "task",
    title: "Remove producer task",
  });

  resetResumeStateProducersForTests();
  registerResumeStateReadResolver("tasks", "task", async () => ({ readable: true, status: "active" }));
  registerResumeStateProducer({
    buildPayload: ({ event }) => ({
      action: "remove",
      recordId: event.record_id,
    }),
    events: ["task.deleted"],
    id: "test.task-deleted",
    moduleId: "tasks",
    recordType: "task",
  });
  registerResumeStateProducerEventHandlers();

  await modulesService.emitInternalEvent("task.deleted", {
    moduleId: "tasks",
    recordId: taskId,
    recordType: "task",
    session,
  });

  const rows = await querySql(`
SELECT resume_state_id
FROM work_resume_state
WHERE workspace_id = ${sqlText(session.workspace_id)}
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
