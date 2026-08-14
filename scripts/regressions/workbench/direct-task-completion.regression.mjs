export const regressionMeta = Object.freeze({
  id: "workbench.direct-task-completion",
  area: "workbench",
  tier: "focused",
  tags: ["completion", "recurrence", "tasks", "workbench"],
  description: "Proves Task completion closes directly, preserves recurrence continuity, and never promotes a completed Next Action into Workbench.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createProjectTextReader } from "../../test-support/source-scan.mjs";
import { workspaceSessionFixture } from "../../test-support/session-fixtures.mjs";
const { readTextAsync: readText } = createProjectTextReader();

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-direct-task-completion-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "direct-task-completion.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "Direct-Task-Completion-Test-123!";

const [
  taskDialogSource,
  tasksBrowserSource,
  tasksIntegrationSource,
  tasksServiceSource,
  workbenchSource,
  candidateServiceSource,
] = await Promise.all([
  readText("public/js/task-dialog.js"),
  readText("public/js/tasks.js"),
  readText("src/modules/tasks/module.integrations.js"),
  readText("src/modules/tasks/tasks.service.js"),
  readText("public/js/workbench.js"),
  readText("src/services/work-candidate.service.js"),
]);

const { closeSqlite, initializeDatabase, querySql } = await import("../../../src/db/index.js");
const { tasksService } = await import("../../../src/modules/tasks/tasks.service.js");
const { workCandidateService } = await import("../../../src/services/work-candidate.service.js");

try {
  assertStaticCompletionContract();
  await initializeDatabase();
  const session = await readSeedSession();

  const completedTask = (await tasksService.create({
    next_action: "Keep this context without creating more work.",
    title: "Direct completion with retained Next Action",
  }, session)).task;
  const completion = await tasksService.complete(completedTask.task_id, session);

  assert.equal(completion.task.status, "complete");
  assert.equal(
    completion.task.next_action,
    "Keep this context without creating more work.",
    "completion should preserve the ordinary Next Action field",
  );

  const recurringTask = (await tasksService.create({
    due_date: "2026-07-22",
    recurrence: {
      enabled: true,
      endDate: "2026-07-25",
      frequency: "DAILY",
      interval: 1,
    },
    title: "Recurring direct completion",
  }, session)).task;
  const recurringCompletion = await tasksService.complete(recurringTask.task_id, session);
  assert.equal(recurringCompletion.task.status, "complete");
  assert.equal(recurringCompletion.recurrenceJob?.queued, true, "direct completion must preserve recurrence queueing");
  assert.ok(recurringCompletion.recurrenceContinuity, "direct completion must preserve safe recurrence continuity");

  const workbenchItems = await tasksService.listWorkbenchItems(session);
  assert.equal(
    workbenchItems.items.some((item) => item.task_id === completedTask.task_id),
    false,
    "a completed Task must not re-enter Workbench because it retains a Next Action",
  );

  const candidates = await workCandidateService.listWorkCandidates(session, {
    includeTaskCandidates: true,
    limit: 100,
  });
  assert.equal(
    candidates.items.some((item) => item.recordId === completedTask.task_id),
    false,
    "the framework candidate service must not recover a completed Next Action as work",
  );

  const integrity = await querySql("PRAGMA integrity_check;");
  assert.equal(integrity[0]?.integrity_check, "ok");
  console.log("Direct Task completion regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { force: true, recursive: true });
}

function assertStaticCompletionContract() {
  const saveAndComplete = functionBody(taskDialogSource, "saveAndCompleteTask");
  const saveTaskForm = functionBody(taskDialogSource, "saveTaskForm");
  const changeState = functionBody(taskDialogSource, "taskFormChangeState");
  const formSnapshot = functionBody(taskDialogSource, "taskFormSnapshot");
  const tasksCompletion = functionBody(tasksBrowserSource, "postTaskAction");
  const workbenchCompletion = functionBody(workbenchSource, "completeFocusedTask");

  assert.match(
    saveAndComplete,
    /taskFormChangeState\(\)\.hasChanges[\s\S]*saveTaskForm\([\s\S]*api\.postJson\(`\/api\/tasks\/\$\{encodeURIComponent\(taskId\)\}\/complete`/,
    "editor completion should save only real pending form changes before the dedicated completion call",
  );
  assert.match(
    saveAndComplete,
    /notifyTaskEditorSaved\(result\)[\s\S]*hostContext\?\.complete\?\.\(taskCompletionHostDetail\(result\)\)[\s\S]*closeTaskModal\(dialog, "complete"\)/,
    "editor completion should refresh its host, report lifecycle detail, and close",
  );
  assert.doesNotMatch(taskDialogSource, /offerCompletionNextAction|pendingTaskCompletionDetail/);
  assert.doesNotMatch(saveAndComplete, /focusTaskEditorTarget\("next_action"\)/);

  assert.match(
    saveTaskForm,
    /editingTask\?\.recurrence_template_id && formChanges\.recurrenceTemplateChanged[\s\S]*title: "Update recurring task"/,
    "the recurrence scope question should require an actual template-backed form change",
  );
  assert.match(
    changeState,
    /snapshot\.all !== initialTaskFormSnapshot\.all[\s\S]*snapshot\.recurrenceTemplate !== initialTaskFormSnapshot\.recurrenceTemplate/,
    "dirty-state comparison should separate any pending edit from recurrence-template changes",
  );
  assert.match(
    functionBody(taskDialogSource, "readTaskFormPayload"),
    /next_action: fields\.nextAction\.value/,
    "Next Action should remain an ordinary editable Task field",
  );
  assert.doesNotMatch(
    formSnapshot.slice(formSnapshot.indexOf("const recurrenceTemplate")),
    /next_action|blocked_reason|resume_note|reminder|tagIds|parent_task_id/,
    "occurrence-only fields must not trigger the recurrence scope question",
  );

  assert.doesNotMatch(tasksCompletion, /openTaskDialog|next_action/);
  assert.match(tasksCompletion, /reloadTaskList\(\)[\s\S]*Task completed\./);
  assert.doesNotMatch(workbenchCompletion, /openTaskCandidate|task_completion_follow_up|next_action/);
  assert.match(
    workbenchCompletion,
    /resetTaskFocusState\(\);[\s\S]*refreshFocusCandidates\(\);[\s\S]*renderWorkbench\(\);[\s\S]*setTaskCompletionStatus\(completionDetail\)[\s\S]*focusActiveFocusQuestion\(\)/,
    "Task Focus completion should return directly to Focus Selection with completion feedback",
  );

  assert.doesNotMatch(tasksIntegrationSource, /task_completion_follow_up/);
  assert.doesNotMatch(tasksServiceSource, /taskCompletionFollowUp|task_completion_follow_up/);
  assert.doesNotMatch(candidateServiceSource, /TASK_COMPLETION_FOLLOW_UP|taskCompletionFollowUp/);
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

  return workspaceSessionFixture(user);
}

function functionBody(source, name) {
  const syncStart = source.indexOf(`function ${name}(`);
  const asyncStart = source.indexOf(`async function ${name}(`);
  const start = syncStart >= 0 ? syncStart : asyncStart;
  assert.notEqual(start, -1, `Missing function ${name}`);

  const signatureEnd = source.indexOf(") {", start);
  const openBrace = signatureEnd >= 0 ? signatureEnd + 2 : source.indexOf("{", start);
  let depth = 0;
  for (let index = openBrace; index < source.length; index += 1) {
    if (source[index] === "{") {
      depth += 1;
    } else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openBrace, index + 1);
      }
    }
  }

  throw new Error(`Could not parse function ${name}`);
}
