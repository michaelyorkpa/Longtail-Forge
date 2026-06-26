import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const styles = readText("public/css/longtail-forge.css");
const tasksView = readText("views/protected/tasks.html");
const taskDialogScript = readText("public/js/task-dialog.js");
const surfaceContract = readText("docs/ui-surface-contract.md");
const uiGuide = readText("docs/ui-layout-guide.md");

for (const className of [
  "surface-modal-footer",
  "surface-modal-footer-group",
  "surface-modal-footer-utilities",
  "surface-modal-footer-commit",
  "surface-modal-footer-action",
]) {
  assert.match(styles, new RegExp(`\\.${className}`), `${className} must be defined by the framework stylesheet`);
  assert.match(surfaceContract, new RegExp(`\\.${className}`), `${className} must be documented in the surface contract`);
}

assert.match(styles, /\.surface-modal-footer\s*\{[\s\S]*justify-content:\s*space-between;/, "modal footers should separate utility and commit action groups");
assert.match(styles, /\.surface-modal-footer-action\[data-surface-action-role="primary"\]\s*\{[\s\S]*border-color:\s*var\(--color-accent\)/, "primary footer actions should use the accent token");
assert.match(styles, /\.surface-modal-footer-action\[data-surface-action-role="destructive"\]\s*\{[\s\S]*border-color:\s*var\(--color-danger-border\)/, "destructive footer actions should use danger tokens");
assert.match(styles, /\.form-actions\.surface-modal-footer\s*\{[\s\S]*justify-content:\s*space-between;/, "shared footer layout should win over legacy form-actions alignment");

// 0.33.5.18.5.4 framework modal scroll/footer fix: reserve the scrollbar gutter (no layout width shift)
// and pin the form footer flush to the modal bottom (no negative bottom-margin gap below the footer).
assert.match(styles, /\.view-modal-body,\s*\.view-modal-form\s*\{[\s\S]*scrollbar-gutter:\s*stable;/, "modal scroll regions should reserve the scrollbar gutter so the layout width does not shift");
assert.match(styles, /\.view-modal-form\s*\{\s*padding-bottom:\s*0;/, "the scrolling modal form should drop its bottom padding so the sticky footer reaches the true bottom");
assert.match(styles, /\.view-modal-form > \.surface-modal-footer\s*\{[\s\S]*position:\s*sticky;[\s\S]*bottom:\s*0;[\s\S]*margin:\s*12px -20px 0;/, "the form modal footer should stick flush to the bottom with no negative bottom-margin gap");

assert.match(surfaceContract, /Adaptive Footer Labels/, "surface contract must document adaptive footer labels");
assert.match(uiGuide, /adaptive visible text/, "UI guide must document adaptive visible text rules");

assert.match(taskDialogScript, /view\.renderDescriptorModalForm\(descriptor, \{[\s\S]*utilityActions: taskEditorUtilityActions\(descriptor\)[\s\S]*actions: taskEditorCommitActions\(descriptor\)/, "Tasks editor should render through the framework modal footer helper");
assert.match(taskDialogScript, /dialog\.viewParts\.footer\.classList\.add\("form-actions", "task-modal-actions", "surface-modal-footer--dense"\)/, "Tasks editor should apply the shared dense modal footer shell to the framework footer");
assert.match(taskDialogScript, /dialog\.viewParts\.footer\.dataset\.modalFooter = ""/, "Tasks editor should keep the modal footer hook on the framework footer");
assert.match(taskDialogScript, /function taskEditorUtilityActions\(descriptor\)[\s\S]*view\.createActionButton\(\{[\s\S]*action: action\.id[\s\S]*className: "surface-modal-footer-action"[\s\S]*role: action\.role[\s\S]*button\.dataset\.taskTagsToggle[\s\S]*button\.dataset\.taskFilesToggle[\s\S]*button\.dataset\.copyTaskLink[\s\S]*button\.hidden = true/, "Tasks utility footer actions should be framework action buttons with module-owned hooks");
assert.match(taskDialogScript, /function taskEditorCommitActions\(descriptor\)[\s\S]*view\.createActionButton\(\{[\s\S]*action: action\.id[\s\S]*className: "surface-modal-footer-action"[\s\S]*type: action\.id === "save" \? "submit" : "button"[\s\S]*button\.dataset\.cancelTask[\s\S]*button\.dataset\.saveTask/, "Tasks commit footer actions should be framework action buttons with module-owned hooks");
assert.ok(
  taskDialogScript.indexOf("function taskEditorUtilityActions") < taskDialogScript.indexOf("function taskEditorCommitActions"),
  "Tasks utility footer actions should remain declared before commit footer actions",
);
assert.match(
  taskDialogScript,
  /function createTaskRecurrenceDialog\(\)[\s\S]*view\.createModalForm\(\{[\s\S]*actions: taskRecurrenceActions\(descriptor\)[\s\S]*dialog\.viewParts\.footer\.classList\.add\("task-modal-actions"\)[\s\S]*dialog\.viewParts\.footer\.dataset\.modalFooter = ""/,
  "Task recurrence dialog should use the shared modal footer shell through the framework child modal helper",
);

for (const expectedCall of [
  /icons\.decorateButton\(fields\.tagToggle, \{ icon: "tag", label: "Task tags", text: "Tags", title: "Task tags", iconOnly: false \}\)/,
  /icons\.decorateButton\(fields\.fileToggle, \{ icon: "file", label: "Task files", text: "Files", title: "Task files", iconOnly: false \}\)/,
  /icons\.decorateButton\(fields\.copyLink, \{ icon: "copy", label: "Copy task link", text: "Copy Link", title: "Copy task link", iconOnly: false \}\)/,
  /icons\.decorateButton\(fields\.cancel, \{ icon: "close", label: "Cancel", text: "", title: "Cancel", iconOnly: true \}\)/,
  /icons\.decorateButton\(fields\.save, \{ icon: "save", label: "Save task", text: "", title: "Save task", iconOnly: true \}\)/,
]) {
  assert.match(taskDialogScript, expectedCall, "task footer controls should keep visible utility labels and compact commit labels");
}

assert.match(tasksView, /css\/longtail-forge\.css\?v=72/, "Tasks view must load the footer-contract stylesheet cache key");
assert.match(tasksView, /js\/task-dialog\.js\?v=21/, "Tasks view must load the footer-contract task-dialog cache key");

console.log("Modal footer contract regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}
