import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const shared = read("public/js/shared/tags.js");
const admin = read("public/js/tags.js");
const service = read("src/services/tags.service.js");
const repo = read("src/repositories/tags.repo.js");
const routes = read("src/routes/tags.routes.js");
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

/** @param {string} source @param {string} name */
function readTable(source, name) {
  const at = source.indexOf("const " + name + " = Object.freeze([");
  assert.notEqual(at, -1, name + " must exist");
  return [...source.slice(at, source.indexOf("]);", at)).matchAll(/"([a-z_]+)"/g)].map((entry) => entry[1]);
}

/**
 * One shipped reader, instantiated from its own file's source.
 * @param {string} source @param {number} indent @param {readonly string[]} exported
 */
function shippedReader(source, indent, exported) {
  const tables = ["TAG_TEXT_MEMBERS", "TAG_COUNT_MEMBERS", "TAG_STATUSES"]
    .map((name) => "const " + name + " = " + JSON.stringify(readTable(source, name)) + ";");
  return new Function([
    ...tables,
    readerBody(source, "function isTagRecord(value) {", indent),
    readerBody(source, "function isTagCatalogRecord(value) {", indent),
    ...exported.map((name) => readerBody(source, "function " + name + "(", indent)),
    "return { isTagCatalogRecord, " + exported.join(", ") + " };",
  ].join("\n"))();
}

const sharedReader = shippedReader(shared, 2, ["readTagCatalogEntries", "readCreatedTag"]);
const adminReader = shippedReader(admin, 2, ["readTagCatalog"]);

/**
 * The members `tagRowToAppValue` reconstructs, read from the producer rather than the parser.
 * @returns {string[]}
 */
function producerTagMembers() {
  const body = functionBody(repo, "function tagRowToAppValue(databaseRow) {");
  const members = [...body.matchAll(/^ {4}([a-z_]+)[:,]/gm)].map((entry) => entry[1]);
  assert.ok(members.length >= 10, "the tag normaliser must have been parsed");
  return members;
}

/** The `tags` table columns, read out of the schema. */
function tagColumns() {
  const start = schema.indexOf("CREATE TABLE tags (");
  assert.notEqual(start, -1, "the tags table must exist");
  const block = schema.slice(start, schema.indexOf("\n);", start));
  /** @type {Map<string, {notNull: boolean, primaryKey: boolean, check: string}>} */
  const columns = new Map();
  for (const line of block.split("\n").slice(1)) {
    const match = /^ {2}([a-z_]+) TEXT(.*)$/.exec(line.replace(/,$/, ""));
    if (!match) continue;
    columns.set(match[1], {
      notNull: match[2].includes("NOT NULL"),
      primaryKey: match[2].includes("PRIMARY KEY"),
      check: (/CHECK \(.*IN \((.*)\)\)/.exec(match[2]) || ["", ""])[1],
    });
  }
  assert.ok(columns.size > 8, "the schema block must have been parsed");
  return columns;
}

/**
 * A tag as `tagRowToAppValue` rebuilds one.
 * @param {Record<string, unknown>} [overrides]
 * @returns {Record<string, unknown>}
 */
function tagRecord(overrides = {}) {
  /** @type {Record<string, unknown>} */
  const record = {
    tag_id: "tag_1",
    workspace_id: "workspace_1",
    name: "Urgent",
    slug: "urgent",
    description: "",
    color: "",
    status: "active",
    usage_count: 3,
    direct_usage_count: 2,
    propagated_usage_count: 1,
    system_usage_count: 0,
    created_by_user_id: "",
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
  };
  return { ...record, ...overrides };
}

describe("one producer record serves both catalogue routes", () => {
  it("routes both list and create through the same reconstruction", () => {
    const list = functionBody(service, "async function list(session, query = {}) {");
    assert.match(list, /return \{\n\s+tags: await tagsRepository\.listTags\(/,
      "the list envelope names one member and spreads nothing");
    const create = functionBody(service, "async function create(session, payload = {}) {");
    assert.match(create, /return \{ tag \};/, "and so does the create envelope");
    assert.match(create, /throw new AppError\("Tag creation did not return the created tag\.", 500\);/,
      "which throws rather than answering a body without it");
    const listTags = functionBody(repo, "async function listTags(workspaceId, options = {}) {");
    assert.match(listTags, /return rows\.map\(tagRowToAppValue\);/, "the list reaches tagRowToAppValue");
    const readById = functionBody(repo, "async function readTagById(workspaceId, tagId) {");
    assert.match(readById, /tagRowToAppValue\(/, "and so does the single-record read the create returns");
  });

  it("declares one record for both, not a list tag and a created tag", () => {
    assert.equal((contracts.match(/export interface BrowserTagCatalogRecord\b/g) || []).length, 1,
      "there is one catalogue record");
    for (const invented of ["BrowserTagListItem", "BrowserCreatedTag", "BrowserTagSummary"]) {
      assert.ok(!contracts.includes(invented), invented + " would split one producer into two records");
    }
    for (const name of ["BrowserTagListEnvelope", "BrowserTagMutationEnvelope"]) {
      const declared = functionBody(contracts, "export interface " + name + " {", "\n}\n");
      const members = [...declared.matchAll(/^ {2}([a-z]+):/gm)].map((entry) => entry[1]);
      assert.equal(members.length, 1, name + " is exact at one member");
      assert.doesNotMatch(declared, /\?:/, "and names nothing optional");
    }
  });

  it("promises exactly what the producer reconstructs", () => {
    const produced = producerTagMembers();
    const declared = functionBody(contracts, "export interface BrowserTagCatalogRecord {", "\n}\n");
    const promised = [...declared.matchAll(/^ {2}([a-z_]+):/gm)].map((entry) => entry[1]);
    assert.deepEqual([...promised].sort(), [...produced].sort(),
      "every member the producer builds is promised, and nothing else is");
  });

  it("names no assignment member", () => {
    const declared = functionBody(contracts, "export interface BrowserTagCatalogRecord {", "\n}\n");
    for (const member of [
      "tag_assignment_id", "assignment_source", "origin", "source_assignment_id",
      "source_target_type", "source_target_id", "propagation_rule_id",
    ]) {
      assert.ok(!declared.includes(member), member + " belongs to an assignment record, not to this producer");
      assert.notEqual(sharedReader.readTagCatalogEntries({ tags: [tagRecord()] }).length, 0,
        "and a catalogue tag without it is still readable");
    }
    const assignment = functionBody(repo, "function assignmentRowToAppValue(databaseRow) {");
    assert.match(assignment, /tag_assignment_id/, "because those members belong to this other reconstruction");
  });

  it("validates every member it promises", () => {
    const declared = functionBody(contracts, "export interface BrowserTagCatalogRecord {", "\n}\n");
    const promised = [...declared.matchAll(/^ {2}([a-z_]+):/gm)].map((entry) => entry[1]);
    const validated = new Set([
      ...readTable(shared, "TAG_TEXT_MEMBERS"),
      ...readTable(shared, "TAG_COUNT_MEMBERS"),
      ...[...readerBody(shared, "function isTagCatalogRecord(value) {", 2).matchAll(/value\.([a-z_]+)/g)].map((entry) => entry[1]),
    ]);
    for (const member of promised) {
      assert.ok(validated.has(member), member + " is promised and must be validated by the reader");
    }
  });
});

describe("the record follows the table and the aggregates", () => {
  it("requires every text member the normaliser fills", () => {
    const columns = tagColumns();
    for (const member of readTable(shared, "TAG_TEXT_MEMBERS")) {
      assert.ok(columns.has(member), member + " is a tags column");
      for (const value of [null, 7, undefined, {}]) {
        assert.equal(sharedReader.isTagCatalogRecord(tagRecord({ [member]: value })), false,
          member + " may not be " + JSON.stringify(value ?? String(value)));
      }
      assert.equal(sharedReader.isTagCatalogRecord(tagRecord({ [member]: "" })),
        member !== "tag_id",
        member + " may be empty unless it is the identity");
    }
  });

  it("reads the nullable-to-empty-string rule out of the producer", () => {
    const normalizer = functionBody(repo, "function tagRowToAppValue(databaseRow) {");
    for (const member of ["description", "color", "created_by_user_id"]) {
      assert.match(normalizer, new RegExp(member + ': row\\.' + member + ' \\|\\| ""'),
        member + " is filled with the empty string by the producer");
    }
    const declared = functionBody(contracts, "export interface BrowserTagCatalogRecord {", "\n}\n");
    assert.doesNotMatch(declared, /: string \| null/, "so no member is declared nullable");
  });

  it("requires the identity the primary key guarantees", () => {
    const column = tagColumns().get("tag_id");
    assert.ok(column?.primaryKey, "tag_id is the table's primary key");
    assert.equal(sharedReader.isTagCatalogRecord(tagRecord({ tag_id: "" })), false,
      "an empty tag_id is not an identity a picker or an admin row may submit");
  });

  it("requires the four usage counts as non-negative integers", () => {
    const listTags = functionBody(repo, "async function listTags(workspaceId, options = {}) {");
    for (const member of readTable(shared, "TAG_COUNT_MEMBERS")) {
      assert.match(listTags, new RegExp("COALESCE\\(tag_usage\\." + member + ", 0\\) AS " + member),
        member + " is a COALESCEd aggregate on the list query");
      assert.ok(!tagColumns().has(member), "and not a column of the table");
      for (const value of ["3", null, -1, 1.5, Number.NaN, undefined, true]) {
        assert.equal(sharedReader.isTagCatalogRecord(tagRecord({ [member]: value })), false,
          member + " may not be " + JSON.stringify(value ?? String(value)));
      }
      assert.equal(sharedReader.isTagCatalogRecord(tagRecord({ [member]: 0 })), true,
        member + " may be zero, which is what an unused tag has");
    }
    const normalizer = functionBody(repo, "function tagRowToAppValue(databaseRow) {");
    assert.match(normalizer, /usage_count: Number\(row\.usage_count \|\| 0\)/,
      "and the producer coerces each through Number with a zero default");
  });

  it("closes status to the vocabulary the column admits, not to what a page compares", () => {
    const check = tagColumns().get("status")?.check;
    assert.equal(check, "'active', 'archived', 'disabled'", "the column admits exactly three");
    assert.deepEqual([...readTable(shared, "TAG_STATUSES")].sort(), ["active", "archived", "disabled"],
      "so the browser vocabulary is those three");
    const declared = /export type BrowserTagStatus = (.+);/.exec(contracts);
    assert.ok(declared, "the status type must be declared");
    assert.deepEqual(declared[1].split("|").map((entry) => entry.trim().replace(/"/g, "")).sort(),
      ["active", "archived", "disabled"], "and the contract declares the same three");
    for (const bad of ["", "Active", "ARCHIVED", "deleted", null, 7]) {
      assert.equal(sharedReader.isTagCatalogRecord(tagRecord({ status: bad })), false,
        JSON.stringify(bad ?? String(bad)) + " is not a status this column can hold");
    }
    for (const good of ["active", "archived", "disabled"]) {
      assert.equal(sharedReader.isTagCatalogRecord(tagRecord({ status: good })), true, good + " is");
    }
  });

  it("declares disabled even though no current writer produces it", () => {
    for (const writer of ['setTagStatus(session.workspace_id, tagId, "archived")', 'setTagStatus(session.workspace_id, tagId, "active")']) {
      assert.ok(service.includes(writer), "the service writes " + writer);
    }
    assert.ok(!service.includes('"disabled"'),
      "nothing writes disabled today, and it is declared because the column permits it rather than because something sends it");
  });
});

describe("the two readers implement one record and two policies", () => {
  const fixtures = [
    { body: { tags: [] }, valid: 0, why: "a valid empty catalogue" },
    { body: { tags: [tagRecord()] }, valid: 1, why: "one valid tag" },
    { body: { tags: [tagRecord(), tagRecord({ tag_id: "tag_2" })] }, valid: 2, why: "two valid tags" },
    { body: { tags: [tagRecord(), { tag_id: "tag_2" }] }, valid: 1, why: "one valid tag beside a malformed one" },
    { body: { tags: [{ tag_id: "tag_2" }] }, valid: 0, why: "only a malformed tag" },
    { body: {}, valid: 0, why: "no tags member" },
    { body: { tags: null }, valid: 0, why: "a null tags member" },
    { body: null, valid: 0, why: "no body at all" },
  ];

  it("agrees on which records are valid", () => {
    for (const { body, valid, why } of fixtures) {
      const fromShared = sharedReader.readTagCatalogEntries(body);
      assert.equal(fromShared.length, valid, "the shared helper keeps the valid records for " + why);
      const fromAdmin = adminReader.readTagCatalog(body);
      if (fromAdmin !== null) {
        assert.equal(fromAdmin.length, valid, "and the admin reader agrees on record validity for " + why);
      }
    }
  });

  it("differs on envelope and element failure, deliberately", () => {
    // The shared helper feeds pickers, so an unreadable entry is one option fewer; the admin page
    // manages the catalogue, so the same body is a ledger it cannot vouch for.
    const mixed = { tags: [tagRecord(), { tag_id: "tag_2" }] };
    assert.equal(sharedReader.readTagCatalogEntries(mixed).length, 1,
      "the picker helper drops the unusable entry and keeps the usable one");
    assert.equal(adminReader.readTagCatalog(mixed), null,
      "the administration page refuses the whole catalogue");
    for (const body of [{}, { tags: null }, null, "body", 7, []]) {
      assert.deepEqual(sharedReader.readTagCatalogEntries(body), [],
        "the picker helper stays absence-tolerant for " + JSON.stringify(body));
      assert.equal(adminReader.readTagCatalog(body), null,
        "and the administration page refuses it");
    }
    assert.deepEqual(adminReader.readTagCatalog({ tags: [] }), [],
      "while a genuinely empty catalogue is a real answer to both");
  });

  it("names the difference where each reader is written", () => {
    const sharedDoc = shared.slice(shared.indexOf("   * The catalogue entries of a `GET /api/tags` body"),
      shared.indexOf("  function readTagCatalogEntries(body) {"));
    assert.match(sharedDoc, /deliberately looser/, "the shared helper records that its policy is the looser one");
    assert.match(sharedDoc, /pickers and filters/, "and why");
    const adminDoc = admin.slice(admin.indexOf(" * The tag catalogue, or `null`"),
      admin.indexOf("function readTagCatalog(body) {"));
    assert.match(adminDoc, /refuses whole/, "and the administration page records that it refuses whole");
    assert.match(adminDoc, /No tags found/, "and names the sentence it must not print for an unreadable body");
  });

  it("preserves the producer's own records in both", () => {
    const original = tagRecord({ future_tag_field: { nested: true } });
    const originalArray = [original];
    const fromShared = sharedReader.readTagCatalogEntries({ tags: originalArray });
    assert.equal(fromShared[0], original, "the shared helper answers the producer's object");
    assert.deepEqual(fromShared[0].future_tag_field, { nested: true }, "with its unpromised members intact");
    const adminOriginal = tagRecord({ future_tag_field: { nested: true } });
    const adminArray = [adminOriginal];
    const fromAdmin = adminReader.readTagCatalog({ tags: adminArray });
    assert.equal(fromAdmin, adminArray, "the administration reader answers the producer's array");
    assert.equal(fromAdmin?.[0], adminOriginal, "and its records");
  });

  it("keeps valid ordering", () => {
    const ordered = [tagRecord({ tag_id: "a" }), tagRecord({ tag_id: "b" }), tagRecord({ tag_id: "c" })];
    assert.deepEqual(sharedReader.readTagCatalogEntries({ tags: ordered }).map((/** @type {{tag_id: string}} */ tag) => tag.tag_id),
      ["a", "b", "c"], "the shared helper does not reorder");
    assert.deepEqual(adminReader.readTagCatalog({ tags: ordered })?.map((/** @type {{tag_id: string}} */ tag) => tag.tag_id),
      ["a", "b", "c"], "and neither does the administration reader");
  });

  it("does not share a reader by adding the helper to the administration page", () => {
    const view = read("views/protected/tags.html");
    assert.ok(!view.includes("js/shared/tags.js"),
      "the Tags page does not load the shared helper and this child does not make it");
    assert.ok(!contracts.includes("BrowserTagCatalogReader"), "and no surface is published to share the parser");
  });
});

describe("the shared helper keeps its settled absence tolerance", () => {
  const load = readerBody(shared, "async function loadTags(options = {}) {", 2);

  it("answers an empty list rather than throwing for a body it cannot use", () => {
    // Pinned by source: a helper that throws crashes every runtime fixture in this file before
    // one of them can name the failure, so the absence-tolerant return is asserted where it is
    // written rather than inferred from behaviour.
    const reader = readerBody(shared, "function readTagCatalogEntries(body) {", 2);
    assert.match(reader, /if \(!isTagRecord\(body\) \|\| !Array\.isArray\(body\.tags\)\) \{\n\s+return \[\];\n\s+\}/,
      "the picker helper stays absence-tolerant for a body with no usable tags array");
    assert.doesNotMatch(reader, /throw /, "and never throws");
  });

  it("still resolves an empty list for a non-OK response", () => {
    assert.match(load, /if \(!response\.ok\) \{\n\s+return \[\];\n\s+\}/,
      "a non-OK response resolves [] exactly as it did");
    assert.doesNotMatch(load, /throw new Error\("Tags unavailable/, "and does not become a rejection");
  });

  it("reads the parsed body as unknown", () => {
    assert.match(load, /\/\*\* @type \{unknown\} \*\/\n\s+const body = await response\.json\(\);/,
      "the parsed body is explicitly unknown");
    assert.match(load, /return readTagCatalogEntries\(body\);/, "and goes through the reader");
    assert.doesNotMatch(shared, /Array\.isArray\(body\.tags\) \? body\.tags : \[\]/,
      "the raw read must be gone");
  });
});

describe("the administration page refuses rather than reporting no tags", () => {
  const fetchTags = readerBody(admin, "async function fetchTags(params) {", 2);

  it("no longer performs the raw read", () => {
    assert.doesNotMatch(admin, /Array\.isArray\(body\.tags\) \? body\.tags : \[\]/,
      "the raw read must be gone from the page");
    assert.match(fetchTags, /\/\*\* @type \{unknown\} \*\/\n\s+const body = await response\.json\(\);/,
      "the parsed body is explicitly unknown");
  });

  it("takes the existing unavailable path", () => {
    assert.match(fetchTags, /if \(!tags\) \{\n\s+throw new Error\("Tags unavailable\."\);\n\s+\}/,
      "an unreadable body throws the same message the non-OK path already used");
    assert.match(fetchTags, /throw new Error\(await responseError\(response, "Tags unavailable\."\)\)/,
      "which is the failure this page already had");
    const refusal = fetchTags.indexOf("if (!tags) {");
    const returned = fetchTags.indexOf("return tags;");
    assert.notEqual(refusal, -1, "the refusal exists");
    assert.notEqual(returned, -1, "and the return");
    assert.ok(refusal < returned, "and the refusal comes first");
  });

  it("cannot render the empty state for an unreadable body", () => {
    assert.match(admin, /emptyElement\("No tags found"\)/, "the page has an empty state");
    const render = functionBody(admin, "  function renderTags() {", "\n  }\n");
    assert.match(render, /state\.tags/, "which renders from the stored catalogue");
    assert.equal(adminReader.readTagCatalog({ tags: [{ tag_id: "tag_1" }] }), null,
      "and a malformed catalogue never reaches that state");
  });

  it("annotates only the two direct list-storage slots", () => {
    assert.match(admin, /@type \{BrowserTagCatalogRecord\[\]\}\n\s+\*\/\n\s+allTags: \[\],/,
      "allTags is typed by the response it stores");
    assert.match(admin, /@type \{BrowserTagCatalogRecord\[\]\}\n\s+\*\/\n\s+tags: \[\],/,
      "and so is tags");
    assert.ok(!admin.includes("TagsPageState"), "and no page-wide state interface is created");
    // Counted inside the state literal and in either spelling: a whole-file scan for the short
    // alias could not see a third slot written as the qualified import, and a whole-file scan for
    // both also counts the reader's own return annotation, which is not a state slot at all.
    const stateLiteral = admin.slice(admin.indexOf("const state = {"), admin.indexOf("\n  };", admin.indexOf("const state = {")));
    assert.equal((stateLiteral.match(/@type \{(?:import\("[^"]+"\)\.)?BrowserTagCatalogRecord\[\]\}/g) || []).length, 2,
      "exactly two slots are annotated, in either spelling");
  });
});

describe("the create response is validated and its failure is a failure", () => {
  const create = readerBody(shared, "async function createTag(payload = {}) {", 2);

  it("accepts a valid created tag", () => {
    const tag = tagRecord();
    const result = sharedReader.readCreatedTag({ tag });
    assert.equal(result, tag, "the producer's own tag object comes back");
  });

  it("refuses a successful body carrying no readable tag", () => {
    for (const body of [null, undefined, {}, { tag: null }, { tag: {} }, { tag: tagRecord({ tag_id: "" }) }, []]) {
      assert.equal(sharedReader.readCreatedTag(body), null,
        JSON.stringify(body) + " is not a created-tag body");
    }
  });

  it("throws rather than returning null as though nothing was created", () => {
    const refusal = create.indexOf("if (!tag) {");
    const notify = create.indexOf("notifyTagCreated(tag);");
    assert.notEqual(refusal, -1, "the refusal exists");
    assert.notEqual(notify, -1, "and the picker notification");
    assert.ok(refusal < notify, "and the refusal comes before any picker is told");
    assert.match(create, /const tag = readCreatedTag\(body\);\n\n\s+if \(!tag\) \{\n\s+throw new Error\("The created tag could not be read\."\);\n\s+\}/,
      "an unreadable created tag throws");
    assert.doesNotMatch(create, /const tag = body\?\.tag \|\| null;/, "the raw read must be gone");
  });

  it("leaves the non-OK error path exactly as it was", () => {
    assert.match(create, /if \(!response\.ok\) \{\n\s+const error = namespace\.errors\?\.createError\?\.\(body, "Unable to create tag\.", response\.status\)/,
      "the error is still built from the unknown body by the shared helper");
    assert.match(create, /error\.status = response\.status;\n\s+error\.body = body;\n\s+throw error;/,
      "with the status and body still attached");
    const errorAt = create.indexOf("if (!response.ok) {");
    // The first reader call, whatever it is bound to: pinning one spelling let an earlier call
    // slip in above the error path unseen.
    const readAt = create.indexOf("readCreatedTag(");
    assert.ok(errorAt < readAt, "and the error path still runs before any success parsing");
  });

  it("does not alter the conflict recovery ensureTag performs", () => {
    assert.match(shared, /if \(requireErrors\(\)\.caughtStatus\(error\) !== 409\) \{/,
      "conflict recovery still keys on the 409 status");
    assert.match(shared, /const tag = await ensureTag\(name, state\);/,
      "and ensureTag is still the caller that recovers");
  });
});

describe("the suppression body stays unknown", () => {
  it("declares the parser as unknown", () => {
    assert.match(shared, /\* @returns \{Promise<unknown>\}\n {3}\*\/\n {2}async function readJsonResponse\(response\) \{/,
      "readJsonResponse must declare Promise<unknown>, because response.json() is any");
  });

  it("returns the successful body untouched", () => {
    const suppress = readerBody(shared, "async function suppressPropagatedTag(assignmentId) {", 2);
    assert.match(suppress, /const body = await readJsonResponse\(response\);/, "the body goes through the boundary");
    assert.doesNotMatch(suppress, /readTagCatalogEntries|readCreatedTag|isTagCatalogRecord/,
      "and no reader is invented for a body nobody consumes");
    assert.doesNotMatch(suppress, /body\.[a-z]/, "nor is a member read off it");
    for (const invented of ["BrowserTagSuppressionResult", "BrowserTagAssignmentSuppression"]) {
      assert.ok(!contracts.includes(invented), invented + " would describe a body no caller reads");
    }
  });

  it("keeps its only caller ignoring the result", () => {
    assert.match(shared, /await namespace\.tags\.suppressPropagatedTag\(|await suppressPropagatedTag\(/,
      "the suppression is awaited");
    assert.doesNotMatch(shared, /(?:const|let|var) [a-zA-Z]+ = await suppressPropagatedTag\(/,
      "and nothing binds its result");
    assert.doesNotMatch(shared, /await suppressPropagatedTag\([^)]*\)\./, "nor reads a member off it");
  });
});

describe("this child stays inside the two catalogue producers", () => {
  it("adds no reader for the bodies no browser caller parses", () => {
    for (const route of ['/${encodeURIComponent(tag.tag_id)}/${action}']) {
      assert.ok(admin.includes(route), "the archive and restore routes are still called");
    }
    const mutate = readerBody(admin, "async function mutateTagStatus(tag) {", 2);
    assert.doesNotMatch(mutate, /response\.json\(\)/,
      "and their successful bodies are not parsed - only the error path reads one");
    assert.match(mutate, /if \(!response\.ok\) \{\n\s+throw new Error\(await responseError\(response, "Tag update failed\."\)\);/,
      "the failure path is the only reader, and it builds an error message");
    for (const invented of ["BrowserTagArchiveResult", "BrowserTagUpdateResult", "BrowserTagRestoreResult"]) {
      assert.ok(!contracts.includes(invented), invented + " would be a dead reader for an ignored body");
    }
  });

  it("leaves normalizeTagList internal and unpublished", () => {
    assert.match(shared, /function normalizeTagList\(/, "the picker normaliser still exists");
    // A prose mention in a doc comment is not publication; a declared member or exported type is.
    assert.doesNotMatch(contracts, /^\s*normalizeTagList[(<:?]/m, "and is not declared as a member");
    assert.doesNotMatch(contracts, /export (?:type|interface|function) normalizeTagList\b/,
      "nor exported as a type of its own");
    assert.doesNotMatch(shared, /namespace\.tags = \{[\s\S]*normalizeTagList[\s\S]*?\};/,
      "and is not in the published object either");
    const normalize = readerBody(shared, "function normalizeTagList(tags = []) {", 2);
    // An alternation passes while any one survives, so each assignment member is named.
    for (const member of ["tag_assignment_id", "assignment_source", "origin", "source_assignment_id",
      "source_target_type", "source_target_id", "propagation_rule_id"]) {
      assert.ok(normalize.includes(member + ":"),
        "it still accepts the assignment-shaped values the catalogue record does not describe: " + member);
    }
    const declared = functionBody(contracts, "export interface BrowserTagCatalogRecord {", "\n}\n");
    // `propagated_usage_count` is a legitimate catalogue aggregate, so the word alone proves
    // nothing; what must be absent is the assignment record's own members.
    const members = [...declared.matchAll(/^ {2}([a-z_]+):/gm)].map((entry) => entry[1]);
    for (const member of [...normalize.matchAll(/^ {8}([a-z_]+):/gm)].map((entry) => entry[1])) {
      if (["tag_id", "workspace_id", "name", "slug", "description", "color", "status"].includes(member)) continue;
      assert.ok(!members.includes(member),
        member + " is a member normalizeTagList adds and the catalogue record must not claim");
    }
    assert.ok(!/Assignment|Effective|Propagated/.test("BrowserTagCatalogRecord"),
      "and the record's name does not imply it covers assignment or effective tags");
  });

  it("does not touch the namespace surface", () => {
    // This child closed the wire so that `0.33.33.38.2.2.10` could declare the surface over
    // honest returns. It originally asserted the declaration did not exist yet, which was the
    // right guard for one checkpoint and is spent now that the successor has landed. What
    // survives is the fact that outlives both: this child changed no member of the published
    // literal, and the declaration that now exists describes that same literal rather than a
    // wider one this child introduced.
    assert.match(shared, /namespace\.tags = \{/, "the surface is still published the same way");
    const surface = shared.slice(shared.indexOf("namespace.tags = {"), shared.indexOf("};", shared.indexOf("namespace.tags = {")));
    assert.equal((surface.match(/^\s+\w+,$/gm) || []).length, 11, "with eleven members, unchanged by this child");
    assert.ok(!/createTagChip,/.test(surface), "and no member was added to carry the wire work");
  });

  it("leaves the server tag behaviour alone", () => {
    // Scoped to `list`: `read` asserts the identical permission, so a whole-file scan passed
    // while the list route's own gate was gone.
    const listBody = functionBody(service, "async function list(session, query = {}) {");
    assert.match(listBody, /await permissionsService\.assertCan\(session, "tags\.view"/,
      "the list permission is unchanged");
    assert.match(service, /await permissionsService\.assertCan\(session, "tags\.manage"/, "and the create permission");
    assert.match(routes, /tagsRoutes\.get\("\/tags"[\s\S]{0,160}response\.status\(200\)\.json\(result\);/,
      "the list route answers its envelope unchanged");
    assert.match(routes, /tagsRoutes\.post\("\/tags"[\s\S]{0,200}response\.status\(201\)\.json\(result\);/,
      "and the create route answers its own");
    for (const source of [shared, admin]) {
      assert.doesNotMatch(source, /tags\.view|tags\.manage|assertTaggingReadEnabled/,
        "and the browser re-derives none of it");
    }
  });
});
