import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/notes.js");
const names = [
  "pickerRecordFromTarget", "targetPickerDisplayLabel", "targetPickerSecondaryLabel",
  "primaryProjectOptionLabel", "providerDisplayLabel", "normalizeText", "unavailableTargetLabel",
  "editorLinkTargetKey", "editorLinkTargetMatches", "stageEditorLinkTarget", "stagedTargetExists",
  "linkPayloadFromTarget", "stagedLinkPayloads", "noteHasLink", "removeEditorStagedTarget",
  "addEditorNoteLink", "removeEditorNoteLink", "loadEditorLinkTargets", "requireNotesValue",
  "safeNoteErrorMessage", "isSecureError",
];

/** @param {Record<string, unknown>} [overrides] */
function target(overrides = {}) {
  return {
    ariaLabel: "Full target title", clientId: "client", clientName: "Client",
    displayLabel: "Provider label", fullLabel: "Full label", isAvailable: true,
    label: "Plain label", moduleId: "tasks", projectId: "project", projectName: "Project",
    secondaryLabel: "Provider context", sortKey: "sort", sourceUrl: "tasks.html?task=target",
    subtitle: "Subtitle", suggestedLibraryBucket: "active_work", targetId: "target",
    targetType: "task", title: "Title", workspaceName: "Workspace", ...overrides,
  };
}

/** @param {Record<string, unknown>} [overrides] */
function editor(overrides = {}) {
  const state = { editingNoteId: "note / one", editorNote: { links: [] },
    editorSelectedTarget: null, editorStagedTargets: [], linkTargets: [] };
  const formStatus = { textContent: "" };
  /** @type {unknown[][]} */
  const posts = [];
  /** @type {unknown[]} */
  const refreshes = [];
  const context = vm.createContext({
    state, formStatus, window: { LongtailForge: { workspaceContext: { workspaceName: "Current workspace" } } },
    usesBusinessScope: () => true, contextApplyButton: { disabled: false },
    renderEditorContextSelection: () => {}, updateLibrarySuggestion: () => {},
    requireApi: () => ({ postJson: async (/** @type {unknown[]} */ ...args) => posts.push(args) }),
    refreshEditorNote: async (/** @type {unknown} */ id) => refreshes.push(id),
    ...overrides,
  });
  for (const name of names) vm.runInContext(extractFunctionBlock(source, name), context);
  return { api: vm.runInContext(`({ ${names.join(", ")} })`, context), state, formStatus, posts, refreshes, context };
}

/** Compare values created in the browser VM without comparing realm prototypes. @param {unknown} value */
const plain = (value) => JSON.parse(JSON.stringify(value));

describe("Notes link target editor round trip", () => {
  it("carries provider labels, availability and source URL without turning empty strings into missing identities", () => {
    const { api } = editor();
    const record = api.pickerRecordFromTarget(target({ moduleId: "", sourceUrl: "", isAvailable: false }));
    assert.deepEqual(plain(record), {
      moduleId: "", targetType: "task", targetId: "target", displayLabel: "Provider label",
      secondaryLabel: "Provider context", sortKey: "sort", sourceUrl: "", title: "Title",
      fullLabel: "Full label", ariaLabel: "Full target title", isAvailable: false,
    });
    assert.equal(api.pickerRecordFromTarget(target()).sourceUrl, "tasks.html?task=target");
    const legacy = api.pickerRecordFromTarget({ module_id: "legacy", target_type: "task", target_id: "old",
      display_label: "Legacy label", secondary_label: "Legacy context", source_url: "legacy.html",
      sort_key: "old-sort", full_label: "Legacy full", aria_label: "Legacy aria", is_available: false });
    assert.deepEqual(plain(legacy), { moduleId: "legacy", targetType: "task", targetId: "old",
      displayLabel: "Legacy label", secondaryLabel: "Legacy context", sourceUrl: "legacy.html",
      sortKey: "old-sort", fullLabel: "Legacy full", ariaLabel: "Legacy aria", title: "", isAvailable: false });
  });

  it("preserves exact keys, alias precedence and empty-module wildcard matching", () => {
    const { api } = editor();
    assert.equal(api.editorLinkTargetKey(target({ moduleId: "" })), ":task:target");
    assert.equal(api.editorLinkTargetKey(), "");
    assert.equal(api.editorLinkTargetKey({ targetType: "task" }), "");
    assert.equal(api.editorLinkTargetKey({ targetId: "target" }), "");
    const legacy = { module_id: "tasks", target_type: "task", target_id: "target" };
    assert.equal(api.editorLinkTargetKey(legacy), "tasks:task:target");
    assert.equal(api.editorLinkTargetKey({ ...legacy, ...target() }), "tasks:task:target");
    assert.equal(api.editorLinkTargetMatches(legacy, target()), true);
    assert.equal(api.editorLinkTargetMatches(target({ moduleId: "" }), target()), true);
    assert.equal(api.editorLinkTargetMatches(target(), target({ moduleId: "" })), true);
    assert.equal(api.editorLinkTargetMatches(target(), target({ moduleId: "other" })), false);
    assert.equal(api.editorLinkTargetMatches(target(), target({ targetId: "Target" })), false);
    assert.equal(api.editorLinkTargetMatches(target(), target({ targetType: "note" })), false);
    assert.equal(api.editorLinkTargetMatches(), true);
  });

  it("distinguishes an explicit empty secondary label from absence and keeps project labels provider-owned", () => {
    const { api, context } = editor();
    assert.equal(api.targetPickerSecondaryLabel(target({ secondaryLabel: "" })), "");
    assert.equal(api.targetPickerSecondaryLabel({ target_type: "task", client_name: "Legacy client" }), "Legacy client");
    assert.equal(api.targetPickerSecondaryLabel({ targetType: "task", projectName: "Project" }), "Project");
    assert.equal(api.targetPickerSecondaryLabel({ targetType: "task", workspaceName: "Workspace" }), "Workspace");
    assert.equal(api.targetPickerSecondaryLabel({ targetType: "project", clientName: "Client" }), "");
    assert.equal(api.primaryProjectOptionLabel(target()), "Provider label");
    assert.equal(api.primaryProjectOptionLabel({ label: "Project", client_name: "Client" }), "Project - Client");
    assert.equal(api.primaryProjectOptionLabel({ label: "Project", workspaceName: "Space" }), "Project - Space");
    assert.equal(api.primaryProjectOptionLabel({ label: "Project" }), "Project - Current workspace");
    context.usesBusinessScope = () => false;
    assert.equal(api.primaryProjectOptionLabel({ label: "Project", clientName: "Client" }), "Project");
    assert.equal(api.targetPickerSecondaryLabel({ targetType: "task", clientName: "Client" }), "");
    assert.equal(api.targetPickerSecondaryLabel(target()), "Provider context");
  });

  it("stages original objects once, selects duplicates, and submits only the three identity fields", () => {
    const { api, state, formStatus } = editor();
    const chosen = target({ moduleId: "" });
    api.stageEditorLinkTarget({});
    assert.equal(state.editorStagedTargets.length, 0);
    api.stageEditorLinkTarget(chosen);
    assert.equal(state.editorStagedTargets[0], chosen);
    assert.equal(state.editorSelectedTarget, chosen);
    assert.equal(formStatus.textContent, "");
    const duplicate = target();
    api.stageEditorLinkTarget(duplicate);
    assert.equal(state.editorStagedTargets.length, 1);
    assert.equal(state.editorSelectedTarget, duplicate);
    assert.equal(formStatus.textContent, "Linked context is already staged.");
    assert.deepEqual(plain(api.stagedLinkPayloads()), [{ moduleId: "", targetType: "task", targetId: "target" }]);
    api.removeEditorStagedTarget(duplicate);
    assert.equal(state.editorStagedTargets.length, 0);
    assert.equal(state.editorSelectedTarget, null);
  });

  it("adds and removes saved links through encoded routes and refreshes after the mutation", async () => {
    const { api, state, formStatus, posts, refreshes, context } = editor();
    await api.addEditorNoteLink(target({ moduleId: "" }));
    assert.deepEqual(plain(posts), [["/api/notes/note%20%2F%20one/links", { moduleId: "", targetType: "task", targetId: "target" }]]);
    assert.equal(state.editorSelectedTarget, null);
    assert.deepEqual(refreshes, ["note / one"]);
    assert.equal(formStatus.textContent, "");
    assert.equal(context.contextApplyButton.disabled, false);
    await api.removeEditorNoteLink({ note_id: "other / note" }, { note_link_id: "link / one" });
    assert.deepEqual(plain(posts[1]), ["/api/notes/other%20%2F%20note/links/link%20%2F%20one/remove", {}]);
    assert.equal(refreshes[1], "other / note");
    await api.removeEditorNoteLink(null, { noteLinkId: "camel", note_link_id: "ignored" });
    assert.equal(posts[2]?.[0], "/api/notes/note%20%2F%20one/links/camel/remove");
    await api.removeEditorNoteLink(null, {});
    await api.addEditorNoteLink({});
    assert.equal(posts.length, 3);
  });

  it("suppresses duplicate writes, reports safe failures, and restores the optional apply control", async () => {
    const { api, state, posts, formStatus, context } = editor();
    Object.assign(state.editorNote, { links: [{ module_id: "", target_type: "task", target_id: "target" }] });
    await api.addEditorNoteLink(target());
    assert.equal(posts.length, 0);
    assert.equal(formStatus.textContent, "Linked context is already added.");
    state.editorNote.links = [];
    context.requireApi = () => ({ postJson: async () => { throw new Error("crypto payload secret"); } });
    await api.addEditorNoteLink(target());
    assert.match(formStatus.textContent, /^Secure note is locked/);
    assert.doesNotMatch(formStatus.textContent, /secret/);
    assert.equal(context.contextApplyButton.disabled, false);
    context.contextApplyButton = null;
    await api.removeEditorNoteLink(null, { noteLinkId: "link" });
    assert.match(formStatus.textContent, /^Secure note is locked/);
    await api.addEditorNoteLink(target());
    assert.match(formStatus.textContent, /^Secure note is locked/);
  });

  it("keeps missing status failure timing before a mutation and waits for a directory before re-enabling the picker", async () => {
    const { api, posts, context, state } = editor({ formStatus: null });
    await assert.rejects(api.addEditorNoteLink(target()), { name: "TypeError" });
    await assert.rejects(api.removeEditorNoteLink(null, { noteLinkId: "link" }), { name: "TypeError" });
    assert.equal(posts.length, 0);
    context.contextResultsInput = null;
    await api.loadEditorLinkTargets();
    const select = { disabled: false };
    const directory = [target({ isAvailable: false })];
    /** @type {(value: typeof directory) => void} */
    let settle = () => {};
    const pending = new Promise((resolve) => { settle = resolve; });
    /** @type {unknown[]} */
    const requests = [];
    /** @type {unknown[][]} */
    const populated = [];
    Object.assign(context, {
      contextResultsInput: select, contextTargetTypeInput: null, contextSearchInput: null,
      defaultLinkTargetType: () => "project", readLinkTargetClientContext: () => ({ clientScope: "all", clientId: "" }),
      replaceLinkTargetOptions: () => {}, fetchLinkTargets: (/** @type {unknown} */ query) => { requests.push(query); return pending; },
      populateLinkTargetSelect: (/** @type {unknown[]} */ ...args) => populated.push(args),
    });
    const loading = api.loadEditorLinkTargets();
    assert.equal(select.disabled, true);
    assert.deepEqual(plain(requests), [{ targetType: "project", search: "", limit: 40, clientScope: "all", clientId: "" }]);
    settle(directory);
    await loading;
    assert.equal(state.linkTargets, directory);
    assert.equal(populated[0]?.[0], select);
    assert.equal(populated[0]?.[1], directory);
    assert.equal(select.disabled, false);
  });
});
