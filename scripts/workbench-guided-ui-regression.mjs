import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appVersion = "0.33.6.12c-2";
const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const css = readText("public/css/longtail-forge.css");
const roadmap = readText("ROADMAP.md");
const routes = readText("src/routes/workbench.routes.js");
const workbenchHtml = readText("views/protected/workbench.html");
const workbenchScript = readText("public/js/workbench.js");

assert.equal(packageJson.version, appVersion, "package.json should report the guided Workbench UI version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the guided Workbench UI version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the guided Workbench UI version");

assert.match(
  workbenchHtml,
  /<main class="workbench-page" data-workbench-host><\/main>/,
  "Workbench protected HTML should be a minimal framework host",
);
assert.match(
  workbenchHtml,
  /view-builder\.js\?v=16[\s\S]*view-renderer\.js\?v=13[\s\S]*workbench\.js\?v=31/,
  "Workbench host should load view helpers before the guided Workbench adapter",
);
assert.match(
  workbenchScript,
  /const workbenchViewHelpers = window\.LongtailForge\.view;/,
  "Workbench should keep its view helper binding scoped to a Workbench-specific name",
);
assert.doesNotMatch(
  workbenchScript,
  /const view = window\.LongtailForge\.view;/,
  "Workbench must not redeclare the generic classic-script view binding used by other protected scripts",
);
assert.doesNotMatch(
  workbenchHtml,
  /data-workbench-renderer|data-workbench-card|workbench-manual-timer-form|workbench-task-toolbar|workbench-task-list|<details|page-heading/,
  "Workbench host must not carry the old static card/page anatomy",
);
assert.match(
  workbenchScript,
  /const WORKBENCH_VIEW_STATE_FOCUS_SELECTION = "focus-selection";[\s\S]*const WORKBENCH_VIEW_STATE_TASK_FOCUS = "task-focus";/,
  "Workbench should define explicit Focus Selection and Task Focus states",
);

assert.match(
  routes,
  /workFocusModesService[\s\S]*workbenchRoutes\.get\("\/workbench\/focus-modes"[\s\S]*listFocusModes\(request\.session, request\.query\)/,
  "Workbench routes should expose protected focus mode descriptors",
);
assert.match(
  routes,
  /workbenchRoutes\.get\("\/workbench\/focus-candidates"[\s\S]*listFocusCandidates\(request\.session, request\.query\)/,
  "Workbench routes should expose protected focus candidate results",
);

assert.match(
  workbenchScript,
  /const GUIDED_FOCUS_MODE_IDS = \[[\s\S]*"pick-up-where-left-off"[\s\S]*"whats-due-next"[\s\S]*"work-this-week"[\s\S]*"review-blocked-work"[\s\S]*PROJECT_FOCUS_MODE_ID[\s\S]*\];/,
  "Workbench should curate the initial guided focus-mode subset",
);
assert.match(
  workbenchScript,
  /"whats-due-next": \{[\s\S]*label: "Start with what's due"/,
  "Workbench should render friendly question-led focus copy instead of raw mode labels only",
);
assert.match(
  workbenchScript,
  /workbenchHost\.replaceChildren\([\s\S]*header,[\s\S]*createWorkbenchShell\(\)[\s\S]*function createWorkbenchShell\(\)[\s\S]*createGuidedFocusPanel\(\)[\s\S]*createRecommendedActionPanel\(\)[\s\S]*createSecondaryWorkbenchPanel\(\)[\s\S]*createWorkbenchInspectorPanel\(\)/,
  "Workbench adapter should build the page shell from framework-created sections",
);
assert.match(workbenchScript, /workbenchViewHelpers\.createPageHeader/, "Workbench should use the shared page header primitive");
assert.match(workbenchScript, /workbenchViewHelpers\.createStatusMessage/, "Workbench should use the shared status primitive");
assert.match(workbenchScript, /workbenchViewHelpers\.createEmptyState/, "Workbench should use the shared empty-state primitive");
assert.match(
  workbenchScript,
  /api\.getJson\("\/api\/workbench\/focus-modes"[\s\S]*api\.getJson\(`\/api\/workbench\/focus-candidates\?\$\{params\.toString\(\)\}`/,
  "Workbench browser code should load focus data from protected Workbench routes",
);
assert.match(
  workbenchScript,
  /params\.set\("projectId", state\.selectedProjectId\)/,
  "Project focus should pass the selected project into the deterministic focus resolver",
);
assert.match(
  workbenchScript,
  /const RECOMMENDED_CANDIDATE_LIMIT = 5;/,
  "Workbench should cycle the top-five ranked candidates before right-panel overflow",
);
assert.match(
  workbenchScript,
  /const candidate = candidates\[state\.recommendedCandidateIndex\] \|\| null;/,
  "Workbench should render one recommended candidate from the ranked cycle window",
);
assert.match(
  workbenchScript,
  /for \(const candidate of recommendedOverflowCandidates\(\)\)/,
  "Workbench should render overflow candidates in the right-side Inspector",
);
assert.match(
  workbenchScript,
  /workbenchRecommendedAction/,
  "Workbench should expose a stable recommended-action rendering hook",
);
assert.match(
  workbenchScript,
  /workbenchInspectorList/,
  "Workbench should expose a stable right-panel overflow rendering hook",
);
assert.match(
  workbenchScript,
  /Capture the next commitment or adjust the focus\.[\s\S]*Nothing needs this focus right now/,
  "Workbench empty states should suggest a useful next step",
);
assert.match(
  workbenchScript,
  /label: "Change Focus"[\s\S]*onClick: changeFocus/,
  "Workbench should expose Change Focus as the header state action",
);
assert.doesNotMatch(workbenchScript, /label: "Dismiss"|dismissResumeCandidate/, "Workbench should not render candidate dismissal controls");
assert.match(
  workbenchScript,
  /async function openCandidate\(candidate, trigger = null, options = \{\}\)[\s\S]*enterTaskFocus\(candidate, taskId\)[\s\S]*openNonTaskFocusFallback\(candidate\)[\s\S]*await openTaskCandidate\(candidate, taskId, trigger\)/,
  "Recommended candidate openers should enter Task Focus while context opens retain the explicit editor path",
);

assert.match(css, /\.workbench-focus-question-list/, "Workbench CSS should style the focus question list");
assert.match(css, /\.workbench-recommended-card/, "Workbench CSS should emphasize the recommended candidate");
assert.match(css, /\.workbench-inspector-list[\s\S]*overflow-y: auto;/, "Workbench CSS should bound right-panel overflow candidates");

assert.match(
  roadmap,
  /### Version 0\.33\.6\.6 - Guided Workbench UI[\s\S]*- \[x\] Replace the hardcoded `views\/protected\/workbench\.html` host[\s\S]*Acceptance criteria:/,
  "Roadmap should mark guided Workbench UI host conversion complete",
);

console.log("Workbench guided UI regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}
