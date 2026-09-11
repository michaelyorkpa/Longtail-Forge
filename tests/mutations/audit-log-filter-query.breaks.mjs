import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Run explicitly, with no server or other verification reading this source concurrently.
// This harness is not a standing gate; it proves the checkpoint's new behavioral assertions.
const sourcePath = "public/js/audit-log.js";

const original = Buffer.from(readFileSync(sourcePath));
const source = original.toString("utf8");
/** @param {Buffer} bytes */
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const beforeHash = hash(original);

// Most cases are refused by the lifted suite. One is refused only by a rendered browser: a real
// `<select>` derives `value` from its options and resets when they are replaced, which the fake
// DOM's plain `value` property cannot model, so the selection-restoring branch is invisible to
// vitest. That case runs the e2e instead of pretending the fixture covers it.
/** @typedef {"unit" | "rendered"} BreakRunner */

/** @type {Record<BreakRunner, string[]>} */
const RUNNERS = {
  unit: ["node_modules/vitest/vitest.mjs", "run", "tests/unit/audit-log-filter-query-contracts.test.mjs"],
  rendered: ["scripts/run-playwright-e2e.mjs", "tests/e2e/audit-log-filter-selection.spec.mjs"],
};

/** @type {([string, string, string] | [string, string, string, BreakRunner])[]} name, find, replace, runner */
const cases = [
  // --- the completion claims -----------------------------------------------------------------------
  ["a control reverts to an unchecked query",
    'const workspaceFilterSelect = findAuditControl("[data-audit-workspace-filter]", HTMLSelectElement);',
    'const workspaceFilterSelect = document.querySelector("[data-audit-workspace-filter]");'],
  ["a control is narrowed past what the markup renders",
    'const showUtcInput = findAuditControl("[data-audit-show-utc]", HTMLInputElement);',
    'const showUtcInput = findAuditControl("[data-audit-show-utc]", HTMLSelectElement);'],
  ["a cast replaces the checked lookup",
    'const clientFilterControl = findAuditControl("[data-audit-client-filter-control]", HTMLElement);',
    'const clientFilterControl = /** @type {HTMLElement} */ (document.querySelector("[data-audit-client-filter-control]"));'],
  ["a second lookup helper appears",
    "  function buildFilterParams() {",
    "  function findAuditNode(selector) {\n    return document.querySelector(selector);\n  }\n\n  function buildFilterParams() {"],
  ["a suppression is introduced",
    "  function buildFilterParams() {",
    "  // @ts-expect-error deliberately added\n  function buildFilterParams() {"],
  ["the lookup stops checking the subtype",
    "    return element instanceof constructor ? element : null;",
    "    return element;"],
  ["the required narrowing stops refusing an absent control",
    "    if (value === null) {\n      throw new TypeError(`Audit Log requires its ${name}.`);\n    }",
    "    if (false) {\n      throw new TypeError(`unreachable`);\n    }"],

  // --- the emitted key names, each traced to `normalizeFilters` -------------------------------------
  ["the actor key stops matching the receiver",
    '      params.set("actorUserId", actorUserId);',
    '      params.set("userId", actorUserId);'],
  ["the client key stops matching the receiver",
    '      params.set("clientId", clientId);',
    '      params.set("client", clientId);'],
  ["the project key stops matching the receiver",
    '      params.set("projectId", projectId);',
    '      params.set("project", projectId);'],
  ["the record type key stops matching the receiver",
    '      params.set("recordType", recordType);',
    '      params.set("record_type", recordType);'],
  ["the change type key stops matching the receiver",
    '      params.set("changeType", changeType);',
    '      params.set("change_type", changeType);'],
  ["the workspace key stops matching the receiver",
    '      params.set("workspaceId", workspaceId);',
    '      params.set("workspace", workspaceId);'],
  ["the start bound key stops matching the receiver",
    '      params.set("dateFrom", requireTimezones().zonedDateTimeToUtcIso(dateFrom, "00:00:00", timezone));',
    '      params.set("from", requireTimezones().zonedDateTimeToUtcIso(dateFrom, "00:00:00", timezone));'],
  ["the end bound key stops matching the receiver",
    '      params.set("dateTo", requireTimezones().zonedDateTimeToUtcIso(dateTo, "23:59:59", timezone));',
    '      params.set("to", requireTimezones().zonedDateTimeToUtcIso(dateTo, "23:59:59", timezone));'],

  // --- what the query carries ------------------------------------------------------------------------
  ["an unset filter is emitted anyway",
    "    if (actorUserId) {\n      params.set",
    "    if (true) {\n      params.set"],
  ["a set filter is dropped",
    "    if (recordType) {\n      params.set",
    "    if (false) {\n      params.set"],
  ["one control's value is read from another",
    '    const projectId = requireAuditValue(projectFilterSelect, "project filter").value;',
    '    const projectId = requireAuditValue(clientFilterSelect, "client filter").value;'],

  // --- the date bounds --------------------------------------------------------------------------------
  ["the raw typed date is sent instead of the converted instant",
    '      params.set("dateFrom", requireTimezones().zonedDateTimeToUtcIso(dateFrom, "00:00:00", timezone));',
    '      params.set("dateFrom", dateFrom);'],
  ["the start of the range stops covering the whole first day",
    '"00:00:00", timezone));',
    '"12:00:00", timezone));'],
  ["the end of the range stops covering the whole last day",
    '"23:59:59", timezone));',
    '"00:00:00", timezone));'],
  ["the two bounds swap ends",
    '    const dateFrom = requireAuditValue(dateFromInput, "start date input").value;\n    const dateTo = requireAuditValue(dateToInput, "end date input").value;',
    '    const dateFrom = requireAuditValue(dateToInput, "end date input").value;\n    const dateTo = requireAuditValue(dateFromInput, "start date input").value;'],
  ["the UTC toggle stops reaching the conversion",
    '    const timezone = requireAuditValue(showUtcInput, "UTC toggle").checked ? "UTC" : undefined;\n    const dateFrom',
    '    const timezone = undefined;\n    const dateFrom'],
  ["the UTC toggle is inverted",
    '    const timezone = requireAuditValue(showUtcInput, "UTC toggle").checked ? "UTC" : undefined;\n    const dateFrom',
    '    const timezone = requireAuditValue(showUtcInput, "UTC toggle").checked ? undefined : "UTC";\n    const dateFrom'],
  ["a blank date is converted anyway",
    "    if (dateFrom) {\n      params.set",
    "    if (true) {\n      params.set"],

  // --- the catalogues ------------------------------------------------------------------------------------
  ["a catalogue loses its all-label placeholder",
    '    select.replaceChildren(createOption("", allLabel));',
    "    select.replaceChildren();"],
  ["a catalogue is appended to rather than rebuilt",
    '    select.replaceChildren(createOption("", allLabel));',
    '    select.appendChild(createOption("", allLabel));'],
  ["a still-offered selection is dropped on repaint",
    "    if ([...select.options].some((option) => option.value === selectedValue)) {",
    "    if (false) {",
    "rendered"],
  ["two catalogues are crossed",
    '    replaceSelectOptions(projectFilterSelect, "All projects", normalizeOptions(filterOptions.projects));',
    '    replaceSelectOptions(projectFilterSelect, "All projects", normalizeOptions(filterOptions.clients));'],
  ["a catalogue takes the wrong all-label",
    '    replaceSelectOptions(userFilterSelect, "All users", normalizeOptions(filterOptions.users));',
    '    replaceSelectOptions(userFilterSelect, "All clients", normalizeOptions(filterOptions.users));'],
  ["the labelled catalogues stop preferring their label",
    "          label: String(option.label || option.value),",
    "          label: String(option.value),"],
  ["the bare-string vocabularies stop being formatted",
    "        .map((value) => ({ value, label: formatEnum(value) }))",
    "        .map((value) => ({ value, label: value }))"],
  ["the two vocabularies are read as labelled records",
    '    replaceSelectOptions(recordTypeFilterSelect, "All record types", normalizeEnumOptions(filterOptions.recordTypes));',
    '    replaceSelectOptions(recordTypeFilterSelect, "All record types", normalizeOptions(filterOptions.recordTypes));'],

  // --- the client and workspace controls -------------------------------------------------------------------
  ["the client filter is shown when only its placeholder remains",
    "      = requireAuditValue(clientFilterSelect, \"client filter\").options.length <= 1;",
    "      = false;"],
  ["the client filter's gate is inverted",
    "      = requireAuditValue(clientFilterSelect, \"client filter\").options.length <= 1;",
    "      = requireAuditValue(clientFilterSelect, \"client filter\").options.length > 1;"],
  ["the client filter's gate stops counting the placeholder",
    '.options.length <= 1;',
    ".options.length <= 0;"],
  ["the workspace control stays shown for an empty catalogue",
    '    requireAuditValue(workspaceFilterControl, "workspace filter control").hidden = options.length === 0;',
    '    requireAuditValue(workspaceFilterControl, "workspace filter control").hidden = false;'],
  ["the empty workspace catalogue loses its current-workspace option",
    '      select.replaceChildren(createOption("", "Current workspace"));\n      return;',
    "      select.replaceChildren();\n      return;"],
  // **Withdrawn, not unproven.** Removing the empty-catalogue early return was aimed here and
  // found inert, and it is inert in production too rather than only in the fixture: the fall-
  // through calls `replaceSelectOptions(select, "Current workspace", [])`, which replaces the
  // children with the same lone placeholder and then restores nothing, and the trailing
  // `select.value = ... : select.value` is a self-assignment when no option matches. Both paths
  // leave the identical control. The early return is a readability guard, so no assertion was
  // invented to catch it and it is not retained as a passing case.
  ["the resolved scope is applied even when it is not offered",
    "    select.value = options.some((option) => option.value === selectedWorkspaceId)\n      ? selectedWorkspaceId\n      : select.value;",
    "    select.value = selectedWorkspaceId;"],
  ["the resolved scope is ignored when it is offered",
    "    select.value = options.some((option) => option.value === selectedWorkspaceId)\n      ? selectedWorkspaceId\n      : select.value;",
    "    select.value = select.value;"],
  ["the workspace catalogue stops being forwarded with the resolved scope",
    "    populateWorkspaceOptions(filterOptions.workspaces, selectedWorkspaceId);",
    "    populateWorkspaceOptions(filterOptions.workspaces, \"\");"],
];

let caught = 0;
let missed = 0;

try {
  for (const [name, find, replace, runner = "unit"] of cases) {
    const occurrences = source.split(find).length - 1;
    assert.equal(occurrences, 1, `anchor for "${name}" must appear exactly once (found ${occurrences})`);
    writeFileSync(sourcePath, source.replace(find, replace), "utf8");

    const syntax = spawnSync("node", ["--check", sourcePath], { encoding: "utf8", shell: true });
    const suite = spawnSync("node", RUNNERS[runner], {
      encoding: "utf8",
      env: { ...process.env, LTF_E2E_PORT: process.env.LTF_E2E_PORT || "8101" },
      shell: true,
    });
    writeFileSync(sourcePath, original);

    const syntaxValid = syntax.status === 0;
    const refused = syntaxValid && suite.status !== 0;
    if (refused) {
      caught += 1;
      console.log(`CAUGHT (${runner}; syntax valid, assertion failed): ${name}`);
    } else {
      missed += 1;
      console.log(`MISSED (${runner})${syntaxValid ? "" : " [INVALID SYNTAX]"}: ${name}`);
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
