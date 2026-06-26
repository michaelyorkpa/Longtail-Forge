import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const styles = readText("public/css/longtail-forge.css");
const tasksView = readText("views/protected/tasks.html");
const tasksScript = readText("public/js/tasks.js");
const surfaceContract = readText("docs/ui-surface-contract.md");
const uiGuide = readText("docs/ui-layout-guide.md");

assert.match(
  styles,
  /\.surface-main-panel\s*\{[\s\S]*display:\s*grid;[\s\S]*gap:\s*12px;[\s\S]*padding:\s*12px;[\s\S]*background:\s*var\(--color-surface\)/,
  "main-screen internal panels must use the shared main-panel shell",
);
assert.match(
  styles,
  /\.surface-main-panel--sticky\s*\{[\s\S]*box-shadow:\s*var\(--shadow-control\)/,
  "sticky main-screen panels must use shared control elevation",
);
assert.match(
  styles,
  /\.surface-drawer,\s*\.surface-slideout\s*\{[\s\S]*grid-template-rows:\s*auto minmax\(0,\s*1fr\) auto;[\s\S]*box-shadow:\s*var\(--shadow-modal\)/,
  "drawers and slideouts must share shell anatomy and modal elevation",
);
assert.match(
  styles,
  /\.surface-slideout\s*\{[\s\S]*width:\s*min\(560px,\s*94vw\)/,
  "slideouts must allow a wider contextual detail shell than drawers",
);
assert.match(
  styles,
  /\.surface-drawer-header,[\s\S]*\.surface-slideout-footer\s*\{[\s\S]*justify-content:\s*space-between/,
  "drawer and slideout headers/footers must use shared action placement",
);
assert.match(
  styles,
  /\.surface-dense-actions\s*\{[\s\S]*display:\s*inline-flex;[\s\S]*justify-content:\s*flex-end;[\s\S]*gap:\s*6px/,
  "dense table/list actions must have a separate shared placement rule",
);
assert.match(
  styles,
  /@media \(max-width:\s*700px\)\s*\{[\s\S]*\.surface-drawer,\s*\.surface-slideout\s*\{[\s\S]*position:\s*fixed;[\s\S]*inset:\s*0;[\s\S]*border-radius:\s*0/,
  "drawers and slideouts must become full-screen overlays on narrow screens",
);
assert.match(
  styles,
  /@media \(max-width:\s*700px\)\s*\{[\s\S]*\.surface-dense-actions\s*\{[\s\S]*flex-wrap:\s*wrap/,
  "dense action placement must wrap on narrow screens",
);

assert.match(
  tasksScript,
  /main\.classList\.add\("tasks-main-list-panel"\)/,
  "Tasks generated task list should remain mounted in the main panel",
);
assert.doesNotMatch(
  tasksScript,
  /class="task-page-toolbar task-sticky-controls surface-main-panel surface-main-panel--sticky"/,
  "Tasks filter toolbar should no longer require the old sticky main-panel shell",
);
assert.match(
  tasksScript,
  /view\.createBulkActionToolbar\(\{[\s\S]*className:\s*"task-bulk-toolbar"/,
  "Tasks generated bulk toolbar should use the shared bulk-action toolbar shell",
);
assert.match(tasksView, /css\/longtail-forge\.css\?v=72/, "Tasks view must load the drawer/main-surface stylesheet cache key");

for (const expected of [
  ".surface-main-panel",
  ".surface-main-panel--sticky",
  ".surface-drawer-header",
  ".surface-slideout-body",
  ".surface-dense-actions",
]) {
  assert.match(surfaceContract, new RegExp(escapeRegExp(expected)), `${expected} must be documented in the surface contract`);
}

assert.match(
  surfaceContract,
  /narrow screens, drawers and slideouts become full-screen overlays/i,
  "surface contract must define drawer and slideout responsive behavior",
);
assert.match(
  surfaceContract,
  /Dense Table and List Actions/i,
  "surface contract must define dense table/list action placement separately from modal footer actions",
);
assert.match(
  uiGuide,
  /surface-main-panel/,
  "UI guide must route new internal panels to the shared main-panel shell",
);

console.log("Drawer and main-screen surface contract regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
