import assert from "node:assert/strict";

import { createProjectTextReader, extractFunctionBody } from "../../test-support/source-scan.mjs";
// Consolidated under workbench.current-static-contracts by 0.33.33.10.
const { readText } = createProjectTextReader();

const css = readText("public/css/longtail-forge.css");
const moduleContract = readText("docs/module-contract.md");
const uiSurfaceContract = readText("docs/ui-surface-contract.md");
const viewContract = readText("docs/view-building-contract.md");
const workbenchHtml = readText("views/protected/workbench.html");
const workbenchScript = readText("public/js/workbench.js");

assert.match(
  workbenchHtml,
  /longtail-forge\.css[\s\S]*workbench\.js/,
  "Workbench should reference CSS and JS for Task Focus related-context UI",
);
assert.match(
  extractFunctionBody(workbenchScript, "refreshTaskFocusRelatedContext"),
  /\/api\/workbench\/task-focus\/\$\{encodeURIComponent\(taskId\)\}\/related-context[\s\S]*cache: "no-store"[\s\S]*normalizeTaskFocusRelatedContext\(result, taskId\)/,
  "Task Focus Inspector should load selected-task related context from the e-1 route",
);
assert.match(
  extractFunctionBody(workbenchScript, "refreshActiveTaskFocus"),
  /api\.getJson\(`\/api\/tasks\/\$\{encodeURIComponent\(taskId\)\}`[\s\S]*await refreshTaskFocusRelatedContext\(taskId\)/,
  "Selected task details should load before related context is fetched",
);
assert.match(
  extractFunctionBody(workbenchScript, "renderTaskFocusInspector"),
  /syncTaskFocusInspectorCollapseState\(taskFocusInspectorCollapsed, \{ enableCollapse: true \}\)[\s\S]*taskFocusRelatedContextState\(\)[\s\S]*createTaskFocusRelatedContextGroup\(group\)/,
  "Task Focus Inspector should render groups from the selected-task related-context state",
);
assert.doesNotMatch(
  extractFunctionBody(workbenchScript, "renderTaskFocusInspector"),
  /workbenchInspectorCandidates|recommendedOverflowCandidates/,
  "Task Focus Inspector must not render Focus Selection overflow candidates",
);
assert.match(
  extractFunctionBody(workbenchScript, "createTaskFocusRelatedContextItem"),
  /const context = relatedContextContextLabel\(item\)[\s\S]*workbenchRelatedContextAction[\s\S]*workbenchRelatedContextRecord[\s\S]*const badges = relatedContextBadges\(item\)[\s\S]*openTaskFocusRelatedContextItem\(item, event\.currentTarget\)/,
  "Related rows should render service-provided titles, source/reason labels, badges, and stable action hooks",
);
assert.match(
  extractFunctionBody(workbenchScript, "openRelatedContextModuleAction"),
  /sourceTaskId: state\.activeTaskFocus\?\.taskId[\s\S]*sourceType: "task-focus-related-context"[\s\S]*(?:window\.LongtailForge\.)?moduleActions\.open\(action\.moduleActionId/,
  "Related rows should dispatch through existing module actions with Task Focus source context",
);
assert.match(
  extractFunctionBody(workbenchScript, "openRelatedContextModuleAction"),
  /action\.fallbackUrl[\s\S]*navigateFromWorkbench\(action\.fallbackUrl, "related-context-error-fallback"\)/,
  "Related rows should keep an explicit guarded fallback URL path when module action dispatch fails",
);
// 0.33.33.34 retired the inline bridge this used to assert. files.preview is now a
// first-party registry entry whose opener and dependency both name the shared preview
// helper, so no host page synthesizes an opener or writes into the Files namespace.
const moduleActionsScript = readText("public/js/shared/module-actions.js");
const filePreviewScript = readText("public/js/shared/file-preview.js");
assert.match(
  moduleActionsScript,
  /"files\.preview": \[[\s\S]*member: "openFilePreviewAction", src: "js\/shared\/file-preview\.js", surface: "filePreview"/,
  "files.preview should load the shared File Preview helper rather than the Files page controller",
);
assert.match(
  moduleActionsScript,
  /id: "files\.preview"[\s\S]*open: \(params, hostContext\) => namespace\.filePreview\.openFilePreviewAction\(params, hostContext\)/,
  "files.preview should dispatch through the shared File Preview helper",
);
assert.match(
  extractFunctionBody(filePreviewScript, "openFilePreviewAction"),
  /File Preview requires an attachment record\.[\s\S]*openFilePreview\(attachmentOrRow[\s\S]*hostContext\?\.cancel\?\.\(\{[\s\S]*actionId: "files\.preview"/,
  "The shared preview helper should own the action-shaped opener, including its host-context settle",
);
assert.doesNotMatch(
  workbenchScript,
  /filesDialog/,
  "Workbench must not write or read the Files dialog namespace once the bridge is retired",
);
assert.doesNotMatch(
  workbenchScript,
  /js\/files\.js/,
  "Workbench must not lazy-load the Files page adapter just to preview a related attachment",
);

assert.match(
  extractFunctionBody(workbenchScript, "createWorkbenchInspectorPanel"),
  /workbenchInspectorCollapseButton[\s\S]*icon: "down"[\s\S]*workbench-inspector-related-context-list[\s\S]*aria-labelledby/,
  "Task Focus Inspector should expose a visible caret/collapse control and stable related-context body",
);
assert.match(
  extractFunctionBody(workbenchScript, "syncTaskFocusInspectorCollapseState"),
  /workbenchInspectorCollapsed[\s\S]*workbenchInspectorList\.hidden = enableCollapse && collapsed[\s\S]*aria-expanded/,
  "Task Focus Inspector collapse should preserve the side panel while hiding only the list body",
);
assert.match(
  extractFunctionBody(workbenchScript, "enterTaskFocus"),
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

console.log("Workbench Task Focus related-context UI regression passed.");

/** @param {string} source @param {string} name @returns {string} */