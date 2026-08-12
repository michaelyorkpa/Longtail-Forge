import assert from "node:assert/strict";

import { assertRoadmapCursorAtLeast } from "./lib/roadmap-cursor.mjs";
import { createProjectTextReader } from "./test-support/source-scan.mjs";
const { readText } = createProjectTextReader();

const changelog = readText("CHANGELOG.md");
const moduleContract = readText("docs/module-contract.md");
const css = readText("public/css/longtail-forge.css");
const workbenchHtml = readText("views/protected/workbench.html");
const workbenchScript = readText("public/js/workbench.js");

assert.match(
  workbenchHtml,
  /longtail-forge\.css[\s\S]*workbench\.js/,
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
  /workbenchHost\.replaceChildren\([\s\S]*header,[\s\S]*createWorkbenchShell\(\)[\s\S]*function createWorkbenchShell\(\)[\s\S]*createGuidedFocusPanel\(\)[\s\S]*createRecommendedActionPanel\(\)[\s\S]*createSecondaryWorkbenchPanel\(\)/,
  "Workbench host should no longer render a standalone top-level status box under the header",
);
assert.match(
  workbenchScript,
  /function renderWorkbenchStatus\(\) \{[\s\S]*statusText\.hidden = !message;[\s\S]*statusText\.dataset\.viewTone = transientStatus\.isError \? "danger" : "info";[\s\S]*\}/,
  "Workbench should render header-slot status state through the shared view status primitive",
);
assert.match(
  workbenchScript,
  /function focusScopeStatusMessage\(\) \{[\s\S]*Select a project to narrow the recommendation\./,
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
  moduleContract,
  /As of 0\.33\.6\.6b, the Workbench host no longer renders a standalone top status box or a static intro subtitle under the page heading[\s\S]*shared `LongtailForge\.view\.createStatusMessage\(\)` primitive inside the page-header body/,
  "Module contract should preserve the Workbench host status cleanup boundary",
);
assert.match(
  changelog,
  /## Version 0\.33\.6\.6b[\s\S]*relocated `workbench-header-status` contract without the old intro copy or standalone status box/,
  "Changelog should preserve the Workbench host status cleanup closeout",
);
assertRoadmapCursorAtLeast("0.33.8", "Live roadmap should advance to the current active cursor after the completed Workbench history");

console.log("Workbench host status and intro-copy cleanup regression passed.");
