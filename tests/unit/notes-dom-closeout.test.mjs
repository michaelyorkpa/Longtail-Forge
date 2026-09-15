import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { FakeDocument, FakeElement, fakeDomConstructors } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/notes.js");
const names = ["createNoteBulkDialogShell", "clearBulkSelection", "closeNotesSlideOutDrawer", "renderEditorContextSelection", "requireNotesValue", "isResponseRecord"];
function fixture() {
  const document = new FakeDocument();
  /** @type {unknown[][]} */ const calls = [];
  const context = vm.createContext({ document, ...fakeDomConstructors(),
    state: { selectedNoteIds: new Set(["one", "two"]) }, notesList: document.createElement("div"),
    contextSelectedMessage: document.createElement("p"), userInput: document.createElement("input"),
    syncNotesBulkToolbar: () => calls.push(["toolbar"]), renderEditorContextPanel: () => calls.push(["panel"]),
    contextSummaryLabel: (/** @type {string} */ type) => { calls.push(["summary", type]); return "Readable user"; },
    contextTypeLabel: (/** @type {string} */ type) => type,
    unavailableTargetLabel: () => "Unavailable",
  });
  for (const name of names) vm.runInContext(extractFunctionBlock(source, name), context);
  return { document, context, calls, api: vm.runInContext(`({${names.join(",")}})`, context) };
}

describe("Notes final DOM boundaries", () => {
  it("decorates inherited dataset bags while preserving optional visibility and the rest of the bulk shell", () => {
    // The real browser probe covers native namespace/prototype behavior. These bags
    // exercise the actual shell function's boundary, not a fake DOM's own dataset rule.
    const inherited = Object.create({ dataset: {} });
    for (const visibility of [inherited, null, {}, { dataset: null }, { dataset: [] }]) {
      const f = fixture(), { document, context } = f;
      const form = document.createElement("form"), body = document.createElement("div"), footer = document.createElement("footer");
      form.append(body, footer);
      /** @type {unknown[][]} */ const insertions = [];
      // FakeDocument has no insertBefore. Record its arguments here; the rendered
      // case checks native placement rather than inventing parsing/layout behavior.
      Object.assign(form, { insertBefore: (/** @type {unknown} */ node, /** @type {unknown} */ reference) => { insertions.push([node, reference]); return node; } });
      const dialog = Object.assign(document.createElement("dialog"), { viewParts: { form, body, footer } });
      // Override only the descriptor's optional visibility lookup; required controls
      // and the returned form/body/footer remain separate, observable elements.
      Object.defineProperty(form, "querySelector", { value: () => visibility });
      context.requireView = () => ({ createActionButton: () => document.createElement("button"),
        createElement: () => document.createElement("div"), createStatusMessage: () => document.createElement("p") });
      context.notesBulkEditorModalDescriptor = () => ({ title: "Bulk fixture" });
      context.requireDescriptorRenderers = () => ({ renderDescriptorModalForm: () => dialog });
      /** @type {Map<string, ReturnType<FakeDocument["createElement"]>>} */ const controls = new Map();
      context.bulkFormControl = (/** @type {unknown} */ actual, /** @type {string} */ name) => {
        assert.equal(actual, dialog); const control = document.createElement("select"); controls.set(name, control); return control;
      };
      assert.equal(f.api.createNoteBulkDialogShell(), dialog);
      assert.deepEqual([...controls.keys()], ["library", "collection", "noteType", "tagAction"]);
      assert.equal(form.dataset.noteBulkForm, ""); assert.equal(body.classList.contains("notes-bulk-grid"), true);
      assert.equal(body.querySelector("[data-note-bulk-tags]")?.tagName, "DIV");
      assert.equal(insertions.length, 1); assert.equal(insertions[0][1], footer);
      const status = insertions[0][0]; assert.ok(status instanceof FakeElement);
      assert.equal(status.dataset.noteBulkFormStatus, "");
    }
    assert.equal(Object.hasOwn(inherited, "dataset"), false);
    assert.equal(inherited.dataset.noteBulkVisibility, "");
  });

  it("clears real input matches and state, leaves non-input checked expandos alone, then synchronizes once", () => {
    const f = fixture(), input = f.document.createElement("input"), impostor = f.document.createElement("div");
    input.className = impostor.className = "notes-list-select"; input.checked = impostor.checked = true;
    f.context.notesList.append(input, impostor);
    f.api.clearBulkSelection();
    assert.equal(input.checked, false); assert.equal(impostor.checked, true);
    assert.equal(f.context.state.selectedNoteIds.size, 0); assert.deepEqual(f.calls, [["toolbar"]]);
    f.context.notesList = null; f.api.clearBulkSelection(); assert.deepEqual(f.calls, [["toolbar"], ["toolbar"]]);
  });

  it("clicks an expanded HTML drawer trigger exactly once and leaves closed or absent triggers alone", () => {
    const f = fixture(), trigger = f.document.createElement("button");
    trigger.setAttribute("data-view-slideout-sidebar-trigger", ""); f.document.body.append(trigger);
    let clicks = 0; trigger.addEventListener("click", () => { clicks += 1; });
    f.api.closeNotesSlideOutDrawer(); assert.equal(clicks, 0);
    trigger.setAttribute("aria-expanded", "true"); f.api.closeNotesSlideOutDrawer(); assert.equal(clicks, 1);
    trigger.setAttribute("aria-expanded", "false"); f.api.closeNotesSlideOutDrawer(); assert.equal(clicks, 1);
    trigger.remove(); f.api.closeNotesSlideOutDrawer(); assert.equal(clicks, 1);
    // A real SVG with an instrumented click is covered by the rendered probe, since
    // this fixture does not model native namespace constructor identity.
  });

  it("requires the cached user control at its old read, after panel rendering and only on the implicit-user path", () => {
    const f = fixture(); f.context.userInput = null; f.context.contextSelectedMessage.textContent = "Previous selection";
    assert.throws(() => f.api.renderEditorContextSelection(), { name: "TypeError", message: "Required Notes value is unavailable." });
    assert.deepEqual(f.calls, [["panel"]]); assert.equal(f.context.contextSelectedMessage.textContent, "Previous selection");
    for (const target of [{ targetType: "workspace", label: "Workspace label" }, { targetType: "task", label: "Task label" }])
      assert.doesNotThrow(() => f.api.renderEditorContextSelection(target));
    assert.equal(f.context.contextSelectedMessage.textContent, "Linked context: task: Task label");
    f.context.contextSelectedMessage = null; assert.doesNotThrow(() => f.api.renderEditorContextSelection());

    const g = fixture(); let reads = 0;
    Object.defineProperty(g.context.userInput, "value", { get: () => { reads += 1; g.calls.push(["user-read"]); return "user-id"; } });
    g.api.renderEditorContextSelection(); assert.equal(reads, 1);
    assert.deepEqual(g.calls, [["panel"], ["user-read"], ["summary", "user"]]);
    assert.equal(g.context.contextSelectedMessage.textContent, "Linked context: User: Readable user");
    const h = fixture(); h.api.renderEditorContextSelection();
    assert.equal(h.context.contextSelectedMessage.textContent, "No linked context selected."); assert.deepEqual(h.calls, [["panel"]]);
  });
});
