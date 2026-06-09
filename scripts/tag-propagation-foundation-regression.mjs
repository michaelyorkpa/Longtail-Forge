import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-tag-propagation-foundation-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-tag-propagation-test.db");
process.env.SUPER_ADMIN_PASSWORD = "Tag-Propagation-Test-Password-123!";

const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { clientsService } = await import("../src/modules/client-projects/clients.service.js");
const { tagsRepository } = await import("../src/repositories/tags.repo.js");
const { tagsService } = await import("../src/services/tags.service.js");

try {
  await initializeDatabase();

  const session = await readProtectedSession();
  await enableAuditLogging(session.workspace_id);
  await assertTagDefinitionsStaySimple();
  await assertPropagationStorageIndexes();

  const validationTarget = await createTaskTarget(session, "Propagation Source Validation Task");
  const target = await createTaskTarget(session, "Propagation Foundation Task");
  const otherTarget = await createTaskTarget(session, "Unrelated Tagged Task");
  const manualTag = (await tagsService.create(session, { name: "Manual Foundation" })).tag;
  const propagatedTag = (await tagsService.create(session, { name: "Propagated Foundation" })).tag;
  const systemTag = (await tagsService.create(session, { name: "System Foundation" })).tag;
  const unrelatedTag = (await tagsService.create(session, { name: "Unrelated Manual" })).tag;

  await assertAssignmentSourceValidation(session, {
    manualTag,
    propagatedTag,
    systemTag,
    target: validationTarget,
  });

  await tagsService.replaceManualAssignments(session, {
    tagIds: [manualTag.tag_id],
    targetId: target.taskId,
    targetType: "task",
  });
  await tagsRepository.addAssignment(session.workspace_id, {
    created_by_user_id: session.user_id,
    propagation_rule_id: "task-from-project",
    source: "propagated",
    source_assignment_id: `source-${propagatedTag.tag_id}`,
    source_target_id: "source-project-1",
    source_target_type: "project",
    tag_id: propagatedTag.tag_id,
    target_id: target.taskId,
    target_type: "task",
  });
  await tagsService.replaceManualAssignments(session, {
    tagIds: [],
    targetId: otherTarget.taskId,
    targetType: "task",
  });
  await tagsRepository.addAssignment(session.workspace_id, {
    created_by_user_id: session.user_id,
    source: "manual",
    tag_id: unrelatedTag.tag_id,
    target_id: otherTarget.taskId,
    target_type: "task",
  });

  const replacedManual = await tagsService.replaceManualAssignments(session, {
    tagIds: [],
    targetId: target.taskId,
    targetType: "task",
  });
  assert.deepEqual(replacedManual.assignments, [], "manual replacement can clear direct tags");

  const effectiveAfterReplace = await tagsService.listEffectiveTagsForTarget(session, "task", target.taskId);
  assert.deepEqual(
    effectiveAfterReplace.map((assignment) => assignment.tag_id),
    [propagatedTag.tag_id],
    "manual replacement must preserve propagated assignments",
  );
  assert.deepEqual(
    (await tagsService.listDirectTagsForTarget(session, "task", otherTarget.taskId)).map((assignment) => assignment.tag_id),
    [unrelatedTag.tag_id],
    "manual replacement must not touch unrelated direct assignments",
  );

  await assertSuppressionRules(session, target.taskId, propagatedTag.tag_id);
  await assertClientProjectSavesPreservePropagatedTags(session);
  await assertRefreshStubs(session, target.taskId);
  await assertIntegrity();

  console.log("Tag propagation foundation regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertAssignmentSourceValidation(session, { manualTag, propagatedTag, systemTag, target }) {
  for (const assignment of [
    { source: "manual", tag_id: manualTag.tag_id },
    {
      propagation_rule_id: "task-from-project",
      source: "propagated",
      source_target_id: "source-project-1",
      source_target_type: "project",
      tag_id: propagatedTag.tag_id,
    },
    { source: "system", tag_id: systemTag.tag_id },
  ]) {
    await tagsRepository.addAssignment(session.workspace_id, {
      created_by_user_id: session.user_id,
      target_id: target.taskId,
      target_type: "task",
      ...assignment,
    });
  }

  await assert.rejects(
    () => tagsRepository.addAssignment(session.workspace_id, {
      created_by_user_id: session.user_id,
      source: "invalid",
      tag_id: manualTag.tag_id,
      target_id: target.taskId,
      target_type: "task",
    }),
    /Invalid tag assignment source/,
  );

  assert.equal((await tagsService.listDirectTagsForTarget(session, "task", target.taskId)).length, 1);
  assert.equal((await tagsService.listPropagatedTagsForTarget(session, "task", target.taskId)).length, 1);
  assert.equal((await tagsService.listEffectiveTagsForTarget(session, "task", target.taskId)).length, 3);
}

async function assertSuppressionRules(session, taskId, propagatedTagId) {
  const manualAssignment = (await tagsService.listDirectTagsForTarget(session, "task", taskId))[0];
  assert.equal(manualAssignment, undefined, "test setup should have cleared manual tags before suppression checks");

  const propagatedAssignment = (await tagsService.listPropagatedTagsForTarget(session, "task", taskId))[0];
  assert.ok(propagatedAssignment, "propagated assignment should exist before suppression");

  await assert.rejects(
    () => tagsService.suppressPropagatedAssignment(session, { assignmentId: "missing" }),
    /Tag assignment was not found/,
  );

  const manualOnlyTarget = await createTaskTarget(session, "Manual Suppression Guard Task");
  const manualOnlyTag = (await tagsService.create(session, { name: "Manual Suppression Guard" })).tag;
  await tagsRepository.addAssignment(session.workspace_id, {
    created_by_user_id: session.user_id,
    source: "manual",
    tag_id: manualOnlyTag.tag_id,
    target_id: manualOnlyTarget.taskId,
    target_type: "task",
  });
  const manualOnlyAssignment = (await tagsService.listDirectTagsForTarget(session, "task", manualOnlyTarget.taskId))[0];
  await assert.rejects(
    () => tagsService.suppressPropagatedAssignment(session, { assignmentId: manualOnlyAssignment.tag_assignment_id }),
    /Only propagated tag assignments can be suppressed/,
  );

  await tagsService.suppressPropagatedAssignment(session, {
    assignmentId: propagatedAssignment.tag_assignment_id,
  });

  assert.deepEqual(await tagsService.listPropagatedTagsForTarget(session, "task", taskId), []);
  const suppressions = await tagsRepository.listSuppressionsForTarget(session.workspace_id, "task", taskId);
  assert.equal(suppressions.length, 1);
  assert.equal(suppressions[0].tag_id, propagatedTagId);
  assert.equal(suppressions[0].source_target_type, "project");
  assert.equal(suppressions[0].source_target_id, "source-project-1");
  assert.equal(suppressions[0].propagation_rule_id, "task-from-project");
}

async function assertClientProjectSavesPreservePropagatedTags(session) {
  const clientDirectTag = (await tagsService.create(session, { name: "Client Direct" })).tag;
  const clientPropagatedTag = (await tagsService.create(session, { name: "Client Propagated" })).tag;
  const projectDirectTag = (await tagsService.create(session, { name: "Project Direct" })).tag;
  const projectPropagatedTag = (await tagsService.create(session, { name: "Project Propagated" })).tag;
  const client = (await clientsService.createClient({
    billable: "yes",
    name: "Propagation Billing Client",
    tagIds: [clientDirectTag.tag_id],
  }, session)).client;
  const project = (await clientsService.createProject(client.id, {
    billable: "yes",
    name: "Propagation Billing Project",
    tagIds: [projectDirectTag.tag_id],
  }, session)).project;

  await tagsRepository.addAssignment(session.workspace_id, {
    created_by_user_id: session.user_id,
    propagation_rule_id: "client-parent",
    source: "propagated",
    source_target_id: "parent-client-1",
    source_target_type: "client",
    tag_id: clientPropagatedTag.tag_id,
    target_id: client.id,
    target_type: "client",
  });
  await tagsRepository.addAssignment(session.workspace_id, {
    created_by_user_id: session.user_id,
    propagation_rule_id: "project-client",
    source: "propagated",
    source_target_id: client.id,
    source_target_type: "client",
    tag_id: projectPropagatedTag.tag_id,
    target_id: project.id,
    target_type: "project",
  });

  await clientsService.updateClient(client.id, {
    billable: "no",
    name: client.name,
    tagIds: [clientDirectTag.tag_id],
  }, session);
  await clientsService.updateProject(project.id, {
    billable: "no",
    client_id: client.id,
    name: project.name,
    tagIds: [projectDirectTag.tag_id],
  }, session);

  assertIncludesTagIds(
    await tagsService.listEffectiveTagsForTarget(session, "client", client.id),
    [clientDirectTag.tag_id, clientPropagatedTag.tag_id],
  );
  assertIncludesTagIds(
    await tagsService.listEffectiveTagsForTarget(session, "project", project.id),
    [projectDirectTag.tag_id, projectPropagatedTag.tag_id],
  );
}

async function assertRefreshStubs(session, taskId) {
  const targetRefresh = await tagsService.refreshPropagatedAssignmentsForTarget(session, {
    targetId: taskId,
    targetType: "task",
  });
  assert.equal(typeof targetRefresh.refreshed, "boolean");
  assert.equal(typeof targetRefresh.scanned_records, "number");

  const workspaceRefresh = await tagsService.refreshPropagatedAssignmentsForWorkspace(session);
  assert.equal(typeof workspaceRefresh.refreshed, "boolean");
  assert.equal(workspaceRefresh.workspace_id, session.workspace_id);
}

function assertIncludesTagIds(assignments, expectedTagIds) {
  const actualTagIds = new Set(assignments.map((assignment) => assignment.tag_id));

  for (const tagId of expectedTagIds) {
    assert.ok(actualTagIds.has(tagId), `expected tag ${tagId} to be preserved`);
  }
}

async function assertTagDefinitionsStaySimple() {
  const columns = await querySql("PRAGMA table_info(tags);");
  const columnNames = columns.map((column) => column.name);

  assert.ok(!columnNames.includes("scope"));
  assert.ok(!columnNames.includes("scope_type"));
  assert.ok(!columnNames.includes("visibility"));
}

async function assertPropagationStorageIndexes() {
  const assignmentColumns = (await querySql("PRAGMA table_info(tag_assignments);")).map((column) => column.name);
  for (const column of [
    "source_assignment_id",
    "source_target_type",
    "source_target_id",
    "propagation_rule_id",
  ]) {
    assert.ok(assignmentColumns.includes(column), `tag_assignments should include ${column}`);
  }

  const tables = await querySql(`
SELECT name
FROM sqlite_master
WHERE type = 'table'
  AND name = 'tag_assignment_suppressions';
`);
  assert.equal(tables.length, 1, "suppression storage should exist");

  const indexes = (await querySql(`
SELECT name
FROM sqlite_master
WHERE type = 'index'
  AND name IN (
    'idx_tag_assignments_propagation_source',
    'idx_tag_assignments_source_assignment',
    'idx_tag_assignment_suppressions_unique',
    'idx_tag_assignment_suppressions_target',
    'idx_tag_assignment_suppressions_source',
    'idx_tag_assignment_suppressions_tag'
  )
ORDER BY name;
`)).map((row) => row.name);

  assert.deepEqual(indexes, [
    "idx_tag_assignment_suppressions_source",
    "idx_tag_assignment_suppressions_tag",
    "idx_tag_assignment_suppressions_target",
    "idx_tag_assignment_suppressions_unique",
    "idx_tag_assignments_propagation_source",
    "idx_tag_assignments_source_assignment",
  ]);
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

async function createTaskTarget(session, title) {
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
  ${sqlText(title)},
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

async function enableAuditLogging(workspaceId) {
  await runSql(`
UPDATE workspace_settings
SET audit_logging_enabled = 1,
    audit_retention_days = 90
WHERE workspace_id = ${sqlText(workspaceId)};
`);
}

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.equal(rows[0]?.integrity_check, "ok");
}
