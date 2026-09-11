import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Run explicitly, with no server or other verification reading this source concurrently.
// This harness is not a standing gate; it proves the checkpoint's new behavioral assertions.
const sourcePath = "public/js/audit-log.js";
const suites = ["tests/unit/audit-log-rendering-contracts.test.mjs"];
const original = Buffer.from(readFileSync(sourcePath));
const source = original.toString("utf8");
/** @param {Buffer} bytes */
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const beforeHash = hash(original);

/** @type {[string, string, string][]} name, find, replace */
const cases = [
  // --- the completion claims -----------------------------------------------------------------------
  ["a control reverts to an unchecked query",
    'const auditLogBody = findAuditControl("[data-audit-log-body]", HTMLElement);',
    'const auditLogBody = document.querySelector("[data-audit-log-body]");'],
  ["the table body is narrowed past what the markup renders",
    'const auditLogBody = findAuditControl("[data-audit-log-body]", HTMLElement);',
    'const auditLogBody = findAuditControl("[data-audit-log-body]", HTMLInputElement);'],
  ["the form is narrowed past what the markup renders",
    'const auditFilterForm = findAuditControl("[data-audit-filters]", HTMLFormElement);',
    'const auditFilterForm = findAuditControl("[data-audit-filters]", HTMLSelectElement);'],
  ["a cast replaces the checked lookup",
    'const pageSummary = findAuditControl("[data-audit-page-summary]", HTMLElement);',
    'const pageSummary = /** @type {HTMLElement} */ (document.querySelector("[data-audit-page-summary]"));'],
  ["a second lookup helper appears",
    "  function renderAuditLogs() {",
    "  function findAuditNode(selector) {\n    return document.querySelector(selector);\n  }\n\n  function renderAuditLogs() {"],
  ["a suppression is introduced",
    "  function renderAuditLogs() {",
    "  // @ts-expect-error deliberately added\n  function renderAuditLogs() {"],
  ["the required narrowing stops refusing an absent control",
    "    if (value === null) {\n      throw new TypeError(`Audit Log requires its ${name}.`);\n    }",
    "    if (false) {\n      throw new TypeError(`unreachable`);\n    }"],

  // --- the normalized row -------------------------------------------------------------------------
  ["a nullable member stops being coerced",
    '      record_url: String(log.record_url || ""),',
    "      record_url: log.record_url,"],
  ["an actor member stops being coerced",
    '      actor_user_id: String(log.actor_user_id || ""),',
    "      actor_user_id: log.actor_user_id,"],
  ["the row starts carrying a member this page never reads",
    '      ip_address: String(log.ip_address || ""),',
    '      ip_address: String(log.ip_address || ""),\n      workspace_id: String(log.workspace_id || ""),'],
  ["two members of the row swap",
    '      record_id: String(log.record_id || ""),\n      record_label: String(log.record_label || ""),',
    '      record_id: String(log.record_label || ""),\n      record_label: String(log.record_id || ""),'],

  // --- the snapshot reader ---------------------------------------------------------------------------
  ["a falsy member stops being treated as absent",
    "    return value ? String(value) : \"\";",
    "    return value === undefined ? \"\" : String(value);"],
  ["the reader stops refusing a non-record snapshot",
    '    if (typeof snapshot !== "object" || snapshot === null || Array.isArray(snapshot)) {\n      return "";\n    }',
    '    if (typeof snapshot === "number") {\n      return "";\n    }'],
  // **Withdrawn, and inert for a real reason.** Removing the `Array.isArray` clause changes
  // nothing this page can observe: `Object.hasOwn` already refuses every member name the context
  // chain asks for on an array, so the clause states the intent rather than deciding an outcome.
  // It is left exactly as it ships and no assertion was invented to catch it.
  ["the reader stops checking the member is present",
    "    const value = Object.hasOwn(snapshot, member)",
    "    const value = true"],
  ["a parse failure stops surfacing the raw text",
    "    } catch {\n      return jsonText;\n    }",
    "    } catch {\n      return null;\n    }"],
  ["an absent snapshot stops answering null",
    "    if (!jsonText) {\n      return null;\n    }",
    "    if (!jsonText) {\n      return {};\n    }"],
  ["the context stops preferring metadata",
    "    const read = (member) => readSnapshotText(metadata, member)\n      || readSnapshotText(newValue, member)",
    "    const read = (member) => readSnapshotText(newValue, member)\n      || readSnapshotText(metadata, member)"],
  ["the context stops falling back to the before-snapshot",
    "      || readSnapshotText(previousValue, member)\n      || \"\";",
    '      || "";'],
  ["the two snapshots swap",
    "    const newValue = parseJson(log.new_value_json);\n    const previousValue = parseJson(log.previous_value_json);",
    "    const newValue = parseJson(log.previous_value_json);\n    const previousValue = parseJson(log.new_value_json);"],

  // --- the row's client and project ------------------------------------------------------------------
  ["the client label stops preferring the context",
    "    if (context?.client_name) {\n      return context.client_name;\n    }",
    "    if (false) {\n      return context.client_name;\n    }"],
  ["the client label stops being scoped to a client record",
    '    if (log.record_type === "client") {\n      return log.record_label || log.record_id;\n    }',
    "    if (true) {\n      return log.record_label || log.record_id;\n    }"],
  ["an unlabelled record stops falling back to its id",
    '    if (log.record_type === "client") {\n      return log.record_label || log.record_id;',
    '    if (log.record_type === "client") {\n      return log.record_label || "";'],
  ["the project label answers for a client record",
    '    if (log.record_type === "project") {\n      return log.record_label || log.record_id;\n    }\n\n    return "None";\n  }\n\n  /**\n   * @param {NormalizedAuditLog} log\n   * @param {AuditRowContext} context\n   * @returns {string}\n   */\n  function getProjectId',
    '    if (log.record_type === "client") {\n      return log.record_label || log.record_id;\n    }\n\n    return "None";\n  }\n\n  /**\n   * @param {NormalizedAuditLog} log\n   * @param {AuditRowContext} context\n   * @returns {string}\n   */\n  function getProjectId'],

  // --- the table ----------------------------------------------------------------------------------------
  ["the table is appended to rather than rebuilt",
    "    body.replaceChildren();",
    "    body.className = body.className;"],
  ["the empty row stops spanning the table",
    "      cell.colSpan = 7;",
    "      cell.colSpan = 1;"],
  ["the empty state stops naming the view it is showing",
    '      cell.textContent = requireAuditValue(auditViewSelect, "view filter").value === "security"\n        ? "No security events match these filters."\n        : "No audit log entries match these filters.";',
    '      cell.textContent = "No audit log entries match these filters.";'],
  ["the empty state stops clearing the status line",
    '      body.appendChild(row);\n      setStatus("");',
    "      body.appendChild(row);\n      void 0;"],
  ["a populated table stops reporting its window",
    "    updateStatus();",
    "    void 0;"],
  ["the date column stops going through the shared formatter",
    "      createCell(formatDateTime(log.created_at)),",
    "      createCell(log.created_at),"],
  ["the UTC toggle stops reaching the date formatter",
    '    const timezone = requireAuditValue(showUtcInput, "UTC toggle").checked ? "UTC" : undefined;\n\n    return requireTimezones().formatDateTime(value, timezone) || "None";',
    '    const timezone = undefined;\n\n    return requireTimezones().formatDateTime(value, timezone) || "None";'],
  ["two columns swap places",
    "      createCell(createFilterButton(getClientLabel(log, context), getClientId(log, context), clientFilterSelect)),\n      createCell(createFilterButton(getProjectLabel(log, context), getProjectId(log, context), projectFilterSelect)),",
    "      createCell(createFilterButton(getProjectLabel(log, context), getProjectId(log, context), projectFilterSelect)),\n      createCell(createFilterButton(getClientLabel(log, context), getClientId(log, context), clientFilterSelect)),"],
  ["a column is dropped from every row",
    "      createCell(formatEnum(log.change_type)),\n      createCell(detailsButton),",
    "      createCell(detailsButton),"],
  ["the record type column stops being formatted",
    "      createCell(createFilterButton(formatEnum(log.record_type), log.record_type, recordTypeFilterSelect)),",
    "      createCell(createFilterButton(log.record_type, log.record_type, recordTypeFilterSelect)),"],
  ["the actor stops preferring its name",
    "      userButton.textContent = log.actor_user_name || log.actor_user_id;",
    "      userButton.textContent = log.actor_user_id;"],
  ["an unattributed entry stops being named",
    '      userCell.textContent = "None";',
    '      userCell.textContent = "";'],
  ["an unattributed entry gets an actor button anyway",
    "    if (log.actor_user_id) {",
    "    if (true) {"],

  // --- pagination and the status line ----------------------------------------------------------------------
  ["the previous gate stops closing on the first page",
    '    requireAuditValue(previousPageButton, "previous page button").disabled = currentPage <= 1;',
    '    requireAuditValue(previousPageButton, "previous page button").disabled = false;'],
  ["the next gate stops closing on the last page",
    '    requireAuditValue(nextPageButton, "next page button").disabled = currentPage >= totalPages;',
    '    requireAuditValue(nextPageButton, "next page button").disabled = false;'],
  ["the two page gates swap",
    '    requireAuditValue(previousPageButton, "previous page button").disabled = currentPage <= 1;\n    requireAuditValue(nextPageButton, "next page button").disabled = currentPage >= totalPages;',
    '    requireAuditValue(previousPageButton, "previous page button").disabled = currentPage >= totalPages;\n    requireAuditValue(nextPageButton, "next page button").disabled = currentPage <= 1;'],
  ["the summary stops clamping the page to the range",
    "      = `Page ${Math.min(currentPage, totalPages)} of ${totalPages}`;",
    "      = `Page ${currentPage} of ${totalPages}`;"],
  ["the page size stops falling back to fifty",
    '    return Number.parseInt(requireAuditValue(pageSizeSelect, "page size select").value, 10) || 50;',
    '    return Number.parseInt(requireAuditValue(pageSizeSelect, "page size select").value, 10);'],
  ["the window stops offsetting by the page",
    "    const start = (currentPage - 1) * pageSize + 1;",
    "    const start = 1;"],
  ["the window stops closing on the total",
    "    const end = Math.min(start + auditLogs.length - 1, totalAuditLogs);",
    "    const end = start + auditLogs.length - 1;"],
  ["the status line stops naming the view it is showing",
    '    const entryLabel = requireAuditValue(auditViewSelect, "view filter").value === "security"\n      ? "security events"\n      : "audit log entries";',
    '    const entryLabel = "audit log entries";'],

  // --- the filter buttons and cells --------------------------------------------------------------------------
  ["a filter button is offered for a value the catalogue does not carry",
    "    if (!value || text === \"None\" || !select || ![...select.options].some((option) => option.value === value)) {",
    "    if (!value || text === \"None\" || !select) {"],
  ["a filter button is offered with no value at all",
    "    if (!value || text ===",
    "    if (false || text === "],
  ["a filter button is offered for the None label",
    '    if (!value || text === "None" ||',
    "    if (!value || false ||"],
  ["an unlabelled filter cell stops being named",
    '    const text = label || "None";',
    "    const text = label;"],
  ["the filter button stops applying its own value",
    "      select.value = value;\n      currentPage = 1;",
    "      currentPage = 1;"],
  ["the filter button stops returning to the first page",
    "      select.value = value;\n      currentPage = 1;",
    "      select.value = value;"],
  ["a node cell is written as text instead of appended",
    "      cell.appendChild(content);",
    '      cell.textContent = "";'],
  ["an empty text cell stops being named",
    '      cell.textContent = String(content || "None");',
    "      cell.textContent = String(content);"],
  ["a node cell is truncated like a text cell",
    '      cell.title = cell.textContent;\n      cell.classList.add("audit-truncate");',
    '      cell.title = cell.textContent;\n    }\n\n    {\n      cell.classList.add("audit-truncate");'],
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
