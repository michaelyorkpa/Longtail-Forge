import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createFakeBrowserContext } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/notes.js");
const names = ["decorateNotesDeclarativeSurface", "decorateNotesFilter", "isResponseRecord"];
function fixture() {
  const browser = createFakeBrowserContext();
  const surface = browser.document.createElement("section"), chrome = browser.document.createElement("div");
  /** @type {unknown[][]} */ const calls = [];
  const context = vm.createContext({ ...browser,
    requireView: () => ({ createStatusMessage: (/** @type {unknown} */ options) => {
      const status = browser.document.createElement("p"); calls.push(["status", options, status]); return status;
    } }),
    createNotesListChrome: () => chrome,
  });
  for (const name of names) vm.runInContext(extractFunctionBlock(source, name), context);
  return { api: vm.runInContext(`({${names.join(",")}})`, context), document: browser.document, surface, chrome, calls };
}
/** @param {ReturnType<typeof fixture>} f @param {string} tag @param {string} classes */
function element(f, tag, classes = "") { const node = f.document.createElement(tag); node.className = classes; return node; }

describe("Notes rendered surface decoration", () => {
  it("adds Notes hooks to all eight scoped filters and preserves control identity and values", () => {
    const f = fixture();
    const mapping = { status: "noteFilterStatus", visibility: "noteFilterVisibility", security: "noteFilterSecurity", noteType: "noteFilterType", context: "noteFilterContext", owner: "noteFilterOwner", tags: "noteFilterTags", updatedSince: "noteFilterUpdated" };
    const form = element(f, "form", "existing"); form.dataset.viewFilterForm = ""; f.surface.append(form);
    for (const field of Object.keys(mapping)) {
      const wrapper = element(f, "label"); wrapper.dataset.viewField = field;
      const control = element(f, "input"); control.dataset.viewInput = field; control.value = field; wrapper.append(control); form.append(wrapper);
    }
    const outside = element(f, "input"); outside.dataset.viewInput = "status"; f.document.body.append(outside, f.surface);
    f.api.decorateNotesDeclarativeSurface(f.surface);
    assert.equal(form.classList.contains("existing"), true); assert.equal(form.classList.contains("notes-filters"), true); assert.equal(form.dataset.notesFilters, "");
    for (const [field, hook] of Object.entries(mapping)) {
      const control = form.querySelector(`[data-view-input="${field}"]`);
      assert.ok(control); assert.equal(control.dataset[hook], ""); assert.equal(control.value, field);
    }
    assert.equal(outside.dataset.noteFilterStatus, undefined);
  });

  it("preserves action aliases, header placement, index fallback and detail-panel replacement", () => {
    for (const action of ["notes.create", "create-note"]) for (const layout of ["view-slideout-sidebar-main", "view-sidebar-detail-primary", "view-stacked-detail"]) {
      const f = fixture(), button = element(f, "button"); button.dataset.surfaceAction = action;
      const header = element(f, "header", "view-page-header");
      /** @type {unknown[]} */ const after = [];
      // Fake DOM does not implement Node.after; assert the call and node identity.
      // The rendered test independently proves the actual sibling placement.
      Object.assign(header, { after: (/** @type {unknown} */ node) => after.push(node) });
      const index = element(f, "aside", "view-collapsible-index"), summary = element(f, "summary"), title = element(f, "span", "view-collapsible-index-title");
      summary.append(title); index.append(summary);
      const body = element(f, "div", "view-collapsible-index-body"), footer = element(f, "div", "view-collapsible-index-footer existing");
      body.append(element(f, "span")); index.append(body, footer);
      const detail = element(f, "article", layout); detail.append(element(f, "p"));
      f.surface.append(header, button, index, detail);
      f.api.decorateNotesDeclarativeSurface(f.surface);
      assert.equal(button.dataset.noteCreate, ""); assert.equal(title.textContent, "Notes List"); assert.equal(summary.children[0], title);
      assert.equal(index.classList.contains("notes-index-panel"), true); assert.equal(body.children.length, 1); assert.strictEqual(body.children[0], f.chrome);
      assert.equal(footer.classList.contains("existing"), true); assert.equal(footer.classList.contains("notes-list-panel-footer"), true);
      assert.equal(detail.dataset.noteDetail, ""); assert.equal(detail.classList.contains("notes-detail-panel"), true); assert.equal(detail.children.length, 0);
      assert.deepEqual(f.calls[0].slice(0, 2).map((item) => JSON.parse(JSON.stringify(item))), ["status", { className: "notes-status-message" }]);
      assert.strictEqual(after[0], f.calls[0][2]);
    }
  });

  it("prefers the named Notes index and first supported detail layout without rewriting other panels", () => {
    const f = fixture(), primary = element(f, "aside"), fallback = element(f, "aside", "view-collapsible-index"); primary.dataset.viewSidebarPanel = "notes-list";
    const summary = element(f, "summary"); primary.append(summary);
    const detail = element(f, "main", "view-slideout-sidebar-main"), other = element(f, "aside", "view-stacked-detail"); const retained = element(f, "p"); other.append(retained);
    f.surface.append(fallback, primary, other, detail); f.api.decorateNotesDeclarativeSurface(f.surface);
    assert.equal(primary.classList.contains("notes-index-panel"), true); assert.equal(fallback.classList.contains("notes-index-panel"), false); assert.equal(summary.textContent, "Notes List");
    assert.equal(detail.dataset.noteDetail, ""); assert.equal(other.dataset.noteDetail, undefined); assert.strictEqual(other.children[0], retained);
  });

  it("refuses only unreadable dataset hooks and tolerates absent optional descendants", () => {
    const f = fixture(); assert.doesNotThrow(() => f.api.decorateNotesDeclarativeSurface(f.surface));
    for (const dataset of [undefined, null, [], "unreadable", 1, false]) {
      const wrapper = element(f, "label"); wrapper.dataset.viewField = "status";
      const control = element(f, "input"); control.setAttribute("data-view-input", "status");
      Object.defineProperty(control, "dataset", { value: dataset });
      // The fake selector engine itself reads dataset; bypass that unrelated seam
      // for this hostile bag. Native namespace queries are proved in Playwright.
      Object.assign(wrapper, { querySelector: () => control });
      const action = element(f, "button"), form = element(f, "form"), detail = element(f, "article");
      const retained = element(f, "p"); detail.append(retained);
      for (const node of [action, form, detail]) Object.defineProperty(node, "dataset", { value: dataset });
      const matches = new Map([
        ['[data-surface-action="notes.create"], [data-surface-action="create-note"]', action],
        ['[data-view-filter-form]', form], ['.view-slideout-sidebar-main', detail],
        ['[data-view-field="status"]', wrapper],
      ]);
      Object.assign(f.surface, { querySelector: (/** @type {string} */ selector) => matches.get(selector) || null });
      assert.doesNotThrow(() => f.api.decorateNotesDeclarativeSurface(f.surface));
      assert.equal(control.dataset, dataset); assert.strictEqual(detail.children[0], retained);
    }
    assert.throws(() => f.api.decorateNotesDeclarativeSurface(null), { name: "TypeError" });
  });
});
