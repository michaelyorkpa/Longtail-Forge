import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-task-relationships-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-task-relationships.db");
process.env.SUPER_ADMIN_PASSWORD = "Task-Relationships-Test-Password-123!";

const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { tasksService } = await import("../src/modules/tasks/tasks.service.js");
const { workbenchService } = await import("../src/services/workbench.service.js");

try {
  await initializeDatabase();
  const session = await readSeedSession();
  const clientA = await createClient(session.workspace_id, "Relationship Client A");
  const clientB = await createClient(session.workspace_id, "Relationship Client B");

  await assertParentChildBlockingLifecycle(session);
  await assertRelationshipBoundaries(session, clientA, clientB);

  console.log("Task relationships regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertParentChildBlockingLifecycle(session) {
  const parent = (await tasksService.create({
    title: "Parent launch task",
    blocked_reason: "Waiting on legal approval.",
  }, session)).task;
  const child = (await tasksService.create({
    title: "Child blocker task",
  }, session)).task;

  const linked = await tasksService.addChildTask(parent.task_id, {
    child_task_id: child.task_id,
    is_blocking: true,
  }, session);
  const blockedParent = (await tasksService.read(parent.task_id, session)).task;

  assert.equal(linked.relationshipSummary.child_count, 1);
  assert.equal(linked.relationshipSummary.incomplete_blocking_child_count, 1);
  assert.equal(blockedParent.status, "blocked");
  assert.equal(blockedParent.blocked_reason, "Waiting on legal approval.");
  assert.equal(blockedParent.relationshipSummary.incomplete_blocking_child_count, 1);
  assert.equal(blockedParent.resumeContext.relationship_summary.incomplete_blocking_child_count, 1);

  await assert.rejects(
    () => tasksService.update(parent.task_id, { status: "in_progress" }, session),
    /blocking child tasks/i,
  );

  const relationshipRead = await tasksService.listRelationships(parent.task_id, session);
  assert.equal(relationshipRead.relationships.length, 1);
  assert.equal(relationshipRead.relationships[0].related_task.title, "Child blocker task");

  await tasksService.complete(child.task_id, session);
  const stillBlocked = (await tasksService.read(parent.task_id, session)).task;
  assert.equal(stillBlocked.status, "blocked", "manual blocked reason should be preserved after child completion");
  assert.equal(stillBlocked.relationshipSummary.incomplete_blocking_child_count, 0);

  const autoParent = (await tasksService.create({ title: "Auto-blocked parent" }, session)).task;
  const autoChild = (await tasksService.create({ title: "Auto child blocker" }, session)).task;
  await tasksService.addChildTask(autoParent.task_id, { child_task_id: autoChild.task_id, is_blocking: true }, session);
  const autoBlocked = (await tasksService.read(autoParent.task_id, session)).task;
  assert.equal(autoBlocked.status, "blocked");
  assert.match(autoBlocked.blocked_reason, /Blocked by incomplete child task/);

  await tasksService.complete(autoChild.task_id, session);
  const recovered = (await tasksService.read(autoParent.task_id, session)).task;
  assert.equal(recovered.status, "open");
  assert.equal(recovered.blocked_reason, "");

  const nonBlockingParent = (await tasksService.create({ title: "Non-blocking parent" }, session)).task;
  const nonBlockingChild = (await tasksService.create({ title: "Non-blocking child" }, session)).task;
  await tasksService.addChildTask(nonBlockingParent.task_id, { child_task_id: nonBlockingChild.task_id, is_blocking: false }, session);
  const inProgress = (await tasksService.update(nonBlockingParent.task_id, { status: "in_progress" }, session)).task;
  assert.equal(inProgress.status, "in_progress");

  const workbench = await workbenchService.listTaskWorkItems(session);
  const workItem = workbench.items.find((item) => item.task_id === parent.task_id);
  assert.equal(workItem.relationshipSummary.child_count, 1);
}

async function assertRelationshipBoundaries(session, clientA, clientB) {
  const parent = (await tasksService.create({
    title: "Client A parent task",
    client_id: clientA,
  }, session)).task;
  const child = (await tasksService.create({
    title: "Client A child task",
    client_id: clientA,
  }, session)).task;
  const otherClientChild = (await tasksService.create({
    title: "Client B child task",
    client_id: clientB,
  }, session)).task;

  await tasksService.addChildTask(parent.task_id, {
    child_task_id: child.task_id,
    is_blocking: false,
  }, session);

  await assert.rejects(
    () => tasksService.addChildTask(child.task_id, { child_task_id: parent.task_id }, session),
    /circular/i,
  );
  await assert.rejects(
    () => tasksService.addChildTask(parent.task_id, { child_task_id: parent.task_id }, session),
    /own child/i,
  );
  await assert.rejects(
    () => tasksService.addChildTask(parent.task_id, { child_task_id: otherClientChild.task_id }, session),
    /same client/i,
  );

  await tasksService.updateChildTaskRelationship(parent.task_id, child.task_id, { is_blocking: true }, session);
  const blocking = (await tasksService.read(parent.task_id, session)).task;
  assert.equal(blocking.relationshipSummary.blocking_child_count, 1);

  await tasksService.removeChildTaskRelationship(parent.task_id, child.task_id, session);
  const removed = (await tasksService.read(parent.task_id, session)).task;
  assert.equal(removed.relationshipSummary.child_count, 0);
}

async function createClient(workspaceId, name) {
  const now = new Date().toISOString();
  const clientId = randomUUID();

  await runSql(`
INSERT INTO clients (
  id,
  workspace_id,
  parent_client_id,
  name,
  status,
  billable,
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
  ${sqlText(name)},
  'Active',
  'yes',
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
`);

  return clientId;
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
