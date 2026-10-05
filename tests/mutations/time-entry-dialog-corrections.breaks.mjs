import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Run explicitly, with no server or other verification reading this source concurrently.
// This harness is not a standing gate; it proves the `0.33.33.44.6` review corrections.
const sourcePath = "public/js/time-entry-dialog.js";
const suites = [
  "tests/unit/time-entry-dialog-normalizer-contracts.test.mjs",
  "tests/unit/time-entry-dialog-round-trip-contracts.test.mjs",
  "tests/unit/time-entry-dialog-helper-contracts.test.mjs",
  "tests/unit/time-entry-save-contracts.test.mjs",
];
const original = Buffer.from(readFileSync(sourcePath));
const source = original.toString("utf8");
/** @param {Buffer} bytes */
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const beforeHash = hash(original);

/** @type {[string, string, string][]} name, find, replace */
const cases = [
  // --- finding 1: the normaliser's output contract -----------------------------------------
  ["rows are rebuilt without being checked",
    "return entries.filter(isTimeEntryRow).map((entry) => ({",
    "return entries.map((entry) => ({"],
  ["a guaranteed column stops being checked",
    `    "client_id", "client_name", "description", "end_time", "entry_id",`,
    `    "client_name", "description", "end_time", "entry_id",`],
  ["the row check accepts a column of any type",
    "&& TIME_ENTRY_TEXT_COLUMNS.every((column) => typeof value[column] === \"string\");",
    "&& TIME_ENTRY_TEXT_COLUMNS.every((column) => column in value);"],
  ["the row check stops requiring a record",
    "return isTimeEntryRecord(value)\n      && TIME_ENTRY_TEXT_COLUMNS",
    "return Boolean(value)\n      && TIME_ENTRY_TEXT_COLUMNS"],
  ["the envelope stops being narrowed",
    "const entries = isTimeEntryRecord(data) && Array.isArray(data.entries) ? data.entries : [];",
    "const entries = Array.isArray(data?.entries) ? data.entries : [];"],
  ["a coercion is introduced instead of a check",
    "      clientId: entry.client_id,",
    "      clientId: String(entry.client_id),"],
  ["a column the producer does not guarantee is claimed",
    `    "invoice_status", "project_id", "project_name", "start_time", "user_id",`,
    `    "invoice_status", "project_id", "project_name", "start_time", "user_id", "task_id",`],
  ["a conversion the rebuild always made is dropped",
    "durationSeconds: Number(entry.duration_seconds) || 0,",
    "durationSeconds: entry.duration_seconds,"],
  ["the empty-status fallback is dropped",
    'invoiceStatus: entry.invoice_status || "unbilled",',
    "invoiceStatus: entry.invoice_status,"],

  // --- finding 2: the tag picker contract ---------------------------------------------------
  ["the tag picker slot loses the published contract",
    "   * @type {BrowserTagPickerController | null}\n   */\n  let tagPicker = null;",
    "  let tagPicker = null;"],
  ["the inaccurate deferral note returns",
    "**`0.33.33.44.4` claimed this had no published contract. That was wrong.**",
    "Owned by a later `0.33.33.44` child: its handle has no published contract yet."],
  ["the controller contract is redescribed instead of imported",
    '  /** @typedef {import("../../src/types/browser-contracts.js").BrowserTagPickerController} BrowserTagPickerController */\n',
    ""],

  // --- finding 3: the save callback ---------------------------------------------------------
  ["the response is spread unchecked again",
    "const savedResult = isSaveResponseRecord(result) ? result : {};",
    "const savedResult = result;"],
  ["the payload is rebuilt instead of spread",
    "await context.onSaved({ ...savedResult, entryId: savedEntryId });",
    "await context.onSaved({ entryId: savedEntryId });"],
  ["the validated identity is dropped from the payload",
    "await context.onSaved({ ...savedResult, entryId: savedEntryId });",
    "await context.onSaved({ ...savedResult });"],
  ["the non-record branch invents a shape",
    "const savedResult = isSaveResponseRecord(result) ? result : {};",
    'const savedResult = isSaveResponseRecord(result) ? result : { entry: null, storage: "database" };'],
];

let caught = 0;
let missed = 0;

try {
  for (const [name, find, replace] of cases) {
    const occurrences = source.split(find).length - 1;
    assert.equal(occurrences, 1, `anchor for "${name}" must appear exactly once (found ${occurrences})`);
    writeFileSync(sourcePath, source.replace(find, replace), "utf8");

    const syntax = spawnSync("node", ["--check", sourcePath], { encoding: "utf8", shell: true });
    const suite = spawnSync("node", ["node_modules/vitest/vitest.mjs", "run", ...suites], {
      encoding: "utf8", shell: true,
    });
    writeFileSync(sourcePath, original);

    const syntaxValid = syntax.status === 0;
    const refused = syntaxValid && suite.status !== 0;
    if (refused) {
      caught += 1;
      console.log(`CAUGHT (syntax valid, assertion failed): ${name}`);
    } else {
      missed += 1;
      console.log(`MISSED${syntaxValid ? "" : " (INVALID SYNTAX)"}: ${name}`);
    }
  }
} finally {
  writeFileSync(sourcePath, original);
  const afterHash = hash(Buffer.from(readFileSync(sourcePath)));
  assert.equal(afterHash, beforeHash, "source must be restored byte-for-byte");
  console.log(`Restored SHA-256 ${afterHash}`);
}

console.log(`${caught}/${cases.length} caught; ${missed} inert.`);
if (missed > 0) {
  process.exitCode = 1;
}
