import assert from "node:assert/strict";

import { createProjectTextReader } from "../../test-support/source-scan.mjs";
// Consolidated under tasks.current-static-contracts by 0.33.33.10.
const { readText } = createProjectTextReader();

const tasksView = readText("views/protected/tasks.html");
const taskDialogScript = readText("public/js/task-dialog.js");
const stylesheet = readText("public/css/longtail-forge.css");
const tasksModule = readText("src/modules/tasks/module.js");
assert.match(taskDialogScript, /className: "surface-modal-heading"/, "Task modal should use the shared compact modal heading row");
assert.doesNotMatch(taskDialogScript, /task-dialog-heading/, "Task modal should not keep a Task-only heading row class");
assert.match(taskDialogScript, /notificationToggle\.dataset\.taskNotificationToggle = ""[\s\S]*notificationToggle\.hidden = true[\s\S]*notificationToggle\.setAttribute\("aria-pressed", "false"\)/, "Task notification settings should be a direct accessible bell toggle");
assert.doesNotMatch(taskDialogScript, /task-notification-popover|data-task-notification-field|<legend>Notifications<\/legend>/, "Task notification settings should not appear as a popover or separate in-body box");
assert.match(taskDialogScript, /function taskEditorMetadataRibbon[\s\S]*className: \["task-metadata-ribbon", "view-detail-badges", "surface-chip-row"\][\s\S]*"data-task-metadata-ribbon"[\s\S]*"aria-label": "Task summary"/, "Task modal should expose a framework detail badge row after the title field");
assert.match(taskDialogScript, /taskEditorMetadataRibbon\(view\),[\s\S]*taskEditorContinuitySection\(view\),[\s\S]*taskEditorDetailsSection\(view\)/, "Task modal should place the always-visible continuity row between the metadata ribbon and collapsible details");
assert.match(taskDialogScript, /function taskEditorContinuitySection[\s\S]*"data-view-field-width": "full"[\s\S]*"data-task-continuity-row"/, "Task continuity should use the full-width modal field contract");
assert.doesNotMatch(taskDialogScript, /data-task-completion-field/, "Task modal should not keep a separate Time to Completion block");
assert.match(tasksView, /<script src="js\/task-dialog\.js"><\/script>/, "Task dialog cache bust should advance");
assert.match(tasksView, /<link rel="stylesheet" href="css\/longtail-forge\.css">/, "Shared stylesheet cache bust should advance");

assert.match(taskDialogScript, /notificationToggle: dialog\.querySelector\("\[data-task-notification-toggle\]"\)/, "Task dialog should bind the notification bell toggle");
assert.match(taskDialogScript, /toggleTaskNotificationFollow/, "Task dialog should follow or unfollow from the bell");
assert.doesNotMatch(taskDialogScript, /toggleTaskNotificationPanel/, "Task dialog should not open a notification popover");
assert.match(taskDialogScript, /icons\.decorateButton\(fields\.notificationToggle, \{ icon: "bell"/, "Notification toggle should be decorated as a bell icon button");
assert.match(taskDialogScript, /function writeTaskMetadataRibbon/, "Task dialog should render the metadata ribbon from current field values");
assert.match(taskDialogScript, /createDetailBadgeRow\(\{[\s\S]*ariaLabel:\s*"Task summary"[\s\S]*className:\s*"task-metadata-ribbon"[\s\S]*badges:\s*badges\.map\(createMetadataBadge\)/, "Task metadata ribbon should render through the framework detail badge helper");
assert.match(taskDialogScript, /label: "TTC"/, "Completed task duration should appear as a TTC chip");
assert.match(taskDialogScript, /formatDaysDuration\(Number\(completionSeconds\)\)/, "TTC chip should use days:hours:minutes:seconds formatting");
assert.match(taskDialogScript, /hasCompletedTaskMetrics\(task\)/, "TTC should be limited to saved completed tasks");
assert.match(taskDialogScript, /function createMetadataBadge[\s\S]*focusable:\s*true/, "Metadata badges should remain keyboard focusable");
assert.match(taskDialogScript, /function taskEditorFieldNodes\(\)/, "Task-owned editor field nodes should remain present");
assert.doesNotMatch(taskDialogScript, /function taskEditorFieldMarkup\(\)|taskTemplateElements|document\.createElement\("template"\)|innerHTML/, "Task editor fields should not use raw markup templates");
assert.match(taskDialogScript, /data-task-metadata-ribbon/, "Task-owned editor fields should include the metadata ribbon");

assert.match(stylesheet, /\.task-form \{[\s\S]*position: relative;[\s\S]*display: grid;[\s\S]*gap: 12px;/, "Task modal spacing should be tightened");
assert.match(stylesheet, /\.surface-modal-heading \{[\s\S]*justify-content: space-between;/, "Shared modal heading should align the secondary action to the right");
assert.match(stylesheet, /\.task-metadata-ribbon \{[\s\S]*flex-wrap: wrap;/, "Task metadata ribbon should wrap safely");
assert.match(stylesheet, /\.task-metadata-chip \{[\s\S]*overflow-wrap: anywhere;/, "Task metadata chips should avoid text overflow");
assert.match(stylesheet, /\.task-continuity-row\.is-blocked \{[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/, "Blocked continuity should use all three desktop columns");
assert.match(stylesheet, /@media \(max-width: 700px\) \{[\s\S]*\.task-details-grid,[\s\S]*\.task-continuity-row,[\s\S]*\.task-continuity-row\.is-blocked[\s\S]*grid-template-columns: 1fr;/, "Task details and both continuity states should stack on mobile");

assert.match(tasksModule, /version:\s*appVersion/, "Tasks module version should consume the canonical app version");

console.log("Task modal compact layout regression passed.");
