import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const nav = read("public/js/navigation.js");
const page = read("public/js/notifications.js");
const service = read("src/services/notifications.service.js");
const repo = read("src/repositories/notifications.repo.js");
const routes = read("src/routes/notifications.routes.js");
const contracts = read("src/types/browser-contracts.d.ts");

/** @param {string} source @param {string} opener @param {string} [closer] */
function functionBody(source, opener, closer = "\n}\n") {
  const start = source.indexOf(opener);
  assert.notEqual(start, -1, opener + " must exist");
  const end = source.indexOf(closer, start);
  return source.slice(start, end === -1 ? source.length : end);
}

/**
 * One function body sliced at the indentation it is written at.
 * @param {string} source @param {string} indentedOpener @param {number} indent
 */
function readerBody(source, indentedOpener, indent) {
  const pad = " ".repeat(indent);
  const start = source.indexOf(pad + indentedOpener);
  assert.notEqual(start, -1, indentedOpener + " must exist");
  const end = source.indexOf("\n" + pad + "}\n", start);
  assert.notEqual(end, -1, indentedOpener + " must terminate");
  return source.slice(start, end + pad.length + 2);
}

/** The shipped bell reader, instantiated from navigation's own source. */
function shippedReader() {
  return new Function([
    readerBody(nav, "function isNotificationRecord(value) {", 2),
    readerBody(nav, "function isBellCount(value) {", 2),
    readerBody(nav, "function isBellSummary(body) {", 2),
    readerBody(nav, "function readBellSummary(body) {", 2),
    "return { readBellSummary, isBellCount };",
  ].join("\n"))();
}

const { readBellSummary, isBellCount } = shippedReader();

/**
 * The members the producer reconstructs, read from the repository rather than the parser.
 * @returns {string[]}
 */
function producerSummaryMembers() {
  const body = functionBody(repo, "async function readBellSummaryForRecipient(workspaceId, recipientUserId) {");
  const returned = body.slice(body.lastIndexOf("return {"));
  const members = [...returned.matchAll(/^ {4}([A-Za-z]+)[:,]/gm)].map((entry) => entry[1]);
  assert.ok(members.length >= 5, "the producer's summary must have been parsed");
  return members;
}

/**
 * A summary as `readBellSummaryForRecipient` answers one.
 * @param {Record<string, unknown>} [overrides]
 * @returns {Record<string, unknown>}
 */
function summary(overrides = {}) {
  /** @type {Record<string, unknown>} */
  const record = {
    count: 3,
    unreadCount: 3,
    totalUnreadCount: 5,
    lowPriorityUnreadCount: 2,
    urgentPriorityCount: 1,
    highPriorityCount: 2,
    hasUrgentPriority: true,
    hasHighPriority: true,
    hasPriorityAlert: true,
  };
  return { ...record, ...overrides };
}

/** The all-zero summary a recipient with nothing waiting receives. */
function zeroSummary(overrides = {}) {
  return summary({
    count: 0,
    unreadCount: 0,
    totalUnreadCount: 0,
    lowPriorityUnreadCount: 0,
    urgentPriorityCount: 0,
    highPriorityCount: 0,
    hasUrgentPriority: false,
    hasHighPriority: false,
    hasPriorityAlert: false,
    ...overrides,
  });
}

describe("the bell summary is exact at nine members", () => {
  it("accepts a valid all-zero summary and a valid populated one", () => {
    assert.notEqual(readBellSummary(zeroSummary()), null,
      "a recipient with nothing waiting receives a real summary of zero");
    assert.notEqual(readBellSummary(summary()), null, "and a populated one is readable");
  });

  it("promises exactly what the producer reconstructs", () => {
    const produced = producerSummaryMembers();
    const declared = functionBody(contracts, "export interface BrowserNotificationBellSummary {", "\n}\n");
    const promised = [...declared.matchAll(/^ {2}([A-Za-z]+):/gm)].map((entry) => entry[1]);
    assert.deepEqual([...promised].sort(), [...produced].sort(),
      "every member the producer builds is promised, and nothing else is");
  });

  it("validates every member it promises, by name", () => {
    const declared = functionBody(contracts, "export interface BrowserNotificationBellSummary {", "\n}\n");
    const promised = [...declared.matchAll(/^ {2}([A-Za-z]+):/gm)].map((entry) => entry[1]);
    const predicate = readerBody(nav, "function isBellSummary(body) {", 2);
    for (const member of promised) {
      const check = member.startsWith("has")
        ? 'typeof ' + member + ' !== "boolean"'
        : "!isBellCount(" + member + ")";
      assert.ok(predicate.includes(check),
        member + " is promised and must be checked by the reader, as `" + check + "`");
    }
    assert.doesNotMatch(predicate, /\.every\(\(member\) =>/,
      "a loop over member names proves nothing TypeScript can use, so each is named");
  });

  it("refuses a body that is not a summary", () => {
    // Pinned by source and pinned first: without the record guard the destructure throws on a
    // null body, and the fixtures below never reach their own assertions.
    const predicate = readerBody(nav, "function isBellSummary(body) {", 2);
    assert.match(predicate, /if \(!isNotificationRecord\(body\)\) \{/,
      "the body is proved to be a record before it is destructured");
    for (const body of [null, undefined, "", "body", 0, false, []]) {
      assert.equal(readBellSummary(body), null, String(body) + " is not a bell summary");
    }
    assert.equal(readBellSummary(Object.assign([], summary())), null,
      "an array is not a summary even when it carries the members");
  });

  it("refuses a body missing any promised member", () => {
    for (const member of producerSummaryMembers()) {
      const body = Object.fromEntries(Object.entries(summary()).filter(([key]) => key !== member));
      assert.ok(!Object.hasOwn(body, member), "the fixture must genuinely lack " + member);
      assert.equal(readBellSummary(body), null, "a summary without " + member + " is not one this producer built");
    }
  });

  it("claims nothing beyond the members the producer names", () => {
    const body = functionBody(repo, "async function readBellSummaryForRecipient(workspaceId, recipientUserId) {");
    const returned = body.slice(body.lastIndexOf("return {"));
    assert.doesNotMatch(returned, /\.\.\./, "the summary is an exact reconstruction and spreads nothing");
    const unreadCount = functionBody(service, "async function unreadCount(session) {");
    assert.match(unreadCount, /return notificationsRepository\.readBellSummaryForRecipient\(activeSession\.workspace_id, activeSession\.user_id\);/,
      "and the service answers it unchanged");
    assert.match(routes, /notificationsRoutes\.get\("\/notifications\/unread-count"[\s\S]{0,200}response\.status\(200\)\.json\(result\);/,
      "and so does the route");
  });
});

describe("the counts follow producer truth", () => {
  it("requires each count to be a non-negative integer", () => {
    for (const member of ["count", "unreadCount", "totalUnreadCount", "lowPriorityUnreadCount", "urgentPriorityCount", "highPriorityCount"]) {
      for (const value of ["3", null, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, undefined, true]) {
        assert.equal(readBellSummary(zeroSummary({ [member]: value })), null,
          member + " may not be " + JSON.stringify(value ?? String(value)));
      }
    }
    // Every fractional fixture above also breaks a coherence rule, so integrality alone was never
    // being tested. This one is internally consistent and fractional, so only the integer check
    // can refuse it.
    assert.equal(readBellSummary(summary({
      count: 1.5, unreadCount: 1.5, totalUnreadCount: 1.5, lowPriorityUnreadCount: 0,
      urgentPriorityCount: 0, highPriorityCount: 0,
      hasUrgentPriority: false, hasHighPriority: false, hasPriorityAlert: false,
    })), null, "a coherent summary of fractional counts is still not one a SUM of ones produced");
    assert.equal(isBellCount(0), true, "and zero is a count");
    assert.equal(isBellCount(-0), true, "including negative zero, which is zero");
  });

  it("reads the non-negativity out of the producer's own SUM", () => {
    const body = functionBody(repo, "async function readBellSummaryForRecipient(workspaceId, recipientUserId) {");
    assert.match(body, /SUM\(CASE WHEN status = :unreadStatus THEN 1 ELSE 0 END\) AS unread_count/,
      "every count is a SUM of ones and zeroes");
    assert.match(body, /count: Number\(summary\?\.badge_count \|\| 0\)/,
      "and each is coerced through Number with a zero fallback");
  });

  it("requires the two count aliases to agree", () => {
    assert.equal(readBellSummary(summary({ count: 4 })), null,
      "count and unreadCount are the same SUM and must carry the same number");
    assert.equal(readBellSummary(summary({ unreadCount: 4, totalUnreadCount: 6 })), null, "in either direction");
    const body = functionBody(repo, "async function readBellSummaryForRecipient(workspaceId, recipientUserId) {");
    assert.match(body, /count: Number\(summary\?\.badge_count \|\| 0\),\n\s+unreadCount: Number\(summary\?\.badge_count \|\| 0\),/,
      "because the producer writes both from badge_count");
  });

  it("requires the unread arithmetic to reconcile", () => {
    assert.equal(readBellSummary(summary({ totalUnreadCount: 9 })), null,
      "the total must be the badge plus the low-priority remainder");
    assert.equal(readBellSummary(summary({ lowPriorityUnreadCount: 4 })), null, "in either direction");
    assert.notEqual(readBellSummary(summary({ count: 3, unreadCount: 3, lowPriorityUnreadCount: 0, totalUnreadCount: 3 })), null,
      "and a recipient with no low-priority unread items reconciles too");
    const body = functionBody(repo, "async function readBellSummaryForRecipient(workspaceId, recipientUserId) {");
    assert.match(body, /SUM\(CASE WHEN status = :unreadStatus AND priority != :lowPriority THEN 1 ELSE 0 END\) AS badge_count/,
      "the badge excludes low priority");
    assert.match(body, /SUM\(CASE WHEN status = :unreadStatus AND priority = :lowPriority THEN 1 ELSE 0 END\) AS low_unread_count/,
      "and the low-priority count is the rest of the unread population");
  });

  it("does not treat the priority counts as a subset of the unread count", () => {
    const body = functionBody(repo, "async function readBellSummaryForRecipient(workspaceId, recipientUserId) {");
    assert.match(body, /SUM\(CASE WHEN status IN \(:activeStatuses\) AND priority = :urgentPriority THEN 1 ELSE 0 END\) AS urgent_priority_count/,
      "the urgent count spans the active statuses, not the unread ones");
    assert.match(body, /activeStatuses: \["unread", "read"\],/, "and those statuses include read");
    assert.notEqual(readBellSummary(summary({ count: 0, unreadCount: 0, totalUnreadCount: 0, lowPriorityUnreadCount: 0, urgentPriorityCount: 4, highPriorityCount: 0, hasUrgentPriority: true, hasHighPriority: false, hasPriorityAlert: true })), null,
      "so a recipient who has read every urgent notification still has an urgent count with nothing unread");
    const predicate = readerBody(nav, "function isBellSummary(body) {", 2);
    assert.doesNotMatch(predicate, /urgentPriorityCount <= unreadCount|highPriorityCount <= unreadCount/,
      "and the reader must not invent a containment rule the SQL does not support");
  });
});

describe("the flags must agree with the counts that derive them", () => {
  it("requires each flag to be a boolean", () => {
    for (const member of ["hasUrgentPriority", "hasHighPriority", "hasPriorityAlert"]) {
      for (const value of ["true", 1, null, 0, undefined]) {
        assert.equal(readBellSummary(zeroSummary({ [member]: value })), null,
          member + " may not be " + JSON.stringify(value ?? String(value)));
      }
    }
  });

  it("requires each priority flag to match its own count", () => {
    assert.equal(readBellSummary(summary({ hasUrgentPriority: false })), null,
      "an urgent count above zero means the urgent flag is set");
    assert.equal(readBellSummary(summary({ hasHighPriority: false })), null, "and the same for high");
    assert.equal(readBellSummary(zeroSummary({ hasUrgentPriority: true, hasPriorityAlert: true })), null,
      "and a set flag with a zero count is not one this producer built");
    const body = functionBody(repo, "async function readBellSummaryForRecipient(workspaceId, recipientUserId) {");
    assert.match(body, /hasUrgentPriority: urgentPriorityCount > 0,\n\s+hasHighPriority: highPriorityCount > 0,/,
      "because the producer derives them exactly that way");
  });

  it("requires the alert flag to be the disjunction of the other two", () => {
    assert.equal(readBellSummary(summary({ hasPriorityAlert: false })), null,
      "an alert is set when either priority flag is");
    assert.equal(readBellSummary(zeroSummary({ hasPriorityAlert: true })), null,
      "and cleared when neither is");
    assert.notEqual(readBellSummary(summary({ urgentPriorityCount: 0, hasUrgentPriority: false, hasPriorityAlert: true })), null,
      "one of the two is enough");
    const body = functionBody(repo, "async function readBellSummaryForRecipient(workspaceId, recipientUserId) {");
    assert.match(body, /hasPriorityAlert: urgentPriorityCount > 0 \|\| highPriorityCount > 0,/,
      "which is the producer's own definition");
  });
});

describe("a malformed summary is not a summary of zero", () => {
  const refresh = functionBody(nav, "  async function refreshNotificationCount() {", "\n  }\n");

  it("no longer hands the parsed body straight to the badge", () => {
    assert.doesNotMatch(nav, /applyNotificationSummary\(await response\.json\(\)\)/,
      "the raw handoff must be gone");
    assert.match(refresh, /\/\*\* @type \{unknown\} \*\/\n\s+const body = await response\.json\(\);/,
      "the parsed body is explicitly unknown");
    assert.match(refresh, /const summary = readBellSummary\(body\);/, "and it goes through the reader");
  });

  it("refuses before the badge is updated", () => {
    const refusal = refresh.indexOf('if (!summary) {');
    assert.notEqual(refusal, -1, "an unreadable summary must be refused");
    const applied = refresh.indexOf("applyNotificationSummary(summary);");
    assert.notEqual(applied, -1, "and a readable one applied");
    assert.ok(refusal < applied, "the refusal comes first");
    assert.match(refresh, /if \(!summary\) \{\n\s+throw new Error\("The notification summary could not be read\."\);\n\s+\}/,
      "by throwing into the existing catch");
  });

  it("keeps the existing degradation without claiming the server reported zero", () => {
    assert.match(refresh, /\} catch \{[\s\S]*applyNotificationSummary\(\{ unreadCount: 0 \}\);/,
      "the badge is still reset on failure, which is the page's own choice");
    assert.match(refresh, /not\*\* a claim that the server reported zero/,
      "and the reason is written where the reset happens");
    const reader = readerBody(nav, "function readBellSummary(body) {", 2);
    assert.doesNotMatch(reader, /unreadCount: 0|return \{/,
      "the reader itself never manufactures a zero summary");
  });

  it("leaves applyNotificationSummary alone for its other caller", () => {
    assert.match(nav, /applyNotificationSummary\(shell\.notificationSummary\);/,
      "the bootstrap caller passes an already-trusted internal summary");
    const apply = functionBody(nav, "  function applyNotificationSummary(summary = {}) {", "\n  }\n");
    assert.match(apply, /const unreadCount = Number\(summary\.unreadCount \|\| summary\.count \|\| 0\);/,
      "and the helper is unchanged, because narrowing one caller is this child's whole scope");
    assert.equal((nav.match(/applyNotificationSummary\(/g) || []).length, 4,
      "one declaration and three call sites, exactly as before");
  });
});

describe("this child stays inside the unread-count producer", () => {
  it("publishes one contract and no mutation-response contracts", () => {
    assert.equal((contracts.match(/export interface BrowserNotificationBellSummary\b/g) || []).length, 1,
      "one bell summary contract");
    for (const invented of ["BrowserNotificationReadResult", "BrowserNotificationDismissResult", "BrowserNotificationBulkResult"]) {
      assert.ok(!contracts.includes(invented), invented + " would describe a body no consumer reads");
    }
  });

  it("leaves the bulk mutation callers ignoring their bodies", () => {
    const markAll = functionBody(page, "async function markAllRead() {", "\n}\n");
    assert.match(markAll, /if \(!response\.ok\) \{/, "read-all checks ok");
    assert.doesNotMatch(markAll, /response\.json\(\)/, "and parses nothing, though the server answers this same summary");
    assert.match(markAll, /await loadNotifications\(\);\n\s+await refreshNotificationCount\(\);/, "then refetches");
    const bulk = functionBody(nav, "  async function mutateAllNotifications(action) {", "\n  }\n");
    assert.doesNotMatch(bulk, /response\.json\(\)/, "and the panel's bulk action parses nothing either");
    assert.match(bulk, /await loadNotificationPanel\(\);\n\s+await refreshNotificationCount\(\);/, "and refetches too");
  });

  it("adds no transport", () => {
    assert.match(nav, /await fetch\("\/api\/notifications\/unread-count", \{ cache: "no-store" \}\)/,
      "the transport is unchanged");
    assert.doesNotMatch(nav, /requireApi\(\)\.getJson\("\/api\/notifications\/unread-count"/,
      "and is not migrated to BrowserApi");
  });

  it("keeps the recipient scoping on the server", () => {
    const unread = functionBody(service, "async function unreadCount(session) {");
    assert.match(unread, /await permissionsService\.assertCanInAnyScope\(session, "notifications\.view_own"\);/,
      "the permission is asserted");
    const gate = unread.indexOf("notifications.view_own");
    const query = unread.indexOf("readBellSummaryForRecipient");
    assert.notEqual(gate, -1, "the gate exists");
    assert.notEqual(query, -1, "and the query");
    assert.ok(gate < query, "in that order");
    const body = functionBody(repo, "async function readBellSummaryForRecipient(workspaceId, recipientUserId) {");
    assert.match(body, /WHERE workspace_id = :workspaceId\n {2}AND recipient_user_id = :recipientUserId;/,
      "and the aggregate is scoped to the workspace and the recipient");
  });
});
