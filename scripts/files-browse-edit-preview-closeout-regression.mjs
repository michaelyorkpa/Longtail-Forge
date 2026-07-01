import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appVersion = "0.33.5.20.4";
const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const moduleContract = readText("docs/module-contract.md");
const viewContract = readText("docs/view-building-contract.md");
const declarativeSurfaces = readText("docs/declarative-view-surfaces.md");
const filesCloseout = readText("docs/0.32-module-file-closeout.md");
const notesModule = readText("src/modules/notes/module.js");
const tasksModule = readText("src/modules/tasks/module.js");
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, appVersion, "package.json should report the closeout version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the closeout version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the closeout version");
assert.match(notesModule, new RegExp(`version:\\s*"${escapeRegExp(appVersion)}"`), "Notes module metadata should track the current app version");
assert.match(tasksModule, new RegExp(`version:\\s*"${escapeRegExp(appVersion)}"`), "Tasks module metadata should track the current app version");

assert.match(roadmap, /Completed 0\.33\.5\.18\.11\.1 through 0\.33\.5\.18\.11\.13 are archived/, "Roadmap should identify the closeout as archived");
assert.match(roadmap, /Completed 0\.33\.5\.18\.12\.1 through 0\.33\.5\.18\.12\.7 are archived/, "Roadmap should identify the completed Files upload/action branch as archived");
assert.doesNotMatch(roadmap, /#### Version 0\.33\.5\.18\.11\.12 - Files preview modal and browse row preview action/, "Completed 0.33.5.18.11.12 should be archived out of the live roadmap");
assert.doesNotMatch(roadmap, /#### Version 0\.33\.5\.18\.11\.13 - Files browse\/edit\/preview closeout and 0\.33\.5\.18\.12 handoff/, "Completed 0.33.5.18.11.13 should be archived out of the live roadmap");
assert.doesNotMatch(roadmap, /#### Version 0\.33\.5\.18\.12\.7 - Files docs, changelog, and closeout/, "Completed 0.33.5.18.12.7 should be archived out of the live roadmap");

[
  viewContract,
  moduleContract,
  declarativeSurfaces,
  filesCloseout,
].forEach((source) => {
  assert.match(source, /compact browse\/recovery|compact workspace file recovery|compact filterable listing|compact browse-first/i, "Files docs should describe the compact browse/recovery surface");
  assert.match(source, /File Context/i, "Files docs should document the File Context editor");
  assert.match(source, /Preview modal|Files Preview modal|route-backed Preview/i, "Files docs should document the Preview modal");
  assert.match(source, /Inspector/i, "Files docs should document that Inspector integration is deferred");
});

assert.match(viewContract, /Implementation Notes For 0\.33\.5\.18\.11\.13/, "View-building contract should include closeout implementation notes");
assert.match(viewContract, /Implementation Notes For 0\.33\.5\.18\.12\.7/, "View-building contract should include Files conversion closeout implementation notes");
assert.match(viewContract, /Filter sidebar owns browse filtering[\s\S]*main panel owns the listing only[\s\S]*Row click opens File Context[\s\S]*Preview opens the Files Preview modal/i, "View contract should summarize the revised Files page state");
assert.match(viewContract, /0\.33\.5\.18\.11\.4 inline detail\/summary anatomy was intentionally replaced/, "View contract should record the replaced inline detail anatomy");
assert.match(moduleContract, /As of the 0\.33\.5\.18\.11\.13 closeout/, "Module contract should record the closeout boundary");
assert.match(moduleContract, /As of 0\.33\.5\.18\.12\.7, the Files browse\/edit\/preview\/upload\/action\/strict-guardrail conversion branch is closed/, "Module contract should record the completed Files conversion branch");
assert.match(filesCloseout, /0\.33\.5\.18\.11 Browse\/Edit\/Preview Closeout/, "Files closeout doc should include the browse/edit/preview handoff");
assert.match(declarativeSurfaces, /0\.33\.5\.18\.11\.13/, "Declarative surface guide should be current for the closeout");

assert.match(changelog, /## Version 0\.33\.5\.18\.11\.13 - /, "Changelog should include the closeout version");
assert.match(changelog, /Files browse\/edit\/preview closeout/, "Changelog should describe the closeout");
assert.match(changelog, /0\.33\.5\.18\.12 handoff/, "Changelog should describe the next-branch handoff");
assert.match(regressionSuite, /scripts\/files-browse-edit-preview-closeout-regression\.mjs/, "Regression suite should include the closeout regression");

console.log("Files browse/edit/preview closeout regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
