import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const architecture = readText("docs/architecture.md");
const moduleContract = readText("docs/module-contract.md");
const moduleDevelopment = readText("docs/module-development.md");
const uiSurfaceContract = readText("docs/ui-surface-contract.md");
const uiLayoutGuide = readText("docs/ui-layout-guide.md");
const tasksDocs = readText("docs/tasks-module.md");
const tasksHelp = readText("help/framework/tasks-basics.md");
const tasksModule = readText("src/modules/tasks/module.js");
const currentTasksVersion = "0.33.5.21.0.1";

assert.match(tasksModule, new RegExp(`version: "${escapeRegExp(currentTasksVersion)}"`), "Tasks module metadata should report the current Tasks version");

assert.doesNotMatch(roadmap, /## Version 0\.33\.5\.13 - Framework Surface and Modal Style Standardization/, "Completed surface roadmap should be archived after the next version starts");

assert.match(changelog, /## Version 0\.33\.5\.13\.7 - /, "Changelog should include the closeout version");

assert.match(uiSurfaceContract, /0\.33\.5\.13\.7 framework surface inventory/, "Surface contract should report the closeout version");
assert.match(uiSurfaceContract, /closeout reference for shipped shared surface behavior/i, "Surface contract should describe its closeout role");
assert.match(uiLayoutGuide, /docs\/ui-surface-contract\.md/, "UI layout guide should continue pointing converted work to the surface contract");

assert.match(moduleDevelopment, /## Shared UI Surfaces/, "Module development guide should document shared UI surfaces");
assert.match(moduleDevelopment, /LongtailForge\.overlayHost\.create\(\{ host \}\)/, "Module development guide should document the overlay host helper");
assert.match(moduleContract, /Framework-owned UI surface contracts live in `docs\/ui-surface-contract\.md`/, "Module contract should point to the surface contract");
assert.match(architecture, /As of version 0\.33\.5\.15\.6/, "Architecture should report the current architecture version");
assert.match(architecture, /framework-owned UI surface contract/, "Architecture should include the surface contract in current state");

assert.match(tasksDocs, new RegExp(escapeRegExp(currentTasksVersion)), "Tasks developer docs should report the current Tasks version");
assert.match(tasksDocs, /Task Tags and Files footer utilities open stacked child dialogs/, "Tasks docs should describe shipped child-dialog behavior");
assert.doesNotMatch(tasksDocs, /until the shared framework overlay standardization pass replaces that temporary placement/, "Tasks docs should not describe completed overlay work as future");
assert.match(tasksHelp, /Footer icons open task tags and files inside the task workflow/, "Help should describe current task Tags and Files behavior");
assert.doesNotMatch(tasksHelp, /overlay host|surface-modal|surface-main-panel|framework-owned UI surface/, "Product Help should not expose developer-only surface internals");

console.log("Surface standardization closeout regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
