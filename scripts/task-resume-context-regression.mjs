import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-task-resume-context-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-task-resume-context.db");
process.env.SUPER_ADMIN_PASSWORD = "Task-Resume-Context-Test-Password-123!";

const { closeSqlite, initializeDatabase, querySql } = await import("../src/db/index.js");
const { indexTaskRecord } = await import("../src/modules/tasks/search-indexers.js");
const { tasksService } = await import("../src/modules/tasks/tasks.service.js");

try {
  await initializeDatabase();
  const session = await readSeedSession();

  await assertTaskContextFieldsSurviveCreateUpdateRead(session);
  await assertTaskContextFeedsSafeSummaries(session);
  await assertArchivedTasksAreNotActiveResumeCandidates(session);
  await assertTaskViewDialogIncludesResumeFields();
  await assertResumeNoteCaptureBrowserContract();

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

  const workbench = await tasksService.listWorkbenchItems(session);
  const workItem = workbench.items.find((item) => item.task_id === task.task_id);
  assert.equal(workItem.next_action, "Ask finance for the signed agreement.");
  assert.equal(workItem.blocked_reason, "Agreement is not signed.");
  assert.equal(workItem.resume_note, "Draft response is saved in the description.");
  assert.equal(workItem.resume_context.active_candidate, true);
  assert.equal(workItem.resumeContext, undefined, "work items emit resume_context once");

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

async function assertResumeNoteCaptureBrowserContract() {
  const [captureScript, taskDialogScript, tasksScript, workbenchScript] = await Promise.all([
    fs.readFile(new URL("../public/js/task-resume-note-capture.js", import.meta.url), "utf8"),
    fs.readFile(new URL("../public/js/task-dialog.js", import.meta.url), "utf8"),
    fs.readFile(new URL("../public/js/tasks.js", import.meta.url), "utf8"),
    fs.readFile(new URL("../public/js/workbench.js", import.meta.url), "utf8"),
  ]);
  const promptCalls = [];
  const reads = [];
  const writes = [];
  const tasks = new Map([
    ["task-yes", { task_id: "task-yes", resume_note: "" }],
    ["task-no", { task_id: "task-no", resume_note: "" }],
    ["task-existing", { task_id: "task-existing", resume_note: "Context already saved." }],
  ]);
  const promptResults = [
    { confirmed: true, value: "Continue with the reconciled totals." },
    { confirmed: false, value: "" },
  ];
  const browserWindow = {
    LongtailForge: {
      api: {
        async getJson(url) {
          reads.push(url);
          const taskId = decodeURIComponent(url.split("/").at(-1));
          return { task: { ...tasks.get(taskId) } };
        },
        async putJson(url, payload) {
          writes.push({ payload, url });
          const taskId = decodeURIComponent(url.split("/").at(-1));
          const task = { ...tasks.get(taskId), ...payload };
          tasks.set(taskId, task);
          return { task };
        },
      },
      capturePrompt: {
        async open(options) {
          promptCalls.push(options);
          return promptResults.shift();
        },
      },
    },
  };
  vm.runInNewContext(captureScript, { window: browserWindow });

  const capture = browserWindow.LongtailForge.taskResumeNoteCapture;
  const yesResult = await capture.offer({ task: { task_id: "task-yes", resume_note: "" } });
  assert.equal(yesResult.captured, true, "Yes should capture a resume note");
  assert.equal(writes.length, 1, "Yes should make one Tasks write");
  assert.equal(writes[0].url, "/api/tasks/task-yes", "Yes should write to the correct task");
  assert.equal(JSON.stringify(writes[0].payload), JSON.stringify({
    resume_note: "Continue with the reconciled totals.",
  }), "Yes should write only resume_note through the Tasks route");
  assert.equal(promptCalls[0].prompt, "Add resume note?");
  assert.equal(promptCalls[0].multiline, false, "resume capture should use one single-line entry");
  assert.equal(promptCalls[0].confirmLabel, "Yes");
  assert.equal(promptCalls[0].cancelLabel, "No");

  const repeatedResult = await capture.offer({ task: { task_id: "task-yes", resume_note: "" } });
  assert.equal(repeatedResult.reason, "suppressed", "a just-entered note should suppress another prompt");
  assert.equal(promptCalls.length, 1);

  const existingResult = await capture.offer({ task: tasks.get("task-existing") });
  assert.equal(existingResult.reason, "suppressed", "an existing resume note should suppress capture before another read");
  assert.equal(promptCalls.length, 1);

  const noResult = await capture.offer({ task: { task_id: "task-no", resume_note: "" } });
  assert.equal(noResult.reason, "dismissed", "No should dismiss cleanly");
  assert.equal(writes.length, 1, "No should have no write side effect");
  assert.deepEqual(reads, ["/api/tasks/task-yes", "/api/tasks/task-no"]);

  assert.match(taskDialogScript, /timerStatus === "paused"[\s\S]*offerTaskResumeNote\(result\.task \|\| task\)/, "Task dialog Pause should offer resume capture after the timer mutation");
  assert.match(taskDialogScript, /timer\/finalize[\s\S]*offerTaskResumeNote\(result\.task \|\| task/, "Task dialog finalize should offer resume capture");
  assert.match(tasksScript, /if \(!isRunning\) \{[\s\S]*taskResumeNoteCapture\?\.offer/, "Tasks list Pause should offer resume capture");
  assert.match(workbenchScript, /function changeFocus\([\s\S]*currentTaskFocusTimer\(active\)[\s\S]*offerTaskResumeNote\(active\?\.task[\s\S]*resetTaskFocusState\(\)/, "leaving Task Focus with an active or paused timer should offer capture without delaying the view transition");
  assert.match(workbenchScript, /function offerTaskResumeNote[\s\S]*void window\.LongtailForge\.taskResumeNoteCapture\?\.offer/, "Workbench should not await the capture prompt or block the underlying action");
  assert.match(workbenchScript, /saveFocusedTaskTimer[\s\S]*timerStatus === "paused"[\s\S]*offerTaskResumeNote/, "focused-task Pause should offer resume capture");
  assert.match(workbenchScript, /finalizeFocusedTaskTimer[\s\S]*timer\/finalize[\s\S]*offerTaskResumeNote/, "focused-task finalize should offer resume capture");
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
