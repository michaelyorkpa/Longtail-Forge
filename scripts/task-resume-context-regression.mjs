import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-task-resume-context-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-task-resume-context.db");
process.env.SUPER_ADMIN_PASSWORD = "Task-Resume-Context-Test-Password-123!";

const { closeSqlite, initializeDatabase, querySql } = await import("../src/db/index.js");
const { indexTaskRecord } = await import("../src/modules/tasks/search-indexers.js");
const { tasksService } = await import("../src/modules/tasks/tasks.service.js");
const { workbenchService } = await import("../src/services/workbench.service.js");

try {
  await initializeDatabase();
  const session = await readSeedSession();

  await assertTaskContextFieldsSurviveCreateUpdateRead(session);
  await assertTaskContextFeedsSafeSummaries(session);
  await assertArchivedTasksAreNotActiveResumeCandidates(session);
  await assertTaskViewDialogIncludesResumeFields();

  console.log("Task resume context regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertTaskContextFieldsSurviveCreateUpdateRead(session) {
  const created = (await tasksService.create({
    title: "Prepare CTU invoice",
    next_action: "What's the next thing?",
    blocked_reason: "Waiting on CTU to confirm PO number.",
    resume_note: "Invoice draft is otherwise ready.",
  }, session)).task;

  assert.equal(created.next_action, "What's the next thing?");
  assert.equal(created.blocked_reason, "Waiting on CTU to confirm PO number.");
  assert.equal(created.resume_note, "Invoice draft is otherwise ready.");
  assert.equal(created.resumeContext.active_candidate, true);
  assert.equal(created.resumeContext.blocked_reason, "", "open task resume context should not surface blocked reason");

  const updated = (await tasksService.update(created.task_id, {
    status: "blocked",
    blocked_reason: "CTU still needs to confirm PO number.",
    handoff_note: "Follow up with Alex, then send the draft.",
  }, session)).task;

  assert.equal(updated.next_action, "What's the next thing?", "partial update should preserve next action");
  assert.equal(updated.blocked_reason, "CTU still needs to confirm PO number.");
  assert.equal(updated.resume_note, "Follow up with Alex, then send the draft.");
  assert.equal(updated.resumeContext.blocked_reason, "CTU still needs to confirm PO number.");

  const read = (await tasksService.read(created.task_id, session)).task;
  assert.equal(read.next_action, updated.next_action);
  assert.equal(read.blocked_reason, updated.blocked_reason);
  assert.equal(read.resume_note, updated.resume_note);
}

async function assertTaskContextFeedsSafeSummaries(session) {
  const task = (await tasksService.create({
    title: "Context summary task",
    status: "blocked",
    next_action: "Ask finance for the signed agreement.",
    blocked_reason: "Agreement is not signed.",
    resume_note: "Draft response is saved in the description.",
    description: "Do not infer resume state from this long description.",
  }, session)).task;

  const listResult = await tasksService.list(session);
  const listed = listResult.tasks.find((item) => item.task_id === task.task_id);
  assert.equal(listed.next_action, "Ask finance for the signed agreement.");
  assert.equal(listed.resumeContext.active_candidate, true);

  const summary = await tasksService.summary(session);
  const assigned = summary.assignedToMe.find((item) => item.task_id === task.task_id);
  assert.equal(assigned.next_action, "Ask finance for the signed agreement.");
  assert.equal(assigned.blocked_reason, "Agreement is not signed.");
  assert.equal(assigned.resume_note, "Draft response is saved in the description.");

  const workbench = await workbenchService.listTaskWorkItems(session);
  const workItem = workbench.items.find((item) => item.task_id === task.task_id);
  assert.equal(workItem.next_action, "Ask finance for the signed agreement.");
  assert.equal(workItem.blocked_reason, "Agreement is not signed.");
  assert.equal(workItem.resume_note, "Draft response is saved in the description.");
  assert.equal(workItem.resumeContext.active_candidate, true);

  const searchDocument = await indexTaskRecord({
    workspaceId: session.workspace_id,
    recordId: task.task_id,
  });
  assert.equal(searchDocument.summary, "Ask finance for the signed agreement.");
  assert.match(searchDocument.body, /Agreement is not signed/);
  assert.match(searchDocument.body, /Draft response is saved/);
}

async function assertArchivedTasksAreNotActiveResumeCandidates(session) {
  const task = (await tasksService.create({
    title: "Archived resume context task",
    next_action: "Review the old closeout note.",
    resume_note: "Kept for historical review.",
  }, session)).task;
  const archived = (await tasksService.archive(task.task_id, session)).task;

  assert.equal(archived.status, "archived");
  assert.equal(archived.resumeContext.active_candidate, false);

  const read = (await tasksService.read(task.task_id, session)).task;
  assert.equal(read.next_action, "Review the old closeout note.");
  assert.equal(read.resume_note, "Kept for historical review.");
  assert.equal(read.resumeContext.active_candidate, false);
}

async function assertTaskViewDialogIncludesResumeFields() {
  const taskDialogScript = await fs.readFile(new URL("../public/js/task-dialog.js", import.meta.url), "utf8");

  assert.match(taskDialogScript, /data-task-next-action/, "Tasks dialog must include the next action field");
  assert.match(taskDialogScript, /data-task-blocked-reason/, "Tasks dialog must include the blocked reason field");
  assert.match(taskDialogScript, /data-task-resume-note/, "Tasks dialog must include the resume note field");
  assert.match(taskDialogScript, /data-task-metadata-ribbon/, "Tasks dialog must include the metadata ribbon");
  assert.match(taskDialogScript, /label: "TTC"/, "Tasks dialog must keep completed duration visible as a TTC metadata chip");
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
