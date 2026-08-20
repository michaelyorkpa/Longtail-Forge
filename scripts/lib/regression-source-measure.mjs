// Deterministic source measurement for the active regression estate.
//
// Two figures are produced and both are evidence, never ceilings.
//
// `physicalLines` counts newline-delimited lines exactly as `0.33.33.11`
// measured them, so the historical consolidation record stays comparable.
//
// `structuralLines` counts only lines bearing at least one non-trivia token.
// That is the figure worth reading during a full-strict conversion: JSDoc and
// annotation growth moves the physical count without changing how much
// verification code exists, which is precisely why the physical count stopped
// being a usable forward gate and was retired at `0.33.33.30.8`.
//
// The token pass uses `espree`, the parser ESLint already runs over this
// repository, rather than a regular expression. Comment-stripping by regex
// cannot tell a comment from comment-like text inside a string or template
// literal, and a metric that miscounts is worse than one that is merely coarse.
// TypeScript's scanner would have been the first choice, but `typescript@7`
// ships the native compiler and no longer exposes a JavaScript scanner API.

import { tokenize } from "espree";

/** @typedef {{ physicalLines: number, structuralLines: number }} SourceMeasurement */

const TOKENIZE_OPTIONS = Object.freeze({
  comment: false,
  ecmaVersion: "latest",
  loc: true,
  sourceType: "module",
});

/**
 * Count newline-delimited lines the way `0.33.33.11` counted them.
 * @param {string} text
 * @returns {number}
 */
function countPhysicalLines(text) {
  return text.split(/\r?\n/).length - 1;
}

/**
 * Count lines carrying at least one non-trivia token.
 *
 * A token spanning several lines — a multi-line template literal, say — marks
 * every line it covers, because each of those lines is source rather than
 * commentary.
 * @param {string} text
 * @param {string} label
 * @returns {number}
 */
function countStructuralLines(text, label) {
  let tokens;
  try {
    tokens = tokenize(text, TOKENIZE_OPTIONS);
  } catch (error) {
    throw new Error(`${label} could not be tokenized for structural measurement: ${error instanceof Error ? error.message : String(error)}`);
  }

  /** @type {Set<number>} */
  const lines = new Set();
  for (const token of tokens) {
    // `loc` is optional on the token type because espree only populates it when
    // asked; `TOKENIZE_OPTIONS` always asks, so its absence is a contract
    // breach worth failing on rather than skipping past.
    const location = token.loc;
    if (!location) {
      throw new Error(`${label} produced a token without location data, which the measurement requires`);
    }
    for (let line = location.start.line; line <= location.end.line; line += 1) {
      lines.add(line);
    }
  }
  return lines.size;
}

/**
 * Measure one source file.
 * @param {string} text
 * @param {string} [label]
 * @returns {SourceMeasurement}
 */
function measureSource(text, label = "source") {
  return Object.freeze({
    physicalLines: countPhysicalLines(text),
    structuralLines: countStructuralLines(text, label),
  });
}

/**
 * Measure a set of discovered regression entrypoints.
 * @param {ReadonlyArray<{ path: string }>} entries
 * @param {(path: string) => string} readText
 * @returns {SourceMeasurement}
 */
function measureRegressionEntries(entries, readText) {
  let physicalLines = 0;
  let structuralLines = 0;
  for (const entry of entries) {
    const measurement = measureSource(readText(entry.path), entry.path);
    physicalLines += measurement.physicalLines;
    structuralLines += measurement.structuralLines;
  }
  return Object.freeze({ physicalLines, structuralLines });
}

export { measureRegressionEntries, measureSource };
