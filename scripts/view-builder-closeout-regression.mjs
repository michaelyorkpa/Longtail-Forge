import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appVersion = "0.33.5.18.12.7";
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const moduleContract = readText("docs/module-contract.md");
const moduleDevelopment = readText("docs/module-development.md");
const uiLayoutGuide = readText("docs/ui-layout-guide.md");
const architecture = readText("docs/architecture.md");
const viewContract = readText("docs/view-building-contract.md");
const helpModules = readText("help/framework/modules-and-optional-features.md");
const regressionSuite = readText("scripts/regression-suite.mjs");
const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));

assert.equal(packageJson.version, appVersion, "package.json should report the current app version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the current app version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the current app version");

assert.doesNotMatch(roadmap, /^## Version 0\.33\.5\.14 - /m, "Completed 0.33.5.14 should be archived out of the live roadmap");
assert.doesNotMatch(roadmap, /^## Version 0\.33\.5\.15 - Framework View Builder Contract and Lists Pilot/m, "Completed 0.33.5.15 should be archived out of the live roadmap after 0.33.5.16 closes");

assert.match(viewContract, /As of 0\.33\.5\.15\.6/, "View-building contract should report the closeout version");
assert.match(viewContract, /Implementation Notes For 0\.33\.5\.15\.6/, "View-building contract should include closeout notes");
assert.match(moduleContract, /`LongtailForge\.view` is implemented in `public\/js\/shared\/view-builder\.js`/, "Module contract should document the implemented helper location");
assert.match(moduleContract, /Converted module surfaces should use `LongtailForge\.view` helpers/, "Module contract should document converted surface expectations");
assert.match(moduleContract, /Non-converted surfaces may remain hand-built until an explicit conversion slice/, "Module contract should keep the adoption scope deliberate");
assert.match(moduleDevelopment, /Before converting a module view, identify which pieces are framework-owned anatomy/, "Developer guide should include module view adoption steps");
assert.match(moduleDevelopment, /Do not call `document\.createElement\("dialog"\)` directly in converted surfaces/, "Developer guide should include converted dialog guardrails");
assert.match(uiLayoutGuide, /Use `LongtailForge\.view` for converted framework-owned view anatomy/, "UI layout guide should include view helper usage");
assert.match(uiLayoutGuide, /Disclosure `<summary>` toggles must keep their native disclosure marker/, "UI layout guide should require disclosure summaries to keep the native caret");
assert.match(architecture, /framework-owned view-building helper layer/, "Architecture doc should include the view-building helper boundary");
assert.match(helpModules, /Shared framework view patterns/, "Help should describe shared module view behavior without developer-only class details");

assert.match(changelog, /## Version 0\.33\.5\.15\.6 - /, "Changelog should include the closeout version");
assert.match(regressionSuite, /scripts\/view-builder-closeout-regression\.mjs/, "Regression suite should include the view-builder closeout regression");

console.log("View builder closeout regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}
