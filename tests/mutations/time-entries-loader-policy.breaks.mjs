import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Run explicitly, with no server or other verification reading this source concurrently.
// This harness is not a standing gate; it proves the checkpoint's new behavioral assertions.
const sourcePath = "public/js/time-entries.js";
const suites = [
  "tests/unit/time-entries-loader-policy-contracts.test.mjs",
  "tests/unit/time-entries-filtering-contracts.test.mjs",
];
const original = Buffer.from(readFileSync(sourcePath));
const source = original.toString("utf8");
/** @param {Buffer} bytes */
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const beforeHash = hash(original);

/** @type {[string, string, string][]} name, find, replace */
const cases = [
  // --- the refusal count ------------------------------------------------------------------------
  ["the refusal stops being counted",
    "return { entries, refused: rows.length - entries.length };",
    "return { entries, refused: 0 };"],
  ["the refusal counts rows that were read instead of rows that were not",
    "return { entries, refused: rows.length - entries.length };",
    "return { entries, refused: entries.length };"],
  ["the collection reader stops checking rows at all",
    "const entries = readTimeEntryRows(rows);",
    "const entries = rows;"],

  // --- the loader's policy ------------------------------------------------------------------------
  ["a short read is admitted instead of refused",
    "      if (entryCollection.refused > 0) {",
    "      if (false) {"],
  ["a short read is admitted because the threshold moved",
    "      if (entryCollection.refused > 0) {",
    "      if (entryCollection.refused > 1) {"],
  // Re-aimed: appending a no-op after the assignment changes nothing, because the throw above
  // already makes that line unreachable on refusal. Assigning *before* the guard is the defect.
  ["the collection is assigned before the refusal is decided, clobbering the last whole one",
    "      if (entryCollection.refused > 0) {",
    "      timeEntries = entryCollection.entries;\n      if (entryCollection.refused > 0) {"],
  ["the refusal is reported without saying how much was refused",
    "          `The time entry response could not be read: ${entryCollection.refused} of `\n"
    + "          + `${entryCollection.entries.length + entryCollection.refused} entries were refused.`,",
    '          "The time entry response could not be read.",'],
  // Re-aimed: the first attempt left an unbalanced paren and could only ever fail `node --check`.
  ["the refusal is logged instead of refused",
    "        throw new Error(\n          `The time entry response could not be read: ${entryCollection.refused} of `",
    "        console.error(\n          `The time entry response could not be read: ${entryCollection.refused} of `"],

  // --- what the page shows afterwards -------------------------------------------------------------
  ["the status is cleared even though the load failed",
    '    } catch (error) {\n      setTimeEntryStatus("Entries could not be loaded.");',
    '    } catch (error) {\n      setTimeEntryStatus("");'],
  // Re-aimed: adding a repaint after the assignment cannot bite either, for the same reason -
  // the throw above makes that line unreachable on refusal. Discarding the preserved collection
  // in the failure path is the distinct defect, and it is the half the policy exists to protect.
  ["a failed load throws away the last collection that could be read whole",
    '    } catch (error) {\n      setTimeEntryStatus("Entries could not be loaded.");',
    '    } catch (error) {\n      timeEntries = [];\n      setTimeEntryStatus("Entries could not be loaded.");'],

  // --- the empty and non-ok answers stay distinct from a short read --------------------------------
  ["an empty response starts being treated as a refusal",
    "    const rows = isTimeEntryRecord(data) && Array.isArray(data.entries) ? data.entries : [];",
    "    const rows = isTimeEntryRecord(data) && Array.isArray(data.entries) ? data.entries : [null];"],
  ["a non-ok entries response starts claiming rows were refused",
    "        : { entries: [], refused: 0 };",
    "        : { entries: [], refused: 1 };"],
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
