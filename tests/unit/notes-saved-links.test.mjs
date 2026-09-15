import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/notes.js");
const names = ["isResponseRecord", "isNotesDecoratedLink", "readEditorContextSummary", "primaryContextSummaryForSelection",
  "contextSummaryLabel", "findPrimaryContextProject", "noteHasLink", "editorLinkedContextRows", "editorLinkedContextItem",
  "editorStagedTargetItem", "pickerRecordFromTarget", "targetPickerDisplayLabel", "targetPickerSecondaryLabel",
  "primaryProjectOptionLabel", "providerDisplayLabel", "normalizeText", "unavailableTargetLabel", "editorLinkTargetMatches",
  "isKnownContextTargetType", "removeEditorNoteLink", "requireNotesValue", "safeNoteErrorMessage", "isSecureError",
  "openEditorForLinkedTarget", "openNoteFromUrl"];
function fixture() {
  /** @type {unknown[][]} */ const events = [];
  const state = { editorNote: {}, editorContextSummaries: {}, editorStagedTargets: [], primaryContextProjects: [], editingNoteId: "note / 1", linkTargets: [] };
  const controls = Object.fromEntries(["contextTargetTypeInput", "contextSearchInput", "typeInput", "libraryInput", "formStatus"].map((key) => [key, { value: "", textContent: "" }]));
  const context = vm.createContext({ state, ...controls, URLSearchParams,
    window: { location: { search: "" }, LongtailForge: { workspaceContext: { workspaceName: "Current workspace" } } },
    usesBusinessScope: () => true,
    requireApi: () => { events.push(["api"]); return { postJson: async (/** @type {unknown[]} */ ...args) => events.push(["post", ...args]) }; },
    refreshEditorNote: async (/** @type {unknown} */ id) => events.push(["refresh", id]),
    openEditor: async () => { events.push(["open"]); },
    applyTaskCreatedPrimaryContext: async (/** @type {unknown[]} */ ...args) => events.push(["primary", ...args]),
    stageEditorLinkTarget: (/** @type {unknown} */ target) => events.push(["stage", target]),
    ensureNoteKindOption: (/** @type {unknown} */ value) => events.push(["kind", value]),
    populateNoteCollectionOptions: (/** @type {unknown} */ value) => events.push(["collection", value]),
    renderEditorContextSelection: (/** @type {unknown} */ target) => events.push(["render", target]),
    updateLibrarySuggestion: (/** @type {unknown} */ options) => events.push(["suggestion", options]),
  });
  const start = source.indexOf("const LINK_TARGET_TYPE_LABELS ="); assert.ok(start >= 0);
  vm.runInContext(source.slice(start, source.indexOf(";", start) + 1), context);
  const api = vm.runInContext(`${names.map((name) => extractFunctionBlock(source, name)).join("\n")}\n({${names.join(",")}})`, context);
  return { api, context, state, events };
}
/** @param {unknown} value */ const plain = (value) => JSON.parse(JSON.stringify(value));

describe("Notes saved-link and context readers", () => {
  it("validates every consumed optional text member without requiring the directory vocabulary", () => {
    const { api } = fixture();
    for (const value of [null, undefined, [], false, 1, "row"]) assert.equal(api.isNotesDecoratedLink(value), false);
    const fields = ["moduleId", "module_id", "targetType", "target_type", "targetId", "target_id", "noteLinkId", "note_link_id",
      "label", "displayLabel", "display_label", "secondaryLabel", "secondary_label", "sourceUrl", "source_url",
      "clientId", "client_id", "projectId", "project_id", "clientName", "client_name", "projectName", "project_name", "workspaceName", "workspace_name"];
    for (const key of fields) {
      for (const bad of [null, 12, false, {}, []]) assert.equal(api.isNotesDecoratedLink({ [key]: bad }), false, key);
      for (const good of ["", "legacy-value", undefined]) assert.equal(api.isNotesDecoratedLink({ [key]: good }), true, key);
      assert.equal(api.isNotesDecoratedLink(Object.create({ [key]: "inherited" })), false, key);
    }
    assert.equal(api.isNotesDecoratedLink({ target_type: "future-provider", metadata_json: { unmodelled: true } }), true);
  });

  it("drops only unreadable saved rows, keeps original removal payloads and appends unduplicated staged rows", () => {
    const f = fixture();
    const legacy = { note_link_id: "row", module_id: "tasks", target_type: "task", target_id: "task", label: "Saved task", secondary_label: "", client_name: "Do not substitute" };
    const unavailable = { noteLinkId: "future-row", targetType: "future-provider", targetId: "future", label: "Unavailable linked context", sourceUrl: "" };
    f.context.state.editorNote = { status: "archived", links: [null, legacy, { label: 12 }, unavailable] };
    f.context.state.editorStagedTargets = [{ moduleId: "", targetType: "task", targetId: "task" }, { targetType: "note", targetId: "new", label: "Staged note" }];
    const rows = f.api.editorLinkedContextRows();
    assert.equal(rows.length, 3); assert.equal(rows[0].link, legacy); assert.equal(rows[1].link, unavailable);
    assert.equal(rows[0].displayLabel, "Saved task"); assert.equal(rows[0].secondaryLabel, "");
    assert.equal(rows[0].removable, false); assert.equal(rows[1].removable, false);
    assert.equal(rows[1].targetType, "future-provider"); assert.equal(rows[1].sourceUrl, "");
    assert.equal(rows[2].target, f.context.state.editorStagedTargets[1]);
    assert.equal(f.api.editorLinkedContextItem({}, legacy).removable, true);
    assert.equal(f.api.editorLinkedContextItem({}, { target_type: "project", label: "Project", client_name: "Client" }).displayLabel, "Project - Client");
    assert.equal(f.api.editorLinkedContextItem({}, { target_type: "future-provider" }).displayLabel, "Unavailable linked context");
    f.context.state.editorNote = {}; f.context.state.editorStagedTargets = [];
    assert.deepEqual(plain(f.api.editorLinkedContextRows()), []); assert.equal(f.api.noteHasLink({}, legacy), false);
    f.context.state.editorNote = { links: [null, { label: false }] }; assert.deepEqual(plain(f.api.editorLinkedContextRows()), []);
  });

  it("preserves identity matching for both aliases, exact strings and the empty-module wildcard", () => {
    const { api } = fixture();
    const link = { module_id: "legacy", target_type: "future-provider", target_id: "id" };
    assert.equal(api.noteHasLink({ links: [null, link] }, { targetType: "future-provider", targetId: "id" }), true);
    assert.equal(api.noteHasLink({ links: [link] }, { moduleId: "other", targetType: "future-provider", targetId: "id" }), false);
    assert.equal(api.noteHasLink({ links: [link] }, { targetType: "future-provider", targetId: "ID" }), false);
  });

  it("uses only own readable summaries and retains selection identity, unknown status and fallback rules", () => {
    const f = fixture(), status = { external: true };
    const client = { targetId: "client", label: "Client", status };
    f.context.state.editorContextSummaries = { client };
    assert.equal(f.api.primaryContextSummaryForSelection("client", "client"), client);
    assert.equal(f.api.primaryContextSummaryForSelection("client").status, status);
    assert.deepEqual(plain(f.api.primaryContextSummaryForSelection("client", "other")), {});
    f.context.state.editorContextSummaries = { user: { label: "User" }, project: { label: "No identity" } };
    assert.equal(f.api.contextSummaryLabel("user"), "User");
    assert.equal(f.api.primaryContextSummaryForSelection("project", "paged-out").label, "No identity");
    for (const summaries of [null, [], Object.create({ user: { label: "Inherited" } }), { user: { label: 12 } }]) {
      f.context.state.editorContextSummaries = summaries;
      assert.equal(f.api.contextSummaryLabel("user"), "Unavailable linked context");
      assert.deepEqual(plain(f.api.primaryContextSummaryForSelection("user")), {});
    }
    f.context.state.editorContextSummaries = Object.assign(Object.create(null), { constructor: { label: "Own label" } });
    assert.equal(f.api.contextSummaryLabel("constructor"), "Own label");
    const project = { projectId: "project", targetId: "alternate" }; f.context.state.primaryContextProjects = [project];
    assert.equal(f.api.findPrimaryContextProject("project"), project); assert.equal(f.api.findPrimaryContextProject("alternate"), null);
  });

  it("removes by checked own identity even when display metadata is unreadable, keeping API acquisition and refresh order", async () => {
    const f = fixture();
    await f.api.removeEditorNoteLink({}, { noteLinkId: "camel / row", note_link_id: "legacy", label: 12 });
    assert.deepEqual(plain(f.events), [["api"], ["post", "/api/notes/note%20%2F%201/links/camel%20%2F%20row/remove", {}], ["refresh", "note / 1"]]);
    assert.equal(f.context.formStatus.textContent, ""); f.events.length = 0;
    for (const row of [null, {}, { note_link_id: 12 }, Object.create({ noteLinkId: "inherited" })]) await f.api.removeEditorNoteLink({}, row);
    assert.deepEqual(plain(f.events), [["api"], ["api"], ["api"], ["api"]]);
    f.events.length = 0; await f.api.removeEditorNoteLink({ note_id: "explicit" }, { noteLinkId: "", note_link_id: "legacy" });
    assert.equal(f.events[1][1], "/api/notes/explicit/links/legacy/remove");
  });

  it("runs the real URL producer and retains closure ordering plus the fallback's undefined suggestion", async () => {
    const f = fixture();
    /** @type {() => void} */ let close = () => {};
    f.context.openEditor = () => { f.events.push(["open"]); return new Promise((resolve) => { close = () => resolve(undefined); }); };
    f.context.window.location.search = "?target_type=task&target_id=task&client_id=client&project_id=project";
    const pending = f.api.openNoteFromUrl();
    assert.equal(f.context.contextTargetTypeInput.value, "task"); assert.equal(f.context.contextSearchInput.value, "task");
    assert.deepEqual(plain(f.events), [["open"]]); close(); await pending;
    assert.deepEqual(f.events.map((event) => event[0]), ["open", "primary", "stage", "collection", "render", "suggestion"]);
    const staged = f.events.find((event) => event[0] === "stage")?.[1];
    assert.deepEqual(plain(staged), { clientId: "client", moduleId: "", projectId: "project", targetId: "task", targetType: "task" });
    const suggestion = f.events.at(-1)?.[1]; assert.ok(suggestion && typeof suggestion === "object" && "preferredSuggestion" in suggestion);
    assert.equal(suggestion.preferredSuggestion, undefined);
    assert.equal(f.context.typeInput.value, "log"); assert.equal(f.context.libraryInput.value, "active_work");
  });

  it("keeps directory matches and explicit URL choices, but refuses unsupported new targets after opening", async () => {
    const f = fixture(), matched = { targetType: "task", targetId: "task", suggestedLibraryBucket: "reference" };
    f.context.state.linkTargets = [matched];
    f.context.window.location.search = "?targetType=task&targetId=task&noteKind=research&libraryBucket=knowledge";
    await f.api.openNoteFromUrl(); assert.equal(f.events.find((event) => event[0] === "stage")?.[1], matched);
    assert.deepEqual(plain(f.events.at(-1)), ["suggestion", { preferredSuggestion: "reference" }]);
    assert.equal(f.context.typeInput.value, "research"); assert.equal(f.context.libraryInput.value, "knowledge");
    for (const type of ["future-provider", "constructor", "__proto__"]) {
      f.events.length = 0; f.context.window.location.search = `?targetType=${type}&targetId=id`;
      await f.api.openNoteFromUrl(); assert.deepEqual(plain(f.events), [["open"]]);
    }
  });
});
