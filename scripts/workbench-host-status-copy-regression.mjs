import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appVersion = "0.33.6.6d";
const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const css = readText("public/css/longtail-forge.css");
const roadmap = readText("ROADMAP.md");
const workbenchHtml = readText("views/protected/workbench.html");
const workbenchScript = readText("public/js/workbench.js");

assert.equal(packageJson.version, appVersion, "package.json should report the Workbench host status cleanup version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the Workbench host status cleanup version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the Workbench host status cleanup version");

assert.match(
  workbenchHtml,
  /longtail-forge\.css\?v=25[\s\S]*workbench\.js\?v=20/,
  "Workbench host should bump stylesheet and script cache keys for the status-slot cleanup",
);
assert.doesNotMatch(
  workbenchScript,
  /Choose a focus, then start one useful next action\./,
  "Workbench should remove the static intro subtitle from the page header",
);
assert.match(
  workbenchScript,
  /const headerBody = header\.querySelector\("\.view-page-header-body"\);[\s\S]*statusText = workbenchViewHelpers\.createStatusMessage\(\{[\s\S]*className: "workbench-header-status"[\s\S]*hidden: true[\s\S]*\}\);[\s\S]*headerBody\?\.appendChild\(statusText\);/,
  "Workbench should mount its status primitive in the header body where the intro subtitle used to live",
);
assert.match(
  workbenchScript,
  /workbenchHost\.replaceChildren\([\s\S]*header,[\s\S]*createGuidedFocusPanel\(\)[\s\S]*createRecommendedActionPanel\(\)[\s\S]*createSecondaryWorkbenchPanel\(\)/,
  "Workbench host should no longer render a standalone top-level status box under the header",
);
assert.match(
  workbenchScript,
  /function renderWorkbenchStatus\(\) \{[\s\S]*statusText\.hidden = !message;[\s\S]*statusText\.dataset\.viewTone = transientStatus\.isError \? "danger" : "info";[\s\S]*\}/,
  "Workbench should render header-slot status state through the shared view status primitive",
);
assert.match(
  workbenchScript,
  /function projectFocusStatusMessage\(\) \{[\s\S]*Select a project to narrow the recommendation\./,
  "Workbench should treat the project-focus no-selection state as contextual header status",
);
assert.match(
  workbenchScript,
  /function setStatus\(message, options = \{\}\) \{[\s\S]*transientStatus = \{[\s\S]*message: String\(message \|\| ""\),[\s\S]*\};[\s\S]*renderWorkbenchStatus\(\);[\s\S]*\}/,
  "Workbench status updates should flow through the relocated header status slot",
);

assert.match(
  css,
  /\.workbench-header-status\.view-status-message\.surface-main-panel \{[\s\S]*padding: 0;[\s\S]*border: 0;[\s\S]*background: none;[\s\S]*\}/,
  "Workbench header status should reuse the view status primitive without restoring a panel box",
);
assert.match(
  css,
  /\.workbench-header-status\.view-status-message\.surface-main-panel\.is-error,[\s\S]*\[data-view-tone="danger"\] \{[\s\S]*color: var\(--color-danger\);[\s\S]*\}/,
  "Workbench header status should keep danger styling in the relocated slot",
);
assert.doesNotMatch(
  css,
  /\.workbench-status\b/,
  "Workbench should remove the deprecated standalone status-box styling hook",
);

assert.match(
  roadmap,
  /### Version 0\.33\.6\.6b - Workbench host status and intro-copy cleanup[\s\S]*- \[x\] Remove the frequently-empty status box[\s\S]*- \[x\] Relocate the transient status messages[\s\S]*- \[x\] Do not hand-build framework-owned header\/status anatomy[\s\S]*- \[x\] Add a focused static\/browser regression/,
  "Roadmap should mark the Workbench host status cleanup slice complete",
);

console.log("Workbench host status and intro-copy cleanup regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}
