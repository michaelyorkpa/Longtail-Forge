import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { FakeDocument } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/notes.js");
const names = ["tagChips", "mountTagEditor", "hydrateNoteTagFilterOptions", "openTagsDialog", "closeTagsDialog", "handleTagsDialogClose", "mountBulkTagPicker", "loadTags", "requireNotesValue", "findNotesControl"];
/** @param {unknown} value */
const plain = (value) => { assert.notEqual(value, undefined, "Expected a recorded value."); return JSON.parse(JSON.stringify(value)); };
function fixture() {
  const doc = new FakeDocument();
  /** @param {string} tag */
  const node = (tag) => Object.assign(doc.createElement(tag), { style: { backgroundColor: "" } });
  const input = node("input"); input.setAttribute("data-tag-picker-input", "");
  const toggle = node("button"); const modal = node("dialog"); modal.append(input);
  /** @type {unknown[]} */
  const events = [];
  const controller = { readTagIds: () => ["direct"], refreshTags: async () => {}, setSelected: () => {} };
  const state = { availableTags: [{ tag_id: "a", name: "Alpha", slug: "alpha", description: "Useful", color: "#112233" }], tagsDialogNoteId: "old", tagPicker: null, bulkTagPicker: null };
  const surface = {
    NO_TAGS_FILTER_VALUE: "__none__",
    loadTags: async (/** @type {unknown} */ options) => { events.push(["load", options]); return [{ tag_id: "b", name: "Beta", slug: "beta", description: "", color: "" }]; },
    mountPicker: async (/** @type {unknown} */ target, /** @type {unknown} */ options) => { events.push(["mount", target, options]); return controller; },
  };
  const context = vm.createContext({ state, surface, events, tagsEditor: node("div"), bulkTagsEditor: node("div"), tagsToggle: toggle, tagsDialog: modal, dialog: node("dialog"),
    document: { createElement: node, querySelector: () => input },
    HTMLInputElement: class { static [Symbol.hasInstance](/** @type {unknown} */ value) { return value === input; } },
    window: { LongtailForge: { tags: surface } },
    requireNamespace: () => ({ tags: context.surface }),
    requireView: () => ({ showModal: (/** @type {unknown} */ target, /** @type {unknown} */ options) => events.push(["show", target, options]), closeModal: (/** @type {unknown} */ target) => events.push(["close", target]) }),
    closeFilesDialog: () => events.push("files-close"),
  });
  input.focus = () => { events.push("focus"); };
  const api = vm.runInContext(`${names.map((name) => extractFunctionBlock(source, name)).join("\n")}\n({${names.join(",")}})`, context);
  return { api, context, state, events, surface, input, toggle, modal, controller };
}

describe("Notes tag surface", () => {
  it("offers checked catalogue tags in order, with the no-tags sentinel and search configuration", async () => {
    const { api, state, events } = fixture();
    state.availableTags.push({ tag_id: "b", name: "", slug: "fallback", description: "", color: "" });
    state.availableTags.push({ tag_id: "c", name: "", slug: "", description: "", color: "" });
    await api.hydrateNoteTagFilterOptions({ mountSearchOptions: (/** @type {unknown[]} */ ...args) => events.push(args), setOptions: () => assert.fail("mount must take precedence") });
    assert.deepEqual(plain(events), [[[
      { value: "__none__", label: "No tags", keywords: ["none", "untagged"] },
      { value: "Alpha", label: "Alpha", keywords: ["alpha", "Useful"], color: "#112233" },
      { value: "fallback", label: "fallback", keywords: ["fallback"], color: "" },
      { value: "c", label: "Tag", keywords: [], color: "" },
    ], { submitMode: "option-or-input", minChars: 1, maxResults: 10, emptyMessage: "No matching tags." }]]);
  });

  it("loads only an empty catalogue, supports the legacy setter, missing surface and failed loads", async () => {
    const { api, context, state, events, surface } = fixture();
    state.availableTags = [];
    await api.hydrateNoteTagFilterOptions({ setOptions: (/** @type {unknown[]} */ ...args) => events.push(args) });
    assert.deepEqual(plain(events[0]), ["load", { status: "active" }]);
    assert.deepEqual(plain(events[1]), [[{ value: "__none__", label: "No tags", keywords: ["none", "untagged"] }, { value: "Beta", label: "Beta", keywords: ["beta"], color: "" }],
      { submitMode: "option-or-input", minChars: 1, maxResults: 10, emptyMessage: "No matching tags." }]);
    context.surface = null; context.window.LongtailForge.tags = null; state.availableTags = [];
    events.length = 0;
    await assert.doesNotReject(() => api.hydrateNoteTagFilterOptions());
    assert.deepEqual(plain(state.availableTags), []);
    await api.hydrateNoteTagFilterOptions({ setOptions: (/** @type {unknown[]} */ ...args) => events.push(args) });
    assert.equal(plain(events[0])[0][0].value, "__no_tags__");
    context.surface = surface; surface.loadTags = async () => { throw new Error("Unavailable"); };
    await assert.doesNotReject(() => api.loadTags()); assert.deepEqual(plain(state.availableTags), []);
  });

  it("mounts the note picker with original assignments and awaits the established controller", async () => {
    const { api, context, state, events, controller } = fixture();
    const tags = [{ tag_id: "direct", assignment_source: "direct" }, { tag_id: "inherited", assignment_source: "propagated" }];
    context.tagsToggle.hidden = true;
    await api.mountTagEditor({ note_id: "saved", tags });
    assert.equal(context.tagsToggle.hidden, false); assert.equal(state.tagsDialogNoteId, "saved"); assert.equal(state.tagPicker, controller);
    const mount = events[0]; assert.ok(Array.isArray(mount)); assert.equal(mount[1], context.tagsEditor);
    assert.equal(mount[2].selectedTags, tags); assert.equal(mount[2].tags, state.availableTags);
    assert.deepEqual(plain(mount[2]), { allowCreate: true, label: "Tags", selectedTags: tags, tags: state.availableTags });
    events.length = 0;
    await api.mountTagEditor(null); assert.equal(state.tagsDialogNoteId, ""); const emptyMount = events[0]; assert.ok(Array.isArray(emptyMount)); assert.deepEqual(plain(emptyMount[2].selectedTags), []);
    await api.mountTagEditor({ note_id: "seed" }); assert.equal(state.tagsDialogNoteId, "seed");
    context.surface.mountPicker = async () => null;
    await api.mountTagEditor({ note_id: "seed" }); assert.equal(state.tagPicker, null);
  });

  it("retains optional guard paths and fails at the required toggle before mounting", async () => {
    const { api, context, state, events } = fixture();
    context.surface = null; await api.mountTagEditor(null);
    assert.equal(context.tagsToggle.hidden, true); assert.equal(state.tagsDialogNoteId, "old"); assert.deepEqual(events, []);
    context.surface = {}; context.tagsEditor = null; await api.mountTagEditor(null); assert.equal(context.tagsToggle.hidden, false);
    context.tagsToggle = null; await assert.doesNotReject(() => api.mountTagEditor(null));
    context.tagsEditor = {}; await assert.rejects(() => api.mountTagEditor(null), /Required Notes value/);
    assert.equal(state.tagsDialogNoteId, "old"); assert.deepEqual(events, []);
  });

  it("keeps bulk picker options separate and retains missing-mount no-ops", async () => {
    const { api, context, state, events, controller } = fixture();
    await api.mountBulkTagPicker(); assert.equal(state.bulkTagPicker, controller);
    const mount = events[0]; assert.ok(Array.isArray(mount)); assert.equal(mount[1], context.bulkTagsEditor); assert.equal(mount[2].tags, state.availableTags);
    assert.deepEqual(plain(mount[2]), { allowCreate: false, label: "Tags", placeholder: "Type to search tags", tags: state.availableTags });
    context.bulkTagsEditor = null; await api.mountBulkTagPicker(); assert.equal(state.bulkTagPicker, null);
    context.bulkTagsEditor = {}; context.surface = {}; await api.mountBulkTagPicker(); assert.equal(state.bulkTagPicker, null); assert.equal(events.length, 1);
  });

  it("closes Files, opens the child dialog, then focuses only its picker and restores expansion state", () => {
    const { api, context, events, modal, toggle } = fixture();
    api.openTagsDialog();
    assert.equal(toggle.getAttribute("aria-expanded"), "true");
    assert.equal(events.length, 3); assert.equal(events[0], "files-close"); assert.equal(events[2], "focus");
    const show = events[1]; assert.ok(Array.isArray(show)); assert.equal(show[0], "show"); assert.equal(show[1], modal); assert.equal(show[2].parent, context.dialog); assert.equal(show[2].trigger, toggle);
    api.closeTagsDialog(); assert.deepEqual(events.at(-1), ["close", modal]);
    api.handleTagsDialogClose(); assert.equal(toggle.getAttribute("aria-expanded"), "false");
    modal.replaceChildren(); events.length = 0; api.openTagsDialog(); assert.equal(events.length, 2);
    context.tagsDialog = null; events.length = 0; api.openTagsDialog(); api.closeTagsDialog(); assert.deepEqual(events, []);
    context.tagsToggle = null; assert.doesNotThrow(() => api.handleTagsDialogClose());
  });

  it("renders literal labels, color fallbacks and ordered chips with exact overflow semantics", () => {
    const { api } = fixture();
    const tags = [{ name: "<b>Literal</b>", slug: "unused", color: "#abcdef" }, { slug: "Fallback" }, {}];
    const all = api.tagChips(tags);
    assert.equal(all.className, "notes-tag-list"); assert.equal(all.children.length, 3);
    assert.equal(all.children[0].className, "tag-chip");
    assert.equal(all.children[0].children[0].style.backgroundColor, "#abcdef");
    assert.equal(all.children[0].children[0].getAttribute("aria-hidden"), "true");
    assert.equal(all.children[0].children[1].textContent, "<b>Literal</b>"); assert.equal(all.children[0].children[1].children.length, 0);
    assert.equal(all.children[1].children[0].style.backgroundColor, "#64748b");
    assert.equal(all.children[1].children[1].textContent, "Fallback"); assert.equal(all.children[2].children[1].textContent, "Tag");
    for (const [limit, count, title] of [[0, 1, "3 more tags"], [1, 2, "2 more tags"], [2, 3, "1 more tag"], [3, 3, ""]]) {
      const result = api.tagChips(tags, { limit, showOverflow: true }); assert.equal(result.children.length, count);
      if (title) { assert.equal(result.children.at(-1).title, title); assert.equal(result.children.at(-1).textContent, "..."); assert.equal(result.children.at(-1).className, "tag-chip notes-tag-overflow"); }
    }
    assert.equal(api.tagChips(tags, { limit: 1 }).children.length, 1);
    for (const limit of [-1, 1.5, NaN, Infinity, "1", null]) assert.equal(api.tagChips(tags, { limit }).children.length, 3);
  });

  it("retains empty, primitive fallback, coercion and null-element failure behavior without claiming tag records", () => {
    const { api } = fixture();
    for (const tags of [undefined, [], null, {}, "not an array"]) assert.equal(api.tagChips(tags).textContent, "No tags");
    for (const tag of [false, 5, "text", []]) assert.equal(api.tagChips([tag]).children[0].children[1].textContent, "Tag");
    assert.equal(api.tagChips([{ name: 23 }]).children[0].children[1].textContent, "23");
    for (const tag of [null, undefined]) assert.throws(() => api.tagChips([tag]), /Invalid Notes tag/);
    assert.equal(api.tagChips([null], { limit: 0 }).children.length, 0);
  });
});
