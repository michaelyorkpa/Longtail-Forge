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

assert.match(surfaceContract, /Adaptive Footer Labels/, "surface contract must document adaptive footer labels");
assert.match(uiGuide, /adaptive visible text/, "UI guide must document adaptive visible text rules");

for (const [label, text] of [
  ["static Tasks dialog", tasksView],
  ["fallback Tasks dialog", taskDialogScript],
]) {
  assert.match(
    text,
    /class="form-actions task-modal-actions surface-modal-footer surface-modal-footer--dense" data-modal-footer/,
    `${label} should use the shared dense modal footer shell`,
  );
  assert.match(
    text,
    /data-modal-footer-group="utility"[\s\S]*data-surface-action="tags"[\s\S]*data-surface-action="files"[\s\S]*data-surface-action="copy-link"[\s\S]*data-modal-footer-group="commit"[\s\S]*data-surface-action="cancel"[\s\S]*data-surface-action="save"/,
    `${label} should order utility actions before secondary and primary commit actions`,
  );
  assert.match(
    text,
    /data-surface-action="tags" data-surface-action-role="utility" data-task-tags-toggle/,
    `${label} should mark Tags as a utility footer action`,
  );
  assert.match(
    text,
    /data-surface-action="files" data-surface-action-role="utility" data-task-files-toggle/,
    `${label} should mark Files as a utility footer action`,
  );
  assert.match(
    text,
    /data-surface-action="copy-link" data-surface-action-role="utility" data-copy-task-link hidden/,
    `${label} should mark Copy Link as a hidden utility action until a saved task exists`,
  );
  assert.match(
    text,
    /type="button" data-surface-action="cancel" data-surface-action-role="secondary" data-cancel-task/,
    `${label} should keep Cancel as a secondary non-submit action`,
  );
  assert.match(
    text,
    /type="submit" data-surface-action="save" data-surface-action-role="primary" data-save-task/,
    `${label} should keep Save as the primary submit action`,
  );
  assert.match(
    text,
    /class="form-actions task-modal-actions surface-modal-footer" data-modal-footer[\s\S]*data-surface-action="cancel"[\s\S]*data-surface-action="save"/,
    `${label} recurrence dialog should use the shared modal footer shell`,
  );
}

for (const expectedCall of [
  /icons\.decorateButton\(fields\.tagToggle, \{ icon: "tag", label: "Task tags", text: "", title: "Task tags", iconOnly: true \}\)/,
  /icons\.decorateButton\(fields\.fileToggle, \{ icon: "file", label: "Task files", text: "", title: "Task files", iconOnly: true \}\)/,
  /icons\.decorateButton\(fields\.copyLink, \{ icon: "copy", label: "Copy task link", text: "", title: "Copy task link", iconOnly: true \}\)/,
  /icons\.decorateButton\(fields\.cancel, \{ icon: "close", label: "Cancel", text: "", title: "Cancel", iconOnly: true \}\)/,
  /icons\.decorateButton\(fields\.save, \{ icon: "save", label: "Save task", text: "", title: "Save task", iconOnly: true \}\)/,
]) {
  assert.match(taskDialogScript, expectedCall, "dense task footer icon-only controls should keep labels and titles");
}

assert.match(tasksView, /css\/longtail-forge\.css\?v=21/, "Tasks view must load the footer-contract stylesheet cache key");
assert.match(tasksView, /js\/task-dialog\.js\?v=10/, "Tasks view must load the footer-contract task-dialog cache key");

console.log("Modal footer contract regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}
