import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const roadmap = readText("ROADMAP.md");
const decisions = readText("DECISIONS.md");
const changelog = readText("CHANGELOG.md");
const architecture = readText("docs/architecture.md");
const moduleContract = readText("docs/module-contract.md");
const moduleDevelopment = readText("docs/module-development.md");
const uiSurfaceContract = readText("docs/ui-surface-contract.md");
const uiLayoutGuide = readText("docs/ui-layout-guide.md");
const tasksDocs = readText("docs/tasks-module.md");
const tasksHelp = readText("help/framework/tasks-basics.md");
const tasksModule = readText("src/modules/tasks/module.js");

assert.equal(packageJson.version, "0.33.5.13.7", "package metadata should report the surface closeout version");
assert.equal(packageLock.version, "0.33.5.13.7", "package lock root version should report the surface closeout version");
assert.equal(packageLock.packages[""].version, "0.33.5.13.7", "package lock package version should report the surface closeout version");
assert.match(tasksModule, /version: "0\.33\.5\.13\.7"/, "Tasks module metadata should report the surface closeout version");

for (const item of [
  "Update Help and developer docs where shared modal, overlay, footer, drawer, or surface behavior changed.",
  "Update `DECISIONS.md`, `CHANGELOG.md`, package metadata, and roadmap archive during the implementation closeout.",
  "Run focused converted-surface regressions.",
  "Run `npm run check`.",
  "Run `npm run test:permissions`.",
  "Verify `/api/app-info` reports the expected version after implementation.",
]) {
  assert.match(roadmap, new RegExp(`- \\[x\\] ${escapeRegExp(item)}`), `Roadmap closeout item should be checked: ${item}`);
}

assert.match(decisions, /Last updated for 0\.33\.5\.13\.7 Surface Standardization Closeout\./, "Decisions header should point to the closeout version");
assert.match(decisions, /## Version 0\.33\.5\.13\.7/, "Decisions should include the closeout version");
assert.match(decisions, /No roadmap archive move is needed/, "Decisions should document archive handling for this closeout");
assert.match(changelog, /## Version 0\.33\.5\.13\.7 - /, "Changelog should include the closeout version");

assert.match(uiSurfaceContract, /0\.33\.5\.13\.7 framework surface inventory/, "Surface contract should report the closeout version");
assert.match(uiSurfaceContract, /closeout reference for shipped shared surface behavior/i, "Surface contract should describe its closeout role");
assert.match(uiLayoutGuide, /docs\/ui-surface-contract\.md/, "UI layout guide should continue pointing converted work to the surface contract");

assert.match(moduleDevelopment, /## Shared UI Surfaces/, "Module development guide should document shared UI surfaces");
assert.match(moduleDevelopment, /LongtailForge\.overlayHost\.create\(\{ host \}\)/, "Module development guide should document the overlay host helper");
assert.match(moduleContract, /Framework-owned UI surface contracts live in `docs\/ui-surface-contract\.md`/, "Module contract should point to the surface contract");
assert.match(architecture, /As of version 0\.33\.5\.13\.7/, "Architecture should report the closeout version");
assert.match(architecture, /framework-owned UI surface contract/, "Architecture should include the surface contract in current state");

assert.match(tasksDocs, /0\.33\.5\.13\.7/, "Tasks developer docs should report the closeout version");
assert.match(tasksDocs, /Tags and Files register with the shared framework overlay host/, "Tasks docs should describe shipped overlay behavior");
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
