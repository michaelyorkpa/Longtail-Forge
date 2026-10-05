import assert from "node:assert/strict";

import { createProjectTextReader, extractFunctionBody } from "../../test-support/source-scan.mjs";
// Consolidated under workbench.current-static-contracts by 0.33.33.10.
const { readText } = createProjectTextReader();

const appShellService = readText("src/services/app-shell.service.js");
const footerScript = readText("public/js/footer.js");
const moduleContract = readText("docs/module-contract.md");
const viewContract = readText("docs/view-building-contract.md");
const workbenchHtml = readText("views/protected/workbench.html");
const workbenchScript = readText("public/js/workbench.js");

assert.match(
  workbenchHtml,
  /longtail-forge\.css[\s\S]*workbench\.js/,
  "Workbench should bump its script cache key after removing Quick Notes",
);
assert.doesNotMatch(
  workbenchScript,
  /createQuickNotesSection|Quick Notes|quick-notes|workbenchQuickNotes|workbench-quick-notes/,
  "Workbench browser code should not keep the removed Quick Notes section or hooks",
);

const secondaryWorkbenchPanel = extractFunctionBody(workbenchScript, "createSecondaryWorkbenchPanel");
assert.match(
  secondaryWorkbenchPanel,
  /createTimerSection\(\)/,
  "Workbench should keep Timers after Quick Notes removal",
);
assert.doesNotMatch(
  secondaryWorkbenchPanel,
  /createQuickNotesSection|quick-notes|Quick Notes|createSecondaryCandidateSection/,
  "Workbench secondary layout should not mount Quick Notes or the retired main-column overflow",
);

assert.match(
  appShellService,
  /id: "note"[\s\S]*actionType: "module-action"[\s\S]*moduleActionId: "notes\.add"[\s\S]*requiredPermissions: \["notes\.create"\]/,
  "QAC Note should remain the low-distraction note capture path",
);
assert.match(
  footerScript,
  /"notes\.add": \[[\s\S]*module: true, src: "js\/notes\.js"[\s\S]*function loadQuickActionScript\(dependency\)[\s\S]*dependency\.module[\s\S]*import\(key\)/,
  "QAC Note should still lazy-load the existing Notes dialog safely",
);
assert.match(
  extractFunctionBody(workbenchScript, "candidateModuleAction"),
  /actionId: "notes\.view"[\s\S]*recordParam: "noteId"/,
  "Workbench Inspector should remain the related-note context/open path",
);
assert.match(
  extractFunctionBody(workbenchScript, "createWorkbenchInspectorPanel"),
  /More in this focus[\s\S]*Other work matching the selected focus/,
  "Workbench Inspector should keep visible overflow affordance after Quick Notes removal",
);

assert.match(
  moduleContract,
  /As of 0\.33\.6\.11b[\s\S]*no longer renders a Quick Notes section[\s\S]*QAC Note action[\s\S]*Workbench Inspector/,
  "Module contract should record the no-Quick-Notes Workbench boundary",
);
assert.match(
  viewContract,
  /Workbench \| As of 0\.33\.6\.12d-1[\s\S]*must not render[\s\S]*Quick Notes/,
  "View-building contract should include the current no-Quick-Notes Workbench anatomy",
);

console.log("Workbench remove Quick Notes regression passed.");