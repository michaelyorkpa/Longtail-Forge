import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Run explicitly, with no server or other verification reading this source concurrently.
// This harness is not a standing gate; it proves the checkpoint's new behavioral assertions.
const sourcePath = "public/js/reporting.js";
const suites = ["tests/unit/reporting-filter-contracts.test.mjs"];
const original = Buffer.from(readFileSync(sourcePath));
const source = original.toString("utf8");
/** @param {Buffer} bytes */
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const beforeHash = hash(original);

/** @type {[string, string, string][]} name, find, replace */
const cases = [
  // --- the completion claims -----------------------------------------------------------------------
  ["a suppression is introduced",
    "  function filterQueryKeys(filter) {",
    "  // @ts-expect-error deliberately added\n  function filterQueryKeys(filter) {"],
  ["a second document query appears",
    "  function filterQueryKeys(filter) {",
    '  function reportingNode(selector) {\n    return document.querySelector(selector);\n  }\n\n  function filterQueryKeys(filter) {'],
  ["the required narrowing stops refusing an absent control",
    "    if (value === null) {\n      throw new TypeError(`Reporting requires its ${name}.`);\n    }",
    "    if (false) {\n      throw new TypeError(`unreachable`);\n    }"],
  ["the tag picker stops being narrowed to the control that can carry it",
    "      fieldState.tagFilterController = control instanceof HTMLInputElement",
    "      fieldState.tagFilterController = control"],

  // --- the query keys ---------------------------------------------------------------------------------
  ["a filter that names no keys stops falling back to its id",
    "    return Array.isArray(filter.queryKeys) && filter.queryKeys.length > 0\n      ? filter.queryKeys\n      : [filter.id];",
    "    return Array.isArray(filter.queryKeys) ? filter.queryKeys : [];"],
  ["an empty key list is taken as the keys",
    "Array.isArray(filter.queryKeys) && filter.queryKeys.length > 0",
    "Array.isArray(filter.queryKeys)"],
  ["a non-list of keys is taken as the keys",
    "Array.isArray(filter.queryKeys) && filter.queryKeys.length > 0",
    "filter.queryKeys && filter.queryKeys.length > 0"],

  // --- the visibility condition -------------------------------------------------------------------------
  ["a filter with no condition is hidden",
    "    if (!filter.visibleWhen) {\n      return true;\n    }",
    "    if (!filter.visibleWhen) {\n      return false;\n    }"],
  ["the condition stops being compared to the other filter's value",
    '      && getFilterValue(String(condition.filterId || "")) === condition.equals;',
    "      && true;"],
  ["the condition reads the wrong filter",
    '      && getFilterValue(String(condition.filterId || "")) === condition.equals;',
    '      && getFilterValue(String(condition.equals || "")) === condition.equals;'],
  // **Withdrawn, and inert for a real reason.** Relaxing the record check cannot change what this
  // answers: a non-record carries no `filterId`, so the comparison becomes `getFilterValue("")`
  // against `undefined` - and an unknown filter answers `null`, which never equals `undefined`.
  // Both spellings therefore hide the filter. The check states the intent and ships unchanged.

  // --- the execution envelope ------------------------------------------------------------------------------
  ["a report that is not ready is rendered anyway",
    '      if (!response.ok || envelope.status !== "ready") {',
    "      if (!response.ok) {"],
  ["the failure message stops being read",
    '      errorMessage: typeof error.message === "string" ? error.message : "",',
    '      errorMessage: "",'],
  ["the failure message is read off the envelope root",
    "    const error = typeof body.error === \"object\" && body.error !== null\n      ? /** @type {Record<string, unknown>} */ (body.error)\n      : {};",
    "    const error = body;"],
  ["a non-string status is taken as the status",
    '      status: typeof body.status === "string" ? body.status : "",',
    '      status: String(body.status || ""),'],
  ["a non-string report key is taken as the key",
    '      reportKey: typeof body.reportKey === "string" ? body.reportKey : "",',
    '      reportKey: String(body.reportKey || ""),'],
  // **Withdrawn, and inert for a real reason.** Each member below is read through its own
  // `typeof === "string"` check, so a body that is not a record answers "" for every one of them
  // either way. The guard is what makes the member reads legible, not what decides their answers.
  ["the answered report is no longer checked against the one asked for",
    "      if (envelope.reportKey !== report.reportKey || envelope.renderer !== (report.renderer || \"\")) {",
    "      if (false) {"],

  // --- the renderer registration ------------------------------------------------------------------------------
  ["a registration with no render is recorded",
    '    if (typeof render !== "function") {\n      return;\n    }',
    "    if (false) {\n      return;\n    }"],
  ["a registration reached through the prototype chain is recorded",
    '    const render = Object.hasOwn(normalizedRegistration, "render")',
    '    const render = ("render" in normalizedRegistration)'],
  ["a bare function stops being taken as the render itself",
    '    const normalizedRegistration = typeof registration === "function"\n      ? { render: registration }\n      : registration;',
    "    const normalizedRegistration = registration;"],
  ["an unusable identifier is recorded",
    "    if (!normalizedId || typeof normalizedRegistration !== \"object\"",
    "    if (typeof normalizedRegistration !== \"object\""],
  ["the identifier stops being trimmed",
    '    const normalizedId = String(rendererId || "").trim();',
    '    const normalizedId = String(rendererId || "");'],

  // --- the filter values ---------------------------------------------------------------------------------------
  ["a boolean filter is read off a control that carries no checked state",
    "      return control instanceof HTMLInputElement && control.checked;",
    "      return Boolean(control?.checked);"],
  ["a multi-select filter is read off a control with no option list",
    "    if (control instanceof HTMLSelectElement && control.multiple) {\n      return [...control.selectedOptions].map((option) => option.value);",
    "    if (control?.multiple) {\n      return [...control.selectedOptions].map((option) => option.value);"],
  ["a multi-select filter answers every option rather than the selected ones",
    "      return [...control.selectedOptions].map((option) => option.value);",
    "      return [...control.options].map((option) => option.value);"],
  ["the everything choice is sent as a filter",
    '      return value && value !== "all" ? [value] : [];',
    "      return value ? [value] : [];"],
  ["a tag filter stops preferring its controller",
    '      const value = field.tagFilterController?.readValue?.() || control?.dataset?.tagFilterValue || "all";',
    '      const value = control?.dataset?.tagFilterValue || "all";'],
  ["a boolean filter is written to a control that carries no checked state",
    "      if (control instanceof HTMLInputElement) {\n        control.checked = parseBoolean(value, Boolean(field.filter.defaultValue));\n      }",
    "      control.checked = parseBoolean(value, Boolean(field.filter.defaultValue));"],
  ["an absent value clears the control instead of being ignored",
    "    if (!field || value === undefined || value === null) {\n      return;\n    }",
    "    if (!field) {\n      return;\n    }"],
  // **Withdrawn, and inert for a real reason.** `Object.hasOwn` below already refuses every query
  // key a non-record could be asked for, so relaxing this guard changes no control. It is the same
  // redundancy the presence check answers, not an uncovered behaviour.
  ["a range control with no key of its own is cleared",
    "        const nextValue = Object.hasOwn(range, queryKey)\n          ? /** @type {Record<string, unknown>} */ (range)[queryKey]\n          : undefined;",
    "        const nextValue = /** @type {Record<string, unknown>} */ (range)[queryKey] ?? \"\";"],

  // --- the value helpers ------------------------------------------------------------------------------------------
  ["a boolean word stops being recognised",
    '    if (["true", "1", "yes"].includes(normalized)) {',
    '    if (["true"].includes(normalized)) {'],
  ["the boolean fallback stops being honoured",
    "  function parseBoolean(value, fallback = false) {",
    "  function parseBoolean(value, fallback = true) {"],
  ["a boolean arriving as a list stops being read",
    "    const scalar = Array.isArray(value) ? value[0] : value;",
    "    const scalar = value;"],
  ["a list value stops being split",
    '    return [...new Set(values.flatMap((item) => String(item || "").split(","))',
    "    return [...new Set(values.flatMap((item) => [String(item || \"\")])"],
  ["a list value stops being de-duplicated",
    "    return [...new Set(values.flatMap",
    "    return [...Array.from(values.flatMap"],
  ["a list value stops being trimmed",
    "      .map((item) => item.trim())\n      .filter(Boolean))];",
    "      .filter(Boolean))];"],
  ["a formatted date loses its padding",
    '    const month = String(date.getMonth() + 1).padStart(2, "0");',
    "    const month = String(date.getMonth() + 1);"],
  ["a formatted date is off by a month",
    "    const month = String(date.getMonth() + 1)",
    "    const month = String(date.getMonth())"],
  ["a value the list does not offer is selected anyway",
    "    if ([...select.options].some((option) => option.value === normalizedValue)) {\n      select.value = normalizedValue;\n    }",
    "    select.value = normalizedValue;"],
  ["a control with no option list stops taking the value directly",
    "    if (!(select instanceof HTMLSelectElement)) {\n      select.value = normalizedValue;\n      return;\n    }",
    "    if (!(select instanceof HTMLSelectElement)) {\n      return;\n    }"],
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
