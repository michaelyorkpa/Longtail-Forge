import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const styles = readText("public/css/longtail-forge.css");
const tasksView = readText("views/protected/tasks.html");
const taskDialogScript = readText("public/js/task-dialog.js");
const surfaceContract = readText("docs/ui-surface-contract.md");
const uiGuide = readText("docs/ui-layout-guide.md");

const requiredTokens = [
  "--color-page-bg",
  "--color-surface",
  "--color-surface-raised",
  "--color-surface-muted",
  "--color-surface-inset",
  "--color-surface-overlay",
  "--color-background",
  "--color-page",
  "--color-surface-alt",
  "--color-border",
  "--color-border-subtle",
  "--color-border-strong",
  "--shadow-card",
  "--shadow-modal",
  "--shadow-control",
  "--surface-radius-sm",
  "--surface-radius-md",
  "--surface-focus-ring",
];

for (const token of requiredTokens) {
  assert.match(styles, new RegExp(`${escapeRegExp(token)}\\s*:`), `${token} must be defined in the shared stylesheet`);
  assert.match(surfaceContract, new RegExp(escapeRegExp(token)), `${token} must be documented in the surface contract`);
}

const declaredTokens = new Set([...styles.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((match) => match[1]));
const usedTokens = new Set([...styles.matchAll(/var\((--[a-z0-9-]+)/g)].map((match) => match[1]));
const runtimeTokens = new Set([
  "--collection-depth",
  "--overlay-anchor-left",
  "--overlay-anchor-top",
  "--report-project-depth",
  "--tag-color",
  "--timer-count",
]);
const undefinedTokens = [...usedTokens].filter((token) => !declaredTokens.has(token) && !runtimeTokens.has(token));

assert.deepEqual(undefinedTokens.sort(), [], `stylesheet must not reference undefined surface tokens: ${undefinedTokens.join(", ")}`);

assert.match(
  styles,
  /\.surface-card,\s*\.surface-main-panel,\s*\.surface-modal-group,\s*\.surface-overlay-panel,\s*\.surface-drawer,\s*\.surface-slideout\s*\{[\s\S]*border:\s*1px solid var\(--color-border\)/,
  "shared surface classes must use the framework border token",
);
assert.match(
  styles,
  /\.surface-overlay-panel\s*\{[\s\S]*background:\s*var\(--color-surface-overlay\);[\s\S]*box-shadow:\s*var\(--shadow-card\)/,
  "overlay panels must use overlay background and card elevation tokens",
);
assert.match(
  styles,
  /\.surface-focus-ring:focus-visible,[\s\S]*box-shadow:\s*var\(--surface-focus-ring\)/,
  "shared focusable surfaces must expose the framework focus ring token",
);

assert.match(uiGuide, /docs\/ui-surface-contract\.md/, "UI guide should point new surface work to the shared surface contract");
assert.match(surfaceContract, /Surface Inventory/, "surface contract must include the surface inventory");
assert.match(surfaceContract, /Compatibility Aliases/, "surface contract must document token alias handling");
assert.match(surfaceContract, /Ownership Boundary/, "surface contract must document framework versus module ownership");

assert.match(taskDialogScript, /view\.renderDescriptorModalForm\(descriptor, \{[\s\S]*className: "task-detail-dialog"/, "Tasks modal converted area should request the framework surface modal shell");

for (const { className, pattern } of [
  {
    className: "task-details-field surface-modal-group",
    pattern: /className: \["task-details-field", "surface-modal-group"\]/,
  },
  {
    className: "task-checklist-field surface-modal-group",
    pattern: /className: \["task-checklist-field", "surface-modal-group"\]/,
  },
  {
    className: "task-recurrence-field surface-modal-group surface-divider-top",
    pattern: /className: \["task-recurrence-field", "surface-modal-group", "surface-divider-top"\]/,
  },
  {
    className: "task-timer-field surface-modal-group",
    pattern: /className: \["task-timer-field", "surface-modal-group"\]/,
  },
  {
    className: "task-reminder-field surface-modal-group surface-divider-top",
    pattern: /className: \["task-reminder-field", "surface-modal-group", "surface-divider-top"\]/,
  },
  {
    className: "task-notes-field surface-modal-group surface-divider-top",
    pattern: /className: \["task-notes-field", "surface-modal-group", "surface-divider-top"\]/,
  },
]) {
  assert.match(taskDialogScript, pattern, `Tasks modal converted area should include ${className}`);
}

assert.match(tasksView, /css\/longtail-forge\.css\?v=72/, "Tasks view must load the surface-token stylesheet cache key");

console.log("Surface token contract regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
