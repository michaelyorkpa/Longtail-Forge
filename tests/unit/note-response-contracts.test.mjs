// Runtime proof for the Notes entity, list, pagination and collection response contracts.
//
// `0.33.33.38.4.2` narrowed six Notes API boundaries in `public/js/notes.js`, and a type contract
// alone would prove nothing about what the browser does with a malformed body. These cases lift the
// narrowing functions out of that file and run them against fixtures built from the server's own
// column lists, so the browser contract cannot drift from the producer without failing here.
//
// The proof lives in a unit test rather than a new discovered regression on purpose: the coverage
// policy holds `maximumActiveScripts` at 348 and refuses to raise it, and the estate settled at
// `0.33.33.30.3.1` that weakening that guardrail costs more than it buys. Vitest assertions already
// count toward the effective inventory.

import { describe, it } from "vitest";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const { readText } = createProjectTextReader();

const notesSource = readText("public/js/notes.js");
const repoSource = readText("src/modules/notes/notes.repo.js");
const serviceSource = readText("src/modules/notes/notes.service.js");
const declarationSource = readText("src/types/browser-contracts.d.ts");

const NARROWING_FUNCTIONS = Object.freeze([
  "isResponseRecord",
  "hasTextColumns",
  "hasNullableTextColumns",
  "hasOptionalTextColumns",
  "hasArrayMembers",
  "isNoteListItem",
  "isNoteRecord",
  "requireNoteFromEnvelope",
  "readNotePagination",
  "readNoteListEnvelope",
  "readEnvelopeMember",
  "collectionText",
  "normalizeCollections",
  "compareText",
]);

const COLUMN_TABLES = Object.freeze([
  "REQUIRED_NOTE_COLUMNS",
  "NULLABLE_NOTE_COLUMNS",
  "REQUIRED_NOTE_DETAIL_COLUMNS",
  "OPTIONAL_NOTE_DETAIL_MEMBERS",
  "NULLABLE_NOTE_DETAIL_COLUMNS",
]);

const context = vm.createContext({});
for (const table of COLUMN_TABLES) {
  vm.runInContext(readFrozenTable(notesSource, table), context, { filename: `notes.js:${table}` });
}
for (const name of NARROWING_FUNCTIONS) {
  vm.runInContext(extractFunctionBlock(notesSource, name), context, { filename: `notes.js:${name}` });
}
const narrowing = vm.runInContext(`({ ${[...NARROWING_FUNCTIONS, ...COLUMN_TABLES].join(", ")} })`, context);

const SECURE_STORAGE_COLUMNS = readDeletedFields(serviceSource, "stripSecureStorageFields");
const NOTE_COLUMNS = readColumnList(repoSource, "NOTE_COLUMNS");
const NOTE_LIST_COLUMNS = readColumnList(repoSource, "NOTE_LIST_COLUMNS");

describe("Notes response contracts", () => {
  it("checks exactly the columns the server's own selects produce", assertProducerAgreement);
  it("keeps the eleven stripped secure-storage columns out of the browser contract", assertSecureStorageExclusion);
  it("narrows the single-note envelope and fails malformed bodies on the existing path", assertSingleNoteEnvelope);
  it("checks list elements and rebuilds pagination rather than trusting the container", assertNoteListEnvelope);
  it("normalises collections and drops entries with no identity", assertCollectionNormalisation);
});

/**
 * The browser's checked column tables are the server's, minus what the producer strips.
 *
 * **This is what stops the contract from being consumer wishful thinking.** The fixtures below are
 * built from `NOTE_COLUMNS` and `NOTE_LIST_COLUMNS` as `notes.repo.js` declares them, so a column
 * the server stops selecting, or one the browser starts inventing, fails here rather than passing
 * because both sides were written from the same guess.
 */
function assertProducerAgreement() {
  const browserColumns = new Set([
    ...plain(narrowing.REQUIRED_NOTE_COLUMNS),
    ...plain(narrowing.NULLABLE_NOTE_COLUMNS),
  ]);
  assert.deepEqual(
    [...browserColumns].sort(),
    [...NOTE_LIST_COLUMNS].sort(),
    "the shared column set the browser checks must be exactly what the list select produces",
  );

  const detailColumns = new Set([
    ...browserColumns,
    ...plain(narrowing.REQUIRED_NOTE_DETAIL_COLUMNS),
    ...plain(narrowing.NULLABLE_NOTE_DETAIL_COLUMNS),
  ]);
  const producedDetailColumns = NOTE_COLUMNS.filter((column) => !SECURE_STORAGE_COLUMNS.includes(column));
  const missing = producedDetailColumns.filter((column) => !detailColumns.has(column));
  const invented = [...detailColumns].filter((column) => (
    !producedDetailColumns.includes(column) && !narrowing.REQUIRED_NOTE_DETAIL_COLUMNS.includes(column)
  ));
  assert.deepEqual(missing, [], "every non-secure detail column the server selects must be checked by the browser");
  assert.deepEqual(invented, [], "the browser must not check a column the detail select does not produce");
  assert.deepEqual(
    plain(narrowing.REQUIRED_NOTE_DETAIL_COLUMNS).filter((/** @type {string} */ column) => producedDetailColumns.includes(column)),
    ["body_markdown"],
    "owner_display_name is added by attachNoteIntegrations rather than selected, and body_markdown is the selected one",
  );
}

/**
 * The eleven secure-storage columns are absent from the browser contract and from its checks.
 */
function assertSecureStorageExclusion() {
  assert.equal(SECURE_STORAGE_COLUMNS.length, 11, "shapeNoteForBrowser strips eleven secure-storage columns");
  const contractBlock = declarationBlock("BrowserNoteRecord") + declarationBlock("BrowserNoteColumns")
    + declarationBlock("BrowserNoteListItem") + declarationBlock("BrowserLinkedNoteItem");
  for (const column of SECURE_STORAGE_COLUMNS) {
    assert.doesNotMatch(
      contractBlock,
      new RegExp(`\\b${column}\\b\\s*\\??:`),
      `${column} is deleted by the producer and must not be a member of a browser-facing note contract`,
    );
    assert.ok(
      !narrowing.REQUIRED_NOTE_COLUMNS.includes(column)
      && !narrowing.NULLABLE_NOTE_COLUMNS.includes(column)
      && !narrowing.NULLABLE_NOTE_DETAIL_COLUMNS.includes(column),
      `${column} must not be checked, because requiring it would reject every real note`,
    );
  }

  const withSecurePayload = { ...detailNoteFixture(), secure_payload: "cipher" };
  assert.equal(
    narrowing.isNoteRecord(withSecurePayload),
    true,
    "a body that carries a stripped column is still a note: the contract omits the member rather than policing the wire",
  );
}

/** Single-note envelope: valid accepted, everything malformed rejected on the throwing path. */
function assertSingleNoteEnvelope() {
  const note = detailNoteFixture();
  assert.equal(narrowing.isNoteRecord(note), true, "a note built from the producer's own columns must be accepted");
  assert.deepEqual(plain(narrowing.requireNoteFromEnvelope({ note })), plain(note));

  assert.equal(narrowing.isNoteRecord({ ...note, body_html: undefined }), true, "body_html is deleted, not nulled");
  assert.equal(narrowing.isNoteRecord(omit(note, "body_html")), true, "a route without includeBodyHtml sends no body_html");
  assert.equal(narrowing.isNoteRecord({ ...note, body_html: null }), false, "body_html is optional, never null");
  assert.equal(narrowing.isNoteRecord({ ...note, body_excerpt: null }), true, "a secure note's excerpt is nulled, not removed");
  assert.equal(narrowing.isNoteRecord(omit(note, "body_excerpt")), false, "the select names body_excerpt, so absence is malformed");
  assert.equal(narrowing.isNoteRecord({ ...note, secure_title_warning: "Titles are visible." }), true);
  assert.equal(narrowing.isNoteRecord({ ...note, secure_title_warning: 7 }), false);

  for (const column of narrowing.REQUIRED_NOTE_COLUMNS) {
    assert.equal(narrowing.isNoteRecord(omit(note, column)), false, `a note missing ${column} must be rejected`);
    assert.equal(narrowing.isNoteRecord({ ...note, [column]: null }), false, `${column} is NOT NULL and must not accept null`);
    assert.equal(narrowing.isNoteRecord({ ...note, [column]: 12 }), false, `${column} must be text`);
  }
  assert.equal(narrowing.isNoteRecord({ ...note, note_id: "" }), false, "an empty identity is not a note");
  assert.equal(narrowing.isNoteRecord({ ...note, tags: null }), false, "tags is decorated as an array on every read path");
  assert.equal(narrowing.isNoteRecord({ ...note, links: {} }), false, "links is decorated as an array");
  assert.equal(narrowing.isNoteRecord({ ...note, owner_display_name: null }), false, "the owner label is \"\" when unknown, never null");

  for (const malformed of [null, undefined, 0, "note", true, [], [note]]) {
    assert.equal(narrowing.isNoteRecord(malformed), false);
    assert.throws(
      () => narrowing.requireNoteFromEnvelope({ note: malformed }),
      /The note response did not contain a note\./,
      "a malformed note must fail on the path the raw property read already failed on",
    );
  }
  for (const malformedEnvelope of [null, undefined, "body", 3, [], {}, { notes: [note] }]) {
    assert.throws(() => narrowing.requireNoteFromEnvelope(malformedEnvelope), /did not contain a note/);
  }
}

/** List envelope: container and element are checked separately, and pagination is rebuilt. */
function assertNoteListEnvelope() {
  const item = listNoteFixture();
  const pagination = { hasMore: true, limit: 25, nextCursor: "cursor-2", pageSize: 25 };
  assert.deepEqual(
    plain(narrowing.readNoteListEnvelope({ notes: [item], pagination })),
    { notes: [item], pagination },
  );

  assert.deepEqual(plain(narrowing.readNoteListEnvelope({ notes: "all" })), { notes: [], pagination: null });
  assert.deepEqual(plain(narrowing.readNoteListEnvelope({})), { notes: [], pagination: null });
  for (const malformed of [null, undefined, 7, "body", []]) {
    assert.deepEqual(plain(narrowing.readNoteListEnvelope(malformed)), { notes: [], pagination: null });
  }

  const mixed = narrowing.readNoteListEnvelope({ notes: [item, { note_id: "n-2" }, null, "n-3", [item]] });
  assert.deepEqual(plain(mixed.notes), [item], "a valid container must not make its elements trusted");
  assert.equal(
    narrowing.isNoteListItem(omit(item, "tags")),
    false,
    "the list projection is tag-decorated, so an undecorated element is not a list item",
  );

  assert.equal(narrowing.readNotePagination(pagination).nextCursor, "cursor-2");
  assert.equal(narrowing.readNotePagination(null), null, "an unpaged load reports no pagination");
  for (const member of ["hasMore", "limit", "nextCursor", "pageSize"]) {
    assert.equal(
      narrowing.readNotePagination(omit(pagination, member)),
      null,
      `pagination is built field by field by the producer, so a body missing ${member} is not one`,
    );
  }
  assert.equal(narrowing.readNotePagination({ ...pagination, nextCursor: 4 }), null);
  assert.equal(narrowing.readNotePagination({ ...pagination, hasMore: "yes" }), null);
}

/** The collection normaliser rebuilds what it guarantees and drops what has no identity. */
function assertCollectionNormalisation() {
  const wire = {
    note_library_collection_id: "col-1",
    title: "Reference",
    library_bucket: "reference",
    parent_collection_id: null,
    path_cache: "Reference",
    status: "active",
    depth: "2",
    accessibleNoteCount: "4",
  };
  const [normalised] = narrowing.normalizeCollections([wire]);
  assert.equal(normalised.note_library_collection_id, "col-1");
  assert.equal(normalised.parent_collection_id, "", "a root collection normalises to an empty parent, not null");
  assert.equal(normalised.depth, 2, "depth is rebuilt as a number");
  assert.equal(normalised.accessibleNoteCount, 4);
  assert.equal(normalised.directAccessibleNoteCount, 0);
  assert.equal(normalised.path_cache, "Reference", "fields carried through the spread survive");
  assert.equal(normalised.status, "active");

  assert.deepEqual(plain(narrowing.normalizeCollections(undefined)), [], "a body with no collections normalises to none");
  assert.deepEqual(plain(narrowing.normalizeCollections("collections")), []);
  assert.deepEqual(plain(narrowing.normalizeCollections([null, 4, "col", []])), [], "entries that are not records are dropped");
  assert.deepEqual(plain(narrowing.normalizeCollections([{ title: "No identity" }])), [], "an entry without an id is dropped");
  assert.equal(
    narrowing.normalizeCollections([{ id: "legacy-1" }])[0].note_library_collection_id,
    "legacy-1",
    "the legacy id fallback is preserved",
  );
  assert.equal(narrowing.normalizeCollections([{ id: "c" }])[0].title, "Collection");
  assert.equal(narrowing.normalizeCollections([{ id: "c" }])[0].library_bucket, "reference");
  assert.equal(
    narrowing.normalizeCollections([{ id: "c", title: 12 }])[0].title,
    "Collection",
    "a non-text title falls back rather than being carried as a number into the option label",
  );

  assert.equal(narrowing.readEnvelopeMember({ collections: [wire] }, "collections").length, 1);
  assert.equal(narrowing.readEnvelopeMember("body", "collections"), undefined);
  assert.equal(narrowing.readEnvelopeMember(null, "collections"), undefined);
}

/** A detail note exactly as the producer shapes it. @returns {Record<string, unknown>} */
function detailNoteFixture() {
  /** @type {Record<string, unknown>} */
  const note = {};
  for (const column of NOTE_COLUMNS) {
    if (SECURE_STORAGE_COLUMNS.includes(column)) continue;
    note[column] = narrowing.NULLABLE_NOTE_COLUMNS.includes(column)
      || narrowing.NULLABLE_NOTE_DETAIL_COLUMNS.includes(column)
      ? null
      : `${column}-value`;
  }
  note.body_html = "<p>body</p>";
  note.links = [];
  note.linked_context = {};
  note.owner_display_name = "";
  note.tags = [];
  return note;
}

/** A list note exactly as the list projection shapes it. @returns {Record<string, unknown>} */
function listNoteFixture() {
  /** @type {Record<string, unknown>} */
  const note = {};
  for (const column of NOTE_LIST_COLUMNS) {
    note[column] = narrowing.NULLABLE_NOTE_COLUMNS.includes(column) ? null : `${column}-value`;
  }
  note.tags = [];
  return note;
}

/**
 * A host-realm copy of a value the sandbox produced.
 *
 * The narrowing functions run inside `vm`, so the arrays and objects they return carry that
 * realm's prototypes and `deepStrictEqual` refuses them for a reason that has nothing to do with
 * this contract. Comparing plain copies keeps the assertion about shape.
 * @template T
 * @param {T} value
 * @returns {T}
 */
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

/** @param {Record<string, unknown>} record @param {string} member */
function omit(record, member) {
  const { [member]: _removed, ...rest } = record;
  return rest;
}

/** @param {string} source @param {string} name @returns {string} */
function readFrozenTable(source, name) {
  const match = source.match(new RegExp(`const ${name} = Object\\.freeze\\(\\[[\\s\\S]*?\\]\\);`));
  assert.ok(match, `${name} must remain a frozen table this owner can read`);
  return match[0];
}

/** @param {string} source @param {string} name @returns {string[]} */
function readColumnList(source, name) {
  const match = source.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`));
  assert.ok(match, `${name} must remain a readable column list`);
  return [...match[1].matchAll(/"([a-z_]+)"/g)].map((entry) => entry[1]);
}

/** @param {string} source @param {string} functionName @returns {string[]} */
function readDeletedFields(source, functionName) {
  return [...extractFunctionBlock(source, functionName).matchAll(/delete safe\.(\w+);/g)].map((entry) => entry[1]);
}

/** @param {string} name @returns {string} */
function declarationBlock(name) {
  const match = declarationSource.match(new RegExp(`export interface ${name}[^{]*\\{[\\s\\S]*?\\n\\}`));
  assert.ok(match, `${name} must be declared`);
  return match[0];
}
