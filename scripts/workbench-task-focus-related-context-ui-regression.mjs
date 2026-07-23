import { appVersion } from "../src/core/version.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assertRoadmapCursorAtLeast } from "./lib/roadmap-cursor.mjs";

const changelog = readText("CHANGELOG.md");
const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const css = readText("public/css/longtail-forge.css");
const moduleContract = readText("docs/module-contract.md");
const uiSurfaceContract = readText("docs/ui-surface-contract.md");
const viewContract = readText("docs/view-building-contract.md");
const workbenchHtml = readText("views/protected/workbench.html");
const workbenchScript = readText("public/js/workbench.js");

assert.equal(packageJson.version, appVersion, "package.json should report the Task Focus related-context UI version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the Task Focus related-context UI version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the Task Focus related-context UI version");

assert.match(
  workbenchHtml,
  /longtail-forge\.css[\s\S]*workbench\.js/,
  "Workbench should reference CSS and JS for Task Focus related-context UI",
);
assert.match(
  functionBody(workbenchScript, "refreshTaskFocusRelatedContext"),
  /\/api\/workbench\/task-focus\/\$\{encodeURIComponent\(taskId\)\}\/related-context[\s\S]*cache: "no-store"[\s\S]*normalizeTaskFocusRelatedContext\(result, taskId\)/,
  "Task Focus Inspector should load selected-task related context from the e-1 route",
);
assert.match(
  functionBody(workbenchScript, "refreshActiveTaskFocus"),
  /api\.getJson\(`\/api\/tasks\/\$\{encodeURIComponent\(taskId\)\}`[\s\S]*await refreshTaskFocusRelatedContext\(taskId\)/,
  "Selected task details should load before related context is fetched",
);
assert.match(
  functionBody(workbenchScript, "renderTaskFocusInspector"),
  /syncTaskFocusInspectorCollapseState\(taskFocusInspectorCollapsed, \{ enableCollapse: true \}\)[\s\S]*taskFocusRelatedContextState\(\)[\s\S]*createTaskFocusRelatedContextGroup\(group\)/,
  "Task Focus Inspector should render groups from the selected-task related-context state",
);
assert.doesNotMatch(
  functionBody(workbenchScript, "renderTaskFocusInspector"),
  /workbenchInspectorCandidates|recommendedOverflowCandidates/,
  "Task Focus Inspector must not render Focus Selection overflow candidates",
);
assert.match(
  functionBody(workbenchScript, "createTaskFocusRelatedContextItem"),
  /const context = relatedContextContextLabel\(item\)[\s\S]*workbenchRelatedContextAction[\s\S]*workbenchRelatedContextRecord[\s\S]*const badges = relatedContextBadges\(item\)[\s\S]*openTaskFocusRelatedContextItem\(item, event\.currentTarget\)/,
  "Related rows should render service-provided titles, source/reason labels, badges, and stable action hooks",
);
assert.match(
  functionBody(workbenchScript, "openRelatedContextModuleAction"),
  /sourceTaskId: state\.activeTaskFocus\?\.taskId[\s\S]*sourceType: "task-focus-related-context"[\s\S]*window\.LongtailForge\.moduleActions\.open\(action\.moduleActionId/,
  "Related rows should dispatch through existing module actions with Task Focus source context",
);
assert.match(
  functionBody(workbenchScript, "openRelatedContextModuleAction"),
  /action\.fallbackUrl[\s\S]*navigateFromWorkbench\(action\.fallbackUrl, "related-context-error-fallback"\)/,
  "Related rows should keep an explicit guarded fallback URL path when module action dispatch fails",
);
assert.match(
  functionBody(workbenchScript, "ensureWorkbenchFilePreviewAction"),
  /actionId !== "files\.preview"[\s\S]*filePreview\.openFilePreview[\s\S]*moduleActions\?\.register\?\.\(\{[\s\S]*actionId: "files\.preview"/,
  "Workbench should adapt files.preview to the already-loaded shared File Preview helper without loading the full Files page",
);
assert.doesNotMatch(
  workbenchScript,
  /js\/files\.js/,
  "Workbench must not lazy-load the Files page adapter just to preview a related attachment",
);

assert.match(
  functionBody(workbenchScript, "createWorkbenchInspectorPanel"),
  /workbenchInspectorCollapseButton[\s\S]*icon: "down"[\s\S]*workbench-inspector-related-context-list[\s\S]*aria-labelledby/,
  "Task Focus Inspector should expose a visible caret/collapse control and stable related-context body",
);
assert.match(
  functionBody(workbenchScript, "syncTaskFocusInspectorCollapseState"),
  /workbenchInspectorCollapsed[\s\S]*workbenchInspectorList\.hidden = enableCollapse && collapsed[\s\S]*aria-expanded/,
  "Task Focus Inspector collapse should preserve the side panel while hiding only the list body",
);
assert.match(
  functionBody(workbenchScript, "enterTaskFocus"),
  /taskFocusInspectorCollapsed = false/,
  "Task Focus Inspector should default open when a task is focused",
);
assert.match(
  css,
  /\.workbench-inspector-collapse-button[\s\S]*\.workbench-inspector\[data-workbench-inspector-collapsed="true"\] \.workbench-inspector-collapse-button \.icon[\s\S]*rotate\(-90deg\)/,
  "Task Focus Inspector should show a visible rotating caret for collapsed state",
);
assert.match(
  css,
  /\.workbench-inspector-list\[hidden\] \{[\s\S]*display: none;[\s\S]*\.workbench-inspector-group-heading[\s\S]*grid-template-columns: minmax\(0, 1fr\) auto/,
  "Task Focus Inspector should hide the scroll body when collapsed and render grouped context rows",
);
assert.match(
  css,
  /@media \(max-width: 1099px\) \{[\s\S]*\.workbench-inspector \{[\s\S]*display: none;/,
  "Task Focus Inspector should keep the existing narrow-layout hide behavior",
);
assert.doesNotMatch(
  workbenchScript,
  /workbench-inspector-preview|createElement\("iframe"\)|\.innerHTML/,
  "Task Focus Inspector must not introduce an embedded preview pane",
);

assert.match(
  moduleContract,
  /As of 0\.33\.6\.12e-2[\s\S]*Task Focus Inspector[\s\S]*selected-task related-context route/,
  "Module contract should record the Task Focus Inspector related-context UI boundary",
);
assert.match(
  uiSurfaceContract,
  /As of 0\.33\.6\.12e-2[\s\S]*Task Focus Inspector[\s\S]*selected-task related-context[\s\S]*collapsible/,
  "UI surface contract should record the Task Focus Inspector UI behavior",
);
assert.match(
  viewContract,
  /Workbench \| As of 0\.33\.6\.12d-1[\s\S]*selected-task related-context read model[\s\S]*Task Focus related-context service owns selected-task aggregation/,
  "View-building contract should include the selected-task related-context Inspector boundary",
);
assert.match(
  changelog,
  /## Version 0\.33\.6\.12e-2[\s\S]*selected-task related-context read model from 0\.33\.6\.12e-1 instead of Focus Selection candidate overflow[\s\S]*existing module actions or explicit safe fallbacks/,
  "Changelog should preserve the Task Focus related-context UI closeout",
);
assertRoadmapCursorAtLeast("0.33.8", "Live roadmap should advance to the current active cursor after the completed Workbench history");

console.log("Workbench Task Focus related-context UI regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function functionBody(source, name) {
  const starts = [
    `async function ${name}(`,
    `function ${name}(`,
    `${name}: () => (`,
  ];
  const start = starts
    .map((signature) => source.indexOf(signature))
    .find((index) => index >= 0);
  assert.notEqual(start, undefined, `Missing function ${name}`);

  const signatureEnd = source.indexOf(") {", start);
  const openBrace = signatureEnd >= 0 ? signatureEnd + 2 : source.indexOf("{", start);
  assert.notEqual(openBrace, -1, `Missing body for function ${name}`);

  let depth = 0;
  for (let index = openBrace; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openBrace, index + 1);
      }
    }
  }

  throw new Error(`Could not parse function ${name}`);
}
