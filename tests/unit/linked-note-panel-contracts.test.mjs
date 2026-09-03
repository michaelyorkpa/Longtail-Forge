import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const service = read("src/modules/notes/notes.service.js");
const routes = read("src/modules/notes/notes.routes.js");
const panel = read("public/js/shared/notes-linked-panel.js");
const tasks = read("public/js/tasks.js");
const tasksView = read("views/protected/tasks.html");
const contracts = read("src/types/browser-contracts.d.ts");

/** @param {string} source @param {string} opener */
function functionBody(source, opener) {
  const start = source.indexOf(opener);
  assert.notEqual(start, -1, opener + " must exist");
  const end = source.indexOf("\n}\n", start);
  return source.slice(start, end === -1 ? source.length : end);
}

/** @param {string} name */
function declaredInterface(name) {
  // Matched with an optional `extends` clause: `BrowserLinkedNoteItem` extends the note columns,
  // and a scan that assumed a bare `{` would report it as undeclared.
  const match = new RegExp("export interface " + name + "(?: extends [^{]+)? \\{").exec(contracts);
  assert.ok(match, name + " must be declared");
  return contracts.slice(match.index, contracts.indexOf("\n}", match.index));
}

/** @param {string} declared */
function declaredMembers(declared) {
  return [...declared.matchAll(/^ {2}(\w+)\??:/gm)].map((entry) => entry[1]).sort();
}

/** The shared reader, instantiated from the panel's own source. */
function shippedReader() {
  /** @param {string} opener */
  const slice = (opener) => {
    const start = panel.indexOf(opener);
    assert.notEqual(start, -1, opener + " must exist in the panel source");
    return panel.slice(start, panel.indexOf("\n  }\n", start) + 4);
  };
  const tables = [...panel.matchAll(/const (LINKED_NOTE_SORTS|PANEL_WORKSPACE_TYPES|PANEL_NOTE_TEXT_COLUMNS|PANEL_NOTE_NULLABLE_COLUMNS|PANEL_ITEM_TEXT_MEMBERS|PANEL_WRITE_ACTIONS) = Object\.freeze\(\[[\s\S]*?\]\);/g)]
    .map((entry) => entry[0]);
  assert.equal(tables.length, 6, "all six reader tables must exist in the panel source");
  return new Function([
    ...tables,
    slice("function isPanelRecord(value) {"),
    slice("function hasPanelText(value, keys) {"),
    slice("function hasPanelNullableText(value, keys) {"),
    slice("function hasPanelBooleans(value, keys) {"),
    slice("function isLinkedNoteItem(value) {"),
    slice("function readLinkedNoteTarget(value) {"),
    slice("function readNotesModuleState(value) {"),
    slice("function readPanelActions(value, moduleState) {"),
    slice("function readPanelEmptyState(value) {"),
    slice("function readForTarget(body) {"),
    "return readForTarget;",
  ].join("\n"))();
}

const item = (overrides = {}) => ({
  archived_at: null, body_excerpt: "note body", client_id: null, created_at: "2026-09-01",
  created_by_user_id: null, deleted_at: null, import_source: null, import_source_id: null,
  imported_at: null, library_bucket: "reference", library_bucket_source: "manual",
  linked_user_id: null, note_collection_id: null, note_id: "note-1", note_type: "note",
  owner_user_id: null, project_id: null, security_mode: "normal", slug: null, status: "active",
  task_id: null, ticket_id: null, title: "A note", updated_at: "2026-09-02",
  updated_by_user_id: null, visibility: "workspace", workspace_id: "ws-1",
  id: "note-1", label: "A note", excerpt: "note body", sourceUrl: "/notes/note-1", links: [],
  ...overrides,
});
const moduleState = (overrides = {}) => ({
  enabled: true, historicalReadAccess: true, notesModuleEnabled: true, workspaceType: "business",
  ...overrides,
});
const actions = (overrides = {}) => ({
  canCreate: true, canLink: true, canUnlink: true, readonly: false, ...overrides,
});
const emptyState = () => ({
  action: { href: "notes.html?targetType=task&targetId=t1", label: "Add Note" },
  body: "Add a note when there is context worth preserving for this record.",
  title: "No linked notes yet.",
});
const target = () => ({ moduleId: "tasks", sourceUrl: "/tasks/t1", targetId: "t1", targetType: "task" });
/** One linked note, so the empty state is null. */
const body = (overrides = {}) => ({
  actions: actions(), count: 1, emptyState: null, linkedNotes: [item()],
  moduleState: moduleState(), notes: [{ note_id: "note-1" }], sort: "updated", target: target(),
  ...overrides,
});

describe("the linked-note panel producer", () => {
  const listBody = functionBody(service, "async function listForTarget(session, query = {}) {");

  it("reconstructs eight members with no top-level spread", () => {
    const at = listBody.indexOf("return {");
    const literal = listBody.slice(at, listBody.indexOf("\n  };", at));
    const members = [...literal.matchAll(/^ {4}(\w+)[:,]/gm)].map((entry) => entry[1]).sort();
    assert.deepEqual(
      members,
      ["actions", "count", "emptyState", "linkedNotes", "moduleState", "notes", "sort", "target"],
      "the envelope must carry exactly the eight declared members",
    );
    assert.ok(!literal.includes("..."), "a top-level spread would make the exact envelope unearned");
  });

  it("derives the count and both arrays from one sorted collection", () => {
    assert.match(listBody, /const shapedNotes = sorted\.map\(/, "notes must come from the sorted collection");
    assert.match(listBody, /const linkedNotes = sorted\.map\(\(note\) => shapeLinkedNotePanelItem\(note\)\);/,
      "linked notes must come from the same one");
    assert.match(listBody, /count: linkedNotes\.length,/, "the count must be that list's length");
    assert.match(listBody, /emptyState: linkedNotes\.length > 0 \? null : linkedNotePanelEmptyState\(target\),/,
      "the empty state must be null exactly when there is something to show");
  });

  it("gates the read on target access before anything is listed", () => {
    assert.match(listBody, /await assertTargetAccess\(session, target\);/, "target access must be asserted");
    assert.ok(
      listBody.indexOf("assertTargetAccess") < listBody.indexOf("notesRepository.listForTarget"),
      "and asserted before any note is read",
    );
    assert.match(listBody, /await filterAccessibleNotes\(session, notes\)/, "notes must be permission-filtered");
  });

  it("hands the result to the browser unchanged", () => {
    const at = routes.indexOf('notesRoutes.get("/notes/for-target"');
    assert.notEqual(at, -1, "the for-target route must exist");
    const route = routes.slice(at, routes.indexOf("}));", at));
    assert.match(route, /notesService\.listForTarget\(/, "the route must call the traced producer");
  });

  it("keeps the panel item's secure reduction", () => {
    const shaper = functionBody(service, "function shapeLinkedNotePanelItem(note = {}) {");
    for (const deleted of ["body_markdown", "body_plaintext_index", "metadata_json"]) {
      assert.ok(shaper.includes("delete shaped." + deleted), "the panel item must delete " + deleted);
      assert.ok(
        !declaredInterface("BrowserLinkedNoteItem").includes(deleted),
        "and the contract must not promise " + deleted,
      );
    }
    assert.match(shaper, /excerpt: isEffectivelySecureNote\(shaped\) \? null : shaped\.body_excerpt \|\| ""/,
      "a secure note's excerpt must be nulled rather than shown");
  });

  it("keeps the action hints display-only, decided by the server", () => {
    const shaper = functionBody(service, "async function linkedNotePanelActions(session, moduleState = {}) {");
    assert.match(shaper, /permissionsService\.can\(session, NOTE_PERMISSIONS\.CREATE/, "create must be a permission answer");
    assert.match(shaper, /permissionsService\.can\(session, NOTE_PERMISSIONS\.MANAGE_LINKS/, "so must link management");
    assert.match(shaper, /const canWriteNotes = Boolean\(moduleState\.enabled\);/, "and gated on module writability");
    assert.match(shaper, /readonly: !canWriteNotes,/, "readonly must be the negation of that");
  });

  it("closes the sort vocabulary in the set the options normalise through", () => {
    const match = /const LINKED_NOTE_SORT_MODES = new Set\(\[([\s\S]*?)\]\)/.exec(service);
    assert.ok(match, "the sort set must be a literal this proof can read");
    const produced = [...match[1].matchAll(/"(\w+)"/g)].map((entry) => entry[1]).sort();
    assert.deepEqual(produced, ["pinned", "recent", "title", "updated"], "the set must hold exactly four modes");
    assert.match(
      functionBody(service, "function normalizeLinkedNotePanelOptions(query = {}) {"),
      /LINKED_NOTE_SORT_MODES\.has\(sort\) \? sort : "updated"/,
      "anything outside it must fall back rather than pass through",
    );
    const declared = /export type BrowserLinkedNoteSort = ([^;]+);/.exec(contracts);
    assert.ok(declared, "BrowserLinkedNoteSort must be declared");
    assert.deepEqual(
      [...declared[1].matchAll(/"(\w+)"/g)].map((entry) => entry[1]).sort(),
      produced,
      "the declared union must be the producer's own set",
    );
    const table = /const LINKED_NOTE_SORTS = Object\.freeze\(\[([\s\S]*?)\]\);/.exec(panel);
    assert.ok(table, "the reader must carry the vocabulary as a frozen table");
    assert.deepEqual(
      [...table[1].matchAll(/"(\w+)"/g)].map((entry) => entry[1]).sort(),
      produced,
      "and that table must be the producer's own set",
    );
  });
});

describe("the declarations", () => {
  it("declares the producer's own eight members", () => {
    const declared = declaredInterface("BrowserLinkedNotePanelResponse");
    const listBody = functionBody(service, "async function listForTarget(session, query = {}) {");
    const at = listBody.indexOf("return {");
    const produced = [...listBody.slice(at, listBody.indexOf("\n  };", at)).matchAll(/^ {4}(\w+)[:,]/gm)]
      .map((entry) => entry[1]).sort();
    assert.deepEqual(declaredMembers(declared), produced, "declared membership must equal the producer's literal");
    assert.ok(!/^ {2}\w+\?:/m.test(declared), "no envelope member may be optional");
  });

  it("leaves the compatibility projection opaque on purpose", () => {
    assert.match(declaredInterface("BrowserLinkedNotePanelResponse"), /notes: unknown\[\];/,
      "notes must stay an unnamed container");
    assert.ok(
      !/panel\.notes\[|state\.panel\?\.notes/.test(panel) && !/\.notes\[0\]/.test(tasks),
      "and no consumer on this path may read into one",
    );
  });

  it("reuses the published linked-note item rather than inventing a second projection", () => {
    assert.match(declaredInterface("BrowserLinkedNotePanelResponse"), /linkedNotes: BrowserLinkedNoteItem\[\];/,
      "the panel list must carry the published item");
    assert.match(contracts, /export interface BrowserLinkedNoteItem extends BrowserNoteColumns \{/,
      "which must still be the note-column projection it was drawn as");
  });

  it("names the four nested records the producer reconstructs", () => {
    assert.deepEqual(declaredMembers(declaredInterface("BrowserLinkedNoteTarget")),
      ["moduleId", "sourceUrl", "targetId", "targetType"], "the target record must be the four named members");
    assert.deepEqual(declaredMembers(declaredInterface("BrowserNotesModuleState")),
      ["enabled", "historicalReadAccess", "notesModuleEnabled", "workspaceType"], "and the module state its four");
    assert.deepEqual(declaredMembers(declaredInterface("BrowserLinkedNotePanelActions")),
      ["canCreate", "canLink", "canUnlink", "readonly"], "and the actions its four");
    assert.deepEqual(declaredMembers(declaredInterface("BrowserLinkedNotePanelEmptyState")),
      ["action", "body", "title"], "and the empty state its three");
  });

  it("keeps the target type open rather than closing a vocabulary it does not check", () => {
    assert.match(declaredInterface("BrowserLinkedNoteTarget"), /targetType: string;/,
      "the target type must stay open text");
    assert.ok(
      !panel.includes("LINKED_TARGET_TYPES"),
      "because this reader does not validate the linked-target vocabulary",
    );
  });

  it("puts the reader on the already-declared panel surface", () => {
    assert.match(declaredInterface("BrowserNotesLinkedPanel"),
      /readForTarget\(body: unknown\): BrowserLinkedNotePanelResponse \| null;/,
      "the surface must declare the shared reader");
    assert.match(panel, /namespace\.notesLinkedPanel = \{\n {4}mount,\n {4}readForTarget,\n {2}\};/,
      "and publish it beside what it already had");
  });
});

describe("the shipped reader, run against real bodies", () => {
  const readForTarget = shippedReader();

  it("accepts a real response", () => {
    const result = readForTarget(body());
    assert.ok(result, "a valid response must be accepted");
    assert.equal(result.count, 1, "the count must survive");
    assert.equal(result.linkedNotes[0].note_id, "note-1", "and so must the list");
    assert.equal(result.sort, "updated", "and the sort mode");
  });

  it("accepts a target with no linked notes and its empty state", () => {
    const result = readForTarget(body({ count: 0, linkedNotes: [], notes: [], emptyState: emptyState() }));
    assert.ok(result, "an empty panel is a real answer");
    assert.equal(result.count, 0, "with a real zero");
    assert.equal(result.emptyState?.title, "No linked notes yet.", "and the producer's own empty state");
  });

  it("refuses a body missing any of the eight members", () => {
    for (const key of ["actions", "count", "emptyState", "linkedNotes", "moduleState", "notes", "sort", "target"]) {
      const partial = Object.fromEntries(Object.entries(body()).filter(([name]) => name !== key));
      assert.equal(readForTarget(partial), null, "a body without " + key + " must be refused");
    }
    for (const bad of [null, undefined, 7, "panel", []]) {
      assert.equal(readForTarget(bad), null, "a primitive body must be refused: " + String(bad));
    }
  });

  it("refuses a count that disagrees with the list it counts", () => {
    assert.equal(readForTarget(body({ count: 2 })), null, "a count above the list must be refused");
    assert.equal(readForTarget(body({ count: 0 })), null, "and one below it");
    for (const bad of ["1", 1.5, -1, null, Number.NaN]) {
      assert.equal(readForTarget(body({ count: bad })), null, "an unusable count must be refused: " + String(bad));
    }
  });

  it("refuses when the two projections disagree in length", () => {
    assert.equal(readForTarget(body({ notes: [] })), null, "the compatibility list must match the panel list");
    assert.equal(readForTarget(body({ notes: [{}, {}] })), null, "in both directions");
  });

  it("accepts compatibility elements it never promised to read", () => {
    const wireNotes = [{ anything: true, at: null }];
    const result = readForTarget(body({ notes: wireNotes }));
    assert.ok(result, "an unpromised element shape must not refuse the response");
    assert.equal(result.notes, wireNotes, "and must travel on untouched, as the array the producer sent");
  });

  it("refuses the response when one linked note is malformed", () => {
    for (const broken of [
      item({ note_id: "" }),
      item({ title: null }),
      item({ visibility: undefined }),
      item({ excerpt: 7 }),
      item({ archived_at: 7 }),
      item({ note_collection_id: [] }),
      item({ links: "none" }),
      item({ label: 3 }),
      "note",
    ]) {
      assert.equal(
        readForTarget(body({ count: 2, notes: [{}, {}], linkedNotes: [item(), broken] })),
        null,
        "a malformed linked note must refuse the panel: " + JSON.stringify(broken).slice(0, 60),
      );
    }
  });

  it("accepts a secure note's nulled excerpt", () => {
    const result = readForTarget(body({ linkedNotes: [item({ excerpt: null, body_excerpt: null })] }));
    assert.ok(result, "a secure note's nulled excerpt is what the producer sends");
    assert.equal(result.linkedNotes[0].excerpt, null, "and must be answered as null");
  });

  it("refuses a module state it cannot vouch for", () => {
    for (const bad of [
      moduleState({ enabled: "yes" }),
      moduleState({ historicalReadAccess: undefined }),
      moduleState({ workspaceType: "enterprise" }),
      moduleState({ workspaceType: null }),
      "state",
    ]) {
      assert.equal(readForTarget(body({ moduleState: bad })), null,
        "an unusable module state must refuse the response");
    }
  });

  it("refuses actions that contradict the module state that produced them", () => {
    assert.equal(
      readForTarget(body({
        moduleState: moduleState({ enabled: false }),
        // Every write hint false, so this body violates the readonly rule and nothing else.
        actions: actions({ canCreate: false, canLink: false, canUnlink: false, readonly: false }),
      })),
      null,
      "a disabled module cannot answer a writable panel",
    );
    assert.equal(
      readForTarget(body({
        moduleState: moduleState({ enabled: false }),
        actions: actions({ canCreate: true, canLink: false, canUnlink: false, readonly: true }),
      })),
      null,
      "nor advertise a write action while it cannot be written",
    );
    const denied = readForTarget(body({
      actions: actions({ canCreate: false, canLink: false, canUnlink: false, readonly: false }),
    }));
    assert.ok(denied, "but an enabled module whose permissions deny everything is ordinary");
  });

  it("refuses an empty state that contradicts the count", () => {
    assert.equal(readForTarget(body({ emptyState: emptyState() })), null,
      "a populated panel must not carry an empty state");
    assert.equal(readForTarget(body({ count: 0, linkedNotes: [], notes: [], emptyState: null })), null,
      "and an empty one must carry the producer's");
    assert.equal(
      readForTarget(body({ count: 0, linkedNotes: [], notes: [], emptyState: { title: "x", body: "y" } })),
      null,
      "a malformed empty state must not become a generic message",
    );
  });

  it("refuses a sort mode the producer cannot answer", () => {
    for (const bad of ["created", "", null, undefined, 7]) {
      assert.equal(readForTarget(body({ sort: bad })), null, "an unproducible sort must be refused: " + String(bad));
    }
  });
});

describe("the two consumers", () => {
  it("no longer trust the raw response", () => {
    assert.ok(!panel.includes("panel.linkedNotes || []"), "the panel's raw list default must be gone");
    assert.ok(!tasks.includes("Number(result.count) || 0"), "the Tasks coerced zero must be gone");
  });

  it("share the one reader on the delivered surface", () => {
    assert.match(panel, /const panel = readForTarget\(await api\.getJson\(/, "the panel must use the shared reader");
    assert.match(tasks, /requireNotesLinkedPanel\(\)\.readForTarget\(result\)/,
      "and Tasks must reach it through the surface rather than copying it");
    assert.ok(
      !tasks.includes("function readForTarget"),
      "Tasks must not carry its own copy of the reader",
    );
    const surfaceAt = tasksView.indexOf("js/shared/notes-linked-panel.js");
    const pageAt = tasksView.indexOf("js/tasks.js");
    // Both looked up before comparing: an absent tag answers -1, which would otherwise read as
    // "loaded first" and let the delivery guarantee disappear without failing anything.
    assert.notEqual(surfaceAt, -1, "the Tasks view must deliver the panel surface at all");
    assert.notEqual(pageAt, -1, "and its own script");
    assert.ok(surfaceAt < pageAt, "and the surface must be delivered before the page that uses it");
  });

  it("acquires the surface honestly rather than optional-chaining past it", () => {
    const accessor = functionBody(tasks, "  function requireNotesLinkedPanel() {");
    assert.match(accessor, /throw new Error\("Tasks requires LongtailForge\.notesLinkedPanel\./,
      "a missing surface must fail rather than be skipped");
  });

  it("both refuse rather than inventing a value", () => {
    assert.match(panel, /throw new Error\("Linked notes could not be read\./,
      "the panel must refuse an unreadable response");
    assert.match(tasks, /throw new Error\("Linked note count could not be read\./,
      "and Tasks must refuse rather than record a zero the response never stated");
  });
});
