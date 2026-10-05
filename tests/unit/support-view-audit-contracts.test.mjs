// Runtime proof for the Support View audit response boundary.
//
// One producer, `listAudit`, answers `GET /api/support-view/audit` with five members: events
// shaped by `toAuditEvent`, the shared bounded pagination envelope, five filter catalogues from
// the repository, and two policy constants. Every one is an exact reconstruction, so every
// contract here is exact, and each is pinned to the literal that builds it.
//
// **This is an audit surface, and the proofs treat it as one.** The event vocabulary is closed
// three ways - column `CHECK`, server union, literal writers - and all three are read here
// independently of the browser tables. The shaper's disclosure is checked negatively as well as
// positively: no identifier, request id, metadata or request detail may appear on the record,
// and the contract may not grow one. And a response with an element the browser cannot vouch
// for is refused whole rather than rendered shorter.

import { describe, it } from "vitest";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const { readText } = createProjectTextReader();

const serviceSource = readText("src/services/support-view.service.js");
const routesSource = readText("src/routes/support-view.routes.js");
const repositorySource = readText("src/repositories/support-sessions.repo.js");
const paginationSource = readText("src/core/bounded-pagination.js");
const serverDeclarationSource = readText("src/types/support-view-contracts.d.ts");
const eventsMigration = readText("src/db/migrations/091_support_view_action_events.sql");
const sessionsMigration = readText("src/db/migrations/090_support_view_sessions.sql");
const declarationSource = readText("src/types/browser-contracts.d.ts");
const page = readText("public/js/support-view-audit.js");

const parser = sandbox(page,
  ["isResponseRecord", "isFiniteNumber", "isAuditEvent", "isBoundedPagination", "isFilterOption",
    "isFilterValue", "isAuditFilterOptions", "readSupportViewAudit"],
  ["SUPPORT_VIEW_EVENT_TYPES", "SUPPORT_VIEW_EVENT_OUTCOMES", "SUPPORT_VIEW_SESSION_OUTCOMES",
    "AUDIT_EVENT_TEXT", "BOUNDED_PAGINATION_NUMBERS", "AUDIT_LABELLED_FILTERS", "AUDIT_VALUE_FILTERS"]);

const listAudit = extractFunctionBlock(serviceSource, "listAudit");
const shaper = extractFunctionBlock(serviceSource, "toAuditEvent");
const envelopeMembers = literalMembers(listAudit.slice(listAudit.lastIndexOf("return {")), 4);
const shaperMembers = literalMembers(shaper, 4);

/** Things an audit record must never carry to the browser, by name. */
const UNDISCLOSED = ["event_id", "eventId", "actor_user_id", "actorUserId", "effective_user_id", "effectiveUserId",
  "workspace_id", "workspaceId", "request_id", "requestId", "metadata_json", "metadata", "started_at", "expires_at",
  "ended_at", "ip", "ipAddress", "userAgent", "user_agent", "sessionId", "session_id", "token", "cookie"];

describe("the envelope against its producer", () => {
  it("is exactly the five members listAudit returns", () => {
    assert.deepEqual(envelopeMembers.slice().sort(), ["events", "exportLimit", "filterOptions", "pagination", "retentionDays"],
      "listAudit returns exactly five members");
    assert.deepEqual(declaredMembers(declarationSource, "BrowserSupportViewAuditEnvelope").slice().sort(),
      envelopeMembers.slice().sort(), "the contract is exactly what the service returns");
  });

  it("is reached only through the operator gate, which the contract cannot widen", () => {
    assert.match(listAudit, /const operator = await assertOperator\(session\);/, "listAudit asserts the operator first");
    const gate = extractFunctionBlock(serviceSource, "assertOperator");
    assert.match(gate, /config\.supportView\.enabled/, "Support View must be enabled");
    assert.match(gate, /isSupportViewOperatorSession\(session\)/, "a normal, non-support-view session");
    assert.match(gate, /permissionsService\.isSuperAdmin\(session\)/, "a super administrator");
    assert.match(gate, /assertCan\(session, "support_view\.enter"/, "holding the enter permission");
    assert.match(listAudit, /retentionCutoff\(/, "and the retention window is applied before shaping");
    assert.match(routesSource, /get\("\/support-view\/audit", asyncRoute[\s\S]*?"Cache-Control", "no-store"/,
      "the route forbids caching the response");
  });

  it("sends its two policy constants as numbers", () => {
    assert.match(listAudit, /exportLimit: SUPPORT_VIEW_AUDIT_EXPORT_LIMIT,/);
    assert.match(listAudit, /retentionDays: SUPPORT_VIEW_AUDIT_RETENTION_DAYS,/);
    assert.match(serviceSource, /const SUPPORT_VIEW_AUDIT_RETENTION_DAYS = 365;/);
    assert.match(serviceSource, /const SUPPORT_VIEW_AUDIT_EXPORT_LIMIT = 1000;/);
    const block = declarationBlock(declarationSource, "BrowserSupportViewAuditEnvelope");
    assert.match(block, /\n  exportLimit: number;/);
    assert.match(block, /\n  retentionDays: number;/);
    assert.equal(parser.readSupportViewAudit({ ...envelope(), retentionDays: "365" }), null, "text is not a number of days");
    assert.equal(parser.readSupportViewAudit({ ...envelope(), exportLimit: Number.NaN }), null, "nor is NaN a limit");
  });
});

describe("the event record", () => {
  it("is the exact reconstruction the shaper writes", () => {
    assert.deepEqual(shaperMembers.slice().sort(),
      ["actionId", "actorLabel", "effectiveUserLabel", "eventType", "occurredAt", "outcome", "reasonClass",
        "reasonReference", "routeId", "sessionOutcome", "workspaceName"],
      "toAuditEvent names eleven members");
    assert.deepEqual(declaredMembers(declarationSource, "BrowserSupportViewAuditEvent").slice().sort(),
      shaperMembers.slice().sort(), "and the browser contract is exactly those eleven");
  });

  it("discloses labels and never identifiers, request detail or metadata", () => {
    for (const name of UNDISCLOSED) {
      assert.ok(!shaperMembers.includes(name), `the shaper must not emit ${name}`);
      assert.ok(!declaredMembers(declarationSource, "BrowserSupportViewAuditEvent").includes(name),
        `and the contract must not name ${name}`);
    }
    assert.match(shaper, /actorLabel: displayLabel\(row\.actor_display_name, row\.actor_username\),/,
      "the actor is a readable label");
    assert.match(shaper, /effectiveUserLabel: displayLabel\(row\.effective_display_name, row\.effective_username\),/,
      "and so is the viewed user");
    const search = extractFunctionBlock(repositorySource, "searchAudit");
    assert.doesNotMatch(search, /metadata_json|request_id|ip_address|user_agent/,
      "the query does not even select the metadata, request id, or any request detail");
    assert.match(extractFunctionBlock(serviceSource, "createEvent"), /requestId: value\.requestId,/,
      "a request id is stored on the event, which is why the shaper's omission of it is deliberate");
  });

  it("closes the event vocabulary three ways and pins the browser to all of them", () => {
    const columnTypes = checkLiterals(eventsMigration, "event_type");
    const columnOutcomes = checkLiterals(eventsMigration, "outcome");
    assert.deepEqual(unionLiterals(serverDeclarationSource, "SupportViewEventType"), columnTypes,
      "the server union is the column CHECK");
    assert.deepEqual(unionLiterals(serverDeclarationSource, "SupportViewEventOutcome"), columnOutcomes);
    assert.deepEqual(unionLiterals(declarationSource, "BrowserSupportViewEventType"), columnTypes,
      "the browser union is the column CHECK");
    assert.deepEqual(unionLiterals(declarationSource, "BrowserSupportViewEventOutcome"), columnOutcomes,
      "the browser outcome union is the column CHECK");
    assert.deepEqual(plain(parser.SUPPORT_VIEW_EVENT_TYPES).slice().sort(), columnTypes,
      "and the runtime table is pinned to the column, not to itself");
    assert.deepEqual(plain(parser.SUPPORT_VIEW_EVENT_OUTCOMES).slice().sort(), columnOutcomes);
    for (const literal of ["eventType: \"entered\"", "eventType: \"action_attempt\"", "eventType: \"terminated\"",
      "eventType: \"expired\"", "eventType: \"exited\""]) {
      assert.ok(serviceSource.includes(literal), `a writer passes the literal ${literal}`);
    }
  });

  it("closes the session outcome the same way", () => {
    const column = checkLiterals(sessionsMigration, "outcome", "support_sessions");
    assert.deepEqual(unionLiterals(serverDeclarationSource, "SupportViewSessionOutcome"), column,
      "the server session-outcome union is the column CHECK");
    assert.deepEqual(unionLiterals(declarationSource, "BrowserSupportViewSessionOutcome"), column,
      "the browser session-outcome union is the column CHECK");
    assert.deepEqual(plain(parser.SUPPORT_VIEW_SESSION_OUTCOMES).slice().sort(), column,
      "and the runtime session-outcome table is pinned to the column");
    assert.match(shaper, /sessionOutcome: row\.session_outcome,/);
    assert.match(extractFunctionBlock(repositorySource, "searchAudit"), /support_sessions\.outcome AS session_outcome,/,
      "which is the joined session's column");
  });

  it("keeps the reason class as text because the writers do not close it", () => {
    assert.match(extractFunctionBlock(serviceSource, "recordAction"), /reasonClass: normalizeAuditIdentifier\(action\.reasonClass\),/,
      "an action attempt passes an identifier-shaped token through");
    assert.match(extractFunctionBlock(serviceSource, "normalizeAuditIdentifier"), /\/\^\[a-z0-9\._:-\]\{1,160\}\$\/i/,
      "which is a shape, not a vocabulary");
    assert.match(declarationBlock(declarationSource, "BrowserSupportViewAuditEvent"), /\n  reasonClass: string;/);
    assert.equal(parser.isAuditEvent({ ...auditEvent(), reasonClass: "anything.at:all" }), true);
  });

  it("gives the runtime tables authority of their own", () => {
    assert.deepEqual([...plain(parser.AUDIT_EVENT_TEXT), "eventType", "outcome", "sessionOutcome"].sort(),
      declaredMembers(declarationSource, "BrowserSupportViewAuditEvent").slice().sort(),
      "the browser checks every member the record declares");
  });

  it("rejects what the shaper could not send", () => {
    assert.equal(parser.isAuditEvent(auditEvent()), true);
    for (const member of declaredMembers(declarationSource, "BrowserSupportViewAuditEvent")) {
      assert.equal(parser.isAuditEvent(omit(auditEvent(), member)), false, `${member} is always reconstructed`);
    }
    for (const member of plain(parser.AUDIT_EVENT_TEXT)) {
      assert.equal(parser.isAuditEvent({ ...auditEvent(), [member]: null }), false, `${member} is text, never null`);
    }
    assert.equal(parser.isAuditEvent({ ...auditEvent(), eventType: "paused" }), false, "a word the column cannot hold");
    assert.equal(parser.isAuditEvent({ ...auditEvent(), outcome: "pending" }), false);
    assert.equal(parser.isAuditEvent({ ...auditEvent(), sessionOutcome: "open" }), false);
  });
});

describe("the pagination envelope", () => {
  it("is the exact reconstruction the shared helper writes", () => {
    const helper = extractFunctionBlock(paginationSource, "boundedPaginationEnvelope");
    assert.deepEqual(literalMembers(helper.slice(helper.indexOf("return {")), 4).slice().sort(),
      ["hasMore", "limit", "maxPageSize", "nextCursor", "offset", "returned", "total"], "the helper writes seven members");
    assert.deepEqual(declaredMembers(declarationSource, "BrowserBoundedPagination").slice().sort(),
      literalMembers(helper.slice(helper.indexOf("return {")), 4).slice().sort(),
      "the contract is exactly the helper's seven members");
    assert.match(listAudit, /pagination: boundedPaginationEnvelope\(\{/, "and the audit route uses that helper");
    assert.match(helper, /nextCursor: hasMore \? encodeOffsetCursor\(nextOffset\) : "",/,
      "the cursor is empty text rather than absent when there is nothing further");
    assert.match(helper, /\? null\s+: Number\.isFinite\(Number\(pagination\.total\)\) \? Number\(pagination\.total\) : null;/,
      "and the total is null when the caller had none");
    assert.match(declarationBlock(declarationSource, "BrowserBoundedPagination"), /\n  total: number \| null;/);
  });

  it("is shared by seven routes, which is why it is not named for this one", () => {
    const callers = serviceSource.includes("boundedPaginationEnvelope(") ? 1 : 0;
    assert.equal(callers, 1);
    assert.doesNotMatch(declarationSource, /export interface BrowserSupportViewAuditPagination/,
      "no audit-specific pagination contract exists");
  });

  it("rejects a malformed scalar", () => {
    assert.equal(parser.isBoundedPagination(pagination()), true);
    assert.equal(parser.isBoundedPagination({ ...pagination(), total: null }), true, "a null total is a value");
    for (const member of plain(parser.BOUNDED_PAGINATION_NUMBERS)) {
      assert.equal(parser.isBoundedPagination({ ...pagination(), [member]: "50" }), false, `${member} is a number`);
      assert.equal(parser.isBoundedPagination(omit(pagination(), member)), false, `${member} is always written`);
    }
    assert.equal(parser.isBoundedPagination({ ...pagination(), total: "12" }), false, "a total is a number or null");
    assert.equal(parser.isBoundedPagination({ ...pagination(), hasMore: "true" }), false);
    assert.equal(parser.isBoundedPagination({ ...pagination(), nextCursor: null }), false);
  });
});

describe("the filter catalogues", () => {
  it("are the five the repository builds, in two vocabularies", () => {
    const reader = extractFunctionBlock(repositorySource, "readAuditFilterOptions");
    assert.deepEqual(literalMembers(reader.slice(reader.lastIndexOf("return {")), 4).slice().sort(),
      ["actors", "effectiveUsers", "eventTypes", "outcomes", "workspaces"]);
    assert.deepEqual(declaredMembers(declarationSource, "BrowserSupportViewAuditFilterOptions").slice().sort(),
      ["actors", "effectiveUsers", "eventTypes", "outcomes", "workspaces"]);
    assert.equal((reader.match(/AS label/g) || []).length, 3, "three queries select a label");
    assert.match(reader, /SELECT DISTINCT event_type AS value\r?\n/, "the event-type query selects a value and nothing else");
    assert.match(reader, /SELECT DISTINCT outcome AS value\r?\n/, "and so does the outcome query");
    const block = declarationBlock(declarationSource, "BrowserSupportViewAuditFilterOptions");
    for (const member of plain(parser.AUDIT_LABELLED_FILTERS)) {
      assert.match(block, new RegExp(`\\n  ${member}: BrowserSupportViewAuditFilterOption\\[\\];`), `${member} is labelled`);
    }
    for (const member of plain(parser.AUDIT_VALUE_FILTERS)) {
      assert.match(block, new RegExp(`\\n  ${member}: BrowserSupportViewAuditFilterValue\\[\\];`), `${member} is a bare value`);
    }
    assert.deepEqual(declaredMembers(declarationSource, "BrowserSupportViewAuditFilterValue"), ["value"],
      "the bare vocabulary does not borrow the label");
    assert.match(declarationSource, /SupportViewAuditOption` declares a `label` for all five collections/,
      "and the server declaration's over-claim is recorded rather than copied");
  });

  it("validates every element, not just the containers", () => {
    assert.equal(parser.isAuditFilterOptions(filterOptions()), true);
    assert.equal(parser.isAuditFilterOptions({ ...filterOptions(), actors: [{ value: "u-1" }] }), false,
      "a labelled catalogue needs its label");
    assert.equal(parser.isAuditFilterOptions({ ...filterOptions(), eventTypes: [{ label: "Entered" }] }), false,
      "a bare catalogue needs its value");
    assert.equal(parser.isAuditFilterOptions({ ...filterOptions(), workspaces: [null] }), false);
    assert.equal(parser.isAuditFilterOptions({ ...filterOptions(), outcomes: "denied" }), false, "a catalogue is a list");
    for (const member of ["actors", "effectiveUsers", "eventTypes", "outcomes", "workspaces"]) {
      assert.equal(parser.isAuditFilterOptions(omit(filterOptions(), member)), false, `${member} is always built`);
    }
  });
});

describe("the reader", () => {
  it("accepts the producer's envelope whole", () => {
    assert.deepEqual(plain(parser.readSupportViewAudit(envelope())), envelope());
    assert.deepEqual(plain(parser.readSupportViewAudit({ ...envelope(), events: [] })), { ...envelope(), events: [] });
  });

  it("does not trust a primitive or partial body", () => {
    for (const empty of [null, undefined, "body", 4, [], {}, { events: [] }]) {
      assert.equal(parser.readSupportViewAudit(empty), null);
    }
    for (const member of ["events", "exportLimit", "filterOptions", "pagination", "retentionDays"]) {
      assert.equal(parser.readSupportViewAudit(omit(envelope(), member)), null, `${member} is always sent`);
    }
  });

  it("refuses the whole response when one event cannot be vouched for", () => {
    assert.equal(parser.readSupportViewAudit({ ...envelope(), events: [auditEvent(), { actorLabel: "x" }] }), null,
      "an audit list with an element the browser cannot vouch for is not a shorter list, it is unreadable");
    assert.equal(parser.readSupportViewAudit({ ...envelope(), events: [{}] }), null,
      "an array container alone confers no trust");
    assert.equal(parser.readSupportViewAudit({ ...envelope(), events: {} }), null);
    assert.equal(parser.readSupportViewAudit({ ...envelope(), pagination: { total: 3 } }), null);
    assert.equal(parser.readSupportViewAudit({ ...envelope(), filterOptions: {} }), null);
  });

  it("does not let auth material become vocabulary", () => {
    const leaked = { ...envelope(), events: [{ ...auditEvent(), sessionId: "s-1", ipAddress: "10.0.0.1" }] };
    const read = parser.readSupportViewAudit(leaked);
    assert.ok(read, "extra members do not make the record unreadable at runtime");
    const named = declaredMembers(declarationSource, "BrowserSupportViewAuditEvent");
    for (const name of UNDISCLOSED) {
      assert.ok(!named.includes(name), `${name} is not something the contract may ever name`);
    }
  });
});

describe("the consumer", () => {
  it("narrows the one read through the reader and fails closed", () => {
    for (const raw of ["result.events", "result.pagination", "result.filterOptions", "result.retentionDays", "result.exportLimit"]) {
      assert.ok(!page.includes(raw), `support-view-audit.js must no longer read ${raw} off an unknown body`);
    }
    assert.match(page, /const audit = readSupportViewAudit\(await requireApi\(\)\.getJson\(/);
    assert.match(page, /if \(!audit\) \{\n\s+throw new Error\("The Support View audit response could not be read\."\);/,
      "an unreadable response takes the load-error path the page already had");
    assert.match(page, /totalEvents = audit\.pagination\.total \?\? 0;/, "a null total still means no pages");
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
 * The members an object literal names at one indent, whether written `name: value` or as the
 * shorthand `name,` the pagination helper and the filter reader both use.
 * @param {string} literal @param {number} indent @returns {string[]}
 */
function literalMembers(literal, indent) {
  return [...new Set([...literal.replaceAll("\r\n", "\n").matchAll(new RegExp(`^ {${indent}}([a-zA-Z_]\\w*)(?::|,$)`, "gm"))]
    .map((entry) => entry[1]))];
}

/** @param {string} source @param {string} name @returns {string} */
function declarationBlock(source, name) {
  const match = source.match(new RegExp(`export interface ${name}\\b[^{]*\\{[\\s\\S]*?\\n\\}`));
  assert.ok(match, `${name} must be declared`);
  return match[0];
}

/** @param {string} source @param {string} name @returns {string[]} */
function declaredMembers(source, name) {
  return [...declarationBlock(source, name).matchAll(/^  (\w+)\??:/gm)].map((entry) => entry[1]);
}

/** @param {string} source @param {string} name @returns {string[]} */
function unionLiterals(source, name) {
  const match = source.match(new RegExp(`export type ${name} =([^;]+);`));
  assert.ok(match, `${name} must be declared`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]).sort();
}

/**
 * The words a column CHECK allows, read from the migration rather than from any table.
 * @param {string} source @param {string} column @param {string} [table]
 * @returns {string[]}
 */
function checkLiterals(source, column, table = "") {
  const scope = table ? source.slice(source.indexOf(`CREATE TABLE ${table} (`)) : source;
  const match = scope.match(new RegExp(`\\b${column} TEXT NOT NULL[^,]*?CHECK \\(${column} IN \\(([^)]+)\\)\\)`));
  assert.ok(match, `${column} must carry a CHECK`);
  return [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]).sort();
}

/** @returns {Record<string, unknown>} */
function auditEvent() {
  return {
    actionId: "tasks.delete",
    actorLabel: "Current Administrator",
    effectiveUserLabel: "Viewed User",
    eventType: "action_attempt",
    occurredAt: "2026-09-02T12:00:00.000Z",
    outcome: "denied",
    reasonClass: "read_only_support_view",
    reasonReference: "Ticket 1234",
    routeId: "tasks.delete",
    sessionOutcome: "active",
    workspaceName: "Workspace",
  };
}

/** @returns {Record<string, unknown>} */
function pagination() {
  return { hasMore: false, limit: 50, maxPageSize: 200, nextCursor: "", offset: 0, returned: 1, total: 1 };
}

/** @returns {Record<string, unknown>} */
function filterOptions() {
  return {
    actors: [{ label: "Current Administrator", value: "u-1" }],
    effectiveUsers: [{ label: "Viewed User", value: "u-2" }],
    eventTypes: [{ value: "action_attempt" }],
    outcomes: [{ value: "denied" }],
    workspaces: [{ label: "Workspace", value: "w-1" }],
  };
}

/** @returns {Record<string, unknown>} */
function envelope() {
  return { events: [auditEvent()], exportLimit: 1000, filterOptions: filterOptions(), pagination: pagination(), retentionDays: 365 };
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
