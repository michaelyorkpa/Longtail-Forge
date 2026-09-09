import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
import { FakeDocument, fakeDomConstructors } from "../../scripts/test-support/fake-dom.mjs";

const source = createProjectTextReader().readText("public/js/notes.js");

/** @param {string[]} names @param {Record<string, unknown>} globals */
function lifecycle(names, globals) {
  const context = vm.createContext(globals);
  for (const name of names) vm.runInContext(extractFunctionBlock(source, name), context);
  return vm.runInContext(`({ ${names.join(", ")} })`, context);
}

describe("Notes editor lifecycle", () => {
  it("hydrates without caching, preserves detail identity, and falls back to the exact input", async () => {
    const input = { note_id: "saved-note", title: "Older title" };
    const detail = { ...input, title: "Current title", body_markdown: "Current body" };
    const state = { selectedNote: input };
    /** @type {unknown[]} */
    const reads = [];
    /** @type {unknown[]} */
    const rendered = [];
    let fail = false;
    const api = lifecycle(["hydrateEditorNote"], {
      state,
      requireApi: () => ({
        getJson: async (/** @type {string} */ url, /** @type {unknown} */ options) => {
          reads.push([url, options]);
          if (fail) throw new Error("Unavailable detail");
          return detail;
        },
      }),
      requireNoteFromEnvelope: (/** @type {unknown} */ result) => result,
      renderDetail: (/** @type {unknown} */ note) => rendered.push(note),
    });
    assert.equal(await api.hydrateEditorNote(null), null);
    assert.equal(reads.length, 0);
    assert.equal(await api.hydrateEditorNote(input), detail);
    assert.equal(state.selectedNote, detail);
    assert.equal(rendered[0], detail);
    assert.equal(JSON.stringify(reads), JSON.stringify([["/api/notes/saved-note", { cache: "no-store" }]]));
    fail = true;
    const idOnly = { note_id: "unavailable-note" };
    assert.equal(await api.hydrateEditorNote(input), input);
    assert.equal(await api.hydrateEditorNote(idOnly), idOnly);
    assert.equal(state.selectedNote, detail);
    assert.equal(rendered.length, 1);
  });

  it("does not initialize fields or fail on a missing required control before hydration settles", async () => {
    const note = { note_id: "note", title: "Hydrated" };
    /** @type {(value: typeof note) => void} */
    let finishHydration = () => {};
    const pending = new Promise((resolve) => { finishHydration = resolve; });
    const state = { editingNoteId: "previous", editorNote: null };
    /** @type {string[]} */
    const calls = [];
    const api = lifecycle(["openEditor", "requireNotesValue"], {
      state, dialogTitle: null,
      hydrateEditorNote: () => { calls.push("hydrate"); return pending; },
      requireView: () => { calls.push("view"); return {}; },
    });
    const opening = api.openEditor();
    assert.deepEqual(calls, ["hydrate"]);
    assert.equal(state.editingNoteId, "previous");
    finishHydration(note);
    await assert.rejects(opening, { name: "TypeError" });
    assert.deepEqual(calls, ["hydrate", "view"]);
    assert.equal(state.editingNoteId, "note");
    assert.equal(state.editorNote, note);
  });

  it("keeps missing lookups optional and rejects the wrong DOM subtype without a substitute", () => {
    const document = new FakeDocument();
    const constructors = fakeDomConstructors();
    const api = lifecycle(["findNotesControl", "requireNotesValue"], { document });
    assert.equal(api.findNotesControl("textarea", constructors.HTMLTextAreaElement), null);
    const input = document.createElement("input");
    document.body.appendChild(input);
    assert.equal(api.findNotesControl("input", constructors.HTMLTextAreaElement), null);
    assert.equal(api.findNotesControl("input", constructors.HTMLInputElement), input);
    assert.equal(api.requireNotesValue(input), input);
    assert.throws(() => api.requireNotesValue(null), { name: "TypeError" });
  });

  it("settles cancellation once and clears editor state before closing, with optional controls absent", () => {
    /** @type {unknown[]} */
    const events = [];
    const state = {
      editingNoteId: "note", editorNote: { note_id: "note" }, editorSelectedTarget: {},
      editorStagedTargets: [{}], filesDialogNoteId: "note", tagsDialogNoteId: "note",
      editorHostContext: { cancel: (/** @type {unknown} */ detail) => events.push(detail) },
      editorHostContextSettled: false,
    };
    const api = lifecycle(["closeEditor", "cancelEditor", "handleEditorDialogClose", "cancelNoteEditorHostContext"], {
      state, copyLinkButton: null, dialog: null,
      resetNoteNotificationFollowFields: () => events.push("reset-follow"),
      requireView: () => ({ closeModal: (/** @type {unknown} */ dialog, /** @type {string} */ value) => {
        assert.equal(dialog, null);
        assert.equal(state.editorNote, null);
        assert.equal(state.editorSelectedTarget, null);
        assert.equal(state.editorStagedTargets.length, 0);
        assert.equal(state.filesDialogNoteId, "");
        assert.equal(state.tagsDialogNoteId, "");
        events.push(value);
      } }),
    });
    api.cancelEditor();
    api.handleEditorDialogClose();
    assert.equal(JSON.stringify(events), JSON.stringify([{ actionId: "notes.edit", recordId: "note" }, "reset-follow", "cancel"]));
    assert.equal(state.editorHostContext, null);
    assert.equal(state.editorHostContextSettled, true);
  });
});
