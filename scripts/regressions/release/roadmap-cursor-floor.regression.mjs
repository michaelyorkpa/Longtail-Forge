export const regressionMeta = Object.freeze({
  id: "release.roadmap-cursor-floor",
  area: "release",
  tier: "release-gate",
  tags: ["closeout", "release", "roadmap"],
  description: "Proves the shared roadmap-cursor floor helper parses and compares correctly, accepts only documented out-of-order completion evidence below a floor, keeps closeout regressions on floors instead of exact pins, and lets future cursor advances pass without prior-regression edits.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  assertRoadmapCursorAtLeast,
  compareDottedVersions,
  isDocumentedOutOfOrderRoadmapCloseout,
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
const ordered = ["0.33.5.29.5", "0.33.7.7", "0.33.8", "0.33.12.8", "0.34", "1.0"];
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

const reorderedRoadmapFixture = "Active cursor: `1.2.3.4`.\n\n## Version 1.2.3.4 - Pending slice\n";
const reorderedArchiveFixture = [
  "## Version 1.2.3.5 - Completed slice",
  "",
  "Completed on 2026-08-12 out of numeric order at the operator's request.",
  "The active roadmap cursor remains `1.2.3.4`; this closeout does not skip the pending slice.",
].join("\n");
assert.equal(isDocumentedOutOfOrderRoadmapCloseout("1.2.3.5", {
  roadmapArchiveSource: reorderedArchiveFixture,
  roadmapSource: reorderedRoadmapFixture,
}), true, "an explicit archived out-of-order closeout should preserve the lower live cursor");
assertRoadmapCursorAtLeast("1.2.3.5", "the documented completed slice should satisfy its floor", {
  roadmapArchiveSource: reorderedArchiveFixture,
  roadmapSource: reorderedRoadmapFixture,
});
assert.throws(
  () => assertRoadmapCursorAtLeast("1.2.3.5", "an undocumented reorder should fail", {
    roadmapArchiveSource: "## Version 1.2.3.5 - Completed slice\n\nCompleted normally.\n",
    roadmapSource: reorderedRoadmapFixture,
  }),
  /below the required floor 1\.2\.3\.5/,
  "a lower cursor must not pass without the exact archive evidence",
);
assert.throws(
  () => assertRoadmapCursorAtLeast("1.2.3.5", "a still-live completed section should fail", {
    roadmapArchiveSource: reorderedArchiveFixture,
    roadmapSource: `${reorderedRoadmapFixture}\n## Version 1.2.3.5 - Still live\n`,
  }),
  /below the required floor 1\.2\.3\.5/,
  "an out-of-order closeout must remove its completed version from the live roadmap",
);

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

console.log(`Roadmap cursor floor guardrail passed: live cursor ${liveCursor}, floors monotonic or explicitly archived out of order, no exact pins outside the helper.`);

/**
 * @param {string} directory
 * @returns {string[]}
 */
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
