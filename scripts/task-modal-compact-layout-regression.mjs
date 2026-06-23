import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const tasksView = readText("views/protected/tasks.html");
const taskDialogScript = readText("public/js/task-dialog.js");
const stylesheet = readText("public/css/longtail-forge.css");
const tasksModule = readText("src/modules/tasks/module.js");
const currentTasksVersion = "0.33.5.18.8.4";

assert.match(taskDialogScript, /class="task-dialog-heading"/, "Task modal should use a compact heading row");
assert.match(taskDialogScript, /data-task-notification-toggle hidden aria-pressed="false"/, "Task notification settings should be a direct accessible bell toggle");
assert.doesNotMatch(taskDialogScript, /task-notification-popover|data-task-notification-field|<legend>Notifications<\/legend>/, "Task notification settings should not appear as a popover or separate in-body box");
assert.match(taskDialogScript, /class="task-metadata-ribbon[^"]*" data-task-metadata-ribbon aria-label="Task summary"/, "Task modal should expose a metadata ribbon after the title field");
assert.doesNotMatch(taskDialogScript, /data-task-completion-field/, "Task modal should not keep a separate Time to Completion block");
assert.match(tasksView, /<script src="js\/task-dialog\.js\?v=10"><\/script>/, "Task dialog cache bust should advance");
assert.match(tasksView, /<link rel="stylesheet" href="css\/longtail-forge\.css\?v=60">/, "Shared stylesheet cache bust should advance");

assert.match(taskDialogScript, /notificationToggle: dialog\.querySelector\("\[data-task-notification-toggle\]"\)/, "Task dialog should bind the notification bell toggle");
assert.match(taskDialogScript, /toggleTaskNotificationFollow/, "Task dialog should follow or unfollow from the bell");
assert.doesNotMatch(taskDialogScript, /toggleTaskNotificationPanel/, "Task dialog should not open a notification popover");
assert.match(taskDialogScript, /icons\.decorateButton\(fields\.notificationToggle, \{ icon: "bell"/, "Notification toggle should be decorated as a bell icon button");
assert.match(taskDialogScript, /function writeTaskMetadataRibbon/, "Task dialog should render the metadata ribbon from current field values");
assert.match(taskDialogScript, /label: "TTC"/, "Completed task duration should appear as a TTC chip");
assert.match(taskDialogScript, /formatDaysDuration\(Number\(completionSeconds\)\)/, "TTC chip should use days:hours:minutes:seconds formatting");
assert.match(taskDialogScript, /hasCompletedTaskMetrics\(task\)/, "TTC should be limited to saved completed tasks");
assert.match(taskDialogScript, /node\.tabIndex = 0/, "Metadata chips should be keyboard focusable");
assert.match(taskDialogScript, /taskDialogMarkup\(\)/, "Fallback task dialog markup should remain present");
assert.match(taskDialogScript, /data-task-metadata-ribbon/, "Fallback task dialog markup should include the metadata ribbon");

assert.match(stylesheet, /\.task-form \{[\s\S]*position: relative;[\s\S]*display: grid;[\s\S]*gap: 12px;/, "Task modal spacing should be tightened");
assert.match(stylesheet, /\.task-dialog-heading \{[\s\S]*justify-content: space-between;/, "Task modal heading should align the bell to the right");
assert.match(stylesheet, /\.task-metadata-ribbon \{[\s\S]*flex-wrap: wrap;/, "Task metadata ribbon should wrap safely");
assert.match(stylesheet, /\.task-metadata-chip \{[\s\S]*overflow-wrap: anywhere;/, "Task metadata chips should avoid text overflow");

assert.match(tasksModule, new RegExp(`version: "${escapeRegExp(currentTasksVersion)}"`), "Tasks module version should match the current Tasks release");

console.log("Task modal compact layout regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
