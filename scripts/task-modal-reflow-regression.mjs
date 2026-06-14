import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const tasksView = readText("views/protected/tasks.html");
const taskDialogScript = readText("public/js/task-dialog.js");
const stylesheet = readText("public/css/longtail-forge.css");
const iconsScript = readText("public/js/shared/icons.js");
const tasksModule = readText("src/modules/tasks/module.js");

assert.match(tasksView, /<details class="task-details-field[^"]*" data-task-details-panel open>/, "Task Details should be a collapsible panel in the page dialog");
assert.match(tasksView, /class="task-parent-field"[\s\S]*Parent Task[\s\S]*data-task-parent-task/, "Parent Task should live inside Task Details");
assert.match(tasksView, /data-task-parent-task[\s\S]*data-task-form-status[\s\S]*data-task-priority[\s\S]*data-task-client[\s\S]*data-task-project[\s\S]*data-task-due-date[\s\S]*data-task-due-time/, "Task Details field order should match the two-column reflow contract");
assert.match(tasksView, /class="task-resume-note-field"[\s\S]*class="task-next-action-field"/, "Resume Note should appear beside/before Next Action below Task Details");
assert.match(tasksView, /<details class="task-checklist-field[^"]*" data-task-checklist-field>/, "Checklist should be collapsible");
assert.match(tasksView, /<details class="task-assignee-field[^"]*" data-task-assignee-panel>/, "Assignees should be collapsible");
assert.match(tasksView, /<details class="task-recurrence-field[^"]*" data-task-recurrence-panel>/, "Recurrence should remain collapsed by default");
assert.match(tasksView, /<details class="task-reminder-field[^"]*" data-task-reminder-details>/, "Reminders should remain collapsed by default");
assert.match(tasksView, /data-task-tags-toggle[\s\S]*data-task-files-toggle[\s\S]*data-copy-task-link/, "Tags and Files should move to footer actions before utility/save controls");
assert.match(tasksView, /data-task-tags-panel hidden[\s\S]*data-task-files-panel hidden/, "Tags and Files pickers should mount in hidden footer panels");
assert.match(tasksView, /css\/longtail-forge\.css\?v=21/, "Task reflow should cache-bust shared CSS");
assert.match(tasksView, /js\/shared\/icons\.js\?v=3/, "Task reflow should cache-bust shared icons");
assert.match(tasksView, /js\/task-dialog\.js\?v=10/, "Task reflow should cache-bust Task dialog JS");

assert.match(taskDialogScript, /fields\.taskDetailsPanel\.open = !task \|\| isDuplicate/, "Task Details should open for Add/Duplicate and collapse for Edit");
assert.match(taskDialogScript, /writeParentTaskFields/, "Task dialog should populate Parent Task options");
assert.match(taskDialogScript, /readCurrentParentTaskId/, "Task dialog should read current parent relationship state");
assert.match(taskDialogScript, /syncParentTaskRelationship/, "Task dialog should sync parent relationship on save");
assert.match(taskDialogScript, /\/api\/tasks\/\$\{encodeURIComponent\(nextParentTaskId\)\}\/children/, "Task dialog should use the Tasks relationship API to add a parent");
assert.match(taskDialogScript, /toggleTaskFooterPanel/, "Task dialog should toggle Tags and Files footer panels");
assert.match(taskDialogScript, /icons\.decorateButton\(fields\.tagToggle, \{ icon: "tag"/, "Tags footer action should use a recognizable tag icon");
assert.match(taskDialogScript, /icons\.decorateButton\(fields\.fileToggle, \{ icon: "file"/, "Files footer action should use a recognizable file icon");
assert.match(taskDialogScript, /taskDialogMarkup\(\)/, "Fallback task dialog markup should remain present");
assert.match(taskDialogScript, /data-task-details-panel/, "Fallback task dialog should include Task Details");
assert.match(taskDialogScript, /data-task-tags-toggle/, "Fallback task dialog should include Tags footer action");

assert.match(stylesheet, /\.task-details-grid \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/, "Task Details should use the compact two-column grid");
assert.match(stylesheet, /\.task-parent-field \{[\s\S]*grid-column: 1 \/ -1;/, "Parent Task should span both Task Details columns");
assert.match(stylesheet, /\.task-footer-panel \{[\s\S]*grid-column: 1 \/ -1;/, "Tags and Files panels should be full-width below the main sections");

assert.match(iconsScript, /tag: Object\.freeze/, "Shared icons should include a tag icon");
assert.match(iconsScript, /file: Object\.freeze/, "Shared icons should include a file icon");
assert.match(tasksModule, /version: "0\.33\.5\.13\.6"/, "Tasks module version should match the modal reflow release");

console.log("Task modal reflow regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}
