import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appVersion = "0.33.6.12f";
const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const css = readText("public/css/longtail-forge.css");
const roadmap = readText("ROADMAP.md");
const workbenchHtml = readText("views/protected/workbench.html");
const workbenchScript = readText("public/js/workbench.js");

assert.equal(packageJson.version, appVersion, "package.json should report the collapsible Workbench sections version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the collapsible Workbench sections version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the collapsible Workbench sections version");
assert.match(workbenchHtml, /longtail-forge\.css\?v=34/, "Workbench should bump the shared stylesheet cache key for Workbench section styling");
assert.match(workbenchHtml, /workbench\.js\?v=33/, "Workbench should bump its script cache key for Workbench section changes");

assert.doesNotMatch(
  workbenchScript,
  /function createSecondaryCandidateSection|data-workbench-secondary-candidate-section|workbenchSecondaryCandidates/,
  "The old main-column More in this focus collapsible section should be retired after Inspector owns overflow",
);

const timerSection = extractFunctionBody(workbenchScript, "createTimerSection");
assert.match(
  timerSection,
  /timerSectionElement = createWorkbenchCardSection\(\{[\s\S]*cardId: "active-work-timers"[\s\S]*defaultOpen: hasActiveOrPausedTimers\(\)/,
  "Timers should key its initial open state to whether active or paused timers are loaded",
);

const renderTimers = extractFunctionBody(workbenchScript, "renderTimers");
assert.match(
  renderTimers,
  /syncTimerSectionOpenState\(\)/,
  "Timers should re-evaluate the section open state whenever timer data renders",
);

const syncTimerSectionOpenState = extractFunctionBody(workbenchScript, "syncTimerSectionOpenState");
assert.match(
  syncTimerSectionOpenState,
  /!timerSectionUserToggled[\s\S]*setWorkbenchDisclosureOpen\(timerSectionElement,\s*hasActiveOrPausedTimers\(\)\)/,
  "Timers should auto-open or auto-collapse from timer presence until the user toggles the section",
);
assert.match(
  syncTimerSectionOpenState,
  /timerSectionUserToggled[\s\S]*updateDisclosureExpandedState\(timerSectionElement\)/,
  "Timers should respect an explicit user toggle within the session",
);

const handleWorkbenchCardToggle = extractFunctionBody(workbenchScript, "handleWorkbenchCardToggle");
assert.match(
  handleWorkbenchCardToggle,
  /isTimerWorkbenchCard\(card\)[\s\S]*event\.isTrusted[\s\S]*timerSectionUserToggled = true[\s\S]*return;/,
  "Trusted user toggles of the Timers card should become a session override instead of being persisted as the default",
);

const restoreCardState = extractFunctionBody(workbenchScript, "restoreCardState");
assert.match(
  restoreCardState,
  /if \(isTimerWorkbenchCard\(card\)\) \{[\s\S]*return;[\s\S]*\}/,
  "Saved cross-session card state should not override Timers' timer-presence default",
);

const persistCardState = extractFunctionBody(workbenchScript, "persistCardState");
assert.match(
  persistCardState,
  /if \(isTimerWorkbenchCard\(card\)\) \{[\s\S]*return;[\s\S]*\}/,
  "Timers' dynamic default should not be written into the generic persisted card-state map",
);

assert.match(
  workbenchScript,
  /function createWorkbenchSectionSummary\(\{[\s\S]*"aria-expanded": "false"[\s\S]*"aria-controls"[\s\S]*className: "workbench-section-summary"/,
  "Collapsible Workbench section summaries should expose stable expanded state and controls metadata",
);
assert.match(
  workbenchScript,
  /function updateDisclosureExpandedState\(details\) \{[\s\S]*summary\.setAttribute\("aria-expanded", expanded\)[\s\S]*details\.dataset\.workbenchExpanded = expanded;/,
  "Workbench should keep aria-expanded in sync with details open state",
);

assert.match(
  css,
  /\.workbench-section > summary::before,[\s\S]*\.workbench-timer-card > summary::before \{[\s\S]*border-right: 2px solid currentColor;[\s\S]*transform: rotate\(-45deg\);/,
  "Workbench summaries should render a clear caret affordance while collapsed",
);
assert.match(
  css,
  /\.workbench-section\[open\] > summary::before,[\s\S]*\.workbench-timer-card\[open\] > summary::before \{[\s\S]*transform: rotate\(45deg\);/,
  "Workbench summary carets should rotate when expanded",
);
assert.match(
  css,
  /\.workbench-section > summary:focus-visible,[\s\S]*\.workbench-timer-card > summary:focus-visible \{[\s\S]*outline: 2px solid var\(--color-accent\);[\s\S]*box-shadow: var\(--surface-focus-ring\);/,
  "Workbench collapsible summaries should have visible keyboard focus",
);
assert.match(
  css,
  /\.workbench-section > summary::-webkit-details-marker,[\s\S]*\.workbench-timer-card > summary::-webkit-details-marker \{[\s\S]*display: none;/,
  "The custom caret should replace inconsistent native marker rendering",
);

assert.match(
  roadmap,
  /### Version 0\.33\.6\.6f - Collapsible Workbench sections: default state and caret affordance[\s\S]*- \[x\] Start the "More in this focus" secondary-candidate section collapsed by default[\s\S]*- \[x\] Make the Timers section[\s\S]*- \[x\] Add a clear, consistent caret\/chevron affordance[\s\S]*Acceptance criteria:/,
  "Roadmap should mark collapsible Workbench section defaults and caret affordance complete",
);
assert.match(
  roadmap,
  /### Version 0\.33\.6\.12b - Focus Selection cleanup: Inspector owns More in this focus[\s\S]*- \[x\] Remove the main-column `More in this focus` collapsible section entirely/,
  "Roadmap should mark the retired main-column overflow section complete",
);

console.log("Workbench collapsible sections regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function extractFunctionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Missing function ${name}`);

  const openBrace = source.indexOf("{", start);
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
        return source.slice(openBrace + 1, index);
      }
    }
  }

  assert.fail(`Could not extract function body for ${name}`);
}
