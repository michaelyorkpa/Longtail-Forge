import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const page = read("public/js/notifications.js");
const nav = read("public/js/navigation.js");
const service = read("src/services/notifications.service.js");
const repo = read("src/repositories/notifications.repo.js");
const routes = read("src/routes/notifications.routes.js");
const schema = read("src/db/schema/current.sql");
const contracts = read("src/types/browser-contracts.d.ts");

/** @param {string} source @param {string} opener @param {string} [closer] */
function functionBody(source, opener, closer = "\n}\n") {
  const start = source.indexOf(opener);
  assert.notEqual(start, -1, opener + " must exist");
  const end = source.indexOf(closer, start);
  return source.slice(start, end === -1 ? source.length : end);
}

/**
 * One function body, sliced at the indentation it is written at.
 *
 * The same reader lives at two indents in two files, so a fixed `"\n}\n"` closer terminates it in
 * one of them and runs to the end of the file in the other.
 * @param {string} source @param {string} indentedOpener @param {number} indent
 */
function readerBody(source, indentedOpener, indent) {
  const pad = " ".repeat(indent);
  const start = source.indexOf(pad + indentedOpener);
  assert.notEqual(start, -1, indentedOpener + " must exist");
  const end = source.indexOf("\n" + pad + "}\n", start);
  assert.notEqual(end, -1, indentedOpener + " must terminate");
  return source.slice(start, end);
}

/** @param {string} source @param {string} name */
function readTable(source, name) {
  const at = source.indexOf("const " + name + " = Object.freeze([");
  assert.notEqual(at, -1, name + " must exist");
  return [...source.slice(at, source.indexOf("]);", at)).matchAll(/"([A-Za-z_]+)"/g)].map((entry) => entry[1]);
}

/**
 * One of the two shipped readers, instantiated from its own file's source.
 * @param {string} source
 * @param {number} indent
 */
function shippedReader(source, indent) {
  const pad = " ".repeat(indent);
  /** @param {string} opener */
  const slice = (opener) => {
    const start = source.indexOf(pad + opener);
    assert.notEqual(start, -1, opener + " must exist in the source");
    return source.slice(start, source.indexOf("\n" + pad + "}\n", start) + indent + 3);
  };
  const tables = [
    "NOTIFICATION_TEXT_MEMBERS",
    "NOTIFICATION_TARGET_TEXT_MEMBERS",
    "NOTIFICATION_STATUSES",
    "NOTIFICATION_PRIORITIES",
    "NOTIFICATION_PAGINATION_NUMBERS",
  ].map((name) => "const " + name + " = " + JSON.stringify(readTable(source, name)) + ";");
  return new Function([
    ...tables,
    slice("function isNotificationRecord(value) {"),
    slice("function hasNotificationText(value, members) {"),
    slice("function isNotificationStringList(value) {"),
    slice("function isApplicationRelativeUrl(value) {"),
    slice("function isNotificationTarget(value) {"),
    slice("function isNotificationRecordValue(value) {"),
    slice("function isNotificationPagination(value) {"),
    slice("function isNotificationList(body) {"),
    slice("function readNotificationList(body) {"),
    "return { readNotificationList, isApplicationRelativeUrl };",
  ].join("\n"))();
}

const pageReader = shippedReader(page, 0);
const navReader = shippedReader(nav, 2);

/**
 * The members the producer reconstructs, read from the producer rather than the parser table.
 * @returns {string[]}
 */
function producerNotificationMembers() {
  const row = functionBody(repo, "function notificationRowToAppValue(databaseRow) {");
  const fromRow = [...row.matchAll(/^ {4}([A-Za-z_]+)[:,]/gm)].map((entry) => entry[1]);
  const decorate = functionBody(service, "async function decorateForSession(notification, session) {");
  const added = [...decorate.matchAll(/^ {4}([A-Za-z_]+)[:,]/gm)].map((entry) => entry[1]);
  assert.ok(fromRow.length > 10, "the row normaliser must have been parsed");
  assert.ok(added.length > 2, "the decorator must have been parsed");
  return [...new Set([...fromRow, ...added])];
}

/**
 * The vocabularies the schema's CHECK constraints admit.
 * @param {string} column
 * @returns {string[]}
 */
function schemaVocabulary(column) {
  const start = schema.indexOf("CREATE TABLE notifications (");
  assert.notEqual(start, -1, "the notifications table must exist");
  const block = schema.slice(start, schema.indexOf("\n);", start));
  const match = new RegExp("^ {2}" + column + " TEXT.*CHECK \\(" + column + " IN \\((.*)\\)\\)", "m").exec(block);
  assert.ok(match, column + " must carry a CHECK constraint");
  return match[1].split(",").map((entry) => entry.trim().replace(/'/g, ""));
}

/**
 * A target as `readTargetMetadata` resolves one.
 * @param {Record<string, unknown>} [overrides]
 * @returns {Record<string, unknown>}
 */
function target(overrides = {}) {
  /** @type {Record<string, unknown>} */
  const record = { canOpen: true, moduleId: "tasks", recordId: "task_1", recordType: "task", targetExists: true, url: "/tasks.html?task=task_1" };
  return { ...record, ...overrides };
}

/**
 * A notification as the list producer decorates one.
 * @param {Record<string, unknown>} [overrides]
 * @returns {Record<string, unknown>}
 */
function notification(overrides = {}) {
  /** @type {Record<string, unknown>} */
  const record = {
    notification_id: "notification_1",
    workspace_id: "workspace_1",
    module_id: "tasks",
    event_type: "task.assigned",
    recipient_user_id: "user_1",
    actor_user_id: "user_2",
    record_type: "task",
    record_id: "task_1",
    title: "Task assigned",
    body: "You were assigned a task",
    url: "/tasks.html?task=task_1",
    status: "unread",
    priority: "normal",
    created_at: "2026-09-01T00:00:00.000Z",
    read_at: "",
    dismissed_at: "",
    metadata: {},
    displayType: "Assigned",
    displayTitle: "Task assigned",
    updateTypeLabel: "Assigned",
    target: target(),
  };
  return { ...record, ...overrides };
}

/**
 * The bounded pagination the shared envelope answers.
 * @param {Record<string, unknown>} [overrides]
 * @returns {Record<string, unknown>}
 */
function pagination(overrides = {}) {
  /** @type {Record<string, unknown>} */
  const record = { hasMore: false, limit: 25, maxPageSize: 100, nextCursor: "", offset: 0, returned: 1, total: 1 };
  return { ...record, ...overrides };
}

/**
 * The filter catalogue `readFilterOptionsForRecipient` reconstructs.
 * @param {Record<string, unknown>} [overrides]
 * @returns {Record<string, unknown>}
 */
function filterOptions(overrides = {}) {
  /** @type {Record<string, unknown>} */
  const record = { events: ["task.assigned"], modules: ["tasks"] };
  return { ...record, ...overrides };
}

/**
 * A body as `notificationsService.list` answers one.
 * @param {Record<string, unknown>} [overrides]
 * @returns {Record<string, unknown>}
 */
function listBody(overrides = {}) {
  /** @type {Record<string, unknown>} */
  const record = { filterOptions: filterOptions(), notifications: [notification()], pagination: pagination() };
  return { ...record, ...overrides };
}

/**
 * Runs one fixture through both shipped readers and requires a single verdict.
 * @param {unknown} body @param {boolean} expected @param {string} message
 */
function bothReaders(body, expected, message) {
  const fromPage = pageReader.readNotificationList(body);
  const fromNav = navReader.readNotificationList(body);
  assert.equal(fromPage === null, !expected, "notifications.js: " + message);
  assert.equal(fromNav === null, !expected, "navigation.js: " + message);
  assert.equal(fromPage === null, fromNav === null,
    "both readers implement one contract and must reach the same verdict: " + message);
  return fromPage;
}

describe("the notification list envelope is exact at three members", () => {
  it("accepts a valid full-page response and a valid panel response", () => {
    bothReaders(listBody(), true, "a valid list response is readable");
    bothReaders(listBody({ notifications: [notification(), notification({ notification_id: "notification_2" })] }), true,
      "and so is one with several notifications");
  });

  it("accepts a genuinely empty notification list", () => {
    const result = bothReaders(listBody({ notifications: [], pagination: { hasMore: false, limit: 25, maxPageSize: 100, nextCursor: "", offset: 0, returned: 0, total: 0 } }), true,
      "a recipient with no notifications is a real answer");
    assert.deepEqual(result?.notifications, [], "and it comes back empty");
  });

  it("refuses a body that is not a list body", () => {
    // Pinned by source and pinned first: without the record guard, `body.filterOptions` throws on
    // a null body and the fixtures below never reach their own assertions.
    for (const { source, indent } of [{ source: page, indent: 0 }, { source: nav, indent: 2 }]) {
      const reader = readerBody(source, "function isNotificationList(body) {", indent);
      assert.match(reader, /return isNotificationRecord\(body\)/,
        "the body is proved to be a record before any member is read off it");
    }
    for (const body of [null, undefined, "", "body", 0, false, []]) {
      bothReaders(body, false, String(body) + " is not a notification list body");
    }
    bothReaders(Object.assign([], listBody()), false, "an array is not a list body even when it carries the members");
  });

  it("refuses a body missing any of the three named members", () => {
    for (const member of ["filterOptions", "notifications", "pagination"]) {
      const body = Object.fromEntries(Object.entries(listBody()).filter(([key]) => key !== member));
      assert.ok(!Object.hasOwn(body, member), "the fixture must genuinely lack " + member);
      bothReaders(body, false, "a body without " + member + " is not this producer's");
    }
  });

  it("claims the three members the producer names and nothing else", () => {
    const list = functionBody(service, "async function list(session, query = {}) {");
    assert.match(list, /return \{\n\s+filterOptions,\n\s+notifications: await Promise\.all\([\s\S]*?\n\s+pagination: boundedPaginationEnvelope\(/,
      "the envelope names three members and spreads nothing");
    assert.match(routes, /notificationsRoutes\.get\("\/notifications"[\s\S]{0,220}response\.status\(200\)\.json\(result\);/,
      "and the route answers it unchanged");
    const declared = functionBody(contracts, "export interface BrowserNotificationList {", "\n}\n");
    assert.deepEqual([...declared.matchAll(/^ {2}([A-Za-z_]+):/gm)].map((e) => e[1]).sort(),
      ["filterOptions", "notifications", "pagination"], "and the contract names exactly those three");
  });

  it("reuses the shared bounded pagination rather than declaring a second one", () => {
    assert.match(service, /pagination: boundedPaginationEnvelope\(\{/, "the producer builds the shared envelope");
    const declared = functionBody(contracts, "export interface BrowserNotificationList {", "\n}\n");
    assert.match(declared, /^ {2}pagination: BrowserBoundedPagination;$/m, "and the contract reuses the shared type");
    assert.equal((contracts.match(/export interface BrowserBoundedPagination\b/g) || []).length, 1,
      "there is one bounded pagination contract in the estate");
    for (const invented of ["BrowserNotificationPagination", "BrowserNotificationListPagination"]) {
      assert.ok(!contracts.includes(invented), invented + " would be a second pagination type");
    }
  });

  it("refuses a malformed pagination", () => {
    for (const member of ["limit", "maxPageSize", "offset", "returned"]) {
      bothReaders(listBody({ pagination: pagination({ [member]: "25" }) }), false,
        member + " must be a finite number");
      bothReaders(listBody({ pagination: pagination({ [member]: Number.NaN }) }), false,
        member + " may not be NaN");
    }
    bothReaders(listBody({ pagination: pagination({ hasMore: "false" }) }), false, "hasMore is a boolean");
    bothReaders(listBody({ pagination: pagination({ nextCursor: null }) }), false, "nextCursor is a string");
    bothReaders(listBody({ pagination: pagination({ total: null }) }), true, "and total may legitimately be null");
    for (const pagination of [null, [], "", 7]) {
      bothReaders(listBody({ pagination }), false, "a non-record pagination is refused");
    }
  });
});

describe("the filter catalogue is validated, not assumed", () => {
  it("requires both members the producer reconstructs", () => {
    const options = functionBody(repo, "async function readFilterOptionsForRecipient(workspaceId, recipientUserId, options = {}) {");
    assert.match(options, /return \{\n\s+events: events\.map\(\(row\) => row\.event_type\)\.filter\(Boolean\),\n\s+modules: modules\.map\(\(row\) => row\.module_id\)\.filter\(Boolean\),\n\s+\};/,
      "the producer reconstructs both members and filters falsy entries out of each");
    const declared = functionBody(contracts, "export interface BrowserNotificationFilterOptions {", "\n}\n");
    assert.deepEqual([...declared.matchAll(/^ {2}([A-Za-z_]+):/gm)].map((e) => e[1]).sort(), ["events", "modules"],
      "so the contract promises both, not only the one this page renders");
  });

  it("refuses a malformed catalogue rather than showing an empty one", () => {
    for (const member of ["events", "modules"]) {
      for (const value of [null, undefined, "", 7, {}, "list"]) {
        bothReaders(listBody({ filterOptions: filterOptions({ [member]: value }) }), false,
          member + " must be a list of strings");
      }
      bothReaders(listBody({ filterOptions: filterOptions({ [member]: [7] }) }), false,
        member + " may not carry a non-string entry");
      bothReaders(listBody({ filterOptions: filterOptions({ [member]: [""] }) }), false,
        member + " may not carry an empty entry, because the producer filters those out");
      bothReaders(listBody({ filterOptions: filterOptions({ [member]: [] }) }), true,
        member + " may legitimately be empty");
    }
    for (const filterOptions of [null, [], "", 7]) {
      bothReaders(listBody({ filterOptions }), false, "a non-record catalogue is refused");
    }
  });
});

describe("the notification record is exact, because the spread source is a total reconstruction", () => {
  it("promises exactly what the producer reconstructs", () => {
    const produced = producerNotificationMembers();
    const declared = functionBody(contracts, "export interface BrowserNotification {", "\n}\n");
    const promised = [...declared.matchAll(/^ {2}([A-Za-z_]+):/gm)].map((entry) => entry[1]);
    assert.deepEqual([...promised].sort(), [...produced].sort(),
      "every member the producer builds is promised, and nothing else is");
    assert.ok(produced.length >= 20, "and the producer's members must have been found");
  });

  it("validates every member it promises", () => {
    const declared = functionBody(contracts, "export interface BrowserNotification {", "\n}\n");
    const promised = [...declared.matchAll(/^ {2}([A-Za-z_]+):/gm)].map((entry) => entry[1]);
    const predicate = readerBody(page, "function isNotificationRecordValue(value) {", 0);
    const validated = new Set([
      ...readTable(page, "NOTIFICATION_TEXT_MEMBERS"),
      ...[...predicate.matchAll(/value\.([A-Za-z_]+)/g)].map((entry) => entry[1]),
    ]);
    for (const member of promised) {
      assert.ok(validated.has(member), member + " is promised by the contract and must be validated by the reader");
    }
  });

  it("refuses a record whose promised text member is not text", () => {
    for (const member of readTable(page, "NOTIFICATION_TEXT_MEMBERS")) {
      bothReaders(listBody({ notifications: [notification({ [member]: null })] }), false, member + " may not be null");
      bothReaders(listBody({ notifications: [notification({ [member]: 7 })] }), false, member + " may not be a number");
    }
    bothReaders(listBody({ notifications: [notification({ notification_id: "" })] }), false,
      "and the identity may not be empty");
  });

  it("closes status and priority to the vocabularies the column admits", () => {
    for (const [column, table] of [["status", "NOTIFICATION_STATUSES"], ["priority", "NOTIFICATION_PRIORITIES"]]) {
      const fromSchema = schemaVocabulary(column);
      assert.deepEqual([...readTable(page, table)].sort(), [...fromSchema].sort(),
        column + "'s browser vocabulary must be exactly what the column admits");
      const normalizer = functionBody(service, "function normalize" + column[0].toUpperCase() + column.slice(1) + "(" + column + ") {");
      for (const word of fromSchema) {
        assert.ok(normalizer.includes('"' + word + '"'), word + " must also be in the producer's normalizer");
      }
      for (const bad of ["active", "", "Unread", "URGENT", null, 7]) {
        bothReaders(listBody({ notifications: [notification({ [column]: bad })] }), false,
          JSON.stringify(bad ?? String(bad)) + " is not a " + column + " this column can hold");
      }
      for (const word of fromSchema) {
        bothReaders(listBody({ notifications: [notification({ [column]: word, target: target(), url: "/tasks.html" })] }), true,
          word + " is a " + column + " this column holds");
      }
    }
  });

  it("does not confuse the list query's synthetic active filter with a stored status", () => {
    assert.ok(!readTable(page, "NOTIFICATION_STATUSES").includes("active"),
      "active is a query filter, not a stored status");
    assert.match(page, /filter: "active"/, "even though the page's default filter is spelled that way");
  });

  it("keeps metadata opaque", () => {
    const parse = functionBody(repo, "function parseMetadata(metadataJson) {");
    assert.match(parse, /parsed && typeof parsed === "object" && !Array\.isArray\(parsed\) \? parsed : \{\}/,
      "the producer guarantees a plain object");
    const declared = functionBody(contracts, "export interface BrowserNotification {", "\n}\n");
    assert.match(declared, /^ {2}metadata: Record<string, unknown>;$/m, "so the browser promises a plain object and no more");
    for (const metadata of [null, [], "", 7]) {
      bothReaders(listBody({ notifications: [notification({ metadata })] }), false, "a non-record metadata is refused");
    }
    bothReaders(listBody({ notifications: [notification({ metadata: { job_id: "x", payload: { a: 1 } } })] }), true,
      "and its contents are not modelled");
  });

  it("refuses the whole response for one malformed record", () => {
    const wire = listBody({ notifications: [notification(), { notification_id: "notification_2" }, notification({ notification_id: "notification_3" })] });
    bothReaders(wire, false, "a shortened notification list rendered as complete is worse than a refusal");
    for (const { source, indent } of [{ source: page, indent: 0 }, { source: nav, indent: 2 }]) {
      const reader = readerBody(source, "function readNotificationList(body) {", indent);
      assert.doesNotMatch(reader, /\.filter\(/, "so malformed records are not quietly dropped");
    }
  });
});

describe("the target contract follows readTargetMetadata", () => {
  it("requires the six members the base metadata always names", () => {
    // Same pattern: the redaction branch reads `target.canOpen`, so a missing target guard throws
    // rather than refuses.
    for (const { source, indent } of [{ source: page, indent: 0 }, { source: nav, indent: 2 }]) {
      const predicate = readerBody(source, "function isNotificationRecordValue(value) {", indent);
      assert.match(predicate, /!isNotificationTarget\(value\.target\)/,
        "the target is proved to be a target before the record reads members off it");
    }
    const base = functionBody(service, "async function readTargetMetadata(notification, session) {");
    for (const member of ["canOpen", "moduleId", "recordId", "recordType", "targetExists", "url"]) {
      assert.match(base, new RegExp("^ {4}" + member + "[:,]", "m"), member + " is in the producer's base metadata");
      const broken = { ...target() };
      delete broken[member];
      bothReaders(listBody({ notifications: [notification({ target: broken })] }), false,
        "a target without " + member + " is not one this producer built");
    }
    for (const value of [null, [], "", 7, undefined]) {
      bothReaders(listBody({ notifications: [notification({ target: value })] }), false, "a non-record target is refused");
    }
    for (const canOpen of ["true", 1, null, ""]) {
      bothReaders(listBody({ notifications: [notification({ target: target({ canOpen }) })] }), false,
        JSON.stringify(canOpen) + " is not the boolean canOpen the producer writes");
    }
    for (const targetExists of ["false", 0, null]) {
      bothReaders(listBody({ notifications: [notification({ target: target({ targetExists }) })] }), false,
        JSON.stringify(targetExists) + " is not the boolean targetExists the producer writes");
    }
  });

  it("treats label and context as optional, because only the task and note readers add them", () => {
    const base = functionBody(service, "async function readTargetMetadata(notification, session) {");
    for (const member of ["label", "context"]) {
      assert.doesNotMatch(base, new RegExp("^ {4}" + member + "[:,]", "m"), member + " is not in the base metadata");
      assert.match(service, new RegExp("^ {6}" + member + "[:,]", "m"), "but a resolving reader adds it");
    }
    bothReaders(listBody({ notifications: [notification({ target: target() })] }), true, "a target without them is valid");
    bothReaders(listBody({ notifications: [notification({ target: target({ label: "Fix the bug", context: { clientName: "Acme", projectName: "Rewrite" } }) })] }), true,
      "and a target with them is valid too");
  });

  it("validates the context members the browser reads when a context is present", () => {
    for (const member of ["clientName", "projectName"]) {
      bothReaders(listBody({ notifications: [notification({ target: target({ context: { clientName: "Acme", projectName: "Rewrite", [member]: 7 } }) })] }), false,
        member + " must be a string when a context is present");
    }
    bothReaders(listBody({ notifications: [notification({ target: target({ context: {} }) })] }), false,
      "and a context missing them is not one either reader builds");
    bothReaders(listBody({ notifications: [notification({ target: target({ context: { clientName: "Acme", projectName: "Rewrite", future: { nested: true } } }) })] }), true,
      "a benign extra context member is accepted");
    bothReaders(listBody({ notifications: [notification({ target: target({ label: 7 }) })] }), false,
      "and a non-string label is refused");
  });
});

describe("the protected-note redaction is enforced as a whole", () => {
  const redacted = (overrides = {}) => notification({
    record_type: "note",
    record_id: "note_1",
    module_id: "notes",
    title: "Protected or unavailable note",
    displayTitle: "Protected or unavailable note",
    body: "",
    metadata: {},
    url: "",
    target: target({ canOpen: false, moduleId: "notes", recordId: "note_1", recordType: "note", targetExists: false, url: "" }),
    ...overrides,
  });

  it("accepts a properly redacted notification", () => {
    bothReaders(listBody({ notifications: [redacted()] }), true, "a redacted note notification is readable");
  });

  it("reads the redaction out of the producer", () => {
    const decorate = functionBody(service, "async function decorateForSession(notification, session) {");
    assert.match(decorate, /const protectedOrUnavailableNote = notification\.record_type === "note" && !target\.targetExists;/,
      "the producer decides redaction on record type and target existence");
    assert.match(decorate, /\.\.\.\(protectedOrUnavailableNote \? \{ body: "", metadata: \{\}, title: "Protected or unavailable note" \} : \{\}\)/,
      "and it replaces the title, empties the body and empties the metadata together");
    assert.match(decorate, /displayTitle = protectedOrUnavailableNote \? "Protected or unavailable note"/,
      "and the display title with them");
    assert.match(decorate, /url: target\.canOpen \? target\.url : "",/, "a non-openable target carries no URL");
  });

  it("refuses a record that claims one half of the redaction without the other", () => {
    // Named rather than positional, because a mixed tuple infers a union its own member cannot
    // be used as a computed key.
    for (const { member, value, why } of [
      { member: "title", value: "The real note title", why: "the raw title must have been replaced" },
      { member: "displayTitle", value: "The real note title", why: "the display title must have been replaced" },
      { member: "body", value: "The real note body", why: "the body must have been emptied" },
      { member: "metadata", value: { leaked: true }, why: "the metadata must have been emptied" },
    ]) {
      bothReaders(listBody({ notifications: [redacted({ [member]: value })] }), false,
        "an internally contradictory protected-note record is refused: " + why);
    }
  });

  it("refuses a non-openable target that still carries a navigable URL", () => {
    bothReaders(listBody({ notifications: [notification({ target: target({ canOpen: false }), url: "/tasks.html?task=task_1" })] }), false,
      "the producer writes an empty URL for a target it will not open");
    bothReaders(listBody({ notifications: [notification({ target: target({ canOpen: false }), url: "" })] }), true,
      "and an empty one is correct");
  });
});

describe("the URL that reaches an href is validated at the browser boundary", () => {
  it("refuses every off-site form the server guard lets through", () => {
    const serverGuard = functionBody(service, "function safeRelativeUrl(value) {");
    const shipped = new Function(serverGuard + "\n}\nreturn safeRelativeUrl;")();
    for (const hostile of ["//evil.example/p", "/\\evil.example/p", "\\/evil.example/p"]) {
      assert.notEqual(shipped(hostile), "",
        hostile + " is accepted by the server guard today, which is the recorded defect");
      assert.equal(pageReader.isApplicationRelativeUrl(hostile), false,
        hostile + " resolves to another origin and must not reach an href");
      assert.equal(navReader.isApplicationRelativeUrl(hostile), false, hostile + " in the panel too");
      bothReaders(listBody({ notifications: [notification({ url: hostile, target: target({ url: hostile }) })] }), false,
        hostile + " must refuse the response rather than be rendered");
      bothReaders(listBody({ notifications: [notification({ url: hostile })] }), false,
        hostile + " on the record is refused even when the target's URL is an application path");
      bothReaders(listBody({ notifications: [notification({ target: target({ url: hostile }) })] }), false,
        hostile + " on the target is refused even when the record's URL is an application path");
    }
  });

  it("still refuses the scheme forms the server guard does stop", () => {
    for (const hostile of ["javascript:alert(1)", "data:text/html,x", "vbscript:x", "https://evil.example/p"]) {
      assert.equal(pageReader.isApplicationRelativeUrl(hostile), false, hostile + " is not an application URL");
      bothReaders(listBody({ notifications: [notification({ url: hostile })] }), false, hostile + " is refused");
    }
  });

  it("accepts an application path and an empty URL", () => {
    bothReaders(listBody({ notifications: [notification({ url: "/tasks.html?task=task_1" })] }), true,
      "an application-relative path is what this producer sends");
    bothReaders(listBody({ notifications: [notification({ url: "", target: target({ canOpen: false, url: "" }) })] }), true,
      "and an empty URL is valid for a notification that cannot be opened");
    assert.equal(pageReader.isApplicationRelativeUrl("tasks.html"), false,
      "a bare relative path is not what the producer builds, so it is not blessed either");
  });

  it("does not modify the server guard", () => {
    assert.match(service, /return url && !\/\^\[a-z\]\[a-z0-9\+\.-\]\*:\/i\.test\(url\) \? url : "";/,
      "the server guard is left exactly as it was; correcting it is its own owner's work");
  });
});

describe("the producer's own objects survive", () => {
  it("answers the same body, array and records", () => {
    const originalTarget = target();
    const originalMetadata = { job_id: "job_1" };
    const originalNotification = notification({ target: originalTarget, metadata: originalMetadata });
    const originalArray = [originalNotification];
    const wire = listBody({ notifications: originalArray });
    const result = pageReader.readNotificationList(wire);
    assert.equal(result, wire, "the producer's body is answered, not a copy");
    assert.equal(result?.notifications, originalArray, "and its array");
    assert.equal(result?.notifications[0], originalNotification, "and its records");
    assert.equal(result?.notifications[0].target, originalTarget, "and their targets");
    assert.equal(result?.notifications[0].metadata, originalMetadata, "and their metadata objects");
  });

  it("does not rebuild a notification", () => {
    for (const { source, indent } of [{ source: page, indent: 0 }, { source: nav, indent: 2 }]) {
      const reader = readerBody(source, "function readNotificationList(body) {", indent);
      assert.doesNotMatch(reader, /notification_id:|\.map\(/, "the records are answered as they arrived");
    }
  });
});

describe("both consumers refuse rather than render an empty list", () => {
  it("the page no longer trusts the raw body", () => {
    assert.doesNotMatch(page, /Array\.isArray\(body\.notifications\) \? body\.notifications : \[\]/,
      "the raw read must be gone from the page");
    const load = functionBody(page, "async function loadNotifications() {", "\n}\n");
    assert.match(load, /\/\*\* @type \{unknown\} \*\/\n\s+const body = await response\.json\(\);/,
      "the parsed body is explicitly unknown");
    assert.match(load, /const list = readNotificationList\(body\);\n\n\s+if \(!list\) \{\n\s+throw new Error\("The notification list could not be read\."\);\n\s+\}/,
      "and an unreadable one throws into the existing catch");
  });

  it("the panel no longer trusts the raw body", () => {
    assert.doesNotMatch(nav, /Array\.isArray\(body\.notifications\) \? body\.notifications : \[\]/,
      "the raw read must be gone from navigation");
    const load = functionBody(nav, "  async function loadNotificationPanel() {", "\n  }\n");
    assert.match(load, /\/\*\* @type \{unknown\} \*\/\n\s+const body = await response\.json\(\);/,
      "the parsed body is explicitly unknown");
    assert.match(load, /if \(!list\) \{\n\s+throw new Error\("The notification list could not be read\."\);\n\s+\}/,
      "and an unreadable one throws into the existing catch");
  });

  it("keeps an unreadable body apart from a real empty list in both consumers", () => {
    const pageLoad = functionBody(page, "async function loadNotifications() {", "\n}\n");
    assert.ok(pageLoad.indexOf("throw new Error(\"The notification list could not be read.\")") < pageLoad.indexOf("state.notifications = list.notifications;"),
      "the page refuses before it stores anything");
    const navLoad = functionBody(nav, "  async function loadNotificationPanel() {", "\n  }\n");
    assert.ok(navLoad.indexOf("throw new Error(\"The notification list could not be read.\")") < navLoad.indexOf("renderNotificationPanel(list.notifications)"),
      "and the panel refuses before it renders anything");
    assert.match(nav, /notificationList\.replaceChildren\(createNotificationPanelEmpty\("Notifications unavailable"\)\);/,
      "the panel's failure path says unavailable rather than none");
  });

  it("adds no transport and no shared surface", () => {
    for (const [name, source] of [["notifications.js", page], ["navigation.js", nav]]) {
      assert.match(source, /await fetch\(/, name + " keeps the transport it had");
      assert.doesNotMatch(source, /requireApi\(\)\.getJson\(`\/api\/notifications\?/, name + " is not migrated to BrowserApi");
    }
    assert.ok(!read("views/protected/notifications.html").includes("js/api-client.js"),
      "no api-client delivery is added to the notifications page");
    assert.ok(!contracts.includes("BrowserNotificationListReader"),
      "and no new namespace surface is published to share the parser");
  });

  it("leaves the mutation bodies unparsed, because their callers refetch", () => {
    const mutate = functionBody(page, "async function mutateNotification(notificationId, action) {", "\n}\n");
    assert.match(mutate, /if \(!response\.ok\) \{/, "the page's mutation checks ok");
    assert.doesNotMatch(mutate, /response\.json\(\)/, "and parses nothing");
    assert.match(mutate, /await loadNotifications\(\);\n\s+await refreshNotificationCount\(\);/, "then refetches");
    const markAll = functionBody(page, "async function markAllRead() {", "\n}\n");
    assert.doesNotMatch(markAll, /response\.json\(\)/, "read-all parses nothing either");
    const navMutate = functionBody(nav, "  async function mutateAllNotifications(action) {", "\n  }\n");
    assert.doesNotMatch(navMutate, /response\.json\(\)/, "and neither does the panel's bulk action");
  });
});

describe("the server keeps the decisions that are its own", () => {
  it("gates the list on the recipient's own view permission", () => {
    const list = functionBody(service, "async function list(session, query = {}) {");
    assert.match(list, /await permissionsService\.assertCanInAnyScope\(session, "notifications\.view_own"\);/,
      "the permission is asserted first");
    const gate = list.indexOf("notifications.view_own");
    const query = list.indexOf("notificationsRepository.listForRecipient(");
    assert.notEqual(gate, -1, "the gate must be present");
    assert.notEqual(query, -1, "and the query");
    assert.ok(gate < query, "in that order");
    assert.match(list, /listForRecipient\(activeSession\.workspace_id, activeSession\.user_id, repositoryQuery\)/,
      "and the read is scoped to the workspace and the recipient");
    for (const source of [page, nav]) {
      assert.doesNotMatch(source, /notifications\.view_own|assertCanInAnyScope/, "the browser re-derives none of it");
    }
  });

  it("bounds the pagination server-side", () => {
    const list = functionBody(service, "async function list(session, query = {}) {");
    assert.match(list, /normalizeBoundedPagination\(query, \{\n\s+defaultLimit: NOTIFICATION_DEFAULT_PAGE_SIZE,\n\s+maxLimit: NOTIFICATION_MAX_PAGE_SIZE,\n\s+\}\)/,
      "the limit is clamped by the producer");
  });
});
