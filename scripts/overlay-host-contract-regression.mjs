import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const overlayHost = readText("public/js/shared/overlay-host.js");
const tasksView = readText("views/protected/tasks.html");
const taskDialogScript = readText("public/js/task-dialog.js");
const styles = readText("public/css/longtail-forge.css");
const surfaceContract = readText("docs/ui-surface-contract.md");
const uiGuide = readText("docs/ui-layout-guide.md");

assert.match(overlayHost, /root\.overlayHost\s*=\s*\{[\s\S]*create/, "shared overlay host should expose LongtailForge.overlayHost.create");
assert.match(overlayHost, /registry = new WeakMap\(\)/, "overlay hosts should be scoped per host element");
assert.match(overlayHost, /panel\.setAttribute\("role", "dialog"\)/, "overlay panels should expose dialog role");
assert.match(overlayHost, /trigger\.setAttribute\("aria-haspopup", "dialog"\)/, "overlay triggers should expose dialog popup intent");
assert.match(overlayHost, /trigger\.setAttribute\("aria-expanded", "false"\)/, "overlay triggers should maintain aria-expanded");
assert.match(overlayHost, /document\.addEventListener\("keydown", \(event\) => handleKeydown/, "overlay host should own Escape and focus-trap key handling");
assert.match(overlayHost, /document\.addEventListener\("pointerdown", \(event\) => handlePointerDown/, "overlay host should own click-away closing");
assert.match(overlayHost, /if \(event\.key === "Escape"\)/, "overlay host should close on Escape");
assert.match(overlayHost, /trapFocus\(event, overlay\.panel\)/, "overlay host should trap Tab focus inside the open panel");
assert.match(overlayHost, /global\.matchMedia\?\.\("\(max-width: 700px\)"\)/, "overlay host should switch to mobile bottom-sheet behavior");
assert.match(overlayHost, /closeActive\(state\);[\s\S]*state\.active = overlay/, "overlay host should ensure one active overlay per host");
assert.match(overlayHost, /overlay\.previousFocus\.focus\(\)/, "overlay host should return focus to the triggering control when closing directly");

assert.match(styles, /\.surface-overlay-host\s*\{[\s\S]*position:\s*relative/, "overlay hosts should provide a positioning context");
assert.match(styles, /\.surface-overlay-panel\[hidden\],\s*\.task-footer-panel\[hidden\]\s*\{[\s\S]*display:\s*none !important/, "hidden overlay panels should stay closed when module layout classes set display");
assert.match(styles, /\.surface-overlay-panel\[data-overlay-panel\]\s*\{[\s\S]*box-sizing:\s*border-box[\s\S]*position:\s*absolute[\s\S]*max-height:\s*min\(58vh,\s*520px\)[\s\S]*background:\s*var\(--color-surface-overlay\)/, "desktop overlay panels should be anchored, constrained, and opaque");
assert.match(styles, /\.surface-overlay-panel--bottom-sheet\[data-overlay-panel\]\s*\{[\s\S]*position:\s*fixed[\s\S]*inset:\s*auto 0 0 0/, "mobile overlays should become bottom sheets");
assert.match(surfaceContract, /overlay host behavior/, "surface contract should keep overlay host behavior framework-owned");
assert.match(surfaceContract, /\.surface-overlay-host/, "surface contract should document the overlay host class");
assert.match(surfaceContract, /\.surface-overlay-panel--bottom-sheet/, "surface contract should document mobile bottom-sheet classing");
assert.match(uiGuide, /overlay host owns placement, close behavior, focus handling, Escape, click-away, responsive sizing, and one-open-overlay behavior/, "UI guide should document overlay host ownership");

assert.match(tasksView, /js\/shared\/overlay-host\.js\?v=1/, "Tasks view should load the shared overlay host before task-dialog");
assert.match(tasksView, /js\/shared\/overlay-host\.js\?v=1[\s\S]*js\/task-dialog\.js\?v=18/, "Tasks view should load overlay host before task dialog code");
assert.match(tasksView, /css\/longtail-forge\.css\?v=68/, "Tasks view should load the overlay-host stylesheet cache key");
assert.match(taskDialogScript, /taskEditorFooterPanel\(view, "task-tags-field", \{ "data-task-tags-panel": "" \}[\s\S]*"data-task-tags": ""/, "Tasks tags panel should keep module-owned tag picker mount");
assert.match(taskDialogScript, /taskEditorFooterPanel\(view, "task-files-field", \{ "data-task-files-panel": "" \}[\s\S]*"data-task-files": ""/, "Tasks files panel should keep module-owned file attachment mount");

assert.match(taskDialogScript, /namespace\.overlayHost\.create\(\{ host: form \}\)/, "Task dialog should create a shared overlay host from the form");
assert.match(taskDialogScript, /taskOverlayHost\.register\(\{[\s\S]*name: "tags"[\s\S]*panel: fields\.tagPanel[\s\S]*trigger: fields\.tagToggle/, "Task dialog should register Tags with the shared overlay host");
assert.match(taskDialogScript, /taskOverlayHost\.register\(\{[\s\S]*name: "files"[\s\S]*panel: fields\.filePanel[\s\S]*trigger: fields\.fileToggle/, "Task dialog should register Files with the shared overlay host");
assert.match(taskDialogScript, /taskOverlayHost\.toggle\(panelName\)/, "Task dialog should toggle footer panels through the shared overlay host");
assert.match(taskDialogScript, /function toggleTaskFooterPanelFallback/, "Task dialog should keep a no-helper fallback path");
assert.match(taskDialogScript, /taskOverlayHost\?\.closeAll\?\.\(\)/, "Task dialog should close shared overlays when hiding panels or closing the dialog");
assert.match(taskDialogScript, /mountTaskTagPicker[\s\S]*tagPicker = await namespace\.tags\.mountPicker/, "Task dialog should keep Tags picker content module-owned");
assert.match(taskDialogScript, /mountTaskFileAttachments[\s\S]*fileAttachmentsController = namespace\.fileAttachments\.mount/, "Task dialog should keep Files attachment content framework-owned");

console.log("Overlay host contract regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}
