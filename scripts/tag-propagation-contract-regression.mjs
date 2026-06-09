import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-tag-propagation-contract-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-tag-propagation-contract.db");
process.env.SUPER_ADMIN_PASSWORD = "Tag-Propagation-Contract-Test-123!";

const { internalEventBus } = await import("../src/core/events/event-bus.js");
const { validateModuleManifests } = await import("../src/core/modules/manifest-contract.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { tagsRepository } = await import("../src/repositories/tags.repo.js");
const { tagsService } = await import("../src/services/tags.service.js");

try {
  await assertManifestValidation();
  await initializeDatabase();

  const session = await readProtectedSession();
  await enableAuditLogging(session.workspace_id);
  const task = await createTaskTarget(session, "Propagation Contract Task");
  const tag = (await tagsService.create(session, { name: "Contract Tag" })).tag;

  await assertTagEventsAndRepairFailures(session, task.taskId, tag.tag_id);
  await assertDisabledModuleBlocksPropagation(session, task.taskId, tag.tag_id);
  const propagatedTag = (await tagsService.create(session, { name: "Contract Propagated Tag" })).tag;
  await assertRepairDryRun(session, task.taskId, propagatedTag.tag_id);
  await assertIntegrity();

  console.log("Tag propagation contract regression passed.");
} finally {
  internalEventBus.reset();
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertManifestValidation() {
  assert.doesNotThrow(() => validateModuleManifests([
    manifest("source-module", {
      taggableTypes: [taggable("source-module", "source", "source_records")],
      tagPropagation: [{
        id: "source-to-target",
        sourceModuleId: "source-module",
        sourceTargetType: "source",
        targetModuleId: "target-module",
        targetType: "target",
        relationshipResolver: "tag-propagation.noop",
        workspaceField: "workspace_id",
        sourceReadPermission: "source.read",
        targetReadPermission: "target.read",
        targetTagPermission: "tags.assign",
        requiredModules: ["source-module", "target-module"],
        snapshotOnCreate: true,
        propagateOnParentChange: true,
        propagateOnRelationshipChange: true,
      }],
    }),
    manifest("target-module", {
      taggableTypes: [taggable("target-module", "target", "target_records")],
    }),
  ]));

  assert.throws(() => validateModuleManifests([
    manifest("source-module", {
      taggableTypes: [taggable("source-module", "source", "source_records")],
      tagPropagation: [
        validPropagation({ id: "duplicate-rule" }),
        validPropagation({ id: "duplicate-rule" }),
      ],
    }),
    manifest("target-module", {
      taggableTypes: [taggable("target-module", "target", "target_records")],
    }),
  ]), /tagPropagation id 'duplicate-rule' is duplicated/);

  assert.throws(() => validateModuleManifests([
    manifest("source-module", {
      taggableTypes: [taggable("source-module", "source", "source_records")],
      tagPropagation: [validPropagation({ targetModuleId: "missing-module" })],
    }),
    manifest("target-module", {
      taggableTypes: [taggable("target-module", "target", "target_records")],
    }),
  ]), /targetModuleId references unknown module 'missing-module'/);

  assert.throws(() => validateModuleManifests([
    manifest("source-module", {
      taggableTypes: [taggable("source-module", "source", "source_records")],
      tagPropagation: [validPropagation({ targetType: "missing-target" })],
    }),
    manifest("target-module", {
      taggableTypes: [taggable("target-module", "target", "target_records")],
    }),
  ]), /targetType references unknown taggable type 'target-module:missing-target'/);

  assert.throws(() => validateModuleManifests([
    manifest("source-module", {
      taggableTypes: [taggable("source-module", "source", "source_records")],
      tagPropagation: [validPropagation({ relationshipResolver: "missing.resolver" })],
    }),
    manifest("target-module", {
      taggableTypes: [taggable("target-module", "target", "target_records")],
    }),
  ]), /relationshipResolver references unknown resolver 'missing.resolver'/);

  assert.throws(() => validateModuleManifests([
    manifest("source-module", {
      taggableTypes: [taggable("source-module", "source", "source_records")],
      tagPropagation: [validPropagation({ workspaceField: "workspace-id;drop" })],
    }),
    manifest("target-module", {
      taggableTypes: [taggable("target-module", "target", "target_records")],
    }),
  ]), /workspaceField has an invalid format/);
}

async function assertTagEventsAndRepairFailures(session, taskId, tagId) {
  internalEventBus.reset();
  internalEventBus.on("tag.assignment.manual_added", async () => {
    throw new Error("expected tag hook failure");
  }, {
    id: "tag-contract:failing-hook",
    moduleId: "test-module",
  });

  await tagsService.assign(session, {
    tagId,
    targetId: taskId,
    targetType: "task",
  });

  const failures = tagsService.listTagPropagationFailures(session.workspace_id);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].event, "tag.assignment.manual_added");

  const repair = await tagsService.repairTagPropagation(session, { dryRun: true });
  assert.equal(repair.failed_records, 1);
  assert.equal(repair.failures.length, 1);
}

async function assertDisabledModuleBlocksPropagation(session, taskId, tagId) {
  await runSql(`
UPDATE workspace_modules
SET status = 'disabled'
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND module_id = 'tasks';
`);

  await assert.rejects(
    () => tagsService.addPropagatedAssignment(session, {
      propagationRuleId: "project-to-task",
      sourceTargetId: "project-1",
      sourceTargetType: "project",
      tagId,
      targetId: taskId,
      targetType: "task",
    }),
    /That module is disabled for new tag assignments/,
  );

  await runSql(`
UPDATE workspace_modules
SET status = 'enabled'
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND module_id = 'tasks';
`);
}

async function assertRepairDryRun(session, taskId, tagId) {
  await tagsRepository.addAssignment(session.workspace_id, {
    created_by_user_id: session.user_id,
    propagation_rule_id: "project-to-task",
    source: "propagated",
    source_target_id: "project-1",
    source_target_type: "project",
    tag_id: tagId,
    target_id: taskId,
    target_type: "task",
  });
  const propagated = (await tagsService.listPropagatedTagsForTarget(session, "task", taskId))[0];
  await tagsService.suppressPropagatedAssignment(session, {
    assignmentId: propagated.tag_assignment_id,
  });

  const repair = await tagsService.repairTagPropagation(session, { dryRun: true });
  assert.equal(repair.dryRun, true);
  assert.equal(repair.direct_assignments, 1);
  assert.equal(repair.propagated_assignments, 0);
  assert.equal(repair.suppressed_propagated_assignments, 1);
  assert.equal(repair.repaired_records, 0);
  assert.ok(repair.failed_records >= 1);
}

function manifest(id, overrides = {}) {
  return {
    id,
    name: id,
    displayName: id,
    description: `${id} manifest`,
    category: "test",
    version: "0.32.9.7.2",
    enabledByDefault: true,
    ...overrides,
  };
}

function taggable(moduleId, targetType, tableName) {
  return {
    targetType,
    moduleId,
    label: targetType,
    description: `${targetType} records`,
    tableName,
    idField: "id",
    labelField: "name",
    workspaceField: "workspace_id",
    requiredReadPermission: `${targetType}.read`,
    requiredTagPermission: "tags.assign",
  };
}

function validPropagation(overrides = {}) {
  return {
    id: "source-to-target",
    sourceModuleId: "source-module",
    sourceTargetType: "source",
    targetModuleId: "target-module",
    targetType: "target",
    relationshipResolver: "tag-propagation.noop",
    workspaceField: "workspace_id",
    sourceReadPermission: "source.read",
    targetReadPermission: "target.read",
    targetTagPermission: "tags.assign",
    requiredModules: ["source-module", "target-module"],
    ...overrides,
  };
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
