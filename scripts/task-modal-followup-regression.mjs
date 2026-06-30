import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const taskDialogScript = readText("public/js/task-dialog.js");
const stylesheet = readText("public/css/longtail-forge.css");
const tasksModule = readText("src/modules/tasks/module.js");
const currentTasksVersion = "0.33.5.19.6";

assert.match(taskDialogScript, /icons\.decorateButton\(fields\.notificationToggle, \{ icon: "bell", label: "Follow task notifications", text: "", title: "Follow task notifications", iconOnly: true \}\)/, "Notification settings should render as a bell-only follow toggle when icons are available");
assert.match(taskDialogScript, /icons\.decorateButton\(fields\.tagToggle, \{ icon: "tag", label: "Task tags", text: "Tags", title: "Task tags", iconOnly: false \}\)/, "Tags footer action should include visible text");
assert.match(taskDialogScript, /icons\.decorateButton\(fields\.fileToggle, \{ icon: "file", label: "Task files", text: "Files", title: "Task files", iconOnly: false \}\)/, "Files footer action should include visible text");
assert.match(taskDialogScript, /icons\.decorateButton\(fields\.copyLink, \{ icon: "copy", label: "Copy task link", text: "Copy Link", title: "Copy task link", iconOnly: false \}\)/, "Copy Link should include visible text");
assert.match(taskDialogScript, /icons\.decorateButton\(fields\.cancel, \{ icon: "close", label: "Cancel", text: "", title: "Cancel", iconOnly: true \}\)/, "Cancel should be icon-only");
assert.match(taskDialogScript, /icons\.decorateButton\(fields\.save, \{ icon: "save", label: "Save task", text: "", title: "Save task", iconOnly: true \}\)/, "Save Task should be icon-only");
assert.match(taskDialogScript, /notificationToggle\.dataset\.taskNotificationToggle = ""[\s\S]*notificationToggle\.hidden = true[\s\S]*notificationToggle\.setAttribute\("aria-pressed", "false"\)/, "Task notification bell should be the direct follow toggle");
assert.match(taskDialogScript, /fields\.notificationToggle\?\.addEventListener\("click", toggleTaskNotificationFollow\)/, "Task notification bell should follow or unfollow directly");
assert.match(taskDialogScript, /fields\.notificationToggle\.classList\.toggle\("is-following", isFollowing\)/, "Task notification bell should expose a following state class");
assert.match(taskDialogScript, /namespace\.notificationSubscriptions\.follow\(target\)/, "Task notification bell should follow the task directly");
assert.match(taskDialogScript, /namespace\.notificationSubscriptions\.unfollow\(target\)/, "Task notification bell should unfollow the task directly");
assert.doesNotMatch(taskDialogScript, /task-notification-popover|data-task-notification-field|data-task-notification-follow|data-task-notification-status|toggleTaskNotificationPanel/, "Fallback task dialog markup and controller should not reintroduce the notification popover");

assert.match(taskDialogScript, /const completionSeconds = hasCompletedTaskMetrics\(task\)/, "TTC should only appear when saved completion metrics are available");
assert.match(taskDialogScript, /task\?\.status === "complete"/, "TTC should require the saved task status to be complete");
assert.match(taskDialogScript, /task\?\.completed_at \|\| task\?\.completionMetrics\?\.completed_at/, "TTC should require persisted completion metadata");
assert.match(taskDialogScript, /completionSeconds !== null && completionSeconds !== undefined && Number\.isFinite\(Number\(completionSeconds\)\)/, "TTC should not render when completion seconds are null");
assert.doesNotMatch(taskDialogScript, /fields\.status\?\.value === "archived"[\s\S]*label: "TTC"/, "Archived status should not produce a TTC chip");
assert.match(taskDialogScript, /fields\.checklistField\.open = items\.length > 0/, "Checklist should open only when checklist items exist");
assert.doesNotMatch(taskDialogScript, /fields\.assignees\.closest\("details"\)\.open = selectedIds\.size > 0/, "Task Details should not collapse just because a task is unassigned");
assert.match(taskDialogScript, /function openTaskTagsDialog\(\)[\s\S]*showTaskModal\(tagsDialog, \{ parent: dialog, trigger: fields\.tagToggle \}\)/, "Tags footer button should open a stacked child dialog");
assert.match(taskDialogScript, /function openTaskFilesDialog\(\)[\s\S]*showTaskModal\(filesDialog, \{ parent: dialog, trigger: fields\.fileToggle \}\)/, "Files footer button should open a stacked child dialog");

assert.match(taskDialogScript, /taskEditorLabel\(view, "Resume note", taskEditorTextarea\(view, \{[\s\S]*rows: "2",[\s\S]*"data-task-resume-note": "",[\s\S]*placeholder: "Where did you leave off\?"/, "Resume Note should remain a textarea");
assert.match(taskDialogScript, /taskEditorLabel\(view, "Next action", taskEditorTextarea\(view, \{[\s\S]*rows: "2",[\s\S]*maxlength: "240",[\s\S]*"data-task-next-action": ""/, "Next Action should be a two-line textarea");
assert.match(taskDialogScript, /taskEditorLabel\(view, "Blocked reason", taskEditorTextarea\(view, \{[\s\S]*rows: "1",[\s\S]*"data-task-blocked-reason": ""/, "Blocked Reason should be one line tall");
assert.match(taskDialogScript, /function taskEditorChecklistSection\(view\) \{[\s\S]*className: \["task-checklist-field", "surface-modal-group"\],[\s\S]*attrs: \{ "data-task-checklist-field": "" \}/, "Checklist should not start open in fallback markup");
assert.doesNotMatch(taskDialogScript, /function taskEditorChecklistSection\(view\) \{[\s\S]*attrs: \{ "data-task-checklist-field": "", open: true \}/, "Checklist should not start open in fallback markup");
assert.match(taskDialogScript, /Task Details[\s\S]*data-task-assignees[\s\S]*data-task-blocked-reason/, "Assignees should live inside Task Details before the final Blocked Reason field");
assert.doesNotMatch(taskDialogScript, /data-task-assignment-schedule-panel|Assignment and Scheduling/, "Assignment should not have a separate modal section");
assert.doesNotMatch(taskDialogScript, /<h3>Task Tags<\/h3>|<h3>Task Files<\/h3>/, "Tags and Files footer panels should not add boxed headings in the modal");

assert.match(stylesheet, /\.task-resume-note-field textarea,[\s\S]*\.task-next-action-field textarea \{[\s\S]*min-height: 54px;/, "Resume Note and Next Action should share a compact two-line height");
assert.match(stylesheet, /\.task-blocked-reason-field textarea \{[\s\S]*min-height: 40px;/, "Blocked Reason should use a compact one-line height");
assert.doesNotMatch(stylesheet, /\.task-footer-panel \{[\s\S]*background: transparent;/, "Tags and Files should not rely on parent-body footer panel styling");
assert.match(stylesheet, /\[data-task-notification-toggle\]\.is-following,[\s\S]*\[data-note-notification-toggle\]\.is-following \{[\s\S]*color: var\(--color-danger\);/, "Followed task and note notification bells should be red");

assert.match(tasksModule, new RegExp(`version: "${escapeRegExp(currentTasksVersion)}"`), "Tasks module version should match the current Tasks release");

console.log("Task modal follow-up regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
