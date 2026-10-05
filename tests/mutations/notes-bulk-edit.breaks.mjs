import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

// Run explicitly, with no server or other verification reading this source concurrently.
// This harness is not a standing gate; it proves the checkpoint's new behavioral assertions.
const sourcePath = "public/js/notes.js";
const original = Buffer.from(readFileSync(sourcePath));
const source = original.toString("utf8");
/** @param {Buffer} bytes */
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const beforeHash = hash(original);
const cases = [
  ["metadata is not awaited before tags", "applyBulkEdit", "results.push(await api.postJson", "results.push(api.postJson"],
  ["no-change emits a library write", "readBulkNoteChanges", "if (bulkLibraryInput?.value)", "if (bulkLibraryInput)"],
  ["Uncategorized loses null semantics", "readBulkNoteChanges", "changes.noteCollectionId = null;", 'changes.noteCollectionId = "";'],
  ["kind write omitted", "readBulkNoteChanges", "changes.noteType = bulkTypeInput.value;", "void bulkTypeInput.value;"],
  ["archived note remains selected", "syncNoteSelectionToVisibleNotes", 'note.status !== "archived"', "true"],
  ["off-page selection persists", "syncNoteSelectionToVisibleNotes", "visibleEditableIds.has(noteId)", "true"],
  ["deselect adds selection", "toggleBulkNoteSelection", "state.selectedNoteIds.delete(noteId)", "state.selectedNoteIds.add(noteId)"],
  // First attempt only widened the guard and was inert; this replacement actually closes at zero.
  ["toolbar closes when selection clears", "syncNotesBulkToolbar", "if (bulkToolbar && selectedCount > 0) {\n      bulkToolbar.open = true;", "if (bulkToolbar) {\n      bulkToolbar.open = selectedCount > 0;"],
  ["toolbar ignores published count", "syncNotesBulkToolbar", "const count = publishedCount ||", "const count = null ||"],
  ["empty count remains visible", "syncNotesBulkToolbar", "count.hidden = selectedCount === 0", "count.hidden = false"],
  ["empty selection leaves clear enabled", "syncNotesBulkToolbar", "bulkClearButton.disabled = selectedCount === 0", "bulkClearButton.disabled = false"],
  ["collections ignore library", "populateBulkCollectionOptions", "!selectedLibrary || collection.library_bucket === selectedLibrary", "true"],
  ["collection change retains unavailable value", "populateBulkCollectionOptions", 'previousValue : ""', "previousValue : previousValue"],
  ["collection path loses hierarchy", "populateBulkCollectionOptions", "collection.path_cache || collection.title", "collection.title"],
  ["empty selection opens editor", "openBulkEditor", "state.selectedNoteIds.size === 0", "false"],
  ["bulk kind is not reset", "openBulkEditor", 'requireNotesValue(bulkTypeInput).value = "";', "void bulkTypeInput;"],
  ["bulk open omits tag mounting", "openBulkEditor", "await mountBulkTagPicker();", "void 0;"],
  ["apply ignores empty selection", "applyBulkEdit", "if (state.selectedNoteIds.size === 0)", "if (false)"],
  ["apply ignores tags without action", "applyBulkEdit", "if (!tagAction && tagIds.length > 0)", "if (false)"],
  ["metadata sends wrong selection", "applyBulkEdit", "noteIds: targetIds", "noteIds: []"],
  ["tag call targets wrong record type", "applyBulkEdit", 'targetType: "note"', 'targetType: "task"'],
  ["failed selections are cleared", "applyBulkEdit", "state.selectedNoteIds = failedNoteIds", "state.selectedNoteIds = new Set()"],
  ["fully failed operation closes modal", "applyBulkEdit", "if (fullyUpdatedCount > 0)", "if (fullyUpdatedCount >= 0)"],
  ["failure button stays disabled", "applyBulkEdit", "requireNotesValue(bulkApplyButton).disabled = false;", "requireNotesValue(bulkApplyButton).disabled = true;"],
  ["selected detail refreshes when unrelated", "refreshSelectedNoteAfterBulk", "!selectedId || !updatedIds.has(selectedId)", "!selectedId"],
];

let caught = 0;
/** @type {string[]} */
const inert = [];
try {
  const baseline = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "tests/unit/notes-bulk-edit.test.mjs"],
    { encoding: "utf8", windowsHide: true });
  assert.equal(baseline.status, 0, baseline.stdout + baseline.stderr);
  for (const [label, name, from, to] of cases) {
    assert.ok(label && name && from && to !== undefined);
    const region = name === "types" ? source : extractFunctionBlock(source, name);
    assert.ok(region.includes(from), `${label}: mutation must hit its intended statement`);
    const broken = source.replace(region, region.replaceAll(from, to));
    try {
      writeFileSync(sourcePath, broken);
      const syntax = spawnSync(process.execPath, ["--check", sourcePath], { encoding: "utf8", windowsHide: true });
      assert.equal(syntax.status, 0, `${label}: syntax failure is not a caught break\n${syntax.stderr}`);
      const result = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "tests/unit/notes-bulk-edit.test.mjs"],
        { encoding: "utf8", windowsHide: true });
      const output = result.stdout + result.stderr;
      if (result.status === 0) {
        inert.push(label);
        console.log(`INERT: ${label} - re-aim before claiming coverage`);
      } else {
        assert.equal(result.status, 1, output);
        assert.match(output, /AssertionError/, `${label}: infrastructure or runtime crash is not assertion coverage\n${output}`);
        caught += 1;
        console.log(`CAUGHT (syntax valid, assertion failed): ${label}`);
      }
    } finally {
      writeFileSync(sourcePath, original);
      assert.equal(hash(readFileSync(sourcePath)), beforeHash, `${label}: byte restoration failed`);
    }
  }
} finally {
  writeFileSync(sourcePath, original);
  assert.equal(hash(readFileSync(sourcePath)), beforeHash, "final byte restoration failed");
  console.log(`Restored SHA-256 ${beforeHash}`);
}
console.log(`${caught}/${cases.length} caught; ${inert.length} inert.`);
assert.equal(inert.length, 0, `Re-aim inert breaks: ${inert.join(", ")}`);
