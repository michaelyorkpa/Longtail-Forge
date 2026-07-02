import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appVersion = "0.33.5.21.2";
const viewConversionCloseoutVersion = "0.33.5.18.15";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const tasksModule = readText("src/modules/tasks/module.js");
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const tasksDocs = readText("docs/tasks-module.md");
const viewContract = readText("docs/view-building-contract.md");
const moduleContract = readText("docs/module-contract.md");
const declarativeDocs = readText("docs/declarative-view-surfaces.md");
const strictInventory = readText("docs/tasks-strict-guardrail-inventory.md");
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, appVersion, "package.json should report the Tasks conversion closeout version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the Tasks conversion closeout version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the Tasks conversion closeout version");
assert.match(tasksModule, new RegExp(`version:\\s*"${escapeRegExp(appVersion)}"`), "Tasks module should report the Tasks conversion closeout version");

assert.match(roadmap, /Completed 0\.33\.5\.18\.11\.1 through 0\.33\.5\.18\.11\.13 are archived/, "Roadmap should archive completed Files browse/edit/preview slices");
assert.match(roadmap, /Completed 0\.33\.5\.18\.12\.1 through 0\.33\.5\.18\.12\.7 are archived/, "Roadmap should archive the completed Files upload/action/guardrail branch");
assert.doesNotMatch(roadmap, /### Version 0\.33\.5\.18\.10\.8 - Cross-Module Modal Action Standardization/, "Live roadmap should archive the completed modal action standardization branch");
assert.doesNotMatch(roadmap, /#### Version 0\.33\.5\.18\.10\.7 - Tasks docs, changelog, and closeout/, "Live roadmap should archive the previous completed Tasks closeout slice");
assert.doesNotMatch(roadmap, /#### Version 0\.33\.5\.18\.10\.6 - Tasks strict declarative guardrail enforcement/, "Live roadmap should archive the previous completed Tasks slice");
assert.match(changelog, new RegExp(`## Version ${escapeRegExp(appVersion)} - `), "Changelog should include the Tasks conversion closeout version");

assert.match(tasksDocs, new RegExp(`current Tasks module behavior as of ${escapeRegExp(appVersion)}`), "Tasks docs should report the current Tasks closeout version");
assert.match(tasksDocs, /## Canonical Task Editor Entry Point/, "Tasks docs should document the canonical editor entry point");
assert.match(tasksDocs, /The Tasks page calls `LongtailForge\.tasksDialog\.openTaskEditor\(\)`/, "Tasks docs should document the Tasks page opener path");
assert.match(tasksDocs, /Workbench calls the same opener through the registered module action path/, "Tasks docs should document the Workbench opener path");
assert.match(tasksDocs, /Future Quick Action Center flows should dispatch the registered Task module action or call `openTaskEditor\(\)`/, "Tasks docs should document future QAC usage");
assert.match(tasksDocs, /Future module-triggered task creation should pass safe caller defaults, `sourceContext`, `hostContext`, `returnFocusTo`, and `onSaved` or `refresh` callbacks/, "Tasks docs should document future module-triggered task creation");
assert.match(tasksDocs, /new surfaces should call `openTaskEditor\(\)` or the registered module action instead of building separate task forms/, "Tasks docs should forbid duplicate task forms");
assert.match(tasksDocs, /The protected Tasks page is `tasks\.html` under the Projects menu/, "Tasks docs should preserve the shipped Tasks page location");
assert.match(tasksDocs, /The main panel remains the task list surface/, "Tasks docs should preserve task-list-first behavior");

assert.match(viewContract, new RegExp(`Updated through ${escapeRegExp(viewConversionCloseoutVersion)}, it also records the current helper and descriptor implementation`), "View-building contract should report the view conversion closeout version");
assert.match(viewContract, /## Implementation Notes For 0\.33\.5\.18\.10\.7/, "View-building contract should include Tasks closeout notes");
assert.match(viewContract, /Tasks is now a completed `slide-out-sidebar` adopter and a template for future list-first workflow conversions/, "View-building contract should document Tasks as a slide-out-sidebar adopter");
assert.match(viewContract, /Unlike Notes, Tasks keeps the task list as the primary main-panel surface/, "View-building contract should preserve the task-list-first direction");
assert.match(viewContract, /Opening the drawer must not move, squeeze, or replace the task list/, "View-building contract should protect the main task list");
assert.match(viewContract, /`LongtailForge\.tasksDialog\.openTaskEditor\(\)` is the canonical browser entry point for add\/edit\/duplicate Task flows/, "View-building contract should document the canonical opener");

assert.match(moduleContract, /As of 0\.33\.5\.18\.10\.7, the canonical Task editor opener is the cross-surface Task add\/edit contract/, "Module contract should document the Task editor action pattern");
assert.match(moduleContract, /Future Quick Action Center or module-triggered task creation flows should dispatch the registered Task module action or call the opener/, "Module contract should document future callers");
assert.match(moduleContract, /The Task editor is the first completed workflow example for this pattern/, "Module contract should identify the completed workflow example");

assert.match(declarativeDocs, new RegExp(`viewSurfaces\` authoring contract as of ${escapeRegExp(viewConversionCloseoutVersion)}`), "Declarative view docs should report the view conversion closeout version");
assert.match(declarativeDocs, /Strict guardrails currently enforce[\s\S]*`files\.browse`[\s\S]*`lists\.workspace`[\s\S]*`notes\.workspace`[\s\S]*`tasks\.workspace`/, "Declarative view docs should include Tasks in strict guardrails");
assert.match(declarativeDocs, /The 0\.33\.5\.18\.10\.7 closeout also locks `LongtailForge\.tasksDialog\.openTaskEditor\(\)` as the canonical module-owned Task editor opener/, "Declarative view docs should document the Tasks editor closeout contract");
assert.match(declarativeDocs, /\| Files \| files \| files\.html \| files\.browse \| strict \|/, "Declarative inventory should report Files through the strict framework descriptor surface");
assert.match(declarativeDocs, /\| Client Projects \| clients \| clients\.html \| client-projects\.clients \| strict \|/, "Declarative inventory should report Clients as strict after the Clients/Projects closeout");
assert.match(declarativeDocs, /\| Client Projects \| projects \| projects\.html \| client-projects\.projects \| strict \|/, "Declarative inventory should report Projects as strict after the Clients/Projects closeout");

assert.match(strictInventory, /Current as of 0\.33\.5\.18\.10\.7/, "Tasks strict inventory should report the closeout version");
assert.match(strictInventory, /`scripts\/tasks-conversion-closeout-regression\.mjs` locks the 0\.33\.5\.18\.10\.7 documentation closeout/, "Tasks strict inventory should name the closeout regression");
assert.match(strictInventory, /task list remains the primary main-panel view/, "Tasks strict inventory should preserve task-list-first behavior");
assert.match(strictInventory, /future Quick Action Center/i, "Tasks strict inventory should document future QAC caller guidance");

for (const script of [
  "scripts/tasks-conversion-closeout-regression.mjs",
  "scripts/view-descriptor-declarative-guardrails.mjs",
  "scripts/tasks-strict-guardrail-inventory-regression.mjs",
  "scripts/tasks-declarative-readonly-surface-regression.mjs",
  "scripts/tasks-filter-sidebar-anatomy-regression.mjs",
  "scripts/tasks-readonly-list-binding-regression.mjs",
  "scripts/tasks-bulk-toolbar-shell-regression.mjs",
  "scripts/tasks-bulk-nondestructive-toolbar-regression.mjs",
  "scripts/tasks-bulk-lifecycle-toolbar-regression.mjs",
  "scripts/tasks-modal-shell-regression.mjs",
  "scripts/tasks-canonical-editor-opener-regression.mjs",
  "scripts/task-modal-compact-layout-regression.mjs",
  "scripts/task-modal-reflow-regression.mjs",
  "scripts/task-modal-followup-regression.mjs",
]) {
  assert.match(regressionSuite, new RegExp(escapeRegExp(script)), `Regression suite should include ${script}`);
}

console.log("Tasks conversion closeout regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
