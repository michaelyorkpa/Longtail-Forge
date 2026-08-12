// Shared roadmap-cursor floor helper for branch-closeout regressions.
//
// Closeout regressions must assert that the live roadmap has advanced past
// their branch and never regressed. Exact-value pins ("cursor equals X")
// forced every branch closeout to edit every prior closeout regression;
// these floor assertions are normally monotonic: they pass for the cursor
// value that was current when the branch closed and for every later cursor.
// A roadmap-permitted out-of-order closeout may also satisfy its exact floor
// through explicit live-roadmap and archive evidence while an earlier slice
// remains the honest active cursor.
//
// Do not write new exact cursor or next-section pins in closeout
// regressions; call assertRoadmapCursorAtLeast with the cursor value that is
// current when the branch closes.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const CURSOR_PATTERN = /^Active cursor: `([0-9]+(?:\.[0-9]+)*)`\.$/m;

/**
 * Read and parse the live roadmap's active cursor.
 * @param {{ roadmapSource?: string }} [options] optional source override for fixtures
 * @returns {string} the cursor version, for example "0.33.8"
 */
function readActiveRoadmapCursor(options = {}) {
  const source = options.roadmapSource ?? readFileSync("ROADMAP.md", "utf8");
  const match = source.match(CURSOR_PATTERN);

  if (!match) {
    throw new Error(
      "ROADMAP.md must carry exactly one well-formed 'Active cursor: `<version>`.' line; none was found.",
    );
  }

  return match[1];
}

/**
 * Numeric dotted-version comparison. Handles uneven segment counts:
 * 0.33.5.29.5 < 0.33.7.7 < 0.33.8 < 0.33.12.8, and 0.33 === 0.33.0.
 * @param {string} left
 * @param {string} right
 * @returns {number} negative, zero, or positive
 */
function compareDottedVersions(left, right) {
  const leftParts = parseDottedVersion(left);
  const rightParts = parseDottedVersion(right);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}

/**
 * Assert the live roadmap cursor is at or beyond the given floor.
 * @param {string} minimumVersion the cursor value current when the calling branch closed
 * @param {string} message assertion context shown on failure
 * @param {{ roadmapArchiveSource?: string, roadmapSource?: string }} [options] optional source overrides for fixtures
 */
function assertRoadmapCursorAtLeast(minimumVersion, message, options = {}) {
  parseDottedVersion(minimumVersion);
  const cursor = readActiveRoadmapCursor(options);

  assert.ok(
    compareDottedVersions(cursor, minimumVersion) >= 0
      || isDocumentedOutOfOrderRoadmapCloseout(minimumVersion, options),
    `${message} (live roadmap cursor ${cursor} is below the required floor ${minimumVersion})`,
  );
}

/**
 * Recognize only an explicitly archived operator-requested closeout whose
 * completed version is absent from the live roadmap and whose earlier active
 * cursor still has a real live section.
 * @param {string} completedVersion
 * @param {{ roadmapArchiveSource?: string, roadmapSource?: string }} [options]
 * @returns {boolean}
 */
function isDocumentedOutOfOrderRoadmapCloseout(completedVersion, options = {}) {
  parseDottedVersion(completedVersion);
  const roadmapSource = options.roadmapSource ?? readFileSync("ROADMAP.md", "utf8");
  const archiveSource = options.roadmapArchiveSource ?? readFileSync("ROADMAP-ARCHIVE.md", "utf8");
  const activeCursor = readActiveRoadmapCursor({ roadmapSource });
  if (compareDottedVersions(activeCursor, completedVersion) >= 0) {
    return false;
  }

  const activeHeading = versionHeadingPattern(activeCursor);
  const completedHeading = versionHeadingPattern(completedVersion);
  if (!activeHeading.test(roadmapSource) || completedHeading.test(roadmapSource)) {
    return false;
  }

  const archiveSection = archiveSource.split(completedHeading)[1]?.split(/^## Version /m)[0] || "";
  const preservedCursorStatement = `The active roadmap cursor remains \`${activeCursor}\`;`;
  return /Completed on \d{4}-\d{2}-\d{2} out of numeric order at the operator's request\./.test(archiveSection)
    && archiveSection.includes(preservedCursorStatement);
}

function versionHeadingPattern(version) {
  return new RegExp(`^## Version ${escapeRegExp(version)}(?:\\s+-|\\s*$)`, "m");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseDottedVersion(value) {
  const text = String(value || "").trim();

  if (!/^[0-9]+(\.[0-9]+)*$/.test(text)) {
    throw new Error(`'${value}' is not a dotted numeric version.`);
  }

  return text.split(".").map((segment) => Number.parseInt(segment, 10));
}

export {
  assertRoadmapCursorAtLeast,
  compareDottedVersions,
  isDocumentedOutOfOrderRoadmapCloseout,
  readActiveRoadmapCursor,
};
