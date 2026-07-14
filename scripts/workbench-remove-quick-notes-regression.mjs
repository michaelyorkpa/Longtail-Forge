import { appVersion } from "../src/core/version.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assertRoadmapCursorAtLeast } from "./lib/roadmap-cursor.mjs";

const appShellService = readText("src/services/app-shell.service.js");
const changelog = readText("CHANGELOG.md");
const footerScript = readText("public/js/footer.js");
const moduleContract = readText("docs/module-contract.md");
const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const viewContract = readText("docs/view-building-contract.md");
const workbenchHtml = readText("views/protected/workbench.html");
const workbenchScript = readText("public/js/workbench.js");

assert.equal(packageJson.version, appVersion, "package.json should report the Workbench no-Quick-Notes version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the Workbench no-Quick-Notes version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the Workbench no-Quick-Notes version");

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

const secondaryWorkbenchPanel = functionBody(workbenchScript, "createSecondaryWorkbenchPanel");
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
  functionBody(workbenchScript, "candidateModuleAction"),
  /actionId: "notes\.view"[\s\S]*recordParam: "noteId"/,
  "Workbench Inspector should remain the related-note context/open path",
);
assert.match(
  functionBody(workbenchScript, "createWorkbenchInspectorPanel"),
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
assert.match(
  changelog,
  /## Version 0\.33\.6\.11b[\s\S]*marked the 0\.33\.6\.11b roadmap slice complete[\s\S]*no Quick Notes markers/,
  "Changelog should preserve the Workbench no-Quick-Notes slice closeout",
);
assertRoadmapCursorAtLeast("0.33.8", "Live roadmap should advance to the current active cursor after the completed Workbench history");

console.log("Workbench remove Quick Notes regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`) >= 0
    ? source.indexOf(`function ${name}(`)
    : source.indexOf(`async function ${name}(`);
  assert.notEqual(start, -1, `Missing function ${name}`);

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

  assert.fail(`Could not extract function body for ${name}`);
}
