import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Run explicitly, with no server or other verification reading this source concurrently.
// This harness is not a standing gate; it proves the checkpoint's new behavioral assertions.
const sourcePath = "public/js/time-entries.js";
const suites = ["tests/unit/time-entries-rendering-contracts.test.mjs"];
const original = Buffer.from(readFileSync(sourcePath));
const source = original.toString("utf8");
/** @param {Buffer} bytes */
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const beforeHash = hash(original);

/** @type {[string, string, string][]} name, find, replace */
const cases = [
  // --- the completion claims ---------------------------------------------------------------------
  ["a control reverts to an unchecked query",
    'const timeEntryTable = findTimeEntryControl("[data-time-entry-table]", HTMLElement);',
    'const timeEntryTable = document.querySelector("[data-time-entry-table]");'],
  ["the table is narrowed past what the markup renders",
    'const timeEntryTable = findTimeEntryControl("[data-time-entry-table]", HTMLElement);',
    'const timeEntryTable = findTimeEntryControl("[data-time-entry-table]", HTMLInputElement);'],
  ["a cast replaces the checked lookup",
    'const timeEntryStatus = findTimeEntryControl("[data-time-entry-status]", HTMLElement);',
    'const timeEntryStatus = /** @type {HTMLElement} */ (document.querySelector("[data-time-entry-status]"));'],
  ["a second lookup helper appears",
    "  function renderEntries() {",
    "  function findEntryControl(selector) {\n    return document.querySelector(selector);\n  }\n\n  function renderEntries() {"],
  ["a suppression is introduced",
    "  function renderEntries() {",
    "  // @ts-expect-error deliberately added\n  function renderEntries() {"],

  // --- rendering -----------------------------------------------------------------------------------
  ["the table is appended to rather than rebuilt",
    '    table.innerHTML = "";',
    "    table.className = table.className;"],
  ["the table stops being required at the render that dereferences it",
    '    const table = requireTimeEntryValue(timeEntryTable, "entry table");',
    "    const table = timeEntryTable;"],
  ["the empty row stops spanning the table",
    "      cell.colSpan = 7;",
    "      cell.colSpan = 1;"],
  ["the empty state loses its message",
    '      cell.textContent = "No entries match these filters.";',
    '      cell.textContent = "";'],
  ["the empty state stops syncing the selection controls",
    "    syncSelectionToEntries(entries);\n    updateSelectionControls(entries);\n    updateBulkControls();",
    "    syncSelectionToEntries(entries);"],
  ["a column is dropped from every row",
    "        createTableCell(entry.clientName),\n        createProjectCell(entry),",
    "        createProjectCell(entry),"],
  ["two columns swap places",
    "        createTableCell(formatDate(entry.endTime)),\n        createTableCell(entry.clientName),",
    "        createTableCell(entry.clientName),\n        createTableCell(formatDate(entry.endTime)),"],
  ["the date column renders the wrong end of the entry",
    "        createTableCell(formatDate(entry.endTime)),",
    "        createTableCell(formatDate(entry.startTime)),"],

  // --- row actions ----------------------------------------------------------------------------------
  ["the delete action loses its danger variant",
    '    const deleteButton = createTimeEntryActionButton("Delete", "delete", { danger: true });',
    '    const deleteButton = createTimeEntryActionButton("Delete", "delete");'],
  ["the edit action gains one",
    '    const editButton = createTimeEntryActionButton("Edit", "edit");',
    '    const editButton = createTimeEntryActionButton("Edit", "edit", { danger: true });'],
  ["the shared icon surface stops being used when it is published",
    "    if (window.LongtailForge?.icons?.createIconButton) {",
    "    if (false) {"],
  ["the icon button loses its accessible title",
    "        title: label,",
    '        title: "",'],
  ["the fallback button loses its danger class",
    '    button.classList.toggle("danger-button", options.danger === true);',
    '    button.classList.toggle("danger-button", false);'],
  ["the fallback button stops being a plain button",
    '    button.type = "button";',
    '    button.type = "submit";'],

  // --- tags on the project cell -----------------------------------------------------------------------
  ["an empty tag list is still rendered",
    "    if (tagSurface?.renderTagList && Array.isArray(entry.tags) && entry.tags.length > 0) {",
    "    if (tagSurface?.renderTagList) {"],
  ["the tag list stops being checked as an array",
    "Array.isArray(entry.tags) && entry.tags.length > 0",
    "entry.tags.length > 0"],

  // --- formatting -------------------------------------------------------------------------------------
  ["a non-billable entry starts showing an invoice status",
    '    if (getEffectiveEntryBillable(entry) !== "yes") {\n      return "N/A";\n    }',
    '    if (false) {\n      return "N/A";\n    }'],
  ["an unreadable date renders as Invalid Date",
    "    return Number.isFinite(date.getTime())\n      ? requireTimezones().formatDate(date)\n      : \"\";",
    "    return requireTimezones().formatDate(date);"],
  ["a negative duration stops being clamped",
    "    const normalizedSeconds = Math.max(0, Number.parseInt(String(totalSeconds), 10) || 0);",
    "    const normalizedSeconds = Number.parseInt(String(totalSeconds), 10) || 0;"],
  ["an unreadable duration stops falling back to zero",
    "Number.parseInt(String(totalSeconds), 10) || 0",
    "Number.parseInt(String(totalSeconds), 10)"],
  ["the hours column stops reporting the entry's own duration",
    "        createTableCell(formatHours(entry.durationSeconds)),",
    "        createTableCell(formatHours(0)),"],
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
