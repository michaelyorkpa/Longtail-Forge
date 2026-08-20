// Shared narrowing for single-row database reads in regression owners.
//
// `db.get` and the raw SQL helpers resolve `null` when nothing matches, so a
// probe that reads a column straight off the result either throws a bare
// TypeError or silently compares `undefined`. These state the requirement
// instead: the row must exist for the assertion that follows to mean anything,
// and its absence fails with the label of the read that was expected to
// produce it.
//
// The helpers take a result rather than running a query, so an owner can keep
// whichever accessor it already uses — `db.get`, `querySql`, or a repository
// read — without changing how it talks to the database.
//
// Seven owners closed between `0.33.33.30.4` and `0.33.33.30.7.2.3` carry a
// private copy of this narrowing. Those owners are pinned strict-clean and
// folding them onto this module would reach outside the cohort that publishes
// it, so the duplication is recorded for a later consolidation rather than
// resolved here.

import assert from "node:assert/strict";

/** @typedef {import("../../src/types/database-contracts.js").DatabaseRow} DatabaseRow */

/**
 * Narrow a single-row read to the row it must have returned.
 *
 * The shape defaults to the adapter's open row record. A caller that wants its
 * columns named annotates the receiving binding with a type tag, which is
 * honest because the `SELECT` naming those columns sits directly above the
 * call.
 *
 * The parameter is deliberately the open row rather than the shape, so the
 * annotation on the binding decides the result instead of being overridden by
 * what `db.get` happens to declare.
 * @template {object} [RowShape=DatabaseRow]
 * @param {object | null | undefined} row
 * @param {string} label
 * @returns {RowShape}
 */
function requireRow(row, label) {
  assert.ok(row, `${label} should return a row`);
  return /** @type {RowShape} */ (row);
}

/**
 * Narrow the first row of a multi-row read.
 * @template {object} [RowShape=DatabaseRow]
 * @param {ReadonlyArray<object> | null | undefined} rows
 * @param {string} label
 * @returns {RowShape}
 */
function requireFirstRow(rows, label) {
  assert.ok(rows && rows.length > 0, `${label} should return at least one row`);
  return /** @type {RowShape} */ (requireRow(rows[0], label));
}

export { requireFirstRow, requireRow };
