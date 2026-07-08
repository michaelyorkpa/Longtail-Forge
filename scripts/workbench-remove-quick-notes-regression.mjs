import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appVersion = "0.33.6.12c-2";
const appShellService = readText("src/services/app-shell.service.js");
const footerScript = readText("public/js/footer.js");
const moduleContract = readText("docs/module-contract.md");
const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const roadmap = readText("ROADMAP.md");
const viewContract = readText("docs/view-building-contract.md");
const workbenchHtml = readText("views/protected/workbench.html");
const workbenchScript = readText("public/js/workbench.js");

assert.equal(packageJson.version, appVersion, "package.json should report the Workbench no-Quick-Notes version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the Workbench no-Quick-Notes version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the Workbench no-Quick-Notes version");

assert.match(
  workbenchHtml,
  /longtail-forge\.css\?v=32[\s\S]*workbench\.js\?v=31/,
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
  /"notes\.add": \[[\s\S]*module: true, src: "js\/notes\.js\?v=71"[\s\S]*function loadQuickActionScript\(dependency\)[\s\S]*dependency\.module[\s\S]*import\(key\)/,
  "QAC Note should still lazy-load the existing Notes dialog safely",
);
assert.match(
  functionBody(workbenchScript, "candidateModuleAction"),
  /actionId: "notes\.edit"[\s\S]*recordParam: "noteId"/,
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
  /Workbench \| As of 0\.33\.6\.12c-2[\s\S]*must not render[\s\S]*Quick Notes/,
  "View-building contract should include the current no-Quick-Notes Workbench anatomy",
);
assert.match(
  roadmap,
  /### Version 0\.33\.6\.11b - Remove the Quick Notes section from the Workbench[\s\S]*- \[x\] Remove the Quick Notes section[\s\S]*- \[x\] Confirm no capture\/context gap remains[\s\S]*- \[x\] Preserve permission\/enabled-module handling[\s\S]*- \[x\] Add a regression proving the Workbench renders no Quick Notes section/,
  "Roadmap should mark the Workbench no-Quick-Notes slice complete",
);

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
