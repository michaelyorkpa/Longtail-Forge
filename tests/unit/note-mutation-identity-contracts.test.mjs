import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const service = read("src/modules/notes/notes.service.js");
const routes = read("src/modules/notes/notes.routes.js");
const page = read("public/js/notes.js");
const contracts = read("src/types/browser-contracts.d.ts");

/** @param {string} source @param {string} opener @param {string} [closer] */
function functionBody(source, opener, closer = "\n}\n") {
  const start = source.indexOf(opener);
  assert.notEqual(start, -1, opener + " must exist");
  const end = source.indexOf(closer, start);
  return source.slice(start, end === -1 ? source.length : end);
}

/** The shipped note-envelope reader, instantiated from the page's own source. */
function shippedReader() {
  /** @param {string} opener */
  const slice = (opener) => {
    const start = page.indexOf(opener);
    assert.notEqual(start, -1, opener + " must exist in the page source");
    return page.slice(start, page.indexOf("\n  }\n", start) + 4);
  };
  return new Function([
    "const REQUIRED_NOTE_COLUMNS = " + JSON.stringify(readTable("REQUIRED_NOTE_COLUMNS")) + ";",
    "const NULLABLE_NOTE_COLUMNS = " + JSON.stringify(readTable("NULLABLE_NOTE_COLUMNS")) + ";",
    "const REQUIRED_NOTE_DETAIL_COLUMNS = " + JSON.stringify(readTable("REQUIRED_NOTE_DETAIL_COLUMNS")) + ";",
    "const NULLABLE_NOTE_DETAIL_COLUMNS = " + JSON.stringify(readTable("NULLABLE_NOTE_DETAIL_COLUMNS")) + ";",
    "const OPTIONAL_NOTE_DETAIL_MEMBERS = " + JSON.stringify(readTable("OPTIONAL_NOTE_DETAIL_MEMBERS")) + ";",
    slice("  function isResponseRecord(value) {"),
    slice("  function hasTextColumns(value, columns) {"),
    slice("  function hasNullableTextColumns(value, columns) {"),
    slice("  function hasArrayMembers(value, members) {"),
    slice("  function hasOptionalTextColumns(value, columns) {"),
    slice("  function isNoteListItem(value) {"),
    slice("  function isNoteRecord(value) {"),
    slice("  function requireNoteFromEnvelope(result) {"),
    "return { requireNoteFromEnvelope, isNoteRecord };",
  ].join("\n"))();
}

/** @param {string} name */
function readTable(name) {
  const at = page.indexOf("const " + name + " = Object.freeze([");
  assert.notEqual(at, -1, name + " must exist");
  const body = page.slice(at, page.indexOf("]);", at));
  return [...body.matchAll(/"([a-z_]+)"/g)].map((entry) => entry[1]);
}

/** A note shaped the way the mutation routes answer one. */
function noteRecord(overrides = {}) {
  /** @type {Record<string, unknown>} */
  const record = { links: [], tags: [] };
  for (const key of [...readTable("REQUIRED_NOTE_COLUMNS"), ...readTable("REQUIRED_NOTE_DETAIL_COLUMNS")]) {
    record[key] = key === "note_id" ? "note_1" : "value";
  }
  for (const key of [...readTable("NULLABLE_NOTE_COLUMNS"), ...readTable("NULLABLE_NOTE_DETAIL_COLUMNS")]) {
    record[key] = null;
  }
  return { ...record, ...overrides };
}

describe("the mutation producers", () => {
  it("are the archive and restore routes, and they answer the same note envelope", () => {
    for (const [route, producer] of [["archive", "archive"], ["restore", "restore"]]) {
      const block = functionBody(routes, `notesRoutes.post("/notes/:noteId/${route}"`, "\n}));");
      assert.match(block, new RegExp(`await notesService\\.${producer}\\(request\\.params\\.noteId, requireWorkspaceSession\\(request\\.session\\)\\)`),
        route + " must call its traced producer with a workspace session");
      assert.match(block, /response\.status\(200\)\.json\(result\);/, "and answer its result");
      assert.match(functionBody(service, `async function ${producer}(noteId, session) {`),
        /return \{ note: await shapeNoteForWorkspaceRead\(session, note\) \};/,
        producer + " must answer the shared note envelope");
    }
  });

  it("are the only two callers of the browser helper this child narrows", () => {
    const callers = [...page.matchAll(/await mutateNote\(`([^`]+)`\)/g)].map((entry) => entry[1]).sort();
    assert.deepEqual(
      callers,
      ["/api/notes/${encodeURIComponent(note.note_id)}/archive", "/api/notes/${encodeURIComponent(note.note_id)}/restore"],
      "mutateNote must serve exactly the archive and restore routes",
    );
  });

  it("write, audit and index before they answer", () => {
    for (const producer of ["archive", "restore"]) {
      const body = functionBody(service, `async function ${producer}(noteId, session) {`);
      const write = body.indexOf("await notesRepository.update(");
      assert.notEqual(write, -1, producer + " must write the note");
      const answer = body.indexOf("return { note:");
      assert.notEqual(answer, -1, producer + " must answer the note envelope");
      assert.ok(write < answer, "the write must precede the answer");
      assert.match(body, /await recordNoteAudit\(session, "note_(archived|restored)"/, "the change must be audited");
      assert.match(body, /await syncNoteSearchIndex\(session\.workspace_id, note\.note_id/, "and re-indexed");
      assert.match(body, /await assertNotesWriteEnabled\(session\);/, "behind the module write gate");
      assert.match(body, /await assertCanAccess\(session, previousNote, "(archive|restore)"\);/, "and the note's own access check");
    }
  });
});

describe("the adoption reuses the established note boundary", () => {
  it("adds no second note record and no second parser", () => {
    assert.equal((contracts.match(/export interface BrowserNoteRecord\b/g) || []).length, 1,
      "there must be exactly one browser note record");
    assert.doesNotMatch(contracts, /BrowserNoteMutationResult|BrowserNoteArchiveResponse|BrowserCreatedNote/,
      "this child must not declare a second note response model");
    // Counted with a trailing-name wildcard: a second reader called
    // `requireNoteFromEnvelope2` slipped past a pattern that demanded the paren immediately.
    assert.equal((page.match(/function requireNoteFromEnvelope\w*\(/g) || []).length, 1,
      "and there must be exactly one note-envelope reader");
    assert.equal((page.match(/function isNoteRecord\w*\(/g) || []).length, 1,
      "over exactly one note predicate");
  });

  it("relies on the note record's own non-empty identifier proof", () => {
    assert.match(functionBody(page, "  function isNoteListItem(value) {", "\n  }\n"),
      /&& value\.note_id !== "";/,
      "the note record already refuses an empty identifier");
    const mutate = functionBody(page, "  async function mutateNote(url) {", "\n  }\n");
    assert.doesNotMatch(mutate, /note_id \|\| ""|\?\?\s*""/,
      "so the mutation must not invent a fallback identifier");
  });

  it("leaves the unconsumed search document alone", () => {
    assert.ok(!page.includes("searchDocument"), "the browser must not read the search document");
    // Matched as a declared member, not as text: an existing note contract names it in prose
    // precisely to record that it is *not* promised, and a bare search fails on that sentence.
    assert.doesNotMatch(contracts, /^\s*searchDocument\??:/m, "nor promise it");
    assert.match(contracts, /`metadata` and `searchDocument` - most of which the list select/,
      "and the sibling contract that already recorded it as unpromised must still say so");
    assert.match(service, /async function create\(/, "the create producer still exists");
  });
});

describe("the shipped reader, run against real bodies", () => {
  const { requireNoteFromEnvelope, isNoteRecord } = shippedReader();

  it("answers the note a real mutation envelope carries", () => {
    const note = noteRecord();
    /** @type {Record<string, unknown>} */
    const result = requireNoteFromEnvelope({ note });
    assert.equal(result, note, "the vouched note must be answered by identity");
    assert.equal(result.note_id, "note_1", "with a usable identifier");
  });

  it("refuses an envelope carrying no note", () => {
    for (const bad of [null, undefined, 7, "note", [], {}, { note: null }, { note: "note_1" }, { note: [] }]) {
      assert.throws(() => requireNoteFromEnvelope(bad), /The note response did not contain a note\./,
        "an envelope without a note must be refused");
    }
  });

  it("refuses a note whose identifier is empty", () => {
    assert.equal(isNoteRecord(noteRecord({ note_id: "" })), false,
      "an empty identifier is not a note this page can select");
    assert.throws(() => requireNoteFromEnvelope({ note: noteRecord({ note_id: "" }) }),
      /The note response did not contain a note\./,
      "so the envelope carrying it is refused");
  });

  it("refuses a note that is malformed in any promised column", () => {
    for (const key of ["note_id", "title", "status", "body_markdown", "owner_display_name"]) {
      assert.throws(() => requireNoteFromEnvelope({ note: noteRecord({ [key]: null }) }),
        /The note response did not contain a note\./,
        "a malformed " + key + " must refuse the envelope");
    }
    assert.throws(() => requireNoteFromEnvelope({ note: noteRecord({ links: undefined }) }),
      /The note response did not contain a note\./,
      "and so must a missing links collection");
  });
});

describe("the notes consumer", () => {
  const mutate = functionBody(page, "  async function mutateNote(url) {", "\n  }\n");

  it("no longer reads the identifier off an unvouched body", () => {
    assert.ok(!page.includes("result.note.note_id"), "the raw identity read must be gone");
  });

  it("takes the identifier from the vouched note", () => {
    assert.match(mutate, /await selectNote\(requireNoteFromEnvelope\(result\)\.note_id\);/,
      "the selection must use the note the envelope reader vouched for");
  });

  it("still refreshes the lists before it reads the response", () => {
    const reload = mutate.indexOf("await Promise.all([loadCollections(), loadNotes()]);");
    assert.notEqual(reload, -1, "the lists must be refreshed after the mutation");
    const vouch = mutate.indexOf("requireNoteFromEnvelope(");
    assert.notEqual(vouch, -1, "the response must be vouched for");
    assert.ok(reload < vouch,
      "the write has already committed, so the lists must reload even when the response cannot be read");
  });

  it("routes the refusal into the page's existing note error path", () => {
    assert.match(mutate, /\} catch \(error\) \{\n\s+setStatus\(safeNoteErrorMessage\(error, "Note could not be updated\."\), true\);/,
      "the refusal must land in the existing catch");
    assert.doesNotMatch(mutate, /alert\(|showModal|window\.confirm/, "and add no new failure surface");
  });

  it("leaves the other Notes producers to their own children", () => {
    for (const other of ["result.revisions || []"]) {
      assert.ok(page.includes(other), other + " is another child's read and is untouched");
    }
    // `settings.openExternalLinksNewTab` was on this list until `0.33.33.38.4.5.8` adopted the
    // User Settings producer's own boolean for the external-link preference. A sibling child
    // doing its job is not this one widening, so the claim is asserted against that reader -
    // anchored on the call site, because the reader's own definition also contains its name.
    assert.match(page, /readOpenExternalLinksNewTab\(await api\.getJson\("\/api\/user\/settings"/,
      "settings.openExternalLinksNewTab is another child's read and is untouched");
    assert.match(page, /const targets = readNoteLinkTargets\(/,
      "and the link-target directory belongs to 0.33.33.38.4.12.2");
  });
});
