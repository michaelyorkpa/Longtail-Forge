import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const page = read("public/js/notes.js");
const service = read("src/modules/notes/notes.service.js");
const repo = read("src/modules/notes/notes.repo.js");
const routes = read("src/modules/notes/notes.routes.js");
const schema = read("src/db/schema/current.sql");
const contracts = read("src/types/browser-contracts.d.ts");

/** @param {string} source @param {string} opener @param {string} [closer] */
function functionBody(source, opener, closer = "\n}\n") {
  const start = source.indexOf(opener);
  assert.notEqual(start, -1, opener + " must exist");
  const end = source.indexOf(closer, start);
  return source.slice(start, end === -1 ? source.length : end);
}

/** @param {string} source @param {string} name */
function readTable(source, name) {
  const at = source.indexOf("const " + name + " = Object.freeze([");
  assert.notEqual(at, -1, name + " must exist");
  return [...source.slice(at, source.indexOf("]);", at)).matchAll(/"([a-z_]+)"/g)].map((entry) => entry[1]);
}

/** The shipped reader, instantiated from the page's own source. */
function shippedReader() {
  /** @param {string} opener */
  const slice = (opener) => {
    const start = page.indexOf(opener);
    assert.notEqual(start, -1, opener + " must exist in the page source");
    return page.slice(start, page.indexOf("\n  }\n", start) + 4);
  };
  const tables = [
    "NOTE_REVISION_SECURITY_MODES",
    "REQUIRED_REVISION_COLUMNS",
    "NULLABLE_REVISION_COLUMNS",
    "FORBIDDEN_REVISION_STORAGE_COLUMNS",
    "FORBIDDEN_SECURE_REVISION_BODY_MEMBERS",
  ].map((name) => "const " + name + " = " + JSON.stringify(readTable(page, name)) + ";");
  return new Function([
    ...tables,
    slice("  function isResponseRecord(value) {"),
    slice("  function hasTextColumns(value, columns) {"),
    slice("  function hasNullableTextColumns(value, columns) {"),
    slice("  function hasNoMembers(value, members) {"),
    slice("  function isNoteRevisionSummary(value) {"),
    slice("  function readNoteRevisions(body) {"),
    "return { readNoteRevisions, isNoteRevisionSummary };",
  ].join("\n"))();
}

const { readNoteRevisions } = shippedReader();

/**
 * The `note_revisions` columns, read out of the schema rather than typed here.
 *
 * `PRIMARY KEY` is tracked beside `NOT NULL` because SQLite does not imply one from the other on
 * a `TEXT` key, and the identity column is required for the same reason either way.
 * @returns {Map<string, {type: string, notNull: boolean, primaryKey: boolean, check: string}>}
 */
function revisionColumns() {
  const start = schema.indexOf('CREATE TABLE "note_revisions" (');
  assert.notEqual(start, -1, "the revisions table must exist in the schema");
  const block = schema.slice(start, schema.indexOf("\n);", start));
  /** @type {Map<string, {type: string, notNull: boolean, primaryKey: boolean, check: string}>} */
  const columns = new Map();
  for (const line of block.split("\n").slice(1)) {
    const match = /^ {2}([a-z_]+) (TEXT|INTEGER)(.*)$/.exec(line.replace(/,$/, ""));
    if (!match) continue;
    columns.set(match[1], {
      type: match[2],
      notNull: match[3].includes("NOT NULL"),
      primaryKey: match[3].includes("PRIMARY KEY"),
      check: (/CHECK \(.*IN \((.*)\)\)/.exec(match[3]) || ["", ""])[1],
    });
  }
  assert.ok(columns.size > 20, "the schema block must have been parsed");
  return columns;
}

/** The members `stripSecureStorageFields` deletes, read from the producer rather than the reader. */
function strippedStorageMembers() {
  const body = functionBody(service, "function stripSecureStorageFields(value) {");
  const members = [...body.matchAll(/delete safe\.([a-z_]+);/g)].map((entry) => entry[1]);
  assert.ok(members.length > 5, "the strip helper must have been parsed");
  return members;
}

/**
 * A revision shaped the way the history list sends one.
 * @param {Record<string, unknown>} [overrides]
 * @returns {Record<string, unknown>}
 */
function revision(overrides = {}) {
  /** @type {Record<string, unknown>} */
  const record = {
    note_revision_id: "revision_1",
    workspace_id: "workspace_1",
    note_id: "note_1",
    revision_number: 3,
    title: "Meeting notes",
    body_markdown: "# Meeting notes",
    body_excerpt: "Meeting notes excerpt",
    note_type: "meeting",
    library_bucket: "active_work",
    status: "active",
    visibility: "internal",
    security_mode: "normal",
    changed_by_user_id: "user_1",
    change_summary: "Edited the summary",
    change_reason: null,
    created_at: "2026-09-01T00:00:00.000Z",
    metadata_json: null,
    metadata: {},
    import_source: null,
  };
  return { ...record, ...overrides };
}

/**
 * A secure revision as `shapeRevisionForBrowser(revision, { includeBody: false })` leaves one.
 *
 * `body_markdown` is filtered out rather than deleted, because the shaper **deletes** it and the
 * fixture has to be genuinely without it rather than carrying it as `undefined`.
 * @param {Record<string, unknown>} [overrides]
 * @returns {Record<string, unknown>}
 */
function secureRevision(overrides = {}) {
  const record = Object.fromEntries(Object.entries(
    revision({ security_mode: "secure", body_excerpt: null, secure_title_warning: "hidden" }),
  ).filter(([key]) => key !== "body_markdown"));
  assert.ok(!Object.hasOwn(record, "body_markdown"), "the secure fixture must genuinely lack a body");
  return { ...record, ...overrides };
}

describe("the revision envelope is exact and its elements are not", () => {
  it("accepts a valid empty history, which the producer deliberately answers", () => {
    assert.deepEqual(readNoteRevisions({ revisions: [] }), [],
      "visibleRevisionSnapshots returns [] for an initial-only history, and that is an answer");
    const visible = functionBody(service, "function visibleRevisionSnapshots(revisions = [], note = {}) {");
    assert.match(visible, /if \(visible\.length === 1 && Number\(visible\[0\]\.revision_number\) === 1\) \{\n\s+return \[\];/,
      "and the producer is where that emptiness is decided");
  });

  it("accepts a valid populated history", () => {
    const result = readNoteRevisions({ revisions: [revision(), revision({ note_revision_id: "revision_2" })] });
    assert.equal(result?.length, 2, "both revisions come back");
  });

  it("refuses a body that is not a revision list body", () => {
    for (const body of [null, undefined, "", "body", 0, false, []]) {
      assert.equal(readNoteRevisions(body), null, String(body) + " is not a revision list body");
    }
    assert.equal(readNoteRevisions(Object.assign([], { revisions: [] })), null,
      "an array is not a revision list body even when it carries the member");
  });

  it("refuses a missing or non-array revisions member", () => {
    // Pinned by source first: removing the container guard makes `.every` throw a TypeError
    // rather than refuse, so the fixtures below crash before any of them can name the failure.
    const reader = functionBody(page, "  function readNoteRevisions(body) {", "\n  }\n");
    assert.match(reader, /!Array\.isArray\(body\.revisions\)/,
      "the revisions container is proved to be an array before every() is called on it");
    assert.equal(readNoteRevisions({}), null, "a missing revisions member is not an empty history");
    for (const revisions of [null, "", 0, false, {}, "revisions"]) {
      assert.equal(readNoteRevisions({ revisions }), null, JSON.stringify(revisions) + " is not a history");
    }
  });

  it("claims nothing beyond the one member the producer names", () => {
    const listRevisions = functionBody(service, "async function listRevisions(noteId, session) {");
    assert.match(listRevisions, /return \{ revisions: visibleRevisionSnapshots\(revisions, note\)\.map\(\(revision\) => shapeRevisionForBrowser\(revision, \{ includeBody: false \}\)\) \};/,
      "the envelope names revisions and spreads nothing, so it is exact at one member");
    assert.match(routes, /notesRoutes\.get\("\/notes\/:noteId\/revisions"[\s\S]{0,240}response\.status\(200\)\.json\(result\);/,
      "and the route answers it unchanged");
  });
});

describe("the revision minimum matches what the table guarantees", () => {
  it("requires the columns the schema declares NOT NULL and this panel reads", () => {
    const columns = revisionColumns();
    for (const name of readTable(page, "REQUIRED_REVISION_COLUMNS")) {
      const column = columns.get(name);
      assert.ok(column, name + " must be a revision column");
      assert.ok(column.notNull || column.primaryKey,
        name + " is NOT NULL or the primary key, so the browser may require it");
      assert.equal(readNoteRevisions({ revisions: [revision({ [name]: null })] }), null, name + " may not be null");
      assert.equal(readNoteRevisions({ revisions: [revision({ [name]: 7 })] }), null, name + " may not be a number");
    }
  });

  it("allows null only where the schema allows it", () => {
    const columns = revisionColumns();
    for (const name of readTable(page, "NULLABLE_REVISION_COLUMNS")) {
      const column = columns.get(name);
      assert.ok(column, name + " must be a revision column");
      assert.ok(!column.notNull && !column.primaryKey,
        name + " is nullable in the schema, so the browser may not require it");
      assert.notEqual(readNoteRevisions({ revisions: [revision({ [name]: null })] }), null, name + " may be null");
      assert.equal(readNoteRevisions({ revisions: [revision({ [name]: 7 })] }), null, name + " may not be a number");
    }
  });

  it("requires a usable revision identity, because the restore route submits it", () => {
    assert.equal(readNoteRevisions({ revisions: [revision({ note_revision_id: "" })] }), null,
      "an empty note_revision_id would be submitted to the restore route as a revision that does not exist");
    assert.match(page, /\/revisions\/\$\{encodeURIComponent\(revision\.note_revision_id\)\}\/restore/,
      "and that is where it is submitted");
  });

  it("requires the persisted revision number as an integer", () => {
    assert.equal(revisionColumns().get("revision_number")?.type, "INTEGER", "the column is an integer");
    for (const value of ["3", null, 3.5, Number.NaN, undefined]) {
      assert.equal(readNoteRevisions({ revisions: [revision({ revision_number: value })] }), null,
        JSON.stringify(value ?? String(value)) + " is not a persisted revision number");
    }
    assert.notEqual(readNoteRevisions({ revisions: [revision({ revision_number: 1 })] }), null,
      "and the original revision is number one");
  });

  it("closes security_mode to the pair the column and the domain contract both name", () => {
    const check = revisionColumns().get("security_mode")?.check;
    assert.equal(check, "'normal', 'secure'", "the column admits exactly the pair");
    const domain = read("src/types/notes-domain-contracts.d.ts");
    assert.match(domain, /export type NoteSecurityMode = "normal" \| "secure";/, "and so does the domain contract");
    assert.deepEqual([...readTable(page, "NOTE_REVISION_SECURITY_MODES")].sort(), ["normal", "secure"],
      "so the browser vocabulary is that pair");
    for (const mode of ["Secure", "SECURE", "", "locked", null, 1]) {
      assert.equal(readNoteRevisions({ revisions: [revision({ security_mode: mode })] }), null,
        JSON.stringify(mode ?? String(mode)) + " is not a security mode this column can hold");
    }
  });

  it("leaves the vocabularies this panel only formats open", () => {
    const declared = functionBody(contracts, "export interface BrowserNoteRevisionSummary {", "\n}\n");
    for (const name of ["library_bucket", "visibility"]) {
      assert.ok(revisionColumns().get(name)?.check, name + " does carry a CHECK constraint");
      assert.match(declared, new RegExp("^ {2}" + name + ": string;$", "m"),
        name + " stays open, because formatToken formats it rather than validating it");
      assert.notEqual(readNoteRevisions({ revisions: [revision({ [name]: "something_new" })] }), null,
        "so a bucket or visibility this browser has not heard of is still readable history");
    }
    assert.match(page, /formatToken\(revision\.library_bucket\)/, "and formatting is all the panel does with it");
  });

  it("validates every member it promises", () => {
    // Without this, a column could quietly leave the reader's tables while the declaration still
    // promised it - the membership test below compares the declaration against the panel's reads
    // and would never notice.
    const declared = functionBody(contracts, "export interface BrowserNoteRevisionSummary {", "\n}\n");
    const promised = [...declared.matchAll(/^ {2}([a-z_]+): /gm)].map((entry) => entry[1]);
    const predicate = functionBody(page, "  function isNoteRevisionSummary(value) {", "\n  }\n");
    const validated = new Set([
      ...readTable(page, "REQUIRED_REVISION_COLUMNS"),
      ...readTable(page, "NULLABLE_REVISION_COLUMNS"),
      ...[...predicate.matchAll(/value\.([a-z_]+)/g)].map((entry) => entry[1]),
    ]);
    for (const member of promised) {
      assert.ok(validated.has(member), member + " is promised by the contract and must be validated by the reader");
    }
    assert.deepEqual([...promised].sort(), [...validated].filter((m) => promised.includes(m)).sort(),
      "and the reader validates nothing it does not promise");
  });

  it("promises exactly the members the panel reads", () => {
    const declared = functionBody(contracts, "export interface BrowserNoteRevisionSummary {", "\n}\n");
    const promised = [...declared.matchAll(/^ {2}([a-z_]+): /gm)].map((entry) => entry[1]);
    const item = functionBody(page, "  function revisionItem(note, revision) {", "\n  }\n");
    const consumed = new Set([...item.matchAll(/\brevision\.([a-z_]+)/g)].map((entry) => entry[1]));
    assert.deepEqual([...promised].sort(), [...consumed].sort(),
      "every promised member is read by the panel, and every member it reads is promised");
    assert.ok(consumed.size >= 9, "and the panel's reads must have been found");
    for (const unread of ["note_type", "status", "metadata_json", "changed_by_user_id", "change_reason", "note_id", "workspace_id"]) {
      assert.ok(!promised.includes(unread), unread + " is carried by the response but never read here");
      assert.notEqual(readNoteRevisions({ revisions: [revision({ [unread]: undefined })] }), null,
        "so a revision without it is still readable");
    }
  });
});

describe("the secure boundary is enforced rather than assumed", () => {
  it("refuses any revision still carrying an encrypted storage column", () => {
    const stripped = strippedStorageMembers();
    assert.deepEqual([...readTable(page, "FORBIDDEN_REVISION_STORAGE_COLUMNS")].sort(), [...stripped].sort(),
      "the forbidden set is exactly what stripSecureStorageFields deletes");
    assert.equal(stripped.length, 11, "and there are eleven of them");
    for (const member of stripped) {
      assert.equal(readNoteRevisions({ revisions: [revision({ [member]: "x" })] }), null,
        member + " is stripped from every revision, so its presence means this is not that response");
      assert.equal(readNoteRevisions({ revisions: [secureRevision({ [member]: null })] }), null,
        member + " is forbidden by presence, not by value");
    }
  });

  it("refuses a secure revision that still carries a body", () => {
    for (const member of readTable(page, "FORBIDDEN_SECURE_REVISION_BODY_MEMBERS")) {
      assert.equal(readNoteRevisions({ revisions: [secureRevision({ [member]: "the secret body" })] }), null,
        "a secure revision listed without a body may not carry " + member);
      assert.equal(readNoteRevisions({ revisions: [secureRevision({ [member]: null })] }), null,
        member + " is forbidden by presence on a secure revision, not by value");
    }
    assert.deepEqual([...readTable(page, "FORBIDDEN_SECURE_REVISION_BODY_MEMBERS")].sort(),
      ["body_markdown", "secure_body_decrypted"], "and those are the two the shaper deletes");
  });

  it("refuses a secure revision whose excerpt was not nulled", () => {
    assert.equal(readNoteRevisions({ revisions: [secureRevision({ body_excerpt: "leaked excerpt" })] }), null,
      "the shaper nulls a secure excerpt, so a present one did not come through it");
    assert.equal(readNoteRevisions({ revisions: [secureRevision({ body_excerpt: undefined })] }), null,
      "and it is nulled rather than deleted");
    assert.notEqual(readNoteRevisions({ revisions: [secureRevision()] }), null,
      "a properly shaped secure revision is readable history");
  });

  it("reads the secure branch out of the producer", () => {
    const shaper = functionBody(service, "function shapeRevisionForBrowser(revision = {}, { includeBody = true } = {}) {");
    assert.match(shaper, /const shaped = stripSecureStorageFields\(revision\);/, "every revision is stripped first");
    assert.match(shaper, /if \(isEffectivelySecureNote\(shaped\)\) \{[\s\S]*if \(!includeBody\) \{\n\s+delete shaped\.body_markdown;/,
      "a secure revision listed without a body loses its markdown");
    assert.match(shaper, /shaped\.body_excerpt = null;/, "and its excerpt is nulled");
    assert.match(shaper, /delete shaped\.secure_body_decrypted;/, "and its decrypted body is deleted");
    assert.match(service, /shapeRevisionForBrowser\(revision, \{ includeBody: false \}\)/,
      "and the list is the caller that asks for no body");
  });

  it("does not promise or strip a normal revision's body", () => {
    const declared = functionBody(contracts, "export interface BrowserNoteRevisionSummary {", "\n}\n");
    assert.doesNotMatch(declared, /^ {2}body_markdown: /m, "the contract promises nothing about it");
    assert.notEqual(readNoteRevisions({ revisions: [revision({ body_markdown: "# body" })] }), null,
      "a normal revision that still carries one is accepted, because the shaper does not delete it there");
    const reader = functionBody(page, "  function readNoteRevisions(body) {", "\n  }\n");
    assert.doesNotMatch(reader, /delete |body_markdown/,
      "and this consumer does not strip what it was sent - that is a producer question");
  });
});

describe("the three access layers stay on the server", () => {
  it("checks history permission and consumer access before it reads anything", () => {
    const list = functionBody(service, "async function listRevisions(noteId, session) {");
    const readNote = list.indexOf("await readNoteOrThrow(session, noteId);");
    const history = list.indexOf('await assertCanAccess(session, note, "view_history");');
    const consumer = list.indexOf('assertNoteReadConsumerAccess(note, session, "notes.revisions");');
    const query = list.indexOf("await notesRepository.listRevisions(");
    for (const [name, index] of [["note read", readNote], ["history permission", history], ["consumer access", consumer], ["repository read", query]]) {
      assert.notEqual(index, -1, name + " must be present");
    }
    assert.ok(readNote < history, "the note is read before the history permission is checked");
    assert.ok(history < consumer, "the history permission before the consumer gate");
    assert.ok(consumer < query, "and both before the revisions are queried");
    assert.doesNotMatch(page, /view_history|notes\.revisions|assertCanAccess/,
      "the browser re-derives none of it");
  });

  it("leaves the visible-snapshot filtering where it is", () => {
    assert.match(service, /visibleRevisionSnapshots\(revisions, note\)/, "the list still filters through it");
    const should = functionBody(service, "function shouldShowRevisionSnapshot(revision, revisions, index, note) {");
    assert.match(should, /if \(revision\.security_mode === NOTE_SECURITY_MODES\.SECURE \|\| isEffectivelySecureNote\(note\)\) \{\n\s+return true;/,
      "a secure revision stays visible");
    const reader = functionBody(page, "  function readNoteRevisions(body) {", "\n  }\n");
    assert.doesNotMatch(reader, /filter|slice|revision_number/, "and the browser reimplements none of the filtering");
  });

  it("reads the revisions the repository actually scopes", () => {
    const query = functionBody(repo, "async function listRevisions(workspaceId, noteId) {");
    assert.match(query, /WHERE workspace_id = :workspaceId\n {2}AND note_id = :noteId/, "scoped to the workspace and note");
    assert.match(query, /ORDER BY revision_number DESC;/, "newest first");
    const normalize = functionBody(repo, "function revisionRowToAppValue(row) {");
    assert.match(normalize, /\.\.\.row,/, "the row is spread, which is why the browser record is a structural minimum");
  });
});

describe("the producer's own revisions survive", () => {
  it("answers the same array and the same elements", () => {
    const original = revision({ future_revision_field: { nested: true } });
    const originalArray = [original];
    const result = readNoteRevisions({ revisions: originalArray });
    assert.equal(result, originalArray, "the producer's array is answered, not a copy");
    assert.equal(result?.[0], original, "and its elements are the producer's own objects");
  });

  it("keeps the unpromised members a revision carries", () => {
    const result = readNoteRevisions({ revisions: [revision({ future_revision_field: { nested: true } })] });
    assert.deepEqual(result?.[0].future_revision_field, { nested: true }, "a benign extra member survives");
    assert.equal(result?.[0].changed_by_user_id, "user_1", "and so do the actor and metadata columns");
    assert.deepEqual(result?.[0].metadata, {}, "including the parsed metadata the repository adds");
  });

  it("does not rebuild the revision to the promised minimum", () => {
    const reader = functionBody(page, "  function readNoteRevisions(body) {", "\n  }\n");
    assert.doesNotMatch(reader, /note_revision_id:|revision_number:|body_excerpt:/,
      "rebuilding would strip the metadata, actor and import columns the response carries");
    assert.doesNotMatch(reader, /\.map\(/, "the array is answered as it arrived");
  });
});

describe("an unreadable history is not an empty one", () => {
  const load = functionBody(page, "  async function loadRevisions(note, list) {", "\n  }\n");

  it("no longer performs the raw read", () => {
    assert.doesNotMatch(page, /result\.revisions \|\| \[\]/, "the raw read must be gone from the page");
    assert.match(load, /readNoteRevisions\(await api\.getJson\(`\/api\/notes\/\$\{encodeURIComponent\(note\.note_id\)\}\/revisions`/,
      "and the boundary is the reader");
  });

  it("refuses before anything is rendered", () => {
    const refusal = load.indexOf("if (!revisions) {");
    assert.notEqual(refusal, -1, "an unreadable history must be refused");
    assert.match(load, /if \(!revisions\) \{\n\s+throw new Error\("The revision history could not be read\."\);\n\s+\}/,
      "by throwing into the existing catch rather than rendering an empty history");
    const render = load.indexOf("list.replaceChildren(...(revisions.length");
    assert.notEqual(render, -1, "and the list must still be rendered");
    assert.ok(refusal < render, "the refusal comes first");
  });

  it("keeps a real empty history apart from an unreadable one", () => {
    assert.match(load, /emptyText\("No revisions\."\)/, "a valid empty history says there are none");
    assert.match(load, /\} catch \(error\) \{\n\s+list\.replaceChildren\(emptyText\(safeNoteErrorMessage\(error, "Revisions could not be loaded\."\)\)\);/,
      "and an unreadable one takes the existing failure path");
    assert.notEqual(load.indexOf('"No revisions."'), load.indexOf('"Revisions could not be loaded."'),
      "the two outcomes must not share a message");
  });

  it("refuses the whole history for one malformed revision", () => {
    const wire = { revisions: [revision(), { note_revision_id: "revision_2" }, revision({ note_revision_id: "revision_3" })] };
    assert.equal(readNoteRevisions(wire), null,
      "a shortened history rendered as a complete one tells the viewer that edits never happened");
    const reader = functionBody(page, "  function readNoteRevisions(body) {", "\n  }\n");
    assert.doesNotMatch(reader, /\.filter\(/, "so malformed revisions are not quietly dropped");
  });
});

describe("this child owns only the history list", () => {
  it("leaves the restore response untyped, because nothing reads it", () => {
    const item = functionBody(page, "  function revisionItem(note, revision) {", "\n  }\n");
    assert.match(item, /await api\.postJson\(`\/api\/notes\/\$\{encodeURIComponent\(note\.note_id\)\}\/revisions\/\$\{encodeURIComponent\(revision\.note_revision_id\)\}\/restore`, \{\}\);/,
      "the restore result is awaited and discarded");
    assert.doesNotMatch(item, /const restored|readRestoredRevision|restoredRevision/, "so no reader is invented for it");
    for (const invented of ["BrowserNoteRevisionRestore", "BrowserRestoredRevision", "BrowserNoteRevisionDetail"]) {
      assert.ok(!contracts.includes(invented), invented + " would take on a producer this child does not own");
    }
  });

  it("publishes two contracts and not the persistence record", () => {
    for (const name of ["BrowserNoteRevisionSummary", "BrowserNoteRevisionList"]) {
      assert.equal((contracts.match(new RegExp("export interface " + name + "\\b", "g")) || []).length, 1,
        "one " + name);
    }
    assert.ok(!contracts.includes("NoteRevisionRecord"), "the server's revision record is not mirrored into the browser");
  });

  it("reuses the security-mode vocabulary the estate already declares", () => {
    assert.equal((contracts.match(/export type BrowserNoteEffectiveSecurityMode\b/g) || []).length, 1,
      "there is one such vocabulary");
    // Counting one name cannot see a second alias declared under a different one, which is the
    // duplication this claim is actually about. Two already exist and are two different concepts -
    // a catalog's security policy and a note's effective mode - so the claim is that this child
    // added no third, not that there is only ever one.
    assert.deepEqual((contracts.match(/^export type (\w+) = "normal" \| "secure";$/gm) || []).sort(), [
      'export type BrowserNoteCatalogSecurityPolicy = "normal" | "secure";',
      'export type BrowserNoteEffectiveSecurityMode = "normal" | "secure";',
    ], "and this child declares no third normal/secure alias beside the two the estate already has");
    const declared = functionBody(contracts, "export interface BrowserNoteRevisionSummary {", "\n}\n");
    assert.match(declared, /^ {2}security_mode: BrowserNoteEffectiveSecurityMode;$/m,
      "and the revision summary uses it rather than declaring a second copy");
  });
});
