import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appVersion = "0.33.6.11b";
const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const css = readText("public/css/longtail-forge.css");
const moduleContract = readText("docs/module-contract.md");
const roadmap = readText("ROADMAP.md");
const uiSurfaceContract = readText("docs/ui-surface-contract.md");
const viewContract = readText("docs/view-building-contract.md");
const workbenchHtml = readText("views/protected/workbench.html");
const workbenchScript = readText("public/js/workbench.js");

assert.equal(packageJson.version, appVersion, "package.json should report the Workbench Inspector version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the Workbench Inspector version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the Workbench Inspector version");

assert.match(
  workbenchHtml,
  /longtail-forge\.css\?v=29[\s\S]*workbench\.js\?v=27/,
  "Workbench should bump CSS and JS cache keys for the Inspector panel",
);

assert.match(
  workbenchScript,
  /const WORKBENCH_INSPECTOR_LIMIT = 6;/,
  "Workbench should bound Inspector rows instead of turning the panel into another full index",
);
assert.match(
  workbenchScript,
  /function createWorkbenchShell\(\)[\s\S]*className: "workbench-shell"[\s\S]*className: "workbench-main-column"[\s\S]*createWorkbenchInspectorPanel\(\)/,
  "Workbench should add the Inspector as a subordinate layout column beside the existing main surface",
);
assert.match(
  workbenchScript,
  /function createWorkbenchInspectorPanel\(\)[\s\S]*dataset: \{ workbenchInspector: "" \}[\s\S]*Work context/,
  "Workbench should expose a stable Inspector panel hook and heading",
);
assert.match(
  functionBody(workbenchScript, "renderWorkbench"),
  /renderRecommendedAction\(\);[\s\S]*renderSecondaryFocusCandidates\(\);[\s\S]*renderWorkbenchInspector\(\);/,
  "Workbench render should keep the Inspector synchronized with the current focus candidates",
);
assert.match(
  functionBody(workbenchScript, "workbenchInspectorCandidates"),
  /for \(const candidate of state\.focusCandidates \|\| \[\]\)[\s\S]*WORKBENCH_INSPECTOR_LIMIT/,
  "Inspector rows should come from already permission-shaped focus candidates, not a new browser-side record query",
);
assert.doesNotMatch(
  functionBody(workbenchScript, "workbenchInspectorCandidates"),
  /api\.getJson|fetch\(/,
  "Inspector candidate selection should not fetch a separate unscoped record list in the browser",
);

assert.match(
  functionBody(workbenchScript, "createWorkbenchInspectorItem"),
  /className: "workbench-inspector-title"[\s\S]*addEventListener\("click", \(event\) => openCandidate\(candidate, event\.currentTarget\)\)/,
  "Inspector related titles should open through the existing Workbench candidate opener",
);
assert.match(
  functionBody(workbenchScript, "candidateModuleAction"),
  /actionId: "notes\.edit"[\s\S]*recordParam: "noteId"[\s\S]*actionId: "lists\.edit"[\s\S]*recordParam: "listId"/,
  "Inspector should reuse existing Notes and Lists registered edit actions for modal opens",
);
assert.match(
  functionBody(workbenchScript, "openModuleActionCandidate"),
  /ensureWorkbenchModuleAction\(action\.actionId\)[\s\S]*window\.LongtailForge\.moduleActions\.open\(action\.actionId[\s\S]*source: "workbench"[\s\S]*sourceType: "work-candidate"[\s\S]*returnFocusTo: trigger \|\| document\.activeElement/,
  "Inspector module opens should dispatch through moduleActions with Workbench source context and focus return",
);
assert.match(
  workbenchScript,
  /"notes\.edit": \[[\s\S]*module: true, src: "js\/notes\.js\?v=71"[\s\S]*"lists\.edit": \[[\s\S]*module: true, src: "js\/lists\.js\?v=14"/,
  "Workbench should lazy-load Notes and Lists dialog adapters as modules to avoid classic-script lexical collisions",
);
assert.match(
  functionBody(workbenchScript, "loadWorkbenchActionDependency"),
  /dependency\.module[\s\S]*import\(key\)[\s\S]*document\.createElement\("script"\)/,
  "Workbench dependency loading should use dynamic import only for collision-prone module adapters while keeping normal script loading available",
);

assert.match(
  functionBody(workbenchScript, "inspectorCandidateTitle"),
  /!looksLikeRawId\(title\)[\s\S]*return title;[\s\S]*return label \? `\$\{label\} context` : "Work context";/,
  "Inspector visible titles should avoid raw IDs and use a safe fallback label",
);
assert.match(
  functionBody(workbenchScript, "inspectorCandidateContext"),
  /!looksLikeRawId\(context\)[\s\S]*!looksLikeRawId\(reason\)[\s\S]*Ready to review/,
  "Inspector context copy should avoid raw IDs and body/preview content",
);
assert.doesNotMatch(
  workbenchScript,
  /workbench-inspector-preview|iframe|\.innerHTML|files\.preview/,
  "Inspector should not introduce an embedded preview pane or file preview shortcut in this slice",
);

assert.match(
  css,
  /\.workbench-shell[\s\S]*display: grid;[\s\S]*@media \(min-width: 1100px\) \{[\s\S]*\.workbench-shell[\s\S]*grid-template-columns: minmax\(0, 1fr\) minmax\(280px, 340px\)/,
  "Workbench Inspector should be a wide-layout side column, not an overlay",
);
assert.match(
  css,
  /@media \(max-width: 1099px\) \{[\s\S]*\.workbench-inspector \{[\s\S]*display: none;/,
  "Workbench Inspector should hide gracefully on narrow screens",
);
assert.doesNotMatch(
  css,
  /\.workbench-inspector\s*\{[^}]*position:\s*fixed/i,
  "Workbench Inspector should not compete with the fixed QAC drawer space",
);

assert.match(
  moduleContract,
  /As of 0\.33\.6\.11[\s\S]*Workbench Inspector[\s\S]*permission-safe focus candidates[\s\S]*does not render an embedded preview pane/,
  "Module contract should record the Workbench Inspector boundary",
);
assert.match(
  uiSurfaceContract,
  /As of 0\.33\.6\.11[\s\S]*Workbench Inspector[\s\S]*wide Workbench layouts[\s\S]*not a fixed drawer/,
  "UI surface contract should record the Inspector layout/QAC boundary",
);
assert.match(
  viewContract,
  /Workbench \| As of 0\.33\.6\.11[\s\S]*right-side Inspector[\s\S]*without adding an embedded viewer pane/,
  "View-building contract should include the current Workbench Inspector anatomy",
);
assert.match(
  roadmap,
  /### Version 0\.33\.6\.11 - Workbench Inspector panel[\s\S]*- \[x\] Add a persistent Inspector panel[\s\S]*- \[x\] Show permission-safe related record titles\/context[\s\S]*- \[x\] Do not build an embedded preview pane[\s\S]*- \[x\] Keep the Inspector permission-safe[\s\S]*- \[x\] Degrade gracefully[\s\S]*- \[x\] Add regressions/,
  "Roadmap should mark the Workbench Inspector panel slice complete",
);

console.log("Workbench Inspector panel regression passed.");

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

  throw new Error(`Could not parse function ${name}`);
}
