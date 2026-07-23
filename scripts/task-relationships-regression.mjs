import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-task-relationships-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-task-relationships.db");
process.env.SUPER_ADMIN_PASSWORD = "Task-Relationships-Test-Password-123!";

const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { internalEventBus } = await import("../src/core/events/event-bus.js");
const { clientsService } = await import("../src/modules/client-projects/clients.service.js");
const { indexTaskRecord } = await import("../src/modules/tasks/search-indexers.js");
const { tasksRepository } = await import("../src/modules/tasks/tasks.repo.js");
const { tasksService } = await import("../src/modules/tasks/tasks.service.js");
const capturedTaskEvents = [];
const unsubscribeTaskUpdated = internalEventBus.on("task.updated", async (event) => {
  capturedTaskEvents.push(event);
}, {
  id: "task-relationships:task.updated",
  moduleId: "task-relationships",
});

try {
  await initializeDatabase();
  const session = await readSeedSession();
  const clientA = await createClient(session.workspace_id, "Relationship Client A");
  const clientB = await createClient(session.workspace_id, "Relationship Client B");

  await assertParentChildBlockingLifecycle(session);
  await assertRelationshipBoundaries(session, clientA, clientB);
  await assertProjectCascade(session, clientA);
  await assertPersonalProjectCascade(session);
  const integrity = await querySql("PRAGMA integrity_check;");
  assert.equal(integrity[0]?.integrity_check, "ok");

  console.log("Task relationships regression passed.");
} finally {
  unsubscribeTaskUpdated();
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertProjectCascade(session, clientId) {
  const sourceProject = (await clientsService.createProject(clientId, { name: "Cascade source Project" }, session)).project;
  const childProject = (await clientsService.createProject(clientId, { name: "Cascade child source Project" }, session)).project;
  const destinationProject = (await clientsService.createProject(clientId, { name: "Cascade destination Project" }, session)).project;
  const parent = (await tasksService.create({ title: "Cascade parent", project_id: sourceProject.id }, session)).task;
  const child = (await tasksService.create({ title: "Cascade child", project_id: sourceProject.id }, session)).task;
  const grandchild = (await tasksService.create({ title: "Cascade grandchild", project_id: childProject.id }, session)).task;
  const leaf = (await tasksService.create({ title: "Cascade standalone leaf", project_id: sourceProject.id }, session)).task;
  await tasksService.addChildTask(parent.task_id, { child_task_id: child.task_id }, session);
  await tasksService.addChildTask(child.task_id, { child_task_id: grandchild.task_id }, session);

  const otherWorkspaceId = `relationship-other-${randomUUID()}`;
  const now = new Date().toISOString();
  await runSql(`
INSERT INTO workspaces (workspace_id, name, status, workspace_type, owner_user_id, created_at, updated_at)
VALUES (${sqlText(otherWorkspaceId)}, 'Relationship Other Workspace', 'Active', 'business', ${sqlText(session.user_id)}, ${sqlText(now)}, ${sqlText(now)});
`);
  const crossWorkspaceTask = await tasksRepository.create(otherWorkspaceId, {
    task_id: `relationship-cross-${randomUUID()}`,
    title: "Cross-workspace cascade sentinel",
    status: "open",
    priority: "normal",
    billable: "no",
    created_by_user_id: session.user_id,
    updated_by_user_id: session.user_id,
  });

  const moved = await tasksService.update(parent.task_id, {
    project_id: destinationProject.id,
  }, session);
  assert.deepEqual(
    new Set(moved.tasks.map((task) => task.task_id)),
    new Set([parent.task_id, child.task_id, grandchild.task_id]),
    "Project cascade responses should return the authoritative parent and every descendant",
  );
  for (const taskId of [parent.task_id, child.task_id, grandchild.task_id]) {
    const task = (await tasksService.read(taskId, session)).task;
    assert.equal(task.project_id, destinationProject.id, "all descendants should follow the parent Project");
    assert.equal(task.client_id, destinationProject.client_id, "Business descendant Client should derive from the destination Project");
  }
  assert.equal((await tasksService.read(leaf.task_id, session)).task.project_id, sourceProject.id, "a non-descendant task should not move");
  assert.equal((await tasksRepository.readById(otherWorkspaceId, crossWorkspaceTask.task_id)).project_id, "", "a cascade must not touch another workspace");

  const childEvent = capturedTaskEvents.find((event) =>
    event.record_id === child.task_id && event.metadata?.project_cascade_root_task_id === parent.task_id,
  );
  assert.ok(childEvent, "descendant Project changes should emit canonical task.updated events with cascade context");
  const [grandchildAudit] = await querySql(`
SELECT action, metadata_json
FROM audit_logs
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND record_type = 'task'
  AND record_id = ${sqlText(grandchild.task_id)}
  AND action = 'task_updated'
ORDER BY created_at DESC
LIMIT 1;
`);
  assert.equal(grandchildAudit?.action, "task_updated", "descendant Project changes should retain canonical audit history");
  assert.equal(JSON.parse(grandchildAudit?.metadata_json || "{}").project_id, destinationProject.id);
  const indexedGrandchild = await indexTaskRecord({ workspaceId: session.workspace_id, recordId: grandchild.task_id });
  assert.equal(indexedGrandchild?.project_id, destinationProject.id, "descendant Search documents should refresh to the destination Project");

  const leafMove = await tasksService.update(leaf.task_id, { project_id: destinationProject.id }, session);
  assert.deepEqual(leafMove.tasks.map((task) => task.task_id), [leaf.task_id], "a non-parent Project change should return and touch only itself");

  const deniedParent = (await tasksService.create({ title: "Cascade authority parent", project_id: sourceProject.id }, session)).task;
  const deniedChild = (await tasksService.create({ title: "Cascade authority child", project_id: childProject.id }, session)).task;
  await tasksService.addChildTask(deniedParent.task_id, { child_task_id: deniedChild.task_id }, session);
  const projectAdminSession = await createNoRoleSession(session.workspace_id);
  await assignProjectAdmin(projectAdminSession, sourceProject.id);
  await assignProjectAdmin(projectAdminSession, destinationProject.id);
  await assert.rejects(
    () => tasksService.update(deniedParent.task_id, { project_id: destinationProject.id }, projectAdminSession),
    (error) => error?.statusCode === 403,
    "a descendant outside the actor's old scope should reject the whole cascade",
  );
  assert.equal((await tasksService.read(deniedParent.task_id, session)).task.project_id, sourceProject.id, "failed descendant authority should roll back the parent move");
  assert.equal((await tasksService.read(deniedChild.task_id, session)).task.project_id, childProject.id, "failed descendant authority should leave the child unchanged");
}

async function assertPersonalProjectCascade(session) {
  await runSql(`UPDATE workspaces SET workspace_type = 'personal' WHERE workspace_id = ${sqlText(session.workspace_id)};`);
  const sourceProject = (await clientsService.createProject("", { name: "Personal cascade source" }, session)).project;
  const destinationProject = (await clientsService.createProject("", { name: "Personal cascade destination" }, session)).project;
  const parent = (await tasksService.create({ title: "Personal cascade parent", project_id: sourceProject.id }, session)).task;
  const child = (await tasksService.create({ title: "Personal cascade child", project_id: sourceProject.id }, session)).task;
  await tasksService.addChildTask(parent.task_id, { child_task_id: child.task_id }, session);

  const moved = await tasksService.update(parent.task_id, { project_id: destinationProject.id }, session);
  assert.equal(moved.tasks.length, 2);
  assert.ok(moved.tasks.every((task) => task.project_id === destinationProject.id));
  assert.ok(moved.tasks.every((task) => task.client_id === ""), "Personal descendants should remain Client-free after a Project cascade");
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

  const listRead = await tasksService.listAll(session, { status: "active", task_view: "all" });
  const childListRow = listRead.tasks.find((task) => task.task_id === child.task_id);
  assert.deepEqual(childListRow?.parentTask, {
    task_id: parent.task_id,
    title: parent.title,
    status: "blocked",
  }, "task list projections should expose one safe readable parent for nesting and navigation");

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

  const workbench = await tasksService.listWorkbenchItems(session);
  const workItem = workbench.items.find((item) => item.task_id === parent.task_id);
  assert.equal(workItem.relationship_summary.child_count, 1);
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

async function createNoRoleSession(workspaceId) {
  const userId = randomUUID();
  const now = new Date().toISOString();
  const username = `task-cascade-no-role-${userId}@example.test`;

  await runSql(`
INSERT INTO users (
  user_id,
  home_workspace_id,
  username,
  display_name,
  password,
  user_status,
  protected_user,
  active_workspace_id
)
VALUES (
  ${sqlText(userId)},
  ${sqlText(workspaceId)},
  ${sqlText(username)},
  'Task Cascade Scoped User',
  'unused',
  'active',
  'no',
  ${sqlText(workspaceId)}
);

INSERT INTO user_workspaces (
  user_workspace_id,
  user_id,
  workspace_id,
  status,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(randomUUID())},
  ${sqlText(userId)},
  ${sqlText(workspaceId)},
  'active',
  ${sqlText(now)},
  ${sqlText(now)}
);
`);

  return {
    active_workspace_id: workspaceId,
    home_workspace_id: workspaceId,
    ip: "127.0.0.1",
    timezone: "America/New_York",
    user_id: userId,
    username,
    workspace_id: workspaceId,
  };
}

async function assignProjectAdmin(session, projectId) {
  const now = new Date().toISOString();
  await runSql(`
INSERT INTO user_role_assignments (
  assignment_id,
  workspace_id,
  user_id,
  role_id,
  scope_type,
  scope_id,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(randomUUID())},
  ${sqlText(session.workspace_id)},
  ${sqlText(session.user_id)},
  'project_admin',
  'project',
  ${sqlText(projectId)},
  ${sqlText(now)},
  ${sqlText(now)}
);
`);
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
