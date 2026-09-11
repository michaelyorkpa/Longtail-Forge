import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { setImmediate } from "node:timers";
import { extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
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
  const context = vm.createContext({});
  return vm.runInContext([
    "const REQUIRED_NOTE_COLUMNS = " + JSON.stringify(readTable("REQUIRED_NOTE_COLUMNS")) + ";",
    "const NULLABLE_NOTE_COLUMNS = " + JSON.stringify(readTable("NULLABLE_NOTE_COLUMNS")) + ";",
    "const REQUIRED_NOTE_DETAIL_COLUMNS = " + JSON.stringify(readTable("REQUIRED_NOTE_DETAIL_COLUMNS")) + ";",
    "const NULLABLE_NOTE_DETAIL_COLUMNS = " + JSON.stringify(readTable("NULLABLE_NOTE_DETAIL_COLUMNS")) + ";",
    "const OPTIONAL_NOTE_DETAIL_MEMBERS = " + JSON.stringify(readTable("OPTIONAL_NOTE_DETAIL_MEMBERS")) + ";",
    extractFunctionBlock(page, "isResponseRecord"),
    extractFunctionBlock(page, "hasTextColumns"),
    extractFunctionBlock(page, "hasNullableTextColumns"),
    extractFunctionBlock(page, "hasArrayMembers"),
    extractFunctionBlock(page, "hasOptionalTextColumns"),
    extractFunctionBlock(page, "isNoteListItem"),
    extractFunctionBlock(page, "isNoteRecord"),
    extractFunctionBlock(page, "requireNoteFromEnvelope"),
    extractFunctionBlock(page, "hasNoteIdentity"),
    extractFunctionBlock(page, "requireNoteMutationId"),
    "({ requireNoteFromEnvelope, isNoteRecord, requireNoteMutationId })",
  ].join("\n"), context);
}

/** @param {string} name */
function readTable(name) {
  const at = page.indexOf("const " + name + " = Object.freeze([");
  assert.notEqual(at, -1, name + " must exist");
  const body = page.slice(at, page.indexOf("]);", at));
  return [...body.matchAll(/"([a-z_]+)"/g)].map((entry) => entry[1]);
}

/** A full-detail fixture; archive/restore do NOT attach these detail integrations. */
function detailRecord(overrides = {}) {
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

describe("the adoption distinguishes identity from full detail", () => {
  it("adds no second full note record or full-detail parser", () => {
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

  it("requires a usable mutation identity without inventing a fallback", () => {
    const { requireNoteMutationId } = shippedReader();
    assert.equal(requireNoteMutationId({ note: { note_id: " note_1 " } }), " note_1 ");
    for (const note_id of [undefined, null, "", " ", "\t\n", 7, false, {}, ["note_1"]]) {
      assert.throws(() => requireNoteMutationId({ note: { note_id } }), /usable note ID/);
    }
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

describe("the shipped full-detail reader, run against its promised shape", () => {
  const { requireNoteFromEnvelope, isNoteRecord } = shippedReader();

  it("answers a full detail by identity", () => {
    const note = detailRecord();
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
    assert.equal(isNoteRecord(detailRecord({ note_id: "" })), false,
      "an empty identifier is not a note this page can select");
    assert.throws(() => requireNoteFromEnvelope({ note: detailRecord({ note_id: "" }) }),
      /The note response did not contain a note\./,
      "so the envelope carrying it is refused");
  });

  it("refuses a note that is malformed in any promised column", () => {
    for (const key of ["note_id", "title", "status", "body_markdown", "owner_display_name"]) {
      assert.throws(() => requireNoteFromEnvelope({ note: detailRecord({ [key]: null }) }),
        /The note response did not contain a note\./,
        "a malformed " + key + " must refuse the envelope");
    }
    assert.throws(() => requireNoteFromEnvelope({ note: detailRecord({ links: undefined }) }),
      /The note response did not contain a note\./,
      "and so must a missing links collection");
  });
});

describe("the notes consumer", () => {
  const mutate = functionBody(page, "  async function mutateNote(url) {", "\n  }\n");

  it("no longer reads the identifier off an unvouched body", () => {
    assert.ok(!page.includes("result.note.note_id"), "the raw identity read must be gone");
  });

  it("reads minimal mutation envelopes while refusing malformed envelopes", () => {
    const { requireNoteMutationId, requireNoteFromEnvelope } = shippedReader();
    for (const status of ["archived", "active"]) {
      const result = { note: { note_id: "note_1", status } };
      assert.equal(requireNoteMutationId(result), "note_1");
      assert.throws(() => requireNoteFromEnvelope(result), /did not contain a note/);
    }
    for (const bad of [undefined, null, [], 3, "note", {}, { note: null }, { note: [] }, { note: "note_1" }]) {
      assert.throws(() => requireNoteMutationId(bad), /usable note ID/);
    }
    assert.throws(() => requireNoteMutationId({ note: Object.assign([], { note_id: "note_1" }) }), /usable note ID/);
  });

  it("keeps the full-detail promise strict for tags, links and owner information", () => {
    const { requireNoteFromEnvelope } = shippedReader();
    for (const key of ["tags", "links", "owner_display_name"]) {
      for (const value of [undefined, null, 1, {}]) {
        assert.throws(() => requireNoteFromEnvelope({ note: detailRecord({ [key]: value }) }), /did not contain a note/);
      }
    }
  });

  it("refreshes both lists after writing and before reading identity, then selects the authoritative detail", async () => {
    const f = mutationFixture();
    const mutation = f.api.mutateNote("/api/notes/note_1/archive");
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(f.calls, ["post", "collections", "notes"]);
    assert.equal(f.identityReads(), 0);
    f.releaseCollections(); await new Promise((resolve) => setImmediate(resolve));
    assert.equal(f.identityReads(), 0);
    f.releaseNotes(); await mutation;
    assert.deepEqual(f.calls, ["post", "collections", "notes", "get:note_1", "detail:note_1", "render", "close-drawer", "url:note_1"]);
    assert.equal(f.context.state.selectedNote, f.detail);
    assert.ok(f.identityReads() > 0);
    assert.deepEqual(f.status.at(-1), ["", undefined]);
  });

  it("never replays a committed mutation when its response, refresh or detail read is unreadable", async () => {
    for (const failure of ["response", "collections", "notes", "detail", "detail-shape"]) {
      const f = mutationFixture(failure); f.releaseCollections(); f.releaseNotes();
      await assert.doesNotReject(() => f.api.mutateNote("/api/notes/note_1/restore"));
      assert.equal(f.calls.filter((call) => call === "post").length, 1, failure);
      assert.equal(f.calls.includes("detail:note_1"), false, failure);
      assert.match(String(f.status.at(-1)?.[0]), /Note was updated, but/);
      assert.equal(f.status.at(-1)?.[1], true);
      if (failure === "response") assert.deepEqual(f.calls, ["post", "collections", "notes"]);
    }
  });

  it("preserves the failed-write error path without claiming success or starting refresh", async () => {
    const f = mutationFixture("post"); f.releaseCollections(); f.releaseNotes();
    await assert.doesNotReject(() => f.api.mutateNote("/api/notes/note_1/archive"));
    assert.deepEqual(f.calls, ["post"]);
    assert.deepEqual(f.status.at(-1), ["Note update could not be confirmed. Reload Notes to check its current state.", true]);
    assert.doesNotMatch(mutate, /alert\(|showModal|window\.confirm/);
  });

  it("reports an unconfirmed outcome when the shared API cannot parse a successful write response", async () => {
    const f = mutationFixture("post-response"); f.releaseCollections(); f.releaseNotes();
    await assert.doesNotReject(() => f.api.mutateNote("/api/notes/note_1/archive"));
    assert.equal(f.committedWrites(), 1);
    assert.deepEqual(f.calls, ["post"]);
    assert.deepEqual(f.status.at(-1), ["Note update could not be confirmed. Reload Notes to check its current state.", true]);
  });

  it("leaves the other Notes producers to their own children", () => {
    // `result.revisions || []` was on this list until `0.33.33.38.4.12.3` adopted the revision
    // history boundary. A sibling child doing its job is not this one widening, so the claim is
    // asserted against that reader - anchored on the call site, because the reader's own
    // definition also contains its name.
    assert.match(page, /readNoteRevisions\(await api\.getJson\(`\/api\/notes\/\$\{encodeURIComponent\(note\.note_id\)\}\/revisions`/,
      "the revision history is another child's read and is untouched");
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

/** @param {string} [failure] */
function mutationFixture(failure = "") {
  const detail = detailRecord();
  /** @type {string[]} */ const calls = [];
  /** @type {unknown[][]} */ const status = [];
  let releaseCollections = () => {}, releaseNotes = () => {}, reads = 0, writes = 0;
  const parseResponse = vm.runInNewContext(`${extractFunctionBlock(read("public/js/shared/api-client.js"), "parseJsonResponse")}\nparseJsonResponse`);
  const collections = new Promise((resolve) => { releaseCollections = () => resolve(undefined); });
  const notes = new Promise((resolve) => { releaseNotes = () => resolve(undefined); });
  const result = failure === "response" ? { note: { note_id: [] } } : { note: { get note_id() { reads += 1; return "note_1"; } } };
  const context = vm.createContext({
    ...shippedReader(), state: { selectedNote: null },
    requireApi: () => ({
      postJson: async () => {
        calls.push("post"); if (failure === "post") throw Error("private write error");
        writes += 1;
        return failure === "post-response" ? parseResponse(new globalThis.Response("not JSON", { status: 200 })) : result;
      },
      getJson: async (/** @type {string} */ url) => {
        calls.push(`get:${url.split("/").at(-1)}`);
        if (failure === "detail") throw Error("private read error");
        return { note: failure === "detail-shape" ? { ...detail, tags: null } : detail };
      },
    }),
    loadCollections: async () => { calls.push("collections"); await collections; if (failure === "collections") throw Error("private collections error"); },
    loadNotes: async () => { calls.push("notes"); await notes; if (failure === "notes") throw Error("private list error"); },
    setStatus: (/** @type {unknown} */ text, /** @type {unknown} */ error) => status.push([text, error]),
    safeNoteErrorMessage: (/** @type {unknown} */ error, /** @type {string} */ fallback) => fallback,
    renderDetail: (/** @type {{note_id: string}} */ note) => calls.push(`detail:${note.note_id}`),
    renderNotes: () => calls.push("render"), closeNotesSlideOutDrawer: () => calls.push("close-drawer"),
    updateUrl: (/** @type {string} */ id) => calls.push(`url:${id}`),
    renderDetailPrompt: () => calls.push("prompt"), isSecureError: () => false,
  });
  vm.runInContext(["mutateNote", "selectNote"].map((name) => extractFunctionBlock(page, name)).join("\n"), context);
  return { context, detail, calls, status, releaseCollections, releaseNotes, identityReads: () => reads, committedWrites: () => writes,
    api: vm.runInContext("({mutateNote,selectNote})", context) };
}
