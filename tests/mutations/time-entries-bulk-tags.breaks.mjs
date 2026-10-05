import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Run explicitly, with no server or other verification reading this source concurrently.
// This harness is not a standing gate; it proves the checkpoint's new behavioral assertions.
const sourcePath = "public/js/time-entries.js";
const suites = ["tests/unit/time-entries-bulk-tags-contracts.test.mjs"];
const original = Buffer.from(readFileSync(sourcePath));
const source = original.toString("utf8");
/** @param {Buffer} bytes */
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const beforeHash = hash(original);

/** @type {[string, string, string][]} name, find, replace */
const cases = [
  // --- acquisition -----------------------------------------------------------------------------
  ["a bulk control reverts to an unchecked query",
    'const bulkToolbar = findTimeEntryControl("[data-time-entry-bulk-toolbar]", HTMLDetailsElement);',
    'const bulkToolbar = document.querySelector("[data-time-entry-bulk-toolbar]");'],
  ["a bulk control is narrowed past what the markup renders",
    'const bulkApplyButton = findTimeEntryControl("[data-time-entry-bulk-apply]", HTMLButtonElement);',
    'const bulkApplyButton = findTimeEntryControl("[data-time-entry-bulk-apply]", HTMLInputElement);'],
  ["a cast replaces a checked bulk lookup",
    'const selectAllInput = findTimeEntryControl("[data-time-entry-select-all]", HTMLInputElement);',
    'const selectAllInput = /** @type {HTMLInputElement} */ (document.querySelector("[data-time-entry-select-all]"));'],
  ["the tag filter control reverts to an unchecked query",
    'const filterTagControl = findTimeEntryControl("[data-time-entry-filter-tag-control]", HTMLElement);',
    'const filterTagControl = document.querySelector("[data-time-entry-filter-tag-control]");'],
  ["an optional bulk control is made required",
    "    if (!bulkTagsControl) {\n      return;\n    }",
    '    requireTimeEntryValue(bulkTagsControl, "bulk tags control");'],
  ["a suppression is introduced",
    "  async function applyBulkTagAction() {",
    "  // @ts-expect-error deliberately added\n  async function applyBulkTagAction() {"],

  // --- the catalogue slot -----------------------------------------------------------------------
  ["the tag catalogue loses its contract",
    "   * @type {BrowserTagCatalogRecord[]}\n   */\n  let timeEntryTagOptions = [];",
    "  let timeEntryTagOptions = [];"],
  ["the picker slot loses its contract",
    "   * @type {BrowserTagPickerController | null}\n   */\n  let bulkTagPicker = null;",
    "  let bulkTagPicker = null;"],
  ["a failing catalogue load stops falling back to an empty list",
    "    try {\n      return await tagSurface.loadTags();\n    } catch {\n      return [];\n    }",
    "    return await tagSurface.loadTags();"],
  // Re-aimed: blanking the loader guard is inert, because the `catch` below already answers `[]`
  // when the call fails. Reading the wrong surface is what actually changes the answer.
  ["the catalogue is read from the wrong surface",
    "  async function loadTagOptions() {\n    const tagSurface = requireNamespace().tags;",
    "  async function loadTagOptions() {\n    const tagSurface = requireNamespace();"],

  // --- the tag filter ---------------------------------------------------------------------------
  ["the tag filter stays visible with nothing to offer",
    "filterTagControl.hidden = timeEntryTagOptions.length === 0;",
    "filterTagControl.hidden = false;"],
  ["the tag filter hides when it does have tags",
    "filterTagControl.hidden = timeEntryTagOptions.length === 0;",
    "filterTagControl.hidden = timeEntryTagOptions.length > 0;"],
  ["an unnamed tag loses its slug fallback",
    "...timeEntryTagOptions.map((tag) => createOption(tag.tag_id, tag.name || tag.slug)),",
    "...timeEntryTagOptions.map((tag) => createOption(tag.tag_id, tag.name)),"],
  ["a still-offered filter selection is dropped on repaint",
    "|| timeEntryTagOptions.some((tag) => tag.tag_id === previousValue)",
    "|| false"],
  ["the no-tags sentinel stops being normalized",
    "      ? normalizeTagFilterValue(previousValue)",
    "      ? previousValue"],
  ["the two filter sentinels stop being offered first",
    "      tagFilterAllOption(),\n      tagFilterNoTagsOption(),",
    "      tagFilterAllOption(),"],

  // --- mounting the picker ------------------------------------------------------------------------
  ["a previous observer is left watching the control",
    "    bulkTagObserver?.disconnect();",
    "    bulkTagObserver;"],
  ["the picker mounts without the catalogue",
    "      tags: timeEntryTagOptions,",
    "      tags: [],"],
  ["the bulk picker starts allowing tag creation",
    "      allowCreate: false,",
    "      allowCreate: true,"],
  ["the observer stops watching the subtree",
    "        childList: true,\n        subtree: true,",
    "        childList: true,\n        subtree: false,"],
  ["the controls are not synced after the picker mounts",
    "    }\n    updateBulkControls();\n  }\n\n  async function applyBulkTagAction() {",
    "    }\n  }\n\n  async function applyBulkTagAction() {"],
  // Re-aimed: the first attempt wrote `{} && {...}`, which evaluates to the same options object
  // and so could never bite. Defaulting a declined mount is the real defect.
  ["a declined picker is defaulted instead of held as absent",
    "    if (window.MutationObserver) {",
    "    bulkTagPicker = bulkTagPicker || { readTagIds: () => [], setSelected: () => {}, refreshTags: async () => {} };\n    if (window.MutationObserver) {"],

  // --- applying the bulk action ---------------------------------------------------------------------
  ["an empty selection is still sent",
    "    if (targetIds.length === 0 || tagIds.length === 0) {",
    "    if (tagIds.length === 0) {"],
  ["an empty tag list is still sent",
    "    if (targetIds.length === 0 || tagIds.length === 0) {",
    "    if (targetIds.length === 0) {"],
  ["the action stops being read from the control",
    'const action = bulkActionSelect?.value === "remove" ? "remove" : "add";',
    'const action = "add";'],
  ["the action is inverted",
    'const action = bulkActionSelect?.value === "remove" ? "remove" : "add";',
    'const action = bulkActionSelect?.value === "remove" ? "add" : "remove";'],
  ["the target type stops naming time entries",
    '        targetType: "time_entry",',
    '        targetType: "task",'],
  ["an unreadable response is accepted",
    '      if (!assignment) {\n        throw new Error("The bulk tag response could not be read.");\n      }',
    "      if (!assignment) {\n        return;\n      }"],
  ["the selection survives a successful apply",
    "      selectedEntryIds.clear();",
    "      selectedEntryIds;"],
  ["the picker keeps its tags after a successful apply",
    "      bulkTagPicker?.setSelected?.([]);",
    "      bulkTagPicker;"],
  ["the list is not reloaded after a successful apply",
    "      bulkTagPicker?.setSelected?.([]);\n      await loadTimeEntryData();",
    "      bulkTagPicker?.setSelected?.([]);\n      await Promise.resolve();"],
  ["the skipped count stops being reported",
    "      const skippedText = skippedCount > 0 ? ` ${skippedCount} skipped.` : \"\";",
    '      const skippedText = "";'],
  ["one entry is reported in the plural",
    '${changedCount === 1 ? "entry" : "entries"}',
    '${"entries"}'],
  ["the apply button stays enabled during the request",
    "    if (bulkApplyButton) {\n      bulkApplyButton.disabled = true;\n    }",
    "    if (false) {\n      bulkApplyButton.disabled = true;\n    }"],
  ["the controls are not re-synced after the request",
    "    } finally {\n      updateBulkControls();\n    }",
    "    } finally {\n      Promise.resolve();\n    }"],

  // --- selection ------------------------------------------------------------------------------------
  ["the select-all toggle is inverted",
    "      if (shouldSelect) {\n        selectedEntryIds.add(entry.entryId);\n      } else {\n        selectedEntryIds.delete(entry.entryId);\n      }",
    "      if (shouldSelect) {\n        selectedEntryIds.delete(entry.entryId);\n      } else {\n        selectedEntryIds.add(entry.entryId);\n      }"],
  ["the select-all toggle reaches beyond what is visible",
    "    const entries = getFilteredEntries();\n    const shouldSelect = selectAllInput?.checked === true;",
    "    const entries = [...getFilteredEntries(), { entryId: 'hidden' }];\n    const shouldSelect = selectAllInput?.checked === true;"],
  ["selections that scrolled out of view are kept",
    "      if (!visibleIds.has(entryId)) {\n        selectedEntryIds.delete(entryId);\n      }",
    "      if (false) {\n        selectedEntryIds.delete(entryId);\n      }"],
  ["a partial selection reads as fully selected",
    "selectAllInput.checked = entries.length > 0 && selectedVisibleCount === entries.length;",
    "selectAllInput.checked = selectedVisibleCount > 0;"],
  ["the mixed state stops being shown",
    "selectAllInput.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < entries.length;",
    "selectAllInput.indeterminate = false;"],
  ["the select-all control stays usable with nothing to select",
    "selectAllInput.disabled = entries.length === 0;",
    "selectAllInput.disabled = false;"],
  ["the toolbar opens with nothing selected",
    "    if (bulkToolbar && selectedCount > 0) {",
    "    if (bulkToolbar) {"],
  ["apply is enabled with no tag chosen",
    "      bulkApplyButton.disabled = selectedCount === 0 || !hasTags;",
    "      bulkApplyButton.disabled = selectedCount === 0;"],
  ["the apply label stops counting the selection",
    "      bulkApplyButton.textContent = `Apply to ${selectedCount}`;",
    '      bulkApplyButton.textContent = "Apply";'],
  ["a row checkbox stops reflecting the selection",
    "    checkbox.checked = selectedEntryIds.has(entry.entryId);",
    "    checkbox.checked = false;"],
  ["a row checkbox stops writing the selection",
    "      if (checkbox.checked) {\n        selectedEntryIds.add(entry.entryId);\n      } else {\n        selectedEntryIds.delete(entry.entryId);\n      }",
    "      if (checkbox.checked) {\n        selectedEntryIds.delete(entry.entryId);\n      } else {\n        selectedEntryIds.add(entry.entryId);\n      }"],
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
