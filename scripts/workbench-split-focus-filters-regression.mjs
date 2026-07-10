import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appVersion = "0.33.6.14a";
const changelog = readText("CHANGELOG.md");
const css = readText("public/css/longtail-forge.css");
const moduleContract = readText("docs/module-contract.md");
const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const roadmap = readText("ROADMAP.md");
const workbenchScript = readText("public/js/workbench.js");
const focusModesService = readText("src/services/work-focus-modes.service.js");

assert.equal(packageJson.version, appVersion, "package.json should report the split Workbench focus-filter version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the split Workbench focus-filter version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the split Workbench focus-filter version");

assert.match(
  workbenchScript,
  /WORKBENCH_CLIENT_FOCUS_KEY[\s\S]*WORKBENCH_PROJECT_FOCUS_KEY/,
  "Workbench should persist client and project focus filters independently",
);
assert.match(
  workbenchScript,
  /workbenchClientFocusSelect[\s\S]*data-client-workspace-control[\s\S]*workbenchProjectFocusSelect[\s\S]*workbenchFocusScopeControls/,
  "Workbench focus box should render a Business-only client filter beside a project filter",
);
assert.match(
  workbenchScript,
  /function usesClientScope\(workspaceType = state\.workspaceType\)[\s\S]*normalizeWorkspaceType\(workspaceType\) === "business"/,
  "Workbench client filter visibility should stay workspace-type driven",
);
assert.match(
  workbenchScript,
  /async function handleClientFocusChange\(\)[\s\S]*resolveProjectSelection\(state\.selectedProjectId, state\.clients, state\.selectedClientId\)[\s\S]*await refreshFocusCandidates\(\)/,
  "Changing the client filter should reconcile stale project scope before reloading focus candidates",
);
assert.match(
  workbenchScript,
  /async function handleProjectFocusChange\(\)[\s\S]*window\.localStorage\.setItem\(WORKBENCH_PROJECT_FOCUS_KEY, state\.selectedProjectId\);[\s\S]*await refreshFocusCandidates\(\)/,
  "Changing the project filter should reload every focus mode, not only Project focus",
);
assert.match(
  workbenchScript,
  /const selectedClientScopeId = selectedClientCandidateScopeId\(\);[\s\S]*params\.set\("clientId", selectedClientScopeId\);[\s\S]*if \(state\.selectedProjectId\) \{[\s\S]*params\.set\("projectId", state\.selectedProjectId\)/,
  "Workbench focus requests should pass non-empty client and project filters for all focus modes",
);
assert.doesNotMatch(
  workbenchScript,
  /projectFocusControl\.hidden = state\.focusModeId !== PROJECT_FOCUS_MODE_ID/,
  "Workbench project filter must not be hidden outside Project focus",
);
assert.doesNotMatch(
  workbenchScript,
  /return projects\[0\]\?\.id \|\| "";/,
  "Workbench should not auto-select the first project when the focus filter is unset",
);

assert.match(
  focusModesService,
  /function mergeScopeFilters\(filters = \{\}, input = \{\}, workspaceContext = \{\}\)[\s\S]*workspaceContext\.workspaceType === "business"[\s\S]*merged\.clientId = clientId[\s\S]*merged\.projectId = projectId/,
  "Focus resolver should merge exact client/project filters before building the candidate query",
);
assert.match(
  focusModesService,
  /function normalizeScope\(scope, filters\)[\s\S]*clientId: textValue\(firstValue\(scope\.clientId, filters\.clientId\)[\s\S]*projectId: textValue\(firstValue\(scope\.projectId, filters\.projectId\)/,
  "Focus context scope should expose the active exact client/project filters",
);
assert.match(
  css,
  /\.workbench-focus-scope-controls[\s\S]*grid-template-columns: repeat\(2, minmax\(180px, 1fr\)\)/,
  "Workbench CSS should lay out the split focus filters as a paired control row",
);

assert.match(
  moduleContract,
  /As of 0\.33\.6\.14\.1[\s\S]*shared permission-aware hierarchy scope resolver:[\s\S]*readable descendant sub-clients\/sub-projects[\s\S]*leaf still drills down to that one client or project/,
  "Module contract should document the split filters and shipped descendant-aware hierarchy scope",
);
assert.match(
  roadmap,
  /Active cursor: `0\.33\.6\.15`[\s\S]*Completed work through `0\.33\.6\.14a` is archived in `ROADMAP-ARCHIVE\.md`\./,
  "Roadmap should archive the shipped hierarchy follow-up and advance to the next live slice",
);
assert.match(
  changelog,
  /## Version 0\.33\.6\.6e - [\s\S]*Split the Workbench focus box into separate Client and Project filters[\s\S]*0\.33\.6\.13/,
  "Changelog should record the split focus filters and hierarchy follow-up",
);

console.log("Workbench split focus filters regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}
