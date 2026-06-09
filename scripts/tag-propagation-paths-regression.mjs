import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-tag-propagation-paths-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-tag-propagation-paths.db");
process.env.SUPER_ADMIN_PASSWORD = "Tag-Propagation-Paths-Test-123!";

const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { clientsService } = await import("../src/modules/client-projects/clients.service.js");
const { tasksService } = await import("../src/modules/tasks/tasks.service.js");
const { timeEntriesService } = await import("../src/modules/time-tracking/time-entries.service.js");
const { searchService } = await import("../src/services/search.service.js");
const { reportingService } = await import("../src/services/reporting.service.js");
const { tagsRepository } = await import("../src/repositories/tags.repo.js");
const { tagsService } = await import("../src/services/tags.service.js");

try {
  await initializeDatabase();
  const session = await readProtectedSession();
  await enableAuditLogging(session.workspace_id);

  const fixtures = await createPropagationFixtures(session);
  await assertClientProjectTaskPropagation(session, fixtures);
  await assertSuppressionAndRemovalBehavior(session, fixtures);
  await assertTimeEntrySnapshotsSearchAndReporting(session, fixtures);
  await assertNoSemanticSideEffects(session, fixtures);
  await assertIntegrity();

  console.log("Tag propagation paths regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function createPropagationFixtures(session) {
  const parentClientTag = (await tagsService.create(session, { name: "Parent Client Effective" })).tag;
  const parentProjectTag = (await tagsService.create(session, { name: "Parent Project Effective" })).tag;
  const childManualTag = (await tagsService.create(session, { name: "Child Manual Only" })).tag;
  const lateParentProjectTag = (await tagsService.create(session, { name: "Late Parent Project Effective" })).tag;
  const convertedTag = (await tagsService.create(session, { name: "Converted Child Manual" })).tag;

  const parentClient = (await clientsService.createClient({
    name: "Propagation Parent Client",
    tagIds: [parentClientTag.tag_id],
  }, session)).client;
  const childClient = (await clientsService.createClient({
    name: "Propagation Child Client",
    parent_client_id: parentClient.id,
    tagIds: [],
  }, session)).client;
  const parentProject = (await clientsService.createProject(childClient.id, {
    name: "Propagation Parent Project",
    tagIds: [parentProjectTag.tag_id],
  }, session)).project;
  const childProject = (await clientsService.createProject(childClient.id, {
    name: "Propagation Child Project",
    parent_project_id: parentProject.id,
    tagIds: [childManualTag.tag_id],
  }, session)).project;
  const task = (await tasksService.create({
    project_id: childProject.id,
    title: "Propagation Task",
    tagIds: [],
  }, session)).task;

  return {
    childClient,
    childManualTag,
    childProject,
    convertedTag,
    lateParentProjectTag,
    parentClient,
    parentClientTag,
    parentProject,
    parentProjectTag,
    task,
  };
}

async function assertClientProjectTaskPropagation(session, fixtures) {
  assertTagIds(
    await tagsService.listPropagatedTagsForTarget(session, "client", fixtures.childClient.id),
    [fixtures.parentClientTag.tag_id],
    "child client should receive parent client tags",
  );
  assertTagIds(
    await tagsService.listEffectiveTagsForTarget(session, "project", fixtures.parentProject.id),
    [fixtures.parentClientTag.tag_id, fixtures.parentProjectTag.tag_id],
    "business project should receive linked client effective tags",
  );
  assertTagIds(
    await tagsService.listEffectiveTagsForTarget(session, "project", fixtures.childProject.id),
    [fixtures.childManualTag.tag_id, fixtures.parentClientTag.tag_id, fixtures.parentProjectTag.tag_id],
    "child project should receive client and parent project effective tags while preserving direct tags",
  );
  assertTagIds(
    await tagsService.listEffectiveTagsForTarget(session, "task", fixtures.task.task_id),
    [fixtures.childManualTag.tag_id, fixtures.parentClientTag.tag_id, fixtures.parentProjectTag.tag_id],
    "task should receive linked project effective tags",
  );
}

async function assertSuppressionAndRemovalBehavior(session, fixtures) {
  const childProjectParentTagAssignment = (await tagsService.listPropagatedTagsForTarget(
    session,
    "project",
    fixtures.childProject.id,
  )).find((assignment) => assignment.tag_id === fixtures.parentProjectTag.tag_id);

  await tagsService.suppressPropagatedAssignment(session, {
    assignmentId: childProjectParentTagAssignment.tag_assignment_id,
  });

  assertTagIds(
    await tagsService.listEffectiveTagsForTarget(session, "project", fixtures.parentProject.id),
    [fixtures.parentClientTag.tag_id, fixtures.parentProjectTag.tag_id],
    "suppression should not remove the parent assignment",
  );
  assert.ok(
    !(await tagsService.listEffectiveTagsForTarget(session, "project", fixtures.childProject.id))
      .some((assignment) => assignment.tag_id === fixtures.parentProjectTag.tag_id),
    "suppressed propagated tag should leave the child project",
  );
  assert.ok(
    !(await tagsService.listEffectiveTagsForTarget(session, "task", fixtures.task.task_id))
      .some((assignment) => assignment.tag_id === fixtures.parentProjectTag.tag_id),
    "suppression should cascade to dependent task tags",
  );

  await tagsService.remove(session, {
    tagId: fixtures.childManualTag.tag_id,
    targetId: fixtures.childProject.id,
    targetType: "project",
  });
  assert.ok(
    (await tagsService.listEffectiveTagsForTarget(session, "project", fixtures.parentProject.id))
      .some((assignment) => assignment.tag_id === fixtures.parentProjectTag.tag_id),
    "removing a child direct tag should not affect parent records",
  );

  await tagsService.assign(session, {
    tagId: fixtures.convertedTag.tag_id,
    targetId: fixtures.parentProject.id,
    targetType: "project",
  });
  const propagatedConverted = (await tagsService.listPropagatedTagsForTarget(session, "project", fixtures.childProject.id))
    .find((assignment) => assignment.tag_id === fixtures.convertedTag.tag_id);
  await tagsRepository.removeAssignmentById(session.workspace_id, propagatedConverted.tag_assignment_id);
  await tagsRepository.addAssignment(session.workspace_id, {
    created_by_user_id: session.user_id,
    source: "manual",
    tag_id: fixtures.convertedTag.tag_id,
    target_id: fixtures.childProject.id,
    target_type: "project",
  });
  await tagsService.remove(session, {
    tagId: fixtures.convertedTag.tag_id,
    targetId: fixtures.parentProject.id,
    targetType: "project",
  });
  assertTagIds(
    await tagsService.listDirectTagsForTarget(session, "project", fixtures.childProject.id),
    [fixtures.convertedTag.tag_id],
    "converted manual child tags should survive parent direct removal",
  );
}

async function assertTimeEntrySnapshotsSearchAndReporting(session, fixtures) {
  const firstEntry = (await timeEntriesService.create({
    description: "Task-bound propagated snapshot",
    duration_hours: "1.0000",
    duration_seconds: 3600,
    end_time: "2026-06-09T14:00:00.000Z",
    project_id: fixtures.childProject.id,
    start_time: "2026-06-09T13:00:00.000Z",
    task_id: fixtures.task.task_id,
    tagIds: [],
  }, session)).entry;

  assert.ok(
    firstEntry.tags.some((tag) => tag.tag_id === fixtures.parentClientTag.tag_id),
    "task-bound time entry should snapshot effective task/project tags",
  );

  await tagsService.assign(session, {
    tagId: fixtures.lateParentProjectTag.tag_id,
    targetId: fixtures.parentProject.id,
    targetType: "project",
  });

  assert.ok(
    (await tagsService.listEffectiveTagsForTarget(session, "task", fixtures.task.task_id))
      .some((assignment) => assignment.tag_id === fixtures.lateParentProjectTag.tag_id),
    "later parent tag changes should refresh live task effective tags",
  );
  assert.ok(
    !(await tagsService.listEffectiveTagsForTarget(session, "time_entry", firstEntry.entry_id))
      .some((assignment) => assignment.tag_id === fixtures.lateParentProjectTag.tag_id),
    "existing finalized time entries should not be rewritten by later parent tag changes",
  );

  const secondEntry = (await timeEntriesService.create({
    description: "Manual project propagated snapshot",
    duration_hours: "0.5000",
    duration_seconds: 1800,
    end_time: "2026-06-10T14:30:00.000Z",
    project_id: fixtures.childProject.id,
    start_time: "2026-06-10T14:00:00.000Z",
    tagIds: [],
  }, session)).entry;
  assert.ok(
    secondEntry.tags.some((tag) => tag.tag_id === fixtures.lateParentProjectTag.tag_id),
    "manual/project time entry should snapshot effective project tags",
  );

  const searchRequest = await searchService.composePermissionSafeSearchRequest({
    filters: {
      recordTypes: ["task"],
      tagIds: [fixtures.lateParentProjectTag.tag_id],
    },
    session,
  });
  const searchResult = await searchService.executeSearch(searchRequest);
  assert.ok(
    searchResult.results.some((result) => result.record_type === "task" && result.record_id === fixtures.task.task_id),
    "search exact tag filters should match effective propagated task tags",
  );

  const report = await reportingService.readProjectSummary(session, {
    includeDescendants: true,
    period: "custom",
    scopeId: fixtures.childClient.id,
    startDate: "2026-06-09",
    tagIds: [fixtures.lateParentProjectTag.tag_id],
    endDate: "2026-06-10",
  });
  assert.equal(report.totals.seconds, 1800, "reporting tag filters should use stored time-entry effective tags");
  assert.equal(report.rows.reduce((seconds, row) => seconds + row.displaySeconds, 0), 1800);
}

async function assertNoSemanticSideEffects(session, fixtures) {
  const unfilteredReport = await reportingService.readProjectSummary(session, {
    includeDescendants: true,
    period: "custom",
    scopeId: fixtures.childClient.id,
    startDate: "2026-06-09",
    endDate: "2026-06-10",
  });

  assert.equal(unfilteredReport.totals.seconds, 5400, "effective tags should not alter report footer totals");
  assert.equal((await clientsService.readProject(fixtures.childProject.id, session)).project.billable, "yes");
  assert.equal((await tasksService.read(fixtures.task.task_id, session)).task.status, "open");
}

function assertTagIds(assignments, expectedTagIds, message) {
  assert.deepEqual(
    assignments.map((assignment) => assignment.tag_id).sort(),
    [...expectedTagIds].sort(),
    message,
  );
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

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.equal(rows[0]?.integrity_check, "ok");
}
