import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appVersion = "0.33.5.18.15";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const notesDocs = readText("docs/notes-module.md");
const viewContract = readText("docs/view-building-contract.md");
const moduleContract = readText("docs/module-contract.md");
const surfaceContract = readText("docs/ui-surface-contract.md");
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, appVersion, "package.json should report the closeout version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the closeout version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the closeout version");

assert.match(roadmap, /Completed 0\.33\.5\.18\.6\.1 through 0\.33\.5\.18\.6\.11 are archived/, "Roadmap should document that completed Notes slices are archived");
assert.doesNotMatch(roadmap, /### Version 0\.33\.5\.18\.6\.11 - Notes slide-out sidebar regression pass and docs closeout/, "Live roadmap should not keep the prior completed Notes closeout slice after Tasks 7.1 completes");
assert.doesNotMatch(roadmap, /#### Version 0\.33\.5\.18\.6\.10\.7 - Notes List slide-out behavior/, "Live roadmap should not keep the prior completed slice after the closeout");

assert.match(changelog, new RegExp(`## Version ${escapeRegExp(appVersion)} - `), "Changelog should include the closeout version");

assert.match(notesDocs, new RegExp(`current Notes implementation as of ${escapeRegExp(appVersion)}`), "Notes developer guide should report the current version");
assert.match(notesDocs, /layout: "slide-out-sidebar"/, "Notes guide should document the slide-out descriptor layout");
assert.match(notesDocs, /Filters start collapsed inside the drawer, Library starts open/, "Notes guide should document drawer defaults");
assert.match(notesDocs, /collection create\/edit handoffs wait for that actions modal to close/, "Notes guide should document collection modal handoff behavior");
assert.match(notesDocs, /one visible tag chip plus overflow/, "Notes guide should document the compact list chip rule");
assert.match(notesDocs, /template implementation for future action\/workflow surfaces/, "Notes guide should document Notes as the template adopter");

assert.match(viewContract, /## Implementation Notes For 0\.33\.5\.18\.6\.11/, "View-building contract should include the closeout note");
assert.match(viewContract, /The reusable action\/workflow surface pattern is `layout: "slide-out-sidebar"`/, "View contract should name slide-out-sidebar as the reusable pattern");
assert.match(viewContract, /preferred anatomy for future Tasks, Tickets, Notes, Lists, Files, and Clients\/Projects conversions/, "View contract should document the future action-surface direction");
assert.match(viewContract, /footer-visible offset/, "View contract should document footer-aware trigger placement");
assert.match(viewContract, /not the retired center `split-list-detail` behavior/, "View contract should reject the retired center split");
assert.match(viewContract, /not the rejected persistent split-column `sidebar-detail` anatomy/, "View contract should reject persistent split columns as the future default");

assert.match(moduleContract, /Supported layouts are `single-column`, `stacked`, `sidebar-detail`, `slide-out-sidebar`, and `table-page`; `split-list-detail` is retired and compatibility-only/, "Module contract should document the current descriptor layout set");
assert.match(moduleContract, /As of 0\.33\.5\.18\.6\.11, Notes is the first `slide-out-sidebar` adopter/, "Module contract should document the first adopter");
assert.match(moduleContract, /framework owns the action-surface shell, screen-left funnel trigger, off-canvas drawer, backdrop, focus\/ARIA state, scroll locking, footer-aware trigger placement, panel shell, and central primary\/detail anatomy/i, "Module contract should document framework ownership");
assert.match(moduleContract, /Notes owns filters, Library and collection behavior, Notes List data, sort and pagination, selection behavior, selected-note detail rendering, Primary Context, Linked Context, tags, files, and Markdown workflows/, "Module contract should document Notes ownership");

assert.match(surfaceContract, /0\.33\.5\.18\.6\.11 action-surface slide-out closeout/, "Surface contract should include the closeout scope");
assert.match(surfaceContract, /Descriptor-backed action\/workflow surfaces that need controls beside a primary record view should prefer `layout: "slide-out-sidebar"`/, "Surface contract should document slide-out preference");
assert.match(surfaceContract, /\.view-slideout-sidebar/, "Surface contract should name the slide-out shell class");
assert.match(surfaceContract, /The trigger stays near the lower-left viewport edge and lifts above the visible footer without overlapping it/, "Surface contract should document trigger placement");
assert.match(surfaceContract, /opening the drawer must not squeeze or re-center the selected-record view/, "Surface contract should document central detail behavior");

for (const script of [
  "scripts/view-renderer-shell-regression.mjs",
  "scripts/view-descriptor-manifest-regression.mjs",
  "scripts/notes-declarative-readonly-surface-regression.mjs",
  "scripts/notes-ui-workflow-regression.mjs",
  "scripts/notes-modal-stack-guardrails-regression.mjs",
  "scripts/notes-preview-editor-regression.mjs",
  "scripts/linked-context-picker-shell-regression.mjs",
  "scripts/markdown-closeout-regression.mjs",
  "scripts/notes-slideout-closeout-regression.mjs",
]) {
  assert.match(regressionSuite, new RegExp(escapeRegExp(script)), `Regression suite should include ${script}`);
}

console.log("Notes slide-out closeout regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
