import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const panel = read("public/js/shared/notes-linked-panel.js");
const notesPage = read("public/js/notes.js");
const service = read("src/modules/notes/notes.service.js");
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

/** The shipped panel reader, instantiated from the shared module's own source. */
function shippedPanelReader() {
  /** @param {string} opener */
  const slice = (opener) => {
    const start = panel.indexOf(opener);
    assert.notEqual(start, -1, opener + " must exist in the panel source");
    return panel.slice(start, panel.indexOf("\n  }\n", start) + 4);
  };
  return new Function([
    "const PANEL_NOTE_TEXT_COLUMNS = " + JSON.stringify(readTable(panel, "PANEL_NOTE_TEXT_COLUMNS")) + ";",
    "const PANEL_NOTE_NULLABLE_COLUMNS = " + JSON.stringify(readTable(panel, "PANEL_NOTE_NULLABLE_COLUMNS")) + ";",
    "const PANEL_ITEM_TEXT_MEMBERS = " + JSON.stringify(readTable(panel, "PANEL_ITEM_TEXT_MEMBERS")) + ";",
    slice("  function isPanelRecord(value) {"),
    slice("  function hasPanelText(value, keys) {"),
    slice("  function hasPanelNullableText(value, keys) {"),
    slice("  function isLinkedNoteItem(value) {"),
    slice("  function isSelectableNoteItem(value) {"),
    slice("  function readSelectableNoteList(body) {"),
    "return { readSelectableNoteList, isSelectableNoteItem, isLinkedNoteItem };",
  ].join("\n"))();
}

/** The Notes page's own list-item predicate, for a second independent verdict on one contract. */
function shippedPageReader() {
  /** @param {string} opener */
  const slice = (opener) => {
    const start = notesPage.indexOf(opener);
    assert.notEqual(start, -1, opener + " must exist in the page source");
    return notesPage.slice(start, notesPage.indexOf("\n  }\n", start) + 4);
  };
  return new Function([
    "const REQUIRED_NOTE_COLUMNS = " + JSON.stringify(readTable(notesPage, "REQUIRED_NOTE_COLUMNS")) + ";",
    "const NULLABLE_NOTE_COLUMNS = " + JSON.stringify(readTable(notesPage, "NULLABLE_NOTE_COLUMNS")) + ";",
    slice("  function isResponseRecord(value) {"),
    slice("  function hasTextColumns(value, columns) {"),
    slice("  function hasNullableTextColumns(value, columns) {"),
    slice("  function hasArrayMembers(value, members) {"),
    slice("  function isNoteListItem(value) {"),
    "return { isNoteListItem };",
  ].join("\n"))();
}

const { readSelectableNoteList, isSelectableNoteItem, isLinkedNoteItem } = shippedPanelReader();
const { isNoteListItem } = shippedPageReader();

/**
 * The members `BrowserNoteColumns` declares, split by nullability.
 *
 * Read from the declaration rather than typed here, so this file cannot agree with a parser
 * table by copying it.
 */
function declaredNoteColumns() {
  const block = functionBody(contracts, "export interface BrowserNoteColumns {", "\n}\n");
  /** @type {{required: string[], nullable: string[]}} */
  const columns = { required: [], nullable: [] };
  for (const [, name, type] of block.matchAll(/^ {2}([a-z_]+): (.+);$/gm)) {
    (type.includes("| null") ? columns.nullable : columns.required).push(name);
  }
  return columns;
}

/** A note shaped the way `shapeNoteListProjection` sends one. */
function listNote(overrides = {}) {
  /** @type {Record<string, unknown>} */
  const note = { tags: [] };
  const declared = declaredNoteColumns();
  for (const key of declared.required) note[key] = key === "note_id" ? "note_1" : "value";
  for (const key of declared.nullable) note[key] = null;
  return { ...note, ...overrides };
}

describe("the linked panel reads GET /api/notes against the published list contract", () => {
  it("accepts a body with no notes as a real empty answer", () => {
    const result = readSelectableNoteList({ notes: [], pagination: null });
    assert.deepEqual(result, [], "an empty list is an answer, not a failure");
  });

  it("accepts a populated body", () => {
    const wire = { notes: [listNote(), listNote({ note_id: "note_2" })], pagination: null };
    const result = readSelectableNoteList(wire);
    assert.equal(result?.length, 2, "both notes come back");
  });

  it("refuses a body that is not a record", () => {
    for (const body of [null, undefined, "", "body", 0, false, []]) {
      assert.equal(readSelectableNoteList(body), null, String(body) + " is not a note list body");
    }
    assert.equal(readSelectableNoteList(Object.assign([], { notes: [] })), null,
      "an array is not a note list body even when it carries the member");
  });

  it("refuses a body whose notes member is missing or not an array", () => {
    // Pinned by source, and pinned *first*: removing the container guard makes `.every` throw a
    // TypeError rather than refuse, so the fixtures below crash before any of them can name the
    // failure. A guard that crashes instead of refusing has to be asserted where it is written.
    const reader = functionBody(panel, "  function readSelectableNoteList(body) {", "\n  }\n");
    assert.match(reader, /!Array\.isArray\(body\.notes\)/,
      "the notes container is proved to be an array before every() is called on it");
    assert.equal(readSelectableNoteList({ pagination: null }), null, "a missing notes member is not an empty list");
    for (const notes of [null, "", 0, false, {}, "notes"]) {
      assert.equal(readSelectableNoteList({ notes }), null, JSON.stringify(notes) + " is not a list of notes");
    }
  });

  it("refuses the whole response for one malformed note", () => {
    const wire = { notes: [listNote(), { note_id: "note_2" }, listNote({ note_id: "note_3" })], pagination: null };
    assert.equal(readSelectableNoteList(wire), null,
      "a short link picker presented as a complete one is worse than a refusal");
  });

  it("refuses a note whose columns disagree with the published contract", () => {
    const declared = declaredNoteColumns();
    for (const column of declared.required) {
      assert.equal(readSelectableNoteList({ notes: [listNote({ [column]: null })] }), null,
        column + " is declared as a required string and may not be null");
      assert.equal(readSelectableNoteList({ notes: [listNote({ [column]: 7 })] }), null,
        column + " is declared as a required string and may not be a number");
    }
    for (const column of declared.nullable) {
      assert.equal(readSelectableNoteList({ notes: [listNote({ [column]: 7 })] }), null,
        column + " is declared as a nullable string and may not be a number");
      assert.notEqual(readSelectableNoteList({ notes: [listNote({ [column]: "text" })] }), null,
        column + " is declared as a nullable string and a string is valid");
    }
  });

  it("refuses an empty identifier, because a picker submits it", () => {
    assert.equal(readSelectableNoteList({ notes: [listNote({ note_id: "" })] }), null,
      "an empty note_id would be submitted to the link route as a note that does not exist");
  });

  it("validates the tags container without typing its elements", () => {
    for (const tags of [null, "", 0, {}, undefined]) {
      assert.equal(readSelectableNoteList({ notes: [listNote({ tags })] }), null,
        JSON.stringify(tags ?? String(tags)) + " is not the tags array the contract declares");
    }
    assert.notEqual(readSelectableNoteList({ notes: [listNote({ tags: [{ anything: true }, 7, null] })] }), null,
      "the tag record belongs to LongtailForge.tags and its elements are not typed here");
  });

  it("claims only the notes member, not the envelope", () => {
    const reader = functionBody(panel, "  function readSelectableNoteList(body) {", "\n  }\n");
    assert.match(panel, / \* @returns \{BrowserNoteListItem\[\] \| null\}\n {3}\*\/\n {2}function readSelectableNoteList/,
      "the reader declares that it returns the list it validated, and nothing wider");
    assert.doesNotMatch(reader, /BrowserNoteListEnvelope/,
      "returning the envelope after checking one member would claim a pagination this reader never looked at");
    assert.doesNotMatch(reader, /pagination/, "and the picker neither reads nor stores it");
    assert.notEqual(readSelectableNoteList({ notes: [], pagination: "not a pagination" }), null,
      "an unclaimed member is not validated, so it cannot refuse a body this reader can use");
  });
});

describe("the selectable predicate is the list contract, not the panel projection", () => {
  it("does not require the three members the panel projection adds", () => {
    const note = listNote();
    assert.equal(isSelectableNoteItem(note), true, "a GET /api/notes note is selectable");
    assert.equal(isLinkedNoteItem(note), false,
      "and the same note is refused by the panel predicate, which is why reusing it here would be wrong");
    for (const member of readTable(panel, "PANEL_ITEM_TEXT_MEMBERS")) {
      assert.ok(!Object.hasOwn(note, member), member + " is added by shapeLinkedNotePanelItem, not by this endpoint");
    }
  });

  it("reuses the panel's column tables rather than adding a second divergent list", () => {
    const predicate = functionBody(panel, "  function isSelectableNoteItem(value) {", "\n  }\n");
    assert.match(predicate, /hasPanelText\(value, PANEL_NOTE_TEXT_COLUMNS\)/, "the required columns are the panel's own");
    assert.match(predicate, /hasPanelNullableText\(value, PANEL_NOTE_NULLABLE_COLUMNS\)/, "and so are the nullable ones");
    assert.equal((panel.match(/Object\.freeze\(\[\s*"created_at"/g) || []).length, 1,
      "there is exactly one required-column table in this module");
  });

  it("agrees with the Notes page's own predicate on every fixture", () => {
    const fixtures = [
      listNote(),
      listNote({ note_id: "" }),
      listNote({ title: "" }),
      listNote({ title: null }),
      listNote({ body_excerpt: "text" }),
      listNote({ body_excerpt: 7 }),
      listNote({ tags: null }),
      listNote({ tags: [1, 2] }),
      listNote({ extra_producer_field: "later" }),
      { note_id: "note_1" },
      {},
      null,
      [],
      "note",
    ];
    for (const fixture of fixtures) {
      assert.equal(isSelectableNoteItem(fixture), isNoteListItem(fixture),
        "two readers of one published contract must reach the same verdict on " + JSON.stringify(fixture));
    }
    assert.ok(fixtures.some((f) => isSelectableNoteItem(f)), "and the fixtures must include an accepted note");
    assert.ok(fixtures.some((f) => !isSelectableNoteItem(f)), "and a refused one");
  });

  it("matches the column membership the declaration publishes", () => {
    const declared = declaredNoteColumns();
    assert.deepEqual([...readTable(panel, "PANEL_NOTE_TEXT_COLUMNS")].sort(), [...declared.required].sort(),
      "the required columns must be exactly what BrowserNoteColumns declares as required");
    assert.deepEqual([...readTable(panel, "PANEL_NOTE_NULLABLE_COLUMNS")].sort(), [...declared.nullable].sort(),
      "and the nullable columns exactly what it declares as nullable");
    assert.ok(declared.required.length > 0 && declared.nullable.length > 0, "and the declaration must have been read");
  });
});

describe("the producer's own note objects survive", () => {
  it("answers the same array and the same elements", () => {
    const note = listNote({ extra_producer_field: "kept", tags: [{ tag_id: "t1" }] });
    const originalArray = [note];
    const wire = { notes: originalArray, pagination: null };
    const result = readSelectableNoteList(wire);
    assert.equal(result, originalArray, "the producer's array is answered, not a copy");
    assert.equal(result?.[0], note, "and its elements are the producer's own objects");
  });

  it("keeps a benign additional producer field", () => {
    const result = readSelectableNoteList({ notes: [listNote({ future_member: { nested: true } })] });
    assert.deepEqual(result?.[0].future_member, { nested: true },
      "a structural minimum promises what it checked and preserves everything else");
  });

  it("does not rebuild the note to the three members the picker reads", () => {
    const reader = functionBody(panel, "  function readSelectableNoteList(body) {", "\n  }\n");
    assert.doesNotMatch(reader, /note_id:|title:|body_excerpt:/,
      "rebuilding would throw away everything the search path may carry later");
    assert.doesNotMatch(reader, /\.map\(/, "the array is answered as it arrived");
  });
});

describe("the picker's behaviour is unchanged apart from the trust boundary", () => {
  const load = functionBody(panel, "  async function loadSelectableNotes(state, select, search = \"\") {", "\n  }\n");

  it("no longer performs the raw read", () => {
    assert.doesNotMatch(panel, /\(result\.notes \|\| \[\]\)/, "the raw read must be gone from the module");
    assert.match(load, /readSelectableNoteList\(await api\.getJson\(`\/api\/notes\?/,
      "and the boundary is the reader");
  });

  it("refuses before anything reaches the select", () => {
    const refusal = load.indexOf("if (!selectable) {");
    assert.notEqual(refusal, -1, "the load must refuse an unreadable body");
    const options = load.indexOf("select.replaceChildren(...(notes.length > 0");
    assert.notEqual(options, -1, "and it must still build the option list");
    assert.ok(refusal < options, "the refusal has to come before the options are built");
  });

  it("tells a real empty answer apart from an unreadable one", () => {
    assert.match(load, /new global\.Option\("No notes available", ""\)/, "a valid empty list says there are none");
    assert.match(load, /\} catch \{\n\s+select\.replaceChildren\(new global\.Option\("Notes unavailable", ""\)\);/,
      "and an unreadable body takes the existing unavailable path instead");
    assert.notEqual(load.indexOf('"No notes available"'), load.indexOf('"Notes unavailable"'),
      "the two outcomes must not share a message");
    assert.match(load, /if \(!selectable\) \{\n\s+throw new Error\("The selectable note list could not be read\."\);\n\s+\}/,
      "an unreadable body must throw into the unavailable catch, not render the empty-list message itself");
  });

  it("still excludes the notes that are already linked", () => {
    assert.match(load, /const linkedIds = new Set\(state\.notes\.map\(\(note\) => note\.id\)\);/,
      "the linked ids still come from the panel's own state");
    assert.match(load, /\.filter\(\(note\) => !linkedIds\.has\(note\.note_id\)\)/,
      "and are still excluded from the selectable list");
  });

  it("still searches, caps and labels exactly as it did", () => {
    assert.match(load, /\[note\.title, note\.body_excerpt\]\.filter\(Boolean\)\.join\(" "\)\.toLowerCase\(\)\.includes\(needle\)/,
      "the needle still matches title and excerpt");
    assert.match(load, /\.slice\(0, 50\)/, "the 50-result cap is unchanged");
    assert.match(load, /new global\.Option\(note\.title \|\| "Untitled note", note\.note_id\)/,
      "the title fallback and the submitted identifier are unchanged");
    assert.match(load, /limit: "50",\n\s+status: "active",\n\s+sort: "updated_desc",/, "and so is the query");
  });

  it("stores nothing in panel state", () => {
    assert.doesNotMatch(load, /state\.selectableNotes/,
      "this function did not store the result before and does not need to now");
  });
});

describe("this child leaves the completed panel work alone", () => {
  it("does not touch the for-target reader", () => {
    const forTarget = functionBody(panel, "  function isLinkedNoteItem(value) {", "\n  }\n");
    assert.match(forTarget, /hasPanelText\(value, PANEL_ITEM_TEXT_MEMBERS\)/,
      "the panel projection still requires its three added members");
    assert.match(panel, /const linkedNotes = body\.linkedNotes\.filter\(isLinkedNoteItem\);/,
      "and the for-target envelope still filters with it");
  });

  it("publishes no new note contract", () => {
    for (const invented of ["BrowserSelectableNote", "BrowserPanelNoteListItem", "BrowserSelectableNoteList"]) {
      assert.ok(!contracts.includes(invented), invented + " would be another note projection");
    }
    assert.equal((contracts.match(/export interface BrowserNoteListItem\b/g) || []).length, 1,
      "there is one list-item contract and this child reuses it");
  });

  it("reads the producer that actually shapes this response", () => {
    const projection = functionBody(service, "function shapeNoteListProjection(note = {}) {");
    assert.match(projection, /delete shaped\.body_markdown;/, "the list projection deletes the markdown body");
    assert.match(projection, /delete shaped\.searchDocument;/, "and the search document");
    const envelope = functionBody(service, "function noteListResult(notes, pagination, nextCursor = \"\") {");
    assert.match(envelope, /return \{\n\s+notes,/, "the envelope names notes");
    assert.doesNotMatch(envelope, /\.\.\./, "and is an exact reconstruction at its own level");
  });
});
