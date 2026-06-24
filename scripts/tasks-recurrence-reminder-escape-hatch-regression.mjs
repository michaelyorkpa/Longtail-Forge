import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const taskDialogScript = readText("public/js/task-dialog.js");
const tasksService = readText("src/modules/tasks/tasks.service.js");
const taskRemindersService = readText("src/modules/tasks/task-reminders.service.js");
const tasksModalShellRegression = readText("scripts/tasks-modal-shell-regression.mjs");
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.match(
  taskDialogScript,
  /function createTaskRecurrenceDialog\(\)[\s\S]*view\.createModalForm\(\{[\s\S]*className: "task-recurrence-dialog"[\s\S]*formClassName: "task-recurrence-form"[\s\S]*fields: taskRecurrenceFieldNodes\(\)[\s\S]*actions: taskRecurrenceActions\(descriptor\)/,
  "Task recurrence should keep task-owned fields inside a framework-owned child modal shell.",
);
assert.doesNotMatch(
  taskDialogScript,
  /<dialog class="task-recurrence-dialog"/,
  "Task recurrence should not reintroduce a second raw dialog shell.",
);
assert.match(
  taskDialogScript,
  /function ensureDialog\(\)[\s\S]*if \(!dialog \|\| !recurrenceDialog \|\| !tagsDialog \|\| !filesDialog\)[\s\S]*createTaskDialogElements\(\{[\s\S]*includeEditor: !dialog,[\s\S]*includeFiles: !filesDialog,[\s\S]*includeRecurrence: !recurrenceDialog,[\s\S]*includeTags: !tagsDialog,[\s\S]*\}\)/,
  "Task dialog setup should recreate only missing editor, recurrence, Tags, and Files modal shells.",
);
assert.match(
  taskDialogScript,
  /function openRecurrenceDialog\(\)[\s\S]*fields\.recurrence\.frequency\.value = recurrenceDraft\.frequency \|\| "WEEKLY";[\s\S]*fields\.recurrence\.interval\.value = String\(recurrenceDraft\.interval \|\| 1\);[\s\S]*fields\.recurrence\.endDate\.value = recurrenceDraft\.endDate \|\| "";[\s\S]*showTaskModal\(recurrenceDialog, \{ parent: dialog, trigger: fields\.recurrenceDetails \}\)/,
  "Opening recurrence should hydrate the task-owned draft fields and stack the recurrence child modal above the task editor.",
);
assert.match(
  taskDialogScript,
  /function saveRecurrenceDraft\(event\)[\s\S]*event\.preventDefault\(\);[\s\S]*frequency: fields\.recurrence\.frequency\.value \|\| "WEEKLY"[\s\S]*interval: readPositiveInteger\(fields\.recurrence\.interval, 1\)[\s\S]*endDate: fields\.recurrence\.endDate\.value \|\| ""[\s\S]*updateRecurrenceState\(\);[\s\S]*closeTaskModal\(recurrenceDialog, "saved"\)/,
  "Saving recurrence should preserve the existing task-owned draft semantics and close through the modal stack helper.",
);
assert.match(
  taskDialogScript,
  /function updateRecurrenceState\(\)[\s\S]*fields\.recurrenceDetails\.disabled = !fields\.recurring\.checked;[\s\S]*fields\.recurrenceSummary\.textContent = fields\.recurring\.checked[\s\S]*formatRecurrenceSummary\(recurrenceDraft\)[\s\S]*"Not recurring\."/,
  "Recurrence summary and details-button enablement should still be task-owned.",
);
assert.match(
  taskDialogScript,
  /function readRecurrencePayload\(\)[\s\S]*enabled: Boolean\(fields\.recurring\.checked\)[\s\S]*applyTo: "instance"[\s\S]*frequency: recurrenceDraft\.frequency \|\| "WEEKLY"[\s\S]*interval: recurrenceDraft\.interval \|\| 1[\s\S]*endDate: recurrenceDraft\.endDate \|\| ""/,
  "Task save payload should continue to include the recurrence payload shape expected by the Tasks service.",
);

assert.match(
  taskDialogScript,
  /function writeReminderFields\(details = \{\}\)[\s\S]*taskPolicy = normalizeReminderPolicy\(details\?\.taskPolicy \|\| details\?\.effectivePolicy\?\.offsets \|\| \{\}\)[\s\S]*effectivePolicy = normalizeReminderPolicy\(details\?\.effectivePolicy\?\.offsets \|\| \{\}\)[\s\S]*fields\.reminderOverride\.checked = Boolean\(details\?\.overrideEnabled\)[\s\S]*updateReminderOverrideState\(\)/,
  "Reminder overrides should still hydrate from task reminder details.",
);
assert.match(
  taskDialogScript,
  /function updateReminderOverrideState\(\)[\s\S]*fields\.reminderOverrideFields\.hidden = !fields\.reminderOverride\.checked;/,
  "Reminder override controls should remain task-owned inline behavior.",
);
assert.match(
  taskDialogScript,
  /function readTaskFormPayload\(\)[\s\S]*recurrence: readRecurrencePayload\(\)[\s\S]*reminderOverrideEnabled: fields\.reminderOverride\.checked[\s\S]*reminderPolicy: readReminderPolicy\(\)/,
  "Task save payload should continue to submit recurrence and reminder override data.",
);
assert.match(
  tasksService,
  /async function saveTaskReminderOverride\(workspaceId, taskId, payload = \{\}\)[\s\S]*hasReminderPayload[\s\S]*readReminderOverrideEnabled\(payload, \{\}\)[\s\S]*taskRemindersService\.saveTargetPolicy\(workspaceId, "task", taskId, policy, !overrideEnabled\)/,
  "Tasks service should continue to save task reminder overrides through the reminder service.",
);
assert.match(
  taskRemindersService,
  /async function readTaskReminderDetails\(task\)[\s\S]*overrideEnabled: Boolean\(task\.reminder_override_enabled\)[\s\S]*effectivePolicy[\s\S]*taskPolicy/,
  "Reminder details should continue to expose override, effective policy, and task policy data to the modal.",
);
assert.match(
  tasksModalShellRegression,
  /createTaskRecurrenceDialog[\s\S]*createModalForm/,
  "The shell regression should pin the recurrence child modal to the shared shell helper.",
);
assert.match(
  regressionSuite,
  /scripts\/tasks-recurrence-reminder-escape-hatch-regression\.mjs/,
  "The recurrence/reminder escape-hatch regression should run in the regression suite.",
);

console.log("Tasks recurrence/reminder escape-hatch regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}
