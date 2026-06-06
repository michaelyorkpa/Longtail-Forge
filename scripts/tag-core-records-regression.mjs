import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-tag-core-records-regression-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-tag-core-records-test.db");
process.env.SUPER_ADMIN_PASSWORD = "Tag-Core-Records-Test-Password-123!";

const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { clientsService } = await import("../src/modules/client-projects/clients.service.js");
const { tasksService } = await import("../src/modules/tasks/tasks.service.js");
const { timeEntriesService } = await import("../src/modules/time-tracking/time-entries.service.js");
const { tagsService } = await import("../src/services/tags.service.js");
const { modulesService } = await import("../src/core/modules/modules.service.js");

try {
  await initializeDatabase();
  const session = await readProtectedSession();
  await enableAuditLogging(session.workspace_id);

  const tag = (await tagsService.create(session, { name: "Urgent Client Work", color: "#dc2626" })).tag;
  const client = (await clientsService.createClient({
    name: "Tagged Client",
    tagIds: [tag.tag_id],
  }, session)).client;
  const project = (await clientsService.createProject(client.id, {
    name: "Tagged Project",
    tagIds: [tag.tag_id],
  }, session)).project;
  const task = (await tasksService.create({
    title: "Tagged Task",
    project_id: project.id,
    tagIds: [tag.tag_id],
  }, session)).task;
  const entry = (await timeEntriesService.create({
    project_id: project.id,
    description: "Tagged entry",
    start_time: "2026-06-06T12:00:00.000Z",
    end_time: "2026-06-06T13:00:00.000Z",
    duration_seconds: 3600,
    duration_hours: "1.0000",
    tagIds: [tag.tag_id],
  }, session)).entry;

  assert.deepEqual(client.tags.map((item) => item.tag_id), [tag.tag_id]);
  assert.deepEqual(project.tags.map((item) => item.tag_id), [tag.tag_id]);
  assert.deepEqual(task.tags.map((item) => item.tag_id), [tag.tag_id]);
  assert.deepEqual(entry.tags.map((item) => item.tag_id), [tag.tag_id]);

  assert.equal((await clientsService.listClients(session, { tagIds: [tag.tag_id] })).clients.length, 1);
  assert.equal((await clientsService.listProjects(session, { tagIds: [tag.tag_id] })).projects.length, 1);
  assert.equal((await tasksService.list(session, { tagIds: [tag.tag_id] })).tasks.length, 1);
  assert.equal((await timeEntriesService.list(session, { tagIds: [tag.tag_id] })).entries.length, 1);

  await modulesService.setModuleStatus(session.workspace_id, "tags", false, { session });
  await assert.rejects(
    () => tagsService.list(session),
    (error) => error.message === "Tagging is disabled for this workspace.",
  );

  await assertIntegrity();
  console.log("Tag core records regression passed.");
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

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.equal(rows[0]?.integrity_check, "ok");
}
