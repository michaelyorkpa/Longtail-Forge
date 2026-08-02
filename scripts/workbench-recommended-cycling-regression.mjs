import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assertRoadmapCursorAtLeast } from "./lib/roadmap-cursor.mjs";

const changelog = readText("CHANGELOG.md");
const moduleContract = readText("docs/module-contract.md");
const css = readText("public/css/longtail-forge.css");
const workbenchHtml = readText("views/protected/workbench.html");
const workbenchScript = readText("public/js/workbench.js");


assert.match(
  workbenchHtml,
  /workbench\.js/,
  "Workbench should bump its script cache key for the resume recommendation update",
);
assert.match(
  workbenchScript,
  /const RECOMMENDED_CANDIDATE_LIMIT = 5;/,
  "Resume recommendations should cycle the top-five ranked candidates before Inspector overflow",
);
assert.match(
  workbenchScript,
  /recommendedCandidateIndex: 0,/,
  "Workbench state should track the active recommended candidate index",
);
assert.match(
  workbenchScript,
  /dataset: \{ workbenchRecommendedCycleControls: "" \}/,
  "Recommended-action panel should expose a stable cycling-controls hook",
);
assert.match(
  workbenchScript,
  /icon: "previous"[\s\S]*iconOnly: true[\s\S]*label: "Previous"/,
  "Recommended-action panel should render an icon-only previous arrow with the concise accessible label",
);
assert.match(
  workbenchScript,
  /icon: "next"[\s\S]*iconOnly: true[\s\S]*label: "Next"/,
  "Recommended-action panel should render an icon-only next arrow with the concise accessible label",
);
assert.doesNotMatch(
  workbenchScript,
  /Show previous recommendation|Not this one, show another recommendation/,
  "Recommended-action cycle buttons should not keep verbose sentence labels",
);
assert.match(
  workbenchScript,
  /function recommendedCandidateWindow\(\) \{[\s\S]*return state\.focusCandidates\.slice\(0, RECOMMENDED_CANDIDATE_LIMIT\);[\s\S]*\}/,
  "Recommended candidate selection should draw only from the configured ranked window",
);
assert.match(
  workbenchScript,
  /function recommendedOverflowCandidates\(\) \{[\s\S]*return state\.focusCandidates\.slice\(recommendedCandidateWindow\(\)\.length\);[\s\S]*\}/,
  "Overflow candidates should begin after the recommended cycling window",
);
assert.match(
  workbenchScript,
  /for \(const candidate of recommendedOverflowCandidates\(\)\)/,
  "Focus Selection Inspector should render the overflow list instead of duplicating the cycling window",
);
assert.doesNotMatch(
  workbenchScript,
  /state\.focusCandidates\.slice\(1, 7\)/,
  "More-in-this-focus must not keep the old top-candidate-adjacent slice that duplicates cycling candidates",
);

const cycleBody = extractFunctionBody(workbenchScript, "cycleRecommendedCandidate");
assert.match(
  cycleBody,
  /state\.recommendedCandidateIndex = \(state\.recommendedCandidateIndex \+ direction \+ candidates\.length\) % candidates\.length;/,
  "Recommended-action arrows should wrap within the ranked candidate window",
);
assert.match(
  cycleBody,
  /renderRecommendedAction\(\);/,
  "Recommended-action cycling should only refill the single recommended slot",
);
assert.doesNotMatch(
  cycleBody,
  /renderSecondaryFocusCandidates\(\)/,
  "Recommended-action cycling must not re-render a retired main-column overflow list",
);
assert.match(
  cycleBody,
  /renderWorkbenchInspector\(\);/,
  "Recommended-action cycling should keep the right-side overflow count/list synchronized",
);

const recommendedCardBody = extractFunctionBody(workbenchScript, "createRecommendedCandidateCard");
assert.match(
  recommendedCardBody,
  /meta: recommendedCandidateMeta\(candidate\)/,
  "Recommended card meta should come from the client/project-aware, id-safe helper",
);
assert.match(
  recommendedCardBody,
  /title: safeCandidateText\(candidate\.title, "Untitled work"\)/,
  "Recommended card title should never surface raw-identifier copy",
);
assert.match(
  recommendedCardBody,
  /safeCandidateText\(candidate\.reason, ""\)[\s\S]*safeCandidateText\(candidate\.nextAction, ""\)[\s\S]*"This is the strongest match for the selected focus\."/,
  "Recommended card reason copy should be id-safe with a friendly fallback",
);
assert.match(
  workbenchScript,
  /function recommendedCandidateMeta\(candidate = \{\}\) \{[\s\S]*?candidateClientProjectLabel\(candidate\)[\s\S]*?safeCandidateText\(candidate\.contextLabel, ""\)[\s\S]*?safeCandidateText\(candidate\.reason, ""\);[\s\S]*?\}/,
  "Recommended meta should prefer resolved client/project context before any snapshot copy",
);
assert.match(
  workbenchScript,
  /function candidateClientProjectLabel\(candidate = \{\}\) \{[\s\S]*?state\.clients[\s\S]*?isWorkspaceScope[\s\S]*?\.join\(" \/ "\)/,
  "The client/project label should resolve names from loaded workbench clients, skipping workspace-scope pseudo-clients",
);
assert.match(
  workbenchScript,
  /function looksLikeRawId\(value\) \{[\s\S]*?\\b\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{12\}\\b[\s\S]*?\\b\[0-9a-f\]\{24,\}\\b/,
  "looksLikeRawId must catch identifiers embedded inside copy, not only whole-string ids",
);

const eventSummaries = readText("src/core/events/event-summaries.js");
assert.match(
  eventSummaries,
  /function fallbackSummary\(event\) \{[\s\S]*?recordLabel \? `\$\{fallbackLabel\(event\)\} for \$\{recordLabel\}\.` : `\$\{fallbackLabel\(event\)\}\.`/,
  "Event fallback summaries must omit the record clause when no readable label exists instead of leaking a placeholder",
);
assert.doesNotMatch(
  eventSummaries.slice(eventSummaries.indexOf("function safeRecordLabel")),
  /event\?\.record_id \|\|/,
  "safeRecordLabel must never fall back to the raw record id: identifiers are not user-facing labels",
);

assert.match(
  css,
  /\.workbench-recommended-heading \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) auto;[\s\S]*\}/,
  "Recommended-action heading should reserve a right-aligned controls column",
);
assert.match(
  css,
  /\.workbench-recommended-cycle-controls \{[\s\S]*justify-self: end;[\s\S]*\}/,
  "Recommended-action arrows should be right-aligned with the Start here heading",
);
assert.match(
  css,
  /\.workbench-recommended-cycle-button\.icon-button \{[\s\S]*width: 36px;[\s\S]*height: 36px;[\s\S]*\}/,
  "Recommended-action arrows should remain compact icon-only controls",
);
assert.match(
  changelog,
  /## Version 0\.33\.6\.6a[\s\S]*top-five cycling contract without the old secondary-list slice/,
  "Changelog should preserve the recommended-action cycling and overflow closeout",
);
assert.match(
  moduleContract,
  /As of 0\.33\.6\.6a, the Workbench recommended-action panel gained right-aligned icon-only cycle controls[\s\S]*active recommendation window is the top five ranked candidates[\s\S]*overflow starts after the top-five window/,
  "Module contract should preserve the top-five recommended-action and Inspector overflow boundary",
);
assert.match(
  changelog,
  /## Version 0\.33\.6\.6h[\s\S]*Previous`\/`Next` without the old verbose recommendation-cycle labels/,
  "Changelog should preserve the recommended-action cycle label correction closeout",
);
assertRoadmapCursorAtLeast("0.33.8", "Live roadmap should advance to the current active cursor after the completed Workbench history");

console.log("Workbench recommended-action cycling regression passed.");

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
