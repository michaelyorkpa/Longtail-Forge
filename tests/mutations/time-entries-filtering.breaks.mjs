import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Run explicitly, with no server or other verification reading this source concurrently.
// This harness is not a standing gate; it proves the checkpoint's new behavioral assertions.
const sourcePath = "public/js/time-entries.js";
const suites = ["tests/unit/time-entries-filtering-contracts.test.mjs"];
const original = Buffer.from(readFileSync(sourcePath));
const source = original.toString("utf8");
/** @param {Buffer} bytes */
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const beforeHash = hash(original);

/** @type {[string, string, string][]} name, find, replace */
const cases = [
  // --- the checked producer -------------------------------------------------------------------
  ["the row check is dropped and unchecked rows reach the page",
    "return rows.filter(isTimeEntryRow).map((entry) => ({",
    "return rows.map((entry) => ({"],
  ["the column check weakens from text to mere presence",
    '&& TIME_ENTRY_TEXT_COLUMNS.every((column) => typeof value[column] === "string");',
    "&& TIME_ENTRY_TEXT_COLUMNS.every((column) => value[column] !== undefined);"],
  ["a column is dropped from the checked list",
    '"client_id", "client_name", "description", "end_time", "entry_id",',
    '"client_name", "description", "end_time", "entry_id",'],
  ["the checked list gains a column the producer never guaranteed",
    '"invoice_status", "project_id", "project_name", "start_time", "user_id",',
    '"invoice_status", "project_id", "project_name", "start_time", "user_id", "task_id",'],
  ["a record check accepts an array",
    'return typeof value === "object" && value !== null && !Array.isArray(value);',
    'return typeof value === "object" && value !== null;'],
  ["a rival record predicate appears beside the one the page has",
    "  function isTimeEntryRow(value) {",
    '  function isBulkRecord(value) {\n    return typeof value === "object" && value !== null && !Array.isArray(value);\n  }\n\n  function isTimeEntryRow(value) {'],
  // Retargeted by `0.33.33.44.15`, which moved the envelope check above the row read so an
  // unreadable body is refused outright rather than read as an empty collection.
  ["the body stops being checked for an entries array",
    "    if (!isTimeEntryRecord(data) || !Array.isArray(data.entries)) {\n      return null;\n    }",
    "    if (!isTimeEntryRecord(data)) {\n      return null;\n    }"],
  ["the duration loses the fallback that makes it a number",
    "durationSeconds: Number(entry.duration_seconds) || 0,",
    "durationSeconds: Number(entry.duration_seconds),"],
  ["the billable value stops being normalized",
    "billable: normalizeEntryBillable(entry.billable),",
    "billable: entry.billable,"],
  ["the tags stop being checked as an array",
    "tags: Array.isArray(entry.tags) ? entry.tags : [],",
    "tags: entry.tags,"],
  ["the invoice status loses its default",
    'invoiceStatus: entry.invoice_status || "unbilled",',
    "invoiceStatus: entry.invoice_status,"],
  ["a truthy non-string billable is treated as billable",
    '    if (value === "yes" || value === true) {',
    "    if (value) {"],

  // --- acquisition ---------------------------------------------------------------------------
  ["a control reverts to an unchecked query",
    'const filterPeriodSelect = findTimeEntryControl("[data-time-entry-filter-period]", HTMLSelectElement);',
    'const filterPeriodSelect = document.querySelector("[data-time-entry-filter-period]");'],
  ["a control is narrowed past what the markup renders",
    'const filterCustomDates = findTimeEntryControl("[data-time-entry-filter-custom-dates]", HTMLElement);',
    'const filterCustomDates = findTimeEntryControl("[data-time-entry-filter-custom-dates]", HTMLInputElement);'],
  ["a cast replaces the checked lookup",
    'const sortSelect = findTimeEntryControl("[data-time-entry-sort]", HTMLSelectElement);',
    'const sortSelect = /** @type {HTMLSelectElement} */ (document.querySelector("[data-time-entry-sort]"));'],
  ["the lookup stops checking the subtype",
    "    return element instanceof constructor ? element : null;",
    "    return element;"],
  ["the required narrowing stops refusing an absent control",
    '    if (value === null) {\n      throw new TypeError(`Time Entries requires its ${name}.`);\n    }',
    "    if (false) {\n      throw new TypeError(`unreachable`);\n    }"],
  ["a suppression is introduced",
    "  function getFilteredEntries() {",
    "  // @ts-expect-error deliberately added\n  function getFilteredEntries() {"],

  // --- ordering ------------------------------------------------------------------------------
  ["ascending and descending end order swap",
    "      case \"end_asc\":\n        return firstEntry.endTime.getTime() - secondEntry.endTime.getTime();",
    "      case \"end_asc\":\n        return secondEntry.endTime.getTime() - firstEntry.endTime.getTime();"],
  ["the end order reads the wrong end of the entry",
    "        return secondEntry.endTime.getTime() - firstEntry.endTime.getTime();\n    }",
    "        return secondEntry.startTime.getTime() - firstEntry.startTime.getTime();\n    }"],
  ["the duration order reverses",
    "      case \"duration_desc\":\n        return secondEntry.durationSeconds - firstEntry.durationSeconds;",
    "      case \"duration_desc\":\n        return firstEntry.durationSeconds - secondEntry.durationSeconds;"],
  ["an unknown sort mode stops falling back to newest first",
    '      case "end_desc":\n      default:',
    '      case "end_desc":\n      case "__never__":'],
  ["the project order loses its case-insensitive comparison",
    '          { sensitivity: "base" },',
    "          {},"],

  // --- date ranges ---------------------------------------------------------------------------
  ["every entry is shown instead of none for an invalid range",
    "      return { invalid: true };",
    "      return null;"],
  ["a reversed custom range stops being invalid",
    "    if (!startDate || !endDate || startDate > endDate) {",
    "    if (!startDate || !endDate) {"],
  ["the custom range end stops being exclusive",
    "requireTimezones().zonedDateTimeToUtcIso(addDateInputDays(endDateInput.value, 1), \"00:00:00\"),",
    "requireTimezones().zonedDateTimeToUtcIso(addDateInputDays(endDateInput.value, 0), \"00:00:00\"),"],
  // Re-aimed: blanking this guard is inert, because an invalid range carries no `start` and the
  // comparisons below are false anyway. Reversing it is what actually changes what the page shows.
  ["an invalid range starts showing every row",
    "    if (range?.invalid) {\n      return false;\n    }",
    "    if (range?.invalid) {\n      return true;\n    }"],
  ["the range end becomes inclusive",
    "        entry.endTime < range.end)",
    "        entry.endTime <= range.end)"],
  // Re-aimed for the same reason: an unreadable date compares false without the finite check, so
  // removing it is inert. The start edge is the behaviour this expression actually decides.
  ["the range start stops being inclusive",
    "        entry.endTime >= range.start &&",
    "        entry.endTime > range.start &&"],
  ["the all-entries period stops meaning every entry",
    '    if (periodFilter.value === "all") {\n      return null;\n    }',
    '    if (periodFilter.value === "all") {\n      return getCustomDateRange();\n    }'],
  ["the billing period stops receiving the chosen mode",
    "return getBillingPeriodRange(timeEntrySettings.billingPeriod, periodFilter.value);",
    'return getBillingPeriodRange(timeEntrySettings.billingPeriod, "current");'],

  // --- the status, tag and user filters -------------------------------------------------------
  ["a non-billable entry starts matching a chosen invoice status",
    '    if (getEffectiveEntryBillable(entry) !== "yes") {\n      return !statusFilter.value;\n    }',
    '    if (getEffectiveEntryBillable(entry) !== "yes") {\n      return true;\n    }'],
  ["the status filter compares against the wrong member",
    "return !statusFilter.value || entry.invoiceStatus === statusFilter.value;",
    "return !statusFilter.value || entry.billable === statusFilter.value;"],
  ["a tag without a string identity starts matching",
    '    return isTimeEntryRecord(value) && typeof value.tag_id === "string";',
    "    return isTimeEntryRecord(value);"],
  ["the tag filter stops narrowing the element it reads",
    "return (entry.tags || []).some((tag) => isTagWithIdentity(tag) && tag.tag_id === selectedTagId);",
    "return (entry.tags || []).some((tag) => tag.tag_id === selectedTagId);"],
  ["the second no-tags sentinel is dropped",
    '        if (selectedTagId === noTagsValue || selectedTagId === "__no_effective_tags__") {',
    "        if (selectedTagId === noTagsValue) {"],
  ["an empty user selection starts meaning no users",
    ".filter((entry) => selectedUsers.length === 0 || selectedUsers.includes(entry.userId))",
    ".filter((entry) => selectedUsers.includes(entry.userId))"],
  ["the user filter reads every option instead of the selected ones",
    "return [...userFilter.selectedOptions].map((option) => option.value);",
    "return [...userFilter.options].map((option) => option.value);"],

  // --- the custom date fields ------------------------------------------------------------------
  ["the custom date fields stop following the period",
    "requireTimeEntryValue(filterCustomDates, \"custom date fields\").hidden = !isCustom;",
    "requireTimeEntryValue(filterCustomDates, \"custom date fields\").hidden = false;"],
  ["the custom date inputs stay enabled outside the custom period",
    'requireTimeEntryValue(filterStartDateInput, "custom start date").disabled = !isCustom;',
    'requireTimeEntryValue(filterStartDateInput, "custom start date").disabled = false;'],
  ["the seeded start date stops being the start of the month",
    "formatDateInput(new Date(today.getFullYear(), today.getMonth(), 1));",
    "formatDateInput(today);"],
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
