import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { FakeDocument, fakeDomConstructors } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const reader = createProjectTextReader();
const source = reader.readText("public/js/notes.js");
const adapter = reader.readText("public/js/shared/view-surface-descriptor.js");
const moduleSource = reader.readText("src/modules/notes/module.js");
const literal = moduleSource.match(/viewSurfaces:\s*(\[[\s\S]*?\n  \]),\n  browserAssets/);
assert.ok(literal, "lift the actual Notes manifest contribution");
const manifest = vm.runInNewContext(`(${literal[1]})`, { NOTE_PERMISSIONS: new Proxy({}, { get: (_target, key) => String(key) }) })[0];
const names = ["scopeNotesVisibilityContributions", "scopeNotesVisibilityOptions", "readNotesVisibilityOption", "applyWorkspaceVisibilityControls",
  "notesViewSurfaceDescriptor", "notesEditorModalDescriptor", "notesBulkEditorModalDescriptor", "notesCollectionModalDescriptor", "modalFieldOptions",
  "populateWorkspaceVisibilityOptions", "workspaceVisibilityOptions", "updateSecureVisibilityOptions", "normalizeWorkspaceType", "normalizeText",
  "usesBusinessScope", "workspaceHasClientTools", "isResponseRecord", "findNotesControl", "isNoteFieldOptionPair"];
/** @param {unknown} value */
const plain = (value) => JSON.parse(JSON.stringify(value));
/** @param {string} [workspaceType] */
function scoped(workspaceType = "business") {
  const document = new FakeDocument();
  const state = { workspaceType };
  const workspaceContext = { workspaceType: "family", viewSurfaces: [plain(manifest)], workspaceCapabilities: { availableTools: ["clients_projects"] } };
  const window = { LongtailForge: { workspaceContext } };
  const context = vm.createContext({ window, document, state, ...fakeDomConstructors(), isSecureEditorMode: () => false });
  // Execute the real contract reader, not a mock that promises the result of a cast.
  vm.runInContext(adapter, context);
  context.requireView = () => ({ normalizeSurfaceDescriptor: context.window.LongtailForge.viewSurfaceDescriptor.normalize });
  context.notesOptionElement = (/** @type {string} */ value, /** @type {string} */ label) => {
    const option = document.createElement("option"); option.value = value; option.textContent = label; return option;
  };
  for (const name of names) vm.runInContext(extractFunctionBlock(source, name), context);
  const wrappers = [document.createElement("label"), document.createElement("div"), document.createElement("label")].map((field) => Object.assign(field, { style: { display: "" } }));
  wrappers[1].dataset.viewField = "visibility";
  for (const [index, name] of ["visibilityFilter", "visibilityInput", "bulkVisibilityInput"].entries()) {
    const control = document.createElement("select");
    Object.assign(control, { closest: () => wrappers[index] }); wrappers[index].appendChild(control); context[name] = control;
  }
  return { api: vm.runInContext(`({ ${names.join(", ")} })`, context), context, state, workspaceContext, wrappers, document };
}
/** @param {unknown[]} options */
const values = (options) => Array.from(options, (option) => Array.isArray(option) ? option[0] : option && typeof option === "object" && "value" in option ? option.value : undefined);

describe("Notes visibility contribution producer", () => {
  it("scopes the actual manifest with stable ordering and no mutation", () => {
    const original = plain(manifest);
    for (const type of ["business", "family", "personal"]) {
      const { api } = scoped(type);
      const result = api.scopeNotesVisibilityContributions(manifest);
      assert.equal(result.id, "notes.workspace"); assert.equal(result.moduleId, "notes"); assert.equal(result.layout, "slide-out-sidebar");
      const visibility = result.filters.find((/** @type {{field: string}} */ field) => field.field === "visibility");
      const fields = result.modals.find((/** @type {{id: string}} */ modal) => modal.id === "note-editor").fields;
      const bulk = result.modals.find((/** @type {{id: string}} */ modal) => modal.id === "note-bulk-editor").fields;
      if (type === "personal") {
        assert.equal(visibility, undefined);
        assert.equal(fields.some((/** @type {{field: string}} */ field) => field.field === "visibility"), false);
        assert.equal(bulk.some((/** @type {{field: string}} */ field) => field.field === "visibility"), false);
        assert.equal(result.detail.header.badges.some((/** @type {{field: string}} */ badge) => badge.field === "visibility"), false);
      } else {
        const expected = type === "business" ? ["internal", "private", "workspace", "client_visible", "public"] : ["internal", "private", "workspace", "public"];
        assert.deepEqual(values(visibility.options), ["all", ...expected]);
        assert.deepEqual(values(fields.find((/** @type {{field: string}} */ field) => field.field === "visibility").options), expected);
        assert.deepEqual(values(bulk.find((/** @type {{field: string}} */ field) => field.field === "visibility").options), ["", ...expected]);
      }
    }
    assert.deepEqual(plain(manifest), original);
  });

  it("runs hostile contributions through the published reader on every workspace branch", () => {
    const malformed = [1, false, "surface", [], () => ({}), { id: 42 }, { layout: "invented" }, { filters: {} },
      { filters: [null] }, { filters: [{ field: "visibility", type: 42 }] }, { filters: [{ field: "visibility", type: "select", options: {} }] },
      { modals: [null] }, { modals: [{ id: "note-editor", fields: [false] }] }, { modals: [{ id: "note-editor", fields: [{ field: "visibility", type: "invalid" }] }] },
      { detail: [] }, { detail: { header: "bad" } }];
    for (const type of ["business", "family", "personal", ""]) {
      const { api, workspaceContext } = scoped(type); workspaceContext.workspaceType = "";
      for (const input of malformed) assert.throws(() => api.scopeNotesVisibilityContributions(input), /viewSurface/);
      for (const input of [undefined, null, {}]) {
        const result = api.scopeNotesVisibilityContributions(input);
        assert.equal(result.id, ""); assert.equal(result.moduleId, ""); assert.equal(result.viewId, ""); assert.equal(result.layout, "single-column");
        assert.equal(Object.hasOwn(result, "unpromised"), false);
      }
    }
  });

  it("preserves opaque option metadata while filtering both representations and only the owned fields", () => {
    const { api } = scoped("family");
    const option = { value: "private", label: "Private", extension: { untouched: true } };
    const options = [["public", "Public"], { value: "client_visible", label: "Client Visible" }, option, ["client_visible", "Client Visible"], ["internal", "Internal"]];
    const input = { filters: [{ field: "visibility", type: "select", options }, { field: "other", type: "select", options }],
      modals: [{ id: "note-editor", fields: [{ field: "visibility", type: "select", options }] },
        { id: "note-bulk-editor", fields: [{ field: "visibility", type: "select", options }] },
        { id: "unrelated", fields: [{ field: "visibility", type: "select", options }] }], detail: { header: { badges: [{ field: "visibility" }, { field: "security" }] } } };
    const before = plain(input); const result = api.scopeNotesVisibilityContributions(input);
    assert.deepEqual(values(result.filters[0].options), ["public", "private", "internal"]);
    assert.equal(result.filters[0].options[1], option);
    assert.deepEqual(plain(result.filters[1].options), options);
    assert.deepEqual(plain(result.modals[2].fields[0].options), options);
    assert.deepEqual(plain(result.detail), input.detail);
    assert.deepEqual(plain(input), before);
  });

  it("keeps opaque members unclaimed and reads only established string option pairs", () => {
    const { api } = scoped("personal");
    const poison = { toString() { throw new Error("No coercion"); } };
    for (const option of [null, undefined, 1, true, "private", [], ["private"], [poison, "Label"], { value: "private" }, { value: "private", label: poison }, () => "private"]) {
      assert.equal(api.readNotesVisibilityOption(option), null);
    }
    assert.deepEqual(plain(api.readNotesVisibilityOption({ value: "", label: "  All  " })), ["", "  All  "]);
    assert.deepEqual(plain(api.readNotesVisibilityOption(["private", "Private"])), ["private", "Private"]);
    const opaque = [null, 42, { field: "security", custom: poison }];
    const result = api.scopeNotesVisibilityContributions({ detail: { header: { badges: [...opaque, { field: "visibility" }] } } });
    assert.deepEqual(Array.from(result.detail.header.badges), opaque);
    assert.deepEqual(plain(api.scopeNotesVisibilityContributions({ detail: { header: { badges: "unclaimed" } } }).detail.header.badges), []);
    const family = scoped("family").api;
    assert.deepEqual(Array.from(family.scopeNotesVisibilityOptions([...opaque, { value: "client_visible" }])), opaque);
  });

  it("uses the state workspace first, then context, and preserves empty-workspace projection", () => {
    const { api, state, workspaceContext } = scoped("business");
    assert.ok(api.notesViewSurfaceDescriptor().filters.some((/** @type {{field: string}} */ entry) => entry.field === "visibility"));
    state.workspaceType = ""; workspaceContext.workspaceType = "personal";
    assert.equal(api.notesViewSurfaceDescriptor().filters.some((/** @type {{field: string}} */ entry) => entry.field === "visibility"), false);
    workspaceContext.workspaceType = "";
    assert.deepEqual(values(api.notesViewSurfaceDescriptor().filters.find((/** @type {{field: string}} */ entry) => entry.field === "visibility").options), ["all", "internal", "private", "workspace", "client_visible", "public"]);
    workspaceContext.viewSurfaces = [];
    assert.equal(api.notesViewSurfaceDescriptor(), null);
    assert.deepEqual(plain(api.notesEditorModalDescriptor()), {}); assert.deepEqual(plain(api.notesBulkEditorModalDescriptor()), {}); assert.deepEqual(plain(api.notesCollectionModalDescriptor()), {});
  });

  it("rebuilds the filter in order, retains applicable selections, and resets inapplicable ones", () => {
    const { api, context, state, wrappers, workspaceContext } = scoped();
    context.visibilityFilter.value = "private"; api.applyWorkspaceVisibilityControls();
    assert.equal(context.visibilityFilter.value, "private");
    assert.deepEqual(context.visibilityFilter.options.map((/** @type {{value: string}} */ option) => option.value), ["all", "internal", "private", "workspace", "client_visible", "public"]);
    context.visibilityFilter.value = "client_visible"; state.workspaceType = "family"; api.applyWorkspaceVisibilityControls();
    assert.equal(context.visibilityFilter.value, "all");
    assert.ok(wrappers.every((field) => field.hidden === false && field.style.display === ""));
    workspaceContext.viewSurfaces = [{ id: "notes.workspace", moduleId: "notes", filters: [{ field: "visibility", type: "select", options: [null, { value: "private", label: "Private" }, ["all", "All"]] }] }];
    assert.doesNotThrow(() => api.applyWorkspaceVisibilityControls());
    assert.deepEqual(context.visibilityFilter.options.map((/** @type {{value: string, textContent: string}} */ option) => [option.value, option.textContent]), [["private", "Private"], ["all", "All"]]);
  });

  it("preserves optional controls and wrapper updates before a malformed descriptor fails", () => {
    const { api, context, state, wrappers, workspaceContext } = scoped("personal");
    context.visibilityFilter.value = "private";
    workspaceContext.viewSurfaces = [{ id: "notes.workspace", moduleId: "notes", filters: true }];
    api.applyWorkspaceVisibilityControls();
    assert.ok(wrappers.every((field) => field.hidden && field.style.display === "none")); assert.equal(context.visibilityFilter.value, "private");
    state.workspaceType = "family";
    assert.throws(() => api.applyWorkspaceVisibilityControls(), /viewSurface.filters/);
    assert.ok(wrappers.every((field) => !field.hidden && field.style.display === ""));
    context.visibilityFilter = null; context.visibilityInput = null; context.bulkVisibilityInput = null; api.applyWorkspaceVisibilityControls();
    const notHtml = { hidden: "sentinel", style: null };
    context.visibilityInput = { closest: () => notHtml }; assert.doesNotThrow(() => api.applyWorkspaceVisibilityControls());
    assert.equal(notHtml.hidden, "sentinel");
  });

  it("keeps workspace projection separate from current-context and secure-mode restrictions", () => {
    const { api, context, workspaceContext, state } = scoped();
    api.populateWorkspaceVisibilityOptions("client_visible");
    assert.equal(context.visibilityInput.value, "client_visible");
    api.updateSecureVisibilityOptions(true);
    const clientOption = context.visibilityInput.options.find((/** @type {{value: string}} */ option) => option.value === "client_visible");
    assert.ok(clientOption.hidden && clientOption.disabled); assert.equal(context.visibilityInput.value, "internal");
    api.updateSecureVisibilityOptions(false); assert.equal(clientOption.hidden, false); assert.equal(clientOption.disabled, false);
    workspaceContext.workspaceCapabilities.availableTools = []; api.populateWorkspaceVisibilityOptions("client_visible");
    assert.equal(context.visibilityInput.value, "internal");
    assert.equal(context.visibilityInput.options.some((/** @type {{value: string}} */ option) => option.value === "client_visible"), false);
    state.workspaceType = "family"; api.populateWorkspaceVisibilityOptions("private"); assert.equal(context.visibilityInput.value, "private");
    state.workspaceType = "personal"; assert.deepEqual(plain(api.workspaceVisibilityOptions()), []);
  });
});
