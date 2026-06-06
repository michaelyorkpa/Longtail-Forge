import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-tag-service-regression-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-tags-test.db");
process.env.SUPER_ADMIN_PASSWORD = "Tag-Service-Test-Password-123!";

const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { tagsService } = await import("../src/services/tags.service.js");

try {
  await initializeDatabase();

  const session = await readProtectedSession();
  await enableAuditLogging(session.workspace_id);
  const target = await createTaskTarget(session);

  const created = await tagsService.create(session, {
    color: "#2f6fed",
    description: "Billable client work",
    name: "Client Work",
  });
  assert.equal(created.tag.slug, "client-work");

  const updated = await tagsService.update(session, created.tag.tag_id, {
    color: "#2563eb",
    description: "Client-facing billable work",
    name: "Client Facing",
    slug: "client-facing",
  });
  assert.equal(updated.tag.name, "Client Facing");
  assert.equal(updated.tag.slug, "client-facing");

  const archived = await tagsService.archive(session, created.tag.tag_id);
  assert.equal(archived.tag.status, "archived");
  await assertRejectsWithMessage(() => tagsService.assign(session, {
    tagId: created.tag.tag_id,
    targetId: target.taskId,
    targetType: "task",
  }), "Only active tags can be assigned.");

  const restored = await tagsService.restore(session, created.tag.tag_id);
  assert.equal(restored.tag.status, "active");

  const second = await tagsService.create(session, {
    color: "#059669",
    name: "Research",
  });

  const listed = await tagsService.list(session, { search: "client" });
  assert.deepEqual(listed.tags.map((tag) => tag.tag_id), [created.tag.tag_id]);

  const replaced = await tagsService.replaceAssignments(session, {
    tagIds: [created.tag.tag_id, second.tag.tag_id],
    targetId: target.taskId,
    targetType: "task",
  });
  assert.deepEqual(replaced.assignments.map((assignment) => assignment.tag.slug).sort(), ["client-facing", "research"]);

  const removed = await tagsService.remove(session, {
    tagId: second.tag.tag_id,
    targetId: target.taskId,
    targetType: "task",
  });
  assert.deepEqual(removed.assignments.map((assignment) => assignment.tag.slug), ["client-facing"]);

  const assignments = await tagsService.listAssignments(session, {
    targetId: target.taskId,
    targetType: "task",
  });
  assert.equal(assignments.target.label, "Tagged Regression Task");
  assert.deepEqual(assignments.assignments.map((assignment) => assignment.tag_id), [created.tag.tag_id]);

  await runSql(`
UPDATE workspace_modules
SET status = 'disabled'
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND module_id = 'tasks';
`);
  await assertRejectsWithMessage(() => tagsService.assign(session, {
    tagId: second.tag.tag_id,
    targetId: target.taskId,
    targetType: "task",
  }), "That module is disabled for new tag assignments.");

  await assertAuditRows(session.workspace_id);
  await assertIntegrity();

  console.log("Tag service regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function readProtectedSession() {
  const rows = await querySql(`
SELECT user_id, username, home_workspace_id, active_workspace_id
FROM users
WHERE protected_user = 'yes'
ORDER BY username
LIMIT 1;
`);
  const user = rows[0];

  assert.ok(user, "protected user should exist");

  return {
    active_workspace_id: user.active_workspace_id || user.home_workspace_id,
    home_workspace_id: user.home_workspace_id,
    timezone: "America/New_York",
    user_id: user.user_id,
    username: user.username,
    workspace_id: user.active_workspace_id || user.home_workspace_id,
  };
}

async function enableAuditLogging(workspaceId) {
  await runSql(`
UPDATE workspace_settings
SET audit_logging_enabled = 1,
    audit_retention_days = 90
WHERE workspace_id = ${sqlText(workspaceId)};
`);
}

async function createTaskTarget(session) {
  const taskId = randomUUID();
  const now = new Date().toISOString();

  await runSql(`
INSERT INTO tasks (
  task_id,
  workspace_id,
  client_id,
  project_id,
  title,
  description,
  status,
  priority,
  created_by_user_id,
  updated_by_user_id,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(taskId)},
  ${sqlText(session.workspace_id)},
  NULL,
  NULL,
  'Tagged Regression Task',
  '',
  'open',
  'normal',
  ${sqlText(session.user_id)},
  ${sqlText(session.user_id)},
  ${sqlText(now)},
  ${sqlText(now)}
);
`);

  return { taskId };
}

async function assertRejectsWithMessage(callback, message) {
  await assert.rejects(callback, (error) => {
    assert.equal(error.message, message);
    return true;
  });
}

async function assertAuditRows(workspaceId) {
  const rows = await querySql(`
SELECT action, record_type
FROM audit_logs
WHERE workspace_id = ${sqlText(workspaceId)}
  AND action IN (
    'tag.created',
    'tag.updated',
    'tag.archived',
    'tag.restored',
    'tag.assigned',
    'tag.removed',
    'tag.assignments_replaced'
  )
ORDER BY created_at, action;
`);
  const actions = new Set(rows.map((row) => row.action));

  for (const action of [
    "tag.created",
    "tag.updated",
    "tag.archived",
    "tag.restored",
    "tag.assigned",
    "tag.removed",
    "tag.assignments_replaced",
  ]) {
    assert.ok(actions.has(action), `audit action ${action} should be recorded`);
  }

  assert.ok(rows.some((row) => row.record_type === "tag"));
  assert.ok(rows.some((row) => row.record_type === "tag_assignment"));
}

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.equal(rows[0]?.integrity_check, "ok");
}
