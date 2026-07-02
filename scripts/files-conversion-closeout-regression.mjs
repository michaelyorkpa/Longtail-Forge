import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appVersion = "0.33.5.21.0.6";
const filesCloseoutVersion = "0.33.5.18.12.7";
const viewConversionCloseoutVersion = "0.33.5.18.15";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const notesModule = readText("src/modules/notes/module.js");
const tasksModule = readText("src/modules/tasks/module.js");
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const viewContract = readText("docs/view-building-contract.md");
const declarativeGuide = readText("docs/declarative-view-surfaces.md");
const moduleContract = readText("docs/module-contract.md");
const filesInventory = readText("docs/files-strict-guardrail-inventory.md");
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, appVersion, "package.json should report the Files conversion closeout version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the Files conversion closeout version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the Files conversion closeout version");
assert.match(notesModule, new RegExp(`version:\\s*"${escapeRegExp(appVersion)}"`), "Notes module metadata should track the current app version");
assert.match(tasksModule, new RegExp(`version:\\s*"${escapeRegExp(appVersion)}"`), "Tasks module metadata should track the current app version");

assert.match(roadmap, /Completed 0\.33\.5\.18\.12\.1 through 0\.33\.5\.18\.12\.7 are archived/, "Roadmap should archive the completed Files 0.33.5.18.12 branch");
assert.match(roadmap, /Completed 0\.33\.5\.18\.15 is archived/, "Roadmap should archive the completed view-conversion branch closeout");
assert.doesNotMatch(roadmap, /## Files \(0\.33\.5\.18\.11 - 0\.33\.5\.18\.12\)/, "Live roadmap should not keep the completed Files branch open");
assert.doesNotMatch(roadmap, /#### Version 0\.33\.5\.18\.12\.7 - Files docs, changelog, and closeout/, "Completed Files closeout slice should be archived out of the live roadmap");

assert.match(changelog, new RegExp(`## Version ${escapeRegExp(filesCloseoutVersion)} - `), "Changelog should include the Files conversion closeout version");
assert.match(changelog, /Closed the Files browse\/edit\/preview\/upload\/action\/strict-guardrail conversion branch/, "Changelog should describe the completed Files conversion branch");
assert.match(changelog, /scripts\/files-conversion-closeout-regression\.mjs/, "Changelog should name the closeout regression");

assert.match(viewContract, new RegExp(`Updated through ${escapeRegExp(viewConversionCloseoutVersion)}, it also records`), "View-building contract should report the view-conversion closeout version");
assert.match(viewContract, /## Implementation Notes For 0\.33\.5\.18\.12\.7/, "View-building contract should include closeout implementation notes");
assert.match(viewContract, /The Files conversion branch is closed at the compact listing-first boundary/, "View-building contract should describe the closeout boundary");
assert.match(viewContract, /File Context and Preview remain route-backed, attachment-scoped modal workflows/, "View-building contract should preserve route-backed File Context and Preview");

assert.match(declarativeGuide, new RegExp(`viewSurfaces\` authoring contract as of ${escapeRegExp(viewConversionCloseoutVersion)}`), "Declarative guide should report the view-conversion closeout version");
assert.match(declarativeGuide, /As of the 0\.33\.5\.18\.12\.7 closeout, the Files conversion branch is complete at this boundary/, "Declarative guide should document the closeout");
assert.match(declarativeGuide, /Files is strict as of 0\.33\.5\.18\.12\.6[\s\S]*Clients\/Projects strict enforcement is active as of 0\.33\.5\.18\.14\.5[\s\S]*filter drawer, secondary tag-row, icon-only table action, and legacy page chrome cleanup/, "Declarative inventory should distinguish strict Files and current strict Clients/Projects");

assert.match(moduleContract, /As of 0\.33\.5\.18\.12\.7, the Files browse\/edit\/preview\/upload\/action\/strict-guardrail conversion branch is closed/, "Module contract should record the closeout");
assert.match(moduleContract, /route-backed File Context and Preview modals[\s\S]*shared attachment\/upload\/action shells[\s\S]*strict `files\.browse` guardrails/, "Module contract should summarize the completed Files boundary");
assert.match(moduleContract, /Future Files work must explicitly reopen scope before adding inline detail, inline preview, inline metadata, Inspector behavior, rename\/replacement, storage moves, hard purge, permanent delete, or raw storage controls/, "Module contract should preserve future Files scope discipline");

assert.match(filesInventory, /Current as of 0\.33\.5\.18\.12\.7/, "Files inventory should report the closeout version");
assert.match(filesInventory, /## Closeout Coverage In 0\.33\.5\.18\.12\.7/, "Files inventory should include closeout coverage");
assert.match(filesInventory, /compact listing-first browse[\s\S]*slide-out filters[\s\S]*shared upload and attachment panel shells[\s\S]*route-backed File Context editing[\s\S]*route-backed Preview[\s\S]*strict `files\.browse` guardrails/, "Files inventory should summarize the shipped closeout boundary");

assert.match(regressionSuite, /scripts\/files-conversion-closeout-regression\.mjs/, "Regression suite should include the Files conversion closeout regression");
assert.match(regressionSuite, /scripts\/files-browse-edit-preview-closeout-regression\.mjs/, "Regression suite should keep the browse/edit/preview closeout regression");
assert.match(regressionSuite, /scripts\/files-strict-guardrail-inventory-regression\.mjs/, "Regression suite should keep the Files strict guardrail regression");

console.log("Files conversion closeout regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
