export const regressionMeta = Object.freeze({
  id: "release.roadmap-cursor-floor",
  area: "release",
  tier: "release-gate",
  tags: ["closeout", "release", "roadmap"],
  description: "Proves the shared roadmap-cursor floor helper parses and compares correctly, that closeout regressions use floors instead of exact pins, and that a future cursor advance requires no edits to prior closeout regressions.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  assertRoadmapCursorAtLeast,
  compareDottedVersions,
  readActiveRoadmapCursor,
} from "../../lib/roadmap-cursor.mjs";

// The helper parses the current live roadmap cursor.
const liveCursor = readActiveRoadmapCursor();
assert.match(liveCursor, /^[0-9]+(\.[0-9]+)*$/, "live cursor should be a dotted numeric version");
assert.ok(
  compareDottedVersions(liveCursor, "0.33.8") >= 0,
  "the live cursor should never regress below the floor established when this guardrail landed",
);

// Numeric dotted comparison, including the uneven-segment cases where string
// comparison gets the order wrong.
const ordered = ["0.33.5.29.5", "0.33.7.7", "0.33.8", "0.33.12.2", "0.34", "1.0"];
for (let index = 1; index < ordered.length; index += 1) {
  assert.ok(
    compareDottedVersions(ordered[index - 1], ordered[index]) < 0,
    `${ordered[index - 1]} should order below ${ordered[index]}`,
  );
  assert.ok(
    compareDottedVersions(ordered[index], ordered[index - 1]) > 0,
    `${ordered[index]} should order above ${ordered[index - 1]}`,
  );
}
assert.equal(compareDottedVersions("0.33.8", "0.33.8"), 0);
assert.equal(compareDottedVersions("0.33", "0.33.0"), 0, "uneven lengths should pad with zero segments");

// Floors at or below the live cursor pass; a floor above it fails usefully.
assertRoadmapCursorAtLeast(liveCursor, "a floor equal to the live cursor should pass");
assertRoadmapCursorAtLeast("0.33.7", "a floor below the live cursor should pass");
assert.throws(
  () => assertRoadmapCursorAtLeast("999.0", "synthetic too-high floor"),
  /below the required floor 999\.0/,
  "a floor above the live cursor should fail with the cursor and floor in the message",
);
assert.throws(
  () => assertRoadmapCursorAtLeast("not-a-version", "synthetic junk floor"),
  /is not a dotted numeric version/,
  "a malformed floor should fail loudly",
);

// A missing or malformed cursor line fails loudly rather than passing vacuously.
assert.throws(
  () => readActiveRoadmapCursor({ roadmapSource: "# Roadmap\n\nNo cursor here.\n" }),
  /must carry exactly one well-formed 'Active cursor/,
);
assert.throws(
  () => readActiveRoadmapCursor({ roadmapSource: "Active cursor: `not.a.version!`.\n" }),
  /must carry exactly one well-formed 'Active cursor/,
);

// The tax is gone: against a fixture roadmap with a far-future cursor, the
// floor assertions used by prior closeout regressions still pass unchanged.
const advancedFixture = "# Longtail Forge Roadmap\n\nActive cursor: `0.99.1`.\n\n## Version 0.99.1 - Future branch\n";
assertRoadmapCursorAtLeast("0.33.8", "prior closeout floors must pass after any future cursor advance", {
  roadmapSource: advancedFixture,
});
assert.equal(readActiveRoadmapCursor({ roadmapSource: advancedFixture }), "0.99.1");

// No closeout regression may reintroduce exact cursor or next-section pins;
// the floor helper is the only supported mechanism. The bump-version
// regression writes its own fixture roadmap and the helper/guardrail define
// the pattern, so they are excluded.
const EXCLUDED_FILES = new Set([
  "scripts/bump-version-regression.mjs",
  "scripts/lib/roadmap-cursor.mjs",
  "scripts/regressions/release/roadmap-cursor-floor.regression.mjs",
]);
const exactPinViolations = [];
for (const filePath of walkMjsFiles("scripts")) {
  const normalized = filePath.split(path.sep).join("/");
  if (EXCLUDED_FILES.has(normalized)) {
    continue;
  }
  const source = readFileSync(filePath, "utf8");
  if (/Active cursor: `[0-9]/.test(source) || /Active cursor: `0\\\.|## Version 0\\\.33\\\.[0-9]+`?\/m?\s*,/.test(source)) {
    exactPinViolations.push(normalized);
  }
}
assert.deepEqual(
  exactPinViolations,
  [],
  `Closeout regressions must use assertRoadmapCursorAtLeast instead of exact cursor/next-section pins:\n${exactPinViolations.join("\n")}`,
);

console.log(`Roadmap cursor floor guardrail passed: live cursor ${liveCursor}, floors monotonic, no exact pins outside the helper.`);

function walkMjsFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const fullPath = path.join(directory, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...walkMjsFiles(fullPath));
    } else if (entry.endsWith(".mjs")) {
      files.push(fullPath);
    }
  }
  return files;
}
