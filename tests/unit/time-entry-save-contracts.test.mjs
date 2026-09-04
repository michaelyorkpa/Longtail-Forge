import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const dialog = read("public/js/time-entry-dialog.js");
const service = read("src/modules/time-tracking/time-entries.service.js");
const routes = read("src/modules/time-tracking/time-entries.routes.js");
const contracts = read("src/types/browser-contracts.d.ts");

/** @param {string} source @param {string} opener @param {string} [closer] */
function functionBody(source, opener, closer = "\n}\n") {
  const start = source.indexOf(opener);
  assert.notEqual(start, -1, opener + " must exist");
  const end = source.indexOf(closer, start);
  return source.slice(start, end === -1 ? source.length : end);
}

/** The shipped readers, instantiated from the dialog's own source. */
function shippedReaders() {
  /** @param {string} opener */
  const slice = (opener) => {
    const start = dialog.indexOf(opener);
    assert.notEqual(start, -1, opener + " must exist in the dialog source");
    return dialog.slice(start, dialog.indexOf("\n  }\n", start) + 4);
  };
  const storage = /const SAVED_TIME_ENTRY_STORAGE = "([a-z]+)";/.exec(dialog);
  assert.ok(storage, "the storage literal must exist");
  return new Function([
    'const SAVED_TIME_ENTRY_STORAGE = "' + storage[1] + '";',
    slice("  function isSaveResponseRecord(value) {"),
    slice("  function nestedSavedEntryId(result) {"),
    slice("  function readCreatedTimeEntryId(body) {"),
    slice("  function readUpdatedTimeEntryId(body, requestedEntryId) {"),
    "return { readCreatedTimeEntryId, readUpdatedTimeEntryId };",
  ].join("\n"))();
}

const { readCreatedTimeEntryId, readUpdatedTimeEntryId } = shippedReaders();

/**
 * The literal the producer writes, read from the service rather than the dialog.
 * @returns {string}
 */
function producerStorageLiteral() {
  const create = functionBody(service, "async function createFromActiveTimer(entry, session) {");
  const update = functionBody(service, "async function update(rawPayload, entryId, session) {");
  const fromCreate = /return \{\n\s+entry: [^\n]+\n\s+entry_id: entryId,\n\s+storage: "([a-z]+)",/.exec(create);
  const fromUpdate = /return \{ entry: taggedEntry, storage: "([a-z]+)" \};/.exec(update);
  assert.ok(fromCreate, "the create result must name a storage backend");
  assert.ok(fromUpdate, "the update result must name a storage backend");
  assert.equal(fromCreate[1], fromUpdate[1], "and both routes must currently write the same one");
  return fromCreate[1];
}

/**
 * A decorated entry as `decorateRecordsForTarget` answers one.
 * @param {Record<string, unknown>} [overrides]
 * @returns {Record<string, unknown>}
 */
function savedEntry(overrides = {}) {
  return {
    entry_id: "entry_1",
    workspace_id: "workspace_1",
    user_id: "user_1",
    client_id: "client_1",
    client_name: "Acme",
    project_id: "project_1",
    project_name: "Rewrite",
    description: "Worked on the rewrite",
    start_time: "2026-09-01T09:00:00.000Z",
    end_time: "2026-09-01T10:00:00.000Z",
    duration_seconds: 3600,
    duration_hours: "1.0000",
    billable: 1,
    invoice_status: "uninvoiced",
    tags: [],
    ...overrides,
  };
}

/** What `POST /api/time-entries` answers. */
/**
 * @param {Record<string, unknown>} [overrides]
 * @returns {Record<string, unknown>}
 */
function createResult(overrides = {}) {
  return { entry: savedEntry(), entry_id: "entry_1", storage: producerStorageLiteral(), ...overrides };
}

/** What `PUT /api/time-entries/:entryId` answers. */
/**
 * @param {Record<string, unknown>} [overrides]
 * @returns {Record<string, unknown>}
 */
function updateResult(overrides = {}) {
  return { entry: savedEntry(), storage: producerStorageLiteral(), ...overrides };
}

describe("the create result is read as the create result", () => {
  it("accepts a valid create response", () => {
    assert.equal(readCreatedTimeEntryId(createResult()), "entry_1", "the minted identity comes back");
  });

  it("refuses a response with no outer identity", () => {
    const body = Object.fromEntries(Object.entries(createResult()).filter(([key]) => key !== "entry_id"));
    assert.ok(!Object.hasOwn(body, "entry_id"), "the fixture must genuinely lack it");
    assert.equal(readCreatedTimeEntryId(body), "", "the create producer sends one, so a response without it is not one");
    for (const value of [null, 7, "", undefined]) {
      assert.equal(readCreatedTimeEntryId(createResult({ entry_id: value })), "",
        JSON.stringify(value ?? String(value)) + " is not a minted identity");
    }
  });

  it("refuses a response with no nested entry or no nested identity", () => {
    for (const entry of [null, undefined, "", 7, [], "entry"]) {
      assert.equal(readCreatedTimeEntryId(createResult({ entry })), "",
        JSON.stringify(entry ?? String(entry)) + " is not a saved entry");
    }
    for (const value of [null, 7, "", undefined]) {
      assert.equal(readCreatedTimeEntryId(createResult({ entry: savedEntry({ entry_id: value }) })), "",
        "a nested entry without a usable identity is not one either");
    }
    // Every non-record fixture above also lacks the member, so optional chaining would answer for
    // the record check. An array that carries one is what makes that check load-bearing.
    assert.equal(readCreatedTimeEntryId(createResult({ entry: Object.assign([], { entry_id: "entry_1" }) })), "",
      "an array is not a saved entry even when it carries the identity");
  });

  it("refuses a response whose outer and nested identities disagree", () => {
    assert.equal(readCreatedTimeEntryId(createResult({ entry_id: "entry_2" })), "",
      "two statements about the same new record must agree");
    assert.equal(readCreatedTimeEntryId(createResult({ entry: savedEntry({ entry_id: "entry_9" }) })), "",
      "in either direction");
  });

  it("refuses a response naming a different storage backend", () => {
    for (const storage of ["memory", "", null, undefined, 7, "Database"]) {
      assert.equal(readCreatedTimeEntryId(createResult({ storage })), "",
        JSON.stringify(storage ?? String(storage)) + " is not the backend this producer writes");
    }
    const inDialog = /const SAVED_TIME_ENTRY_STORAGE = "([a-z]*)";/.exec(dialog);
    assert.ok(inDialog, "the dialog names a storage backend");
    assert.equal(inDialog[1], producerStorageLiteral(),
      "and the dialog checks the exact literal the producer writes, read from the producer");
  });

  it("refuses a body that is not a save response at all", () => {
    for (const body of [null, undefined, "", "body", 0, false, []]) {
      assert.equal(readCreatedTimeEntryId(body), "", String(body) + " is not a save response");
    }
    assert.equal(readCreatedTimeEntryId(Object.assign([], createResult())), "",
      "an array is not a save response even when it carries the members");
  });
});

describe("the update result is read as the update result", () => {
  it("accepts a valid update response for the entry it addressed", () => {
    assert.equal(readUpdatedTimeEntryId(updateResult(), "entry_1"), "entry_1", "the confirmed identity comes back");
  });

  it("refuses a response confirming a different record", () => {
    assert.equal(readUpdatedTimeEntryId(updateResult(), "entry_2"), "",
      "a save that returns a different record must not be reported as an edit of the one being edited");
    assert.equal(readUpdatedTimeEntryId(updateResult({ entry: savedEntry({ entry_id: "entry_7" }) }), "entry_1"), "",
      "in either direction");
  });

  it("refuses when the route identity itself is missing", () => {
    assert.equal(readUpdatedTimeEntryId(updateResult(), ""), "",
      "an empty requested identity cannot confirm anything, and must not match an empty nested one");
  });

  it("refuses a response with no nested identity", () => {
    for (const entry of [null, undefined, "", 7, []]) {
      assert.equal(readUpdatedTimeEntryId(updateResult({ entry }), "entry_1"), "",
        JSON.stringify(entry ?? String(entry)) + " is not a saved entry");
    }
    assert.equal(readUpdatedTimeEntryId(updateResult({ entry: savedEntry({ entry_id: 7 }) }), "entry_1"), "",
      "and a non-string identity is not one");
  });

  it("neither requires nor invents an outer identity", () => {
    assert.equal(readUpdatedTimeEntryId(updateResult(), "entry_1"), "entry_1",
      "a response with no outer entry_id is exactly what this producer sends");
    const reader = functionBody(dialog, "  function readUpdatedTimeEntryId(body, requestedEntryId) {", "\n  }\n");
    assert.doesNotMatch(reader, /body\.entry_id/, "so the reader never reads one");
    const declared = functionBody(contracts, "export interface BrowserTimeEntryUpdateResult {", "\n}\n");
    assert.doesNotMatch(declared, /entry_id\??: string;/, "and the contract never promises one");
    assert.doesNotMatch(declared, /entry_id\?:/, "not even as an optional member");
  });

  it("refuses a response naming a different storage backend", () => {
    for (const storage of ["memory", "", null, undefined]) {
      assert.equal(readUpdatedTimeEntryId(updateResult({ storage }), "entry_1"), "",
        JSON.stringify(storage ?? String(storage)) + " is not the backend this producer writes");
    }
  });
});

describe("the branch decides which reader runs, not the shape of the body", () => {
  it("does not accept the other route's body", () => {
    assert.equal(readCreatedTimeEntryId(updateResult()), "",
      "an update body has no outer identity, so the create reader refuses it");
    const created = createResult({ entry_id: "entry_1" });
    assert.equal(readUpdatedTimeEntryId(created, "entry_2"), "",
      "and a create body confirms nothing about an entry the update route addressed");
  });

  it("selects the reader from the control-flow fact the dialog already has", () => {
    const save = functionBody(dialog, "  async function saveEntry(event) {", "\n  }\n");
    assert.match(save, /const savedEntryId = selectedEntry\n\s+\? readUpdatedTimeEntryId\(result, selectedEntry\.entryId\)\n\s+: readCreatedTimeEntryId\(result\);/,
      "the same selectedEntry that chose the route chooses the reader");
    const route = save.indexOf("? await api.putJson(");
    const reader = save.indexOf("? readUpdatedTimeEntryId(");
    assert.notEqual(route, -1, "the route is selected on it");
    assert.notEqual(reader, -1, "and so is the reader");
    assert.ok(route < reader, "in that order");
  });

  it("leaves no fallback chain that merges the two producer shapes", () => {
    assert.doesNotMatch(dialog, /result\.entry_id \|\| result\.entry\?\.entry_id/,
      "the fallback chain that fabricated an empty identity must be gone");
    assert.doesNotMatch(dialog, /selectedEntry\?\.entryId \|\| result/, "and so must its selectedEntry head");
    const save = functionBody(dialog, "  async function saveEntry(event) {", "\n  }\n");
    // Scoped to the whole assignment rather than its first line: the expression spans three lines,
    // so a line-anchored scan could not see a fallback appended to the last one.
    const at = save.indexOf("const savedEntryId =");
    assert.notEqual(at, -1, "the identity must be assigned");
    const assignment = save.slice(at, save.indexOf(";", at));
    assert.doesNotMatch(assignment, /\|\|/, "the identity is derived, not defaulted");
  });

  it("publishes two results rather than one with an optional member", () => {
    for (const name of ["BrowserTimeEntryCreateResult", "BrowserTimeEntryUpdateResult", "BrowserSavedTimeEntryIdentity"]) {
      assert.equal((contracts.match(new RegExp("export interface " + name + "\\b", "g")) || []).length, 1, "one " + name);
    }
    for (const invented of ["BrowserTimeEntrySaveResult", "BrowserSavedTimeEntryResponse"]) {
      assert.ok(!contracts.includes(invented), invented + " would flatten two producers into one shape");
    }
    const create = functionBody(contracts, "export interface BrowserTimeEntryCreateResult {", "\n}\n");
    assert.match(create, /^ {2}entry_id: string;$/m, "the create result requires the outer identity");
    assert.doesNotMatch(create, /entry_id\?:/, "rather than making it optional");
  });
});

describe("the host is told nothing the response could not vouch for", () => {
  const save = functionBody(dialog, "  async function saveEntry(event) {", "\n  }\n");

  it("refuses before the callback, the completion and the close", () => {
    const refusal = save.indexOf('if (savedEntryId === "") {');
    assert.notEqual(refusal, -1, "an unidentifiable save must be refused");
    assert.match(save, /if \(savedEntryId === ""\) \{\n\s+throw new Error\("The saved time entry could not be identified\."\);\n\s+\}/,
      "by throwing into the existing catch");
    for (const [name, needle] of [
      ["the saved callback", "await context.onSaved({ ...result, entryId: savedEntryId });"],
      ["the host completion", "context?.hostContext?.complete?.({"],
      ["the dialog close", 'dialog.close("complete");'],
    ]) {
      const at = save.indexOf(needle);
      assert.notEqual(at, -1, name + " must still happen on a good save");
      assert.ok(refusal < at, "and the refusal must come before " + name);
    }
  });

  it("reports the validated identity to the host", () => {
    assert.match(save, /recordId: savedEntryId,/, "the completion carries the identity the reader vouched for");
    assert.match(save, /actionId: selectedEntry \? "time-entries\.edit" : "time-entries\.add",/,
      "and the action still comes from the same branch");
  });

  it("hands the callback the producer's own result", () => {
    assert.match(save, /await context\.onSaved\(\{ \.\.\.result, entryId: savedEntryId \}\);/,
      "the response is spread rather than rebuilt, so the decorated entry travels on whole");
    assert.doesNotMatch(save, /onSaved\(\{ entryId|onSaved\(\{ entry_id/, "nothing is truncated for the callback");
  });

  it("adds no new failure surface to the dialog", () => {
    assert.match(save, /\} catch \(error\) \{\n\s+setStatus\(requireErrors\(\)\.caughtMessage\(error, "Time entry was not saved\."\), \{ isError: true \}\);/,
      "the refusal lands in the catch the dialog already had");
    assert.equal((save.match(/setStatus\(requireErrors\(\)/g) || []).length, 1,
      "and there is one failure outcome, not a second invented for an unreadable response");
  });
});

describe("the producers stay exactly as different as they are", () => {
  it("the create result names three members and spreads nothing", () => {
    const create = functionBody(service, "async function createFromActiveTimer(entry, session) {");
    assert.match(create, /return \{\n\s+entry: \(await tagsService\.decorateRecordsForTarget\(session, "time_entry", \[data\]\)\)\[0\],\n\s+entry_id: entryId,\n\s+storage: "database",/,
      "the create result is an exact three-member reconstruction");
    assert.match(routes, /timeEntriesRoutes\.post\("\/time-entries"[\s\S]{0,240}response\.status\(201\)\.json\(result\);/,
      "and the route answers it unchanged");
  });

  it("the update result names two members and spreads nothing", () => {
    const update = functionBody(service, "async function update(rawPayload, entryId, session) {");
    assert.match(update, /return \{ entry: taggedEntry, storage: "database" \};/,
      "the update result is an exact two-member reconstruction");
    // Scoped to the return statement: `entry_id` legitimately appears earlier in this function,
    // where the normalised entry is rebuilt from the route parameter. The claim is about what
    // the response names, not about the whole body.
    const returned = update.slice(update.lastIndexOf("return {"));
    assert.doesNotMatch(returned, /entry_id/, "and the response deliberately does not mint an outer identity");
    assert.match(routes, /timeEntriesRoutes\.put\("\/time-entries\/:entryId"[\s\S]{0,240}response\.status\(200\)\.json\(result\);/,
      "and its route answers it unchanged");
  });

  it("the nested entry is decorated, which is why the browser record is a minimum", () => {
    assert.match(service, /tagsService\.decorateRecordsForTarget\(session, "time_entry", \[data\]\)/,
      "the create result decorates the persisted entry");
    const declared = functionBody(contracts, "export interface BrowserSavedTimeEntryIdentity {", "\n}\n");
    const promised = [...declared.matchAll(/^ {2}([a-z_]+): /gm)].map((entry) => entry[1]);
    assert.deepEqual(promised, ["entry_id"], "and the browser promises the one member the dialog reads");
    for (const unread of ["duration_seconds", "billable", "invoice_status", "client_id", "project_id", "tags", "user_id"]) {
      assert.ok(!declared.includes(unread), unread + " belongs to the time-entry record, not to this identity");
    }
  });

  it("preserves the decorated entry and its unpromised members", () => {
    const entry = savedEntry({ future_entry_field: { nested: true } });
    const body = createResult({ entry, entry_id: "entry_1" });
    assert.equal(readCreatedTimeEntryId(body), "entry_1", "the response is readable");
    assert.equal(body.entry, entry, "and the reader answered an identity without touching the entry");
    assert.deepEqual(body.entry.future_entry_field, { nested: true }, "so its unpromised members survive");
    assert.equal(body.entry.duration_seconds, 3600, "and so does everything the callback receives");
  });
});

describe("the server keeps the decisions that are its own", () => {
  it("gates both routes on the module write check", () => {
    for (const [name, opener] of [
      ["create", "async function createFromActiveTimer(entry, session) {"],
      ["update", "async function update(rawPayload, entryId, session) {"],
    ]) {
      const body = functionBody(service, opener);
      assert.match(body, /await assertModuleWriteEnabled\(session, MODULE_ID\);/, name + " asserts the module is writable");
    }
    assert.doesNotMatch(dialog, /assertModuleWriteEnabled|MODULE_ID/, "and the browser re-derives none of it");
  });

  it("parses each payload against its own edge schema", () => {
    assert.match(service, /parseTimeTrackingEdgePayload\(BrowserTimeEntryCreateSchema, rawEntry\)/,
      "the create payload has its own schema");
    assert.match(service, /parseTimeTrackingEdgePayload\(BrowserTimeEntryUpdateSchema, rawPayload\)/,
      "and the update payload has a different one");
  });

  it("leaves permissions, tags, audit and indexing where they are", () => {
    for (const owned of ["syncTimeEntrySearchIndex", "tagsService", "recordAuditEvent"]) {
      assert.ok(service.includes(owned) || /audit/i.test(service), owned + " stays server-side");
      assert.ok(!dialog.includes(owned), owned + " is not re-derived in the dialog");
    }
  });
});
