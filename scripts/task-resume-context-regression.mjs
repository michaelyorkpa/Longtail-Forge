import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { workspaceSessionFixture } from "./test-support/session-fixtures.mjs";

/** @typedef {import("../src/types/http-contracts.js").WorkspaceRequestSession} TaskResumeSession */
/** One task fixture the browser capture sandbox serves and mutates. */
/** @typedef {{ task_id?: string, resume_note?: string, status?: string, blocked_reason?: string }} CaptureTaskFixture */
/** What the capture prompt records about each call this owner asserts on. */
/** @typedef {{ cancelLabel?: string, confirmLabel?: string, multiline?: boolean, prompt?: string, task?: CaptureTaskFixture }} CapturePromptCall */
/** The capture helper writes only a resume note and its canonical action. */
/** @typedef {{ resume_note?: string, resume_note_action?: string }} CaptureWritePayload */
/** @typedef {{ payload: CaptureWritePayload, url: string }} CaptureWrite */
/** @typedef {{ captured?: boolean, consumed?: boolean, reason?: string, task?: CaptureTaskFixture }} CaptureResult */
/** @typedef {{ offer: (options: { task?: CaptureTaskFixture }) => Promise<CaptureResult>, consume: (options: { task?: CaptureTaskFixture }) => Promise<CaptureResult> }} TaskResumeNoteCapture */

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
  await assertResumeNoteFocusLifecycle(session);
  await assertTaskContextFeedsSafeSummaries(session);
  await assertArchivedTasksAreNotActiveResumeCandidates(session);
  await assertTaskViewDialogIncludesResumeFields();
  await assertResumeNoteCaptureBrowserContract();

  console.log("Task resume context regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

/** @param {TaskResumeSession} session */
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

/** @param {TaskResumeSession} session */
async function assertResumeNoteFocusLifecycle(session) {
  const openTask = (await tasksService.create({
    title: "Reusable resume-note task",
    resume_note: "Pick up with the pricing comparison.",
    status: "open",
  }, session)).task;

  const consumedOpenTask = (await tasksService.update(openTask.task_id, {
    blocked_reason: "This must not be applied.",
    priority: "urgent",
    resume_note_action: "consume",
    status: "blocked",
  }, session)).task;
  assert.equal(consumedOpenTask.resume_note, "", "focusing should consume the saved resume note");
  assert.equal(consumedOpenTask.status, "open", "consuming a resume note must preserve Open status");
  assert.equal(consumedOpenTask.blocked_reason, "", "consume must ignore unrelated lifecycle fields");
  assert.equal(consumedOpenTask.priority, openTask.priority, "consume must clear only the resume note");

  const capturedOpenTask = (await tasksService.update(openTask.task_id, {
    resume_note: "Continue with the vendor response.",
    resume_note_action: "capture",
  }, session)).task;
  assert.equal(capturedOpenTask.resume_note, "Continue with the vendor response.");
  assert.equal(capturedOpenTask.status, "in_progress", "capturing a nonblank resume note should move Open to In Progress");

  const consumedInProgressTask = (await tasksService.update(openTask.task_id, {
    resume_note_action: "consume",
  }, session)).task;
  assert.equal(consumedInProgressTask.resume_note, "");
  assert.equal(consumedInProgressTask.status, "in_progress", "consuming a note must not move In Progress back to Open");

  const blockedTask = (await tasksService.create({
    title: "Blocked resume-note task",
    status: "blocked",
    blocked_reason: "Waiting for a decision.",
  }, session)).task;
  await assert.rejects(
    () => tasksService.update(blockedTask.task_id, {
      resume_note: "Decision received; prepare the final draft.",
      resume_note_action: "capture",
    }, session),
    (error) => rejectionStatus(error) === 409 && /blocked tasks do not accept/i.test(rejectionMessage(error)),
    "a stale capture must not replace Blocked status or its reason",
  );
  const unchangedBlockedTask = (await tasksService.read(blockedTask.task_id, session)).task;
  assert.equal(unchangedBlockedTask.status, "blocked");
  assert.equal(unchangedBlockedTask.blocked_reason, "Waiting for a decision.");
  assert.equal(unchangedBlockedTask.resume_note, "");

  const completedTask = (await tasksService.create({
    title: "Terminal resume-note race task",
  }, session)).task;
  await tasksService.complete(completedTask.task_id, session);
  await assert.rejects(
    () => tasksService.update(completedTask.task_id, {
      resume_note: "Do not revive this task.",
      resume_note_action: "capture",
    }, session),
    (error) => rejectionStatus(error) === 409 && /only change while a task is active/i.test(rejectionMessage(error)),
    "a stale capture must not revive a completed task",
  );
}

/** @param {TaskResumeSession} session */
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
  assert.ok(listed, "the canonical Task list should retain the created Task");
  assert.ok(listed.resumeContext, "the canonical Task list should retain typed resume context");
  assert.equal(listed.next_action, "Ask finance for the signed agreement.");
  assert.equal(listed.resumeContext.active_candidate, true);

  const summary = await tasksService.summary(session);
  const assigned = summary.assignedToMe.find((item) => item.task_id === task.task_id);
  assert.ok(assigned, "the assigned-to-me summary should retain the created Task");
  assert.equal(assigned.next_action, "Ask finance for the signed agreement.");
  assert.equal(assigned.blocked_reason, "Agreement is not signed.");
  assert.equal(assigned.resume_note, "Draft response is saved in the description.");

  const workbench = await tasksService.listWorkbenchItems(session);
  const workItem = workbench.items.find((item) => item.task_id === task.task_id);
  assert.ok(workItem, "the workbench work-item list should retain the created Task");
  assert.equal(workItem.next_action, "Ask finance for the signed agreement.");
  assert.equal(workItem.blocked_reason, "Agreement is not signed.");
  assert.equal(workItem.resume_note, "Draft response is saved in the description.");
  assert.equal(workItem.resume_context.active_candidate, true);
  assert.equal(Object.hasOwn(workItem, "resumeContext"), false, "work items emit resume_context once");

  const searchDocument = await indexTaskRecord({
    workspaceId: session.workspace_id,
    recordId: task.task_id,
  });
  assert.ok(searchDocument && "summary" in searchDocument, "indexing one task should answer its search document");
  assert.equal(searchDocument.summary, "Ask finance for the signed agreement.");
  assert.match(searchDocument.body, /Agreement is not signed/);
  assert.match(searchDocument.body, /Draft response is saved/);
}

/** @param {TaskResumeSession} session */
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
  /** @type {CapturePromptCall[]} */
  const promptCalls = [];
  /** @type {string[]} */
  const reads = [];
  /** @type {CaptureWrite[]} */
  const writes = [];
  /** @type {Map<string, CaptureTaskFixture>} */
  const tasks = new Map([
    ["task-yes", { task_id: "task-yes", resume_note: "", status: "open" }],
    ["task-no", { task_id: "task-no", resume_note: "", status: "open" }],
    ["task-existing", { task_id: "task-existing", resume_note: "Context already saved.", status: "open" }],
    ["task-blocked", {
      blocked_reason: "Waiting for approval.",
      resume_note: "",
      status: "blocked",
      task_id: "task-blocked",
    }],
    ["task-blocked-note", {
      blocked_reason: "Waiting for approval.",
      resume_note: "",
      status: "open",
      task_id: "task-blocked-note",
    }],
  ]);
  const promptResults = [
    { confirmed: true, value: "Continue with the reconciled totals." },
    { confirmed: false, value: "" },
    { confirmed: false, value: "" },
  ];
  /** @type {{ LongtailForge: { api: { getJson: (url: string) => Promise<{ task: CaptureTaskFixture }>, putJson: (url: string, payload: CaptureWritePayload) => Promise<{ task: CaptureTaskFixture }> }, capturePrompt: { open: (options: CapturePromptCall) => Promise<{ confirmed: boolean, value: string } | undefined> }, taskResumeNoteCapture?: TaskResumeNoteCapture } }} */
  const browserWindow = {
    LongtailForge: {
      api: {
        async getJson(url) {
          reads.push(url);
          const taskId = taskIdFromUrl(url);
          return { task: { ...tasks.get(taskId) } };
        },
        async putJson(url, payload) {
          writes.push({ payload, url });
          const taskId = taskIdFromUrl(url);
          const task = payload.resume_note_action === "consume"
            ? { ...tasks.get(taskId), resume_note: "" }
            : payload.resume_note_action === "capture"
              ? { ...tasks.get(taskId), resume_note: payload.resume_note, status: "in_progress" }
              : { ...tasks.get(taskId), ...payload };
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
  assert.ok(capture, "the resume-note capture helper should install itself on the window namespace");
  const yesResult = await capture.offer({ task: { task_id: "task-yes", resume_note: "" } });
  assert.equal(yesResult.captured, true, "Yes should capture a resume note");
  assert.equal(writes.length, 1, "Yes should make one Tasks write");
  assert.equal(writes[0].url, "/api/tasks/task-yes", "Yes should write to the correct task");
  assert.equal(JSON.stringify(writes[0].payload), JSON.stringify({
    resume_note: "Continue with the reconciled totals.",
    resume_note_action: "capture",
  }), "Yes should write the note plus its canonical capture action through the Tasks route");
  assert.equal(promptCalls[0].prompt, "Add resume note?");
  assert.equal(promptCalls[0].multiline, false, "resume capture should use one single-line entry");
  assert.equal(promptCalls[0].confirmLabel, "Yes");
  assert.equal(promptCalls[0].cancelLabel, "No");

  const repeatedResult = await capture.offer({ task: { task_id: "task-yes", resume_note: "" } });
  assert.equal(repeatedResult.reason, "suppressed", "a just-entered note should suppress another prompt");
  assert.equal(promptCalls.length, 1);

  const existingFixture = tasks.get("task-existing");
  assert.ok(existingFixture, "the existing-note fixture should be seeded");
  const existingResult = await capture.offer({ task: existingFixture });
  assert.equal(existingResult.reason, "suppressed", "an existing resume note should suppress capture before another read");
  assert.equal(promptCalls.length, 1);

  const noResult = await capture.offer({ task: { task_id: "task-no", resume_note: "", status: "open" } });
  assert.equal(noResult.reason, "dismissed", "No should dismiss cleanly");
  assert.equal(writes.length, 1, "No should have no write side effect");
  assert.deepEqual(reads, ["/api/tasks/task-yes", "/api/tasks/task-no"]);

  const blockedFixture = tasks.get("task-blocked");
  assert.ok(blockedFixture, "the blocked-status fixture should be seeded");
  const blockedResult = await capture.offer({ task: blockedFixture });
  assert.equal(blockedResult.reason, "blocked-task", "Blocked status should suppress resume capture");
  const blockedNoteFixture = tasks.get("task-blocked-note");
  assert.ok(blockedNoteFixture, "the blocked-reason fixture should be seeded");
  const blockedNoteResult = await capture.offer({ task: blockedNoteFixture });
  assert.equal(blockedNoteResult.reason, "blocked-task", "a Blocked Reason should suppress resume capture");
  assert.equal(promptCalls.length, 2, "blocked context should not open the capture prompt");
  assert.deepEqual(reads, ["/api/tasks/task-yes", "/api/tasks/task-no"], "known blocked context should not need another read");
  assert.equal(writes.length, 1, "blocked context should not write a resume note");

  tasks.set("task-yes", {
    ...tasks.get("task-yes"),
    resume_note: "Continue with the reconciled totals.",
    status: "in_progress",
  });
  const consumedFixture = tasks.get("task-yes");
  assert.ok(consumedFixture, "the captured fixture should be seeded");
  const consumeResult = await capture.consume({ task: consumedFixture });
  assert.equal(consumeResult.consumed, true, "re-focusing should consume the prior resume note");
  assert.equal(JSON.stringify(writes.at(-1)), JSON.stringify({
    payload: { resume_note_action: "consume" },
    url: "/api/tasks/task-yes",
  }));

  const repeatedAfterConsume = await capture.offer({ task: {
    ...tasks.get("task-yes"),
    resume_note: "",
  } });
  assert.equal(repeatedAfterConsume.captured, false, "the next focus exit should be allowed to prompt again");
  assert.equal(repeatedAfterConsume.reason, "dismissed");
  assert.equal(promptCalls.length, 3, "consume should reset the per-task in-memory capture suppression");

  assert.match(taskDialogScript, /timerStatus === "paused"[\s\S]*offerTaskResumeNote\(result\.task \|\| task\)/, "Task dialog Pause should offer resume capture after the timer mutation");
  assert.match(taskDialogScript, /timer\/finalize[\s\S]*offerTaskResumeNote\(result\.task \|\| task/, "Task dialog finalize should offer resume capture");
  assert.match(tasksScript, /if \(!isRunning\) \{[\s\S]*taskResumeNoteCapture\?\.offer/, "Tasks list Pause should offer resume capture");
  assert.match(workbenchScript, /async function changeFocus\([\s\S]*navigationIntent\.request\([\s\S]*kind: "workbench-change-focus"[\s\S]*continue: continueChangeFocus/, "Change Focus should hold its exact state transition behind the shared exit intent");
  assert.match(workbenchScript, /function offerTaskResumeNoteBeforeExit[\s\S]*await window\.LongtailForge\.taskResumeNoteCapture\?\.offer/, "interceptable navigation should await resume capture before leaving Task Focus");
  assert.match(workbenchScript, /function offerTaskResumeNote[\s\S]*void window\.LongtailForge\.taskResumeNoteCapture\?\.offer/, "Workbench should not await the capture prompt or block the underlying action");
  assert.match(workbenchScript, /saveFocusedTaskTimer[\s\S]*timerStatus === "paused"[\s\S]*offerTaskResumeNote/, "focused-task Pause should offer resume capture");
  assert.match(workbenchScript, /finalizeFocusedTaskTimer[\s\S]*timer\/finalize[\s\S]*offerTaskResumeNote/, "focused-task finalize should offer resume capture");
}

/** @returns {Promise<TaskResumeSession>} */
async function readSeedSession() {
  const rows = await querySql(`
SELECT users.user_id, users.username, users.timezone, users.home_workspace_id, users.active_workspace_id
FROM users
WHERE users.protected_user = 'yes'
LIMIT 1;
`);
  const user = rows[0];

  assert.ok(user, "fresh database should seed a protected super admin");

  return workspaceSessionFixture(user);
}

/**
 * Read the task id a fixture route addresses.
 * @param {string} url
 * @returns {string}
 */
function taskIdFromUrl(url) {
  const segment = url.split("/").at(-1);
  assert.ok(segment, `fixture route should address a task: ${url}`);
  return decodeURIComponent(segment);
}

/**
 * Read a rejected service call's status without assuming the rejection really
 * is an error object first. A rejection without a numeric status resolves to
 * -1 so the predicate fails rather than passing vacuously.
 * @param {unknown} error
 * @returns {number}
 */
function rejectionStatus(error) {
  if (error === null || typeof error !== "object" || !("statusCode" in error)) return -1;
  const status = /** @type {{ statusCode: unknown }} */ (error).statusCode;
  return typeof status === "number" ? status : -1;
}

/**
 * Read a rejected service call's message as text without assuming a shape.
 * @param {unknown} error
 * @returns {string}
 */
function rejectionMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
