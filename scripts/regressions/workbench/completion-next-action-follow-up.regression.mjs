export const regressionMeta = Object.freeze({
  id: "workbench.completion-next-action-follow-up",
  area: "workbench",
  tier: "focused",
  tags: ["completion", "permissions", "recurrence", "tasks", "workbench"],
  description: "Proves Task completion hands off to the canonical Next Action field and saved follow-ups become distinct permission-safe Workbench candidates without reviving completed Tasks.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-completion-next-action-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "completion-next-action.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "Completion-Next-Action-Test-123!";

const [taskDialogSource, tasksBrowserSource, tasksIntegrationSource, tasksServiceSource, workbenchSource] = await Promise.all([
  readText("public/js/task-dialog.js"),
  readText("public/js/tasks.js"),
  readText("src/modules/tasks/module.integrations.js"),
  readText("src/modules/tasks/tasks.service.js"),
  readText("public/js/workbench.js"),
]);

const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../../../src/db/index.js");
const { tasksService } = await import("../../../src/modules/tasks/tasks.service.js");
const { workCandidateService } = await import("../../../src/services/work-candidate.service.js");

try {
  assertStaticHandoffContract();
  await initializeDatabase();
  const session = await readSeedSession();
  const noRoleSession = await createNoRoleSession(session.workspace_id);

  const blankTask = (await tasksService.create({ title: "Completion with no follow-up" }, session)).task;
  await tasksService.complete(blankTask.task_id, session);

  const savedTask = (await tasksService.create({ title: "Completion with a saved follow-up" }, session)).task;
  await tasksService.complete(savedTask.task_id, session);
  await tasksService.update(savedTask.task_id, {
    next_action: "Send the completed-work summary.",
  }, session);

  const recurringTask = (await tasksService.create({
    due_date: "2026-07-22",
    next_action: "Review the next recurring occurrence.",
    recurrence: {
      enabled: true,
      endDate: "2026-07-25",
      frequency: "DAILY",
      interval: 1,
    },
    title: "Recurring completion follow-up",
  }, session)).task;
  const recurringCompletion = await tasksService.complete(recurringTask.task_id, session);
  assert.equal(recurringCompletion.task.status, "complete");
  assert.equal(recurringCompletion.recurrenceJob?.queued, true, "completion follow-up capture must preserve recurrence queueing");
  assert.ok(recurringCompletion.recurrenceContinuity, "completion follow-up capture must preserve safe recurrence continuity");

  const workbenchItems = await tasksService.listWorkbenchItems(session);
  const savedFollowUp = workbenchItems.items.find((item) => item.task_id === savedTask.task_id);
  assert.ok(savedFollowUp, "a saved completion Next Action should enter the Tasks-owned Workbench source");
  assert.equal(savedFollowUp.source_type, "task_completion_follow_up");
  assert.equal(savedFollowUp.title, "Send the completed-work summary.");
  assert.equal(savedFollowUp.status, "open", "the follow-up should be actionable without changing the completed Task status");
  assert.equal(savedFollowUp.primary_action?.id, "tasks.edit");
  assert.equal(savedFollowUp.primary_action?.params?.focusTarget, "next_action");
  assert.equal(
    workbenchItems.items.some((item) => item.task_id === blankTask.task_id),
    false,
    "blank dismissal must leave completion intact without manufacturing a Workbench item",
  );

  const candidates = await workCandidateService.listWorkCandidates(session, {
    includeTaskCandidates: true,
    limit: 100,
  });
  const candidate = candidates.items.find((item) => item.recordId === savedTask.task_id);
  assert.ok(candidate, "the saved follow-up should become a normalized Workbench candidate");
  assert.equal(candidate.recordType, "task_completion_follow_up");
  assert.equal(candidate.title, "Send the completed-work summary.");
  assert.equal(candidate.primaryAction?.type, "module-action");
  assert.equal(candidate.primaryAction?.id, "tasks.edit");
  assert.equal(candidate.primaryAction?.params?.focusTarget, "next_action");
  assert.equal(
    candidates.items.some((item) => item.recordId === savedTask.task_id && item.recordType === "task"),
    false,
    "a completed Task with a follow-up must not reappear as an ordinary Task Focus candidate",
  );

  const restrictedItems = await tasksService.listWorkbenchItems(noRoleSession);
  assert.equal(restrictedItems.items.length, 0, "Tasks must prune completion follow-ups before shaping them for an unreadable session");
  const restrictedCandidates = await workCandidateService.listWorkCandidates(noRoleSession, {
    includeTaskCandidates: true,
    limit: 100,
  });
  assert.equal(restrictedCandidates.items.length, 0, "Workbench must not recover a follow-up after its Tasks source permission is removed");

  await tasksService.update(savedTask.task_id, { next_action: "" }, session);
  const clearedItems = await tasksService.listWorkbenchItems(session);
  assert.equal(
    clearedItems.items.some((item) => item.task_id === savedTask.task_id),
    false,
    "clearing the Tasks-owned Next Action should retire its follow-up candidate",
  );

  const integrity = await querySql("PRAGMA integrity_check;");
  assert.equal(integrity[0]?.integrity_check, "ok");
  console.log("Completion Next Action follow-up regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { force: true, recursive: true });
}

function assertStaticHandoffContract() {
  assert.match(taskDialogSource, /next_action: "next_action"/, "the canonical editor should accept the Next Action focus target");
  assert.match(
    functionBody(taskDialogSource, "focusTaskEditorTarget"),
    /next_action: fields\.nextAction/,
    "the canonical focus contract should target the real Next Action control",
  );
  assert.match(
    functionBody(taskDialogSource, "offerCompletionNextAction"),
    /focusTaskEditorTarget\("next_action"\)/,
    "in-editor completion should remain in the canonical editor and focus Next Action",
  );
  assert.doesNotMatch(
    functionBody(taskDialogSource, "saveAndCompleteTask"),
    /closeTaskModal/,
    "the Complete footer action must not close before optional follow-up capture",
  );
  assert.match(
    taskDialogSource,
    /if \(pendingTaskCompletionDetail\) \{[\s\S]*hostContext\?\.complete\?\.\(pendingTaskCompletionDetail\)[\s\S]*closeTaskModal\(dialog, "cancel"\)/,
    "closing without a follow-up should settle the originating completion while leaving the persisted completion intact",
  );
  assert.match(
    functionBody(tasksBrowserSource, "postTaskAction"),
    /action === "complete"[\s\S]*openTaskDialog\(result\.task,[\s\S]*focusTarget: "next_action"/,
    "Tasks-page completion should reopen the canonical editor at Next Action",
  );
  assert.match(
    functionBody(workbenchSource, "completeFocusedTask"),
    /recordType: "task_completion_follow_up"[\s\S]*focusTarget: "next_action"/,
    "Workbench completion should hand off to the canonical editor before returning to Focus Selection",
  );
  assert.match(
    functionBody(workbenchSource, "candidateModuleAction"),
    /primaryAction\.type === "module-action"[\s\S]*actionId: primaryAction\.id/,
    "Workbench should dispatch the Tasks-owned follow-up opener through the stable module-action contract",
  );
  assert.match(tasksIntegrationSource, /sourceType: "task_completion_follow_up"/, "Tasks should declare the distinct follow-up source type");
  assert.match(tasksServiceSource, /function taskCompletionFollowUpWorkItemSummary\(task\)/, "Tasks should own follow-up shaping");
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

async function createNoRoleSession(workspaceId) {
  const userId = randomUUID();
  const now = new Date().toISOString();
  const username = `completion-follow-up-${userId}@example.test`;

  await runSql(`
INSERT INTO users (
  user_id, home_workspace_id, username, display_name, password,
  user_status, protected_user, active_workspace_id
)
VALUES (
  ${sqlText(userId)}, ${sqlText(workspaceId)}, ${sqlText(username)},
  'Completion Follow-up No Role', 'unused', 'active', 'no', ${sqlText(workspaceId)}
);

INSERT INTO user_workspaces (
  user_workspace_id, user_id, workspace_id, status, created_at, updated_at
)
VALUES (
  ${sqlText(randomUUID())}, ${sqlText(userId)}, ${sqlText(workspaceId)},
  'active', ${sqlText(now)}, ${sqlText(now)}
);
`);

  return {
    home_workspace_id: workspaceId,
    ip: "127.0.0.1",
    timezone: "America/New_York",
    user_id: userId,
    username,
    workspace_id: workspaceId,
  };
}

async function readText(relativePath) {
  return fs.readFile(path.join(root, relativePath), "utf8");
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
