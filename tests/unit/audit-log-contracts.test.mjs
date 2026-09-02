// Runtime proof for the audit log response.
//
// One service answers both the audit and security-event routes: `listSecurityEvents` calls
// `list` with a flag, so there is one envelope of four members rather than two named after two
// routes. The entries have no shaper at all - they are the fifteen columns `searchForScope`
// selects - so the contract follows the table column for column, and the proof reads the
// schema rather than the renderer.
//
// **The disclosure model is checked, not assumed.** The address is deliberately shown to an
// administrator holding `audit_logs.view`. The three snapshot members are `JSON.stringify`
// output, and they are safe by construction upstream: the profile snapshots go through a
// whitelist shaper with no password column, and the password-reset entry records only a
// timestamp. Both facts are asserted here, and the browser types the snapshots as the JSON
// strings they are rather than pretending they are domain records.
//
// The pagination is the **first reuse** of `BrowserBoundedPagination`, published by
// `0.33.33.38.4.8.1` and named for the helper precisely so this could happen.

import { describe, it } from "vitest";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const { readText } = createProjectTextReader();

const serviceSource = readText("src/services/audit.service.js");
const routesSource = readText("src/routes/audit.routes.js");
const repositorySource = readText("src/repositories/audit-logs.repo.js");
const usersServiceSource = readText("src/services/users.service.js");
const normalizersSource = readText("src/utils/normalizers.js");
const securityEventsSource = readText("src/security/security-events.js");
const schemaSource = readText("src/db/schema/current.sql");
const declarationSource = readText("src/types/browser-contracts.d.ts");
const page = readText("public/js/audit-log.js");

const parser = sandbox(page,
  ["isResponseRecord", "isNullableText", "isAuditLogEntry", "isAuditFilterOption", "isAuditFilterOptions",
    "isBoundedPagination", "readAuditLogEnvelope"],
  ["AUDIT_ENTRY_TEXT", "AUDIT_ENTRY_NULLABLE_TEXT", "AUDIT_LABELLED_FILTERS", "AUDIT_STRING_FILTERS",
    "BOUNDED_PAGINATION_NUMBERS"]);

const list = extractFunctionBlock(serviceSource, "list");
const search = extractFunctionBlock(repositorySource, "searchForScope");
const table = schemaSource.slice(schemaSource.indexOf("CREATE TABLE audit_logs ("));
const columns = tableColumns(table.slice(0, table.indexOf(");")));

describe("the envelope against its producer", () => {
  it("is exactly the four members list returns", () => {
    const returned = literalMembers(list.slice(list.lastIndexOf("return {")), 4);
    assert.deepEqual(returned.slice().sort(), ["auditLogs", "filterOptions", "pagination", "workspaceId"],
      "list returns exactly four members");
    assert.deepEqual(declaredMembers("BrowserAuditLogEnvelope").sort(), returned.slice().sort(),
      "and the contract is exactly those four");
  });

  it("is one envelope for two routes because one service answers both", () => {
    assert.match(extractFunctionBlock(serviceSource, "listSecurityEvents"),
      /return list\(session, filters, \{\s+\.\.\.options,\s+securityOnly: true,/,
      "the security route is the same list with a flag");
    assert.doesNotMatch(declarationSource, /BrowserSecurityEventEnvelope/,
      "so there is no second envelope named after the second route");
    assert.match(page, /function getAuditEndpoint\(\)/, "and the page picks between the two endpoints itself");
  });

  it("is gated on the caller's own workspace unless they are a super administrator", () => {
    // Sliced to the list route: the export route asserts the same permission, and an unsliced
    // match was satisfied by it.
    const listRoute = routesSource.slice(
      routesSource.indexOf('auditRoutes.get("/audit-logs",'),
      routesSource.indexOf('auditRoutes.get("/audit-logs/export.csv"'),
    );
    assert.ok(listRoute.includes("auditService.list("), "the slice is the list route");
    assert.match(listRoute, /assertCan\(\s*request\.session,\s*"audit_logs\.view",/, "the audit route asserts the permission");
    const scope = extractFunctionBlock(serviceSource, "resolveAuditWorkspaceScope");
    assert.match(scope, /workspaceId === session\.workspace_id \|\| await permissionsService\.isSuperAdmin\(session\)/,
      "another workspace requires a super administrator");
    assert.match(scope, /throw new AppError\("You cannot view audit logs for that workspace\.", 403\)/,
      "and anything else is refused");
    assert.match(routesSource, /assertCanViewSecurityEvents\(request\.session\)/, "the security route adds its own check");
    assert.match(list, /cleanupExpired\(workspaceId, settings\.retentionDays\)/, "and retention is enforced before reading");
  });

  it("reuses the bounded pagination contract rather than naming a second one", () => {
    assert.match(list, /pagination: boundedPaginationEnvelope\(\{/, "the service uses the shared helper");
    assert.match(declarationBlock("BrowserAuditLogEnvelope"), /\n  pagination: BrowserBoundedPagination;/,
      "and the envelope names the shared contract");
    assert.doesNotMatch(declarationSource, /BrowserAuditLogPagination/, "no audit-specific pagination exists");
    assert.equal(parser.isBoundedPagination(pagination()), true);
    assert.equal(parser.isBoundedPagination({ ...pagination(), total: null }), true, "a null total is a value");
    for (const member of plain(parser.BOUNDED_PAGINATION_NUMBERS)) {
      assert.equal(parser.isBoundedPagination({ ...pagination(), [member]: "10" }), false, `${member} is a number`);
    }
  });
});

describe("the entry", () => {
  it("is the fifteen columns the query selects, with no shaper between", () => {
    const selected = [...search.slice(search.indexOf("SELECT"), search.indexOf("FROM audit_logs"))
      .matchAll(/^\s*(\w+),?\s*$/gm)].map((entry) => entry[1]).filter((name) => name !== "SELECT");
    assert.equal(selected.length, 15, "fifteen columns are selected");
    assert.deepEqual(selected.slice().sort(), columns.slice().sort(), "which is every column of the table");
    assert.deepEqual(declaredMembers("BrowserAuditLogEntry").sort(), selected.slice().sort(),
      "and the contract is exactly those columns");
    assert.match(list, /auditLogsRepository\.searchForScope\(workspaceScope, repositoryFilters\)/);
    assert.match(list, /\n\s+auditLogs,\r?\n/, "the rows are answered as selected, with nothing shaping them");
  });

  it("follows the schema's nullability column for column", () => {
    const required = requiredColumns(table.slice(0, table.indexOf(");")));
    assert.deepEqual(plain(parser.AUDIT_ENTRY_TEXT).slice().sort(), required.slice().sort(),
      "the browser requires exactly the NOT NULL columns");
    assert.deepEqual([...plain(parser.AUDIT_ENTRY_TEXT), ...plain(parser.AUDIT_ENTRY_NULLABLE_TEXT)].sort(),
      columns.slice().sort(), "and checks every column between the two tables");
    const block = declarationBlock("BrowserAuditLogEntry");
    for (const member of required) {
      assert.match(block, new RegExp(`\\n  ${member}: string;`), `${member} is NOT NULL in the table`);
    }
    for (const member of plain(parser.AUDIT_ENTRY_NULLABLE_TEXT)) {
      assert.match(block, new RegExp(`\\n  ${member}: string \\| null;`), `${member} is nullable in the table`);
    }
  });

  it("keeps its three vocabularies open because the columns and the writers do", () => {
    for (const column of ["action", "change_type", "record_type"]) {
      assert.doesNotMatch(table.slice(0, table.indexOf(");")), new RegExp(`${column} TEXT NOT NULL[^,]*CHECK`),
        `${column} carries no CHECK`);
      assert.match(declarationBlock("BrowserAuditLogEntry"), new RegExp(`\\n  ${column}: string;`));
    }
    assert.match(extractFunctionBlock(serviceSource, "normalizeRecordType"), /allowUnknown/,
      "the record type has an explicit unknown path");
    assert.equal(parser.isAuditLogEntry({ ...entry(), action: "security.authentication.login_failed" }), true,
      "the security stream writes its own action names");
  });

  it("rejects what the query could not send", () => {
    assert.equal(parser.isAuditLogEntry(entry()), true);
    for (const member of declaredMembers("BrowserAuditLogEntry")) {
      assert.equal(parser.isAuditLogEntry(omit(entry(), member)), false, `${member} is always selected`);
    }
    for (const member of plain(parser.AUDIT_ENTRY_TEXT)) {
      assert.equal(parser.isAuditLogEntry({ ...entry(), [member]: null }), false, `${member} is never null`);
    }
    for (const member of plain(parser.AUDIT_ENTRY_NULLABLE_TEXT)) {
      assert.equal(parser.isAuditLogEntry({ ...entry(), [member]: null }), true, `${member} may be null`);
      assert.equal(parser.isAuditLogEntry({ ...entry(), [member]: 0 }), false, `${member} is text or null`);
    }
    assert.equal(parser.isAuditLogEntry({ ...entry(), audit_id: "" }), false, "an entry with no identity is not one");
  });
});

describe("the disclosure model", () => {
  it("states the address rather than pretending it is redacted", () => {
    assert.match(extractFunctionBlock(serviceSource, "record"), /ip_address: nullableString\(event\.ipAddress/,
      "the writer records the acting session's address");
    assert.match(declarationBlock("BrowserAuditLogEntry"), /\n  ip_address: string \| null;/);
    assert.match(declarationBlock("BrowserAuditLogEntry"), /Deliberately disclosed to an\r?\n\s+\* administrator holding `audit_logs\.view`/,
      "and the declaration says so plainly");
  });

  it("keeps the snapshots as JSON strings rather than typing them as records", () => {
    assert.match(extractFunctionBlock(serviceSource, "stringifyNullableJson"), /return JSON\.stringify\(value\);/,
      "the writer stores stringified JSON");
    for (const member of ["previous_value_json", "new_value_json", "metadata_json"]) {
      assert.match(declarationBlock("BrowserAuditLogEntry"), new RegExp(`\\n  ${member}: string \\| null;`),
        `${member} is a JSON string on the wire`);
      assert.equal(parser.isAuditLogEntry({ ...entry(), [member]: '{"a":1}' }), true);
      assert.equal(parser.isAuditLogEntry({ ...entry(), [member]: { a: 1 } }), false,
        `${member} arrives as text, so an object is not what the wire sends`);
    }
    assert.match(declarationBlock("BrowserAuditLogEntry"), /A JSON string, not a record/,
      "and the declaration refuses to promise a shape no producer agrees on");
  });

  it("relies on writers that snapshot through a whitelist, and says so", () => {
    const shaper = extractFunctionBlock(normalizersSource, "userRowToAppValue");
    // `password_change_required` is a preference and legitimately contains the word, so the
    // check names the credential columns themselves rather than matching on the word.
    assert.doesNotMatch(shaper, /row\.password\b|token|secret|hash/i,
      "the profile snapshot shaper names no credential column");
    assert.match(shaper, /passwordChangeRequired: normalizeBooleanPreference\(row\.password_change_required\)/,
      "the one member that reads like a credential is a preference flag");
    assert.match(shaper, /user_id: row\.user_id,/, "it is a hand-written whitelist rather than a spread");
    assert.doesNotMatch(shaper, /\.\.\.row/, "so a new column cannot leak into a snapshot by accident");
    assert.match(usersServiceSource, /action: "user_password_reset",[\s\S]{0,240}?previousValue: \{ password_reset_at: null \},\s+newValue: \{ password_reset_at: new Date\(\)\.toISOString\(\) \},/,
      "and the password-reset entry records a timestamp rather than any credential");
  });

  it("sanitises the security stream that shares this table and this envelope", () => {
    // The security route answers the same envelope, so what that writer may put in a snapshot
    // is part of this boundary's disclosure model even though a different service writes it.
    assert.match(securityEventsSource,
      /const SECRET_FIELD_PATTERN = \/\(\?:authorization\|cookie\|credential\|hash\|password\|secret\|session_\?id\|session_\?reference\|token\)\/i;/,
      "a secret-name pattern is applied to metadata keys");
    assert.match(securityEventsSource,
      /const looksSecret = SECRET_FIELD_PATTERN\.test\(normalizedKey\) && !SAFE_SECRET_FIELD_NAME_EXCEPTIONS\.has\(normalizedKey\);/,
      "at every depth");
    assert.match(securityEventsSource, /depth === 0 && !SAFE_METADATA_FIELDS\.has\(normalizedKey\)/,
      "and the top level is an allowlist rather than a denylist");
    assert.match(securityEventsSource, /const MAX_METADATA_DEPTH = 4;/, "with a bounded depth");
    assert.match(securityEventsSource, /const MAX_METADATA_STRING_LENGTH = 512;/, "and a bounded string length");
  });
});

describe("the filter catalogues", () => {
  it("are the six the service assembles, in two vocabularies", () => {
    const assembled = literalMembers(list.slice(list.indexOf("filterOptions: {"), list.indexOf("pagination:")), 6);
    assert.deepEqual(assembled.slice().sort(), ["clients", "projects", "workspaces"],
      "three are added beside the repository's own");
    assert.match(extractFunctionBlock(repositorySource, "readFilterOptionsForScope"), /changeTypes: changeTypes\.map\(\(row\) => row\.change_type\)/,
      "and the repository maps two of its three to bare strings");
    assert.deepEqual(declaredMembers("BrowserAuditFilterOptions").sort(),
      ["changeTypes", "clients", "projects", "recordTypes", "users", "workspaces"]);
    const block = declarationBlock("BrowserAuditFilterOptions");
    for (const member of plain(parser.AUDIT_LABELLED_FILTERS)) {
      assert.match(block, new RegExp(`\\n  ${member}: BrowserAuditFilterOption\\[\\];`), `${member} is labelled`);
    }
    for (const member of plain(parser.AUDIT_STRING_FILTERS)) {
      assert.match(block, new RegExp(`\\n  ${member}: string\\[\\];`), `${member} is a bare string list`);
    }
  });

  it("keeps its option apart from the Support View audit's", () => {
    assert.deepEqual(declaredMembers("BrowserAuditFilterOption").sort(), ["label", "value"]);
    assert.match(declarationDoc("BrowserAuditFilterOption"), /Not `BrowserSupportViewAuditFilterOption`/,
      "the declaration records why the matching shape was not reused");
    assert.match(declarationSource, /export interface BrowserSupportViewAuditFilterOption \{/,
      "that contract still exists for its own producer");
    assert.match(declarationSource, /export interface BrowserSupportViewAuditFilterValue \{/,
      "with its own bare vocabulary, which this producer does not share");
  });

  it("validates every element, not just the containers", () => {
    assert.equal(parser.isAuditFilterOptions(filterOptions()), true);
    for (const member of plain(parser.AUDIT_LABELLED_FILTERS)) {
      assert.equal(parser.isAuditFilterOptions({ ...filterOptions(), [member]: [{ value: "x" }] }), false,
        `${member} needs its label`);
      assert.equal(parser.isAuditFilterOptions({ ...filterOptions(), [member]: "x" }), false, `${member} is a list`);
    }
    for (const member of plain(parser.AUDIT_STRING_FILTERS)) {
      assert.equal(parser.isAuditFilterOptions({ ...filterOptions(), [member]: [{ value: "x" }] }), false,
        `${member} is a list of strings`);
    }
    for (const member of ["changeTypes", "clients", "projects", "recordTypes", "users", "workspaces"]) {
      assert.equal(parser.isAuditFilterOptions(omit(filterOptions(), member)), false, `${member} is always assembled`);
    }
    assert.equal(parser.isAuditFilterOptions({ ...filterOptions(), clients: [], workspaces: [] }), true,
      "empty is a real answer: clients outside a business workspace, workspaces below a super administrator");
  });
});

describe("the reader", () => {
  it("accepts the producer's envelope whole", () => {
    assert.deepEqual(plain(parser.readAuditLogEnvelope(envelope())), envelope());
  });

  it("refuses partial history rather than rendering it", () => {
    assert.equal(parser.readAuditLogEnvelope({ ...envelope(), auditLogs: [{}] }), null,
      "an array container alone confers no trust");
    assert.equal(parser.readAuditLogEnvelope({ ...envelope(), auditLogs: [entry(), { audit_id: "a-2" }] }), null,
      "one entry the browser cannot vouch for makes the history unreadable, not shorter");
    assert.match(page, /if \(!result\) \{\s+throw new Error\("The audit log response could not be read\."\);/,
      "and the page takes the load-error path it already had");
    assert.match(page, /catch \(error\) \{\s+setStatus\(auditViewSelect\.value === "security"/,
      "which is a real path this page already owned");
  });

  it("does not trust a primitive or partial body", () => {
    for (const empty of [null, undefined, "body", 4, [], {}, { auditLogs: [] }]) {
      assert.equal(parser.readAuditLogEnvelope(empty), null);
    }
    for (const member of ["auditLogs", "filterOptions", "pagination", "workspaceId"]) {
      assert.equal(parser.readAuditLogEnvelope(omit(envelope(), member)), null, `${member} is always sent`);
    }
    assert.equal(parser.readAuditLogEnvelope({ ...envelope(), workspaceId: 1 }), null, "the scope is text");
    assert.equal(parser.readAuditLogEnvelope({ ...envelope(), workspaceId: "all" })?.workspaceId, "all",
      "and a super administrator's scope is a word, not an identifier");
  });
});

describe("the consumer", () => {
  it("narrows the one read through the reader and keeps its display coercion", () => {
    const consumers = ["readAuditLogEnvelope", "isAuditLogEntry", "isAuditFilterOptions", "isBoundedPagination"]
      .reduce((rest, reader) => rest.replace(extractFunctionBlock(page, reader), ""), page);
    for (const raw of ["Array.isArray(result.auditLogs)", "Number.parseInt(result.pagination", "result.pagination?."]) {
      assert.ok(!consumers.includes(raw), `audit-log.js must no longer read ${raw} off an unknown body`);
    }
    assert.match(page, /const result = readAuditLogEnvelope\(await requireApi\(\)\.getJson\(/);
    assert.match(page, /auditLogs = result\.auditLogs\.map\(normalizeAuditLog\);/,
      "the display normaliser still runs, so a null column still renders as it did");
    assert.match(page, /totalAuditLogs = result\.pagination\.total \?\? 0;/, "a null total still means no pages");
    assert.match(extractFunctionBlock(page, "normalizeAuditLog"), /String\(log\.action \|\| ""\)/,
      "and that normaliser is unchanged");
    assert.match(declarationSource, /getJson\([^)]*\): Promise<unknown>;/, "BrowserApi keeps returning a promise of unknown");
  });
});

/** @param {string} source @param {readonly string[]} functions @param {readonly string[]} tables */
function sandbox(source, functions, tables) {
  const context = vm.createContext({});
  for (const table of tables) {
    const match = source.match(new RegExp(`const ${table} = Object\\.freeze\\(\\[[\\s\\S]*?\\]\\);`));
    assert.ok(match, `${table} must remain a frozen table this owner can read`);
    vm.runInContext(match[0], context, { filename: table });
  }
  for (const name of functions) {
    vm.runInContext(extractFunctionBlock(source, name), context, { filename: name });
  }
  return vm.runInContext(`({ ${[...functions, ...tables].join(", ")} })`, context);
}

/**
 * The members an object literal names at one indent, written `name: value` or as shorthand.
 * @param {string} literal @param {number} indent @returns {string[]}
 */
function literalMembers(literal, indent) {
  return [...new Set([...literal.replaceAll("\r\n", "\n").matchAll(new RegExp(`^ {${indent}}([a-zA-Z_]\\w*)(?::|,$)`, "gm"))]
    .map((entry) => entry[1]))];
}

/**
 * Every column a `CREATE TABLE` body declares, read from the schema rather than from any table.
 * @param {string} body @returns {string[]}
 */
function tableColumns(body) {
  return [...body.replaceAll("\r\n", "\n").matchAll(/^ {2}(\w+) TEXT/gm)].map((entry) => entry[1]);
}

/**
 * The columns that body declares `NOT NULL`, primary key included.
 * @param {string} body @returns {string[]}
 */
function requiredColumns(body) {
  return [...body.replaceAll("\r\n", "\n").matchAll(/^ {2}(\w+) TEXT (?:NOT NULL|PRIMARY KEY)/gm)].map((entry) => entry[1]);
}

/**
 * The doc comment above a declaration, which `declarationBlock` deliberately excludes: the
 * block starts at `export interface`, and several of the claims this owner makes live in the
 * prose that explains why a member exists at all.
 * @param {string} name @returns {string}
 */
function declarationDoc(name) {
  const index = declarationSource.indexOf(`export interface ${name} {`);
  assert.ok(index > 0, `${name} must be declared`);
  const opened = declarationSource.lastIndexOf("/**", index);
  assert.ok(opened > 0 && declarationSource.slice(opened, index).trim().endsWith("*/"), `${name} must be documented`);
  return declarationSource.slice(opened, index);
}

/** @param {string} name @returns {string} */
function declarationBlock(name) {
  const match = declarationSource.match(new RegExp(`export interface ${name}\\b[^{]*\\{[\\s\\S]*?\\n\\}`));
  assert.ok(match, `${name} must be declared`);
  return match[0];
}

/** @param {string} name @returns {string[]} */
function declaredMembers(name) {
  return [...declarationBlock(name).matchAll(/^  (\w+)\??:/gm)].map((entry) => entry[1]);
}

/** @returns {Record<string, unknown>} */
function entry() {
  return {
    action: "user_profile_updated",
    actor_user_id: "u-1",
    actor_user_name: "admin",
    audit_id: "a-1",
    change_type: "update",
    created_at: "2026-09-02T12:00:00.000Z",
    ip_address: "10.0.0.1",
    metadata_json: null,
    new_value_json: '{"displayName":"After"}',
    previous_value_json: '{"displayName":"Before"}',
    record_id: "u-2",
    record_label: "Viewed User",
    record_type: "user",
    record_url: "user-admin.html",
    workspace_id: "w-1",
  };
}

/** @returns {Record<string, unknown>} */
function pagination() {
  return { hasMore: false, limit: 25, maxPageSize: 100, nextCursor: "", offset: 0, returned: 1, total: 1 };
}

/** @returns {Record<string, unknown>} */
function filterOptions() {
  return {
    changeTypes: ["update"],
    clients: [{ label: "Acme", value: "c-1" }],
    projects: [{ label: "Rollout", value: "p-1" }],
    recordTypes: ["user"],
    users: [{ label: "admin", value: "u-1" }],
    workspaces: [{ label: "All workspaces", value: "all" }],
  };
}

/** @returns {Record<string, unknown>} */
function envelope() {
  return { auditLogs: [entry()], filterOptions: filterOptions(), pagination: pagination(), workspaceId: "w-1" };
}

/** @param {Record<string, unknown>} record @param {string} member */
function omit(record, member) {
  const { [member]: _removed, ...rest } = record;
  return rest;
}

/** @template T @param {T} value @returns {T} */
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}
