// Shared narrowing for parsed JSON values in regression owners.
//
// `JSON.parse` resolves `any`, so reading a property straight off its result is
// a claim the compiler never checks: a renamed field yields `undefined` and the
// assertion downstream can still pass for the wrong reason. Every owner that
// parses a manifest, a marker file, a lock record, a persisted JSON column, or
// a child process's structured stdout crosses that boundary here instead.
//
// This is deliberately not a schema framework. It proves one thing — that the
// parsed value really is a JSON object rather than a string, an array, or
// `null` — and then lets the caller name only the fields it actually reads.

import assert from "node:assert/strict";

/**
 * Narrow a parsed JSON value to the record an owner is about to read.
 *
 * The parameter is the open parsed value rather than the shape, so the
 * annotation on the receiving binding decides the result instead of being
 * overridden here.
 * @template {object} [RecordShape=Record<string, unknown>]
 * @param {unknown} parsed
 * @param {string} label
 * @returns {RecordShape}
 */
function requireJsonRecord(parsed, label) {
  assert.ok(
    parsed && typeof parsed === "object" && !Array.isArray(parsed),
    `${label} should parse to a JSON object`,
  );
  return /** @type {RecordShape} */ (parsed);
}

export { requireJsonRecord };
